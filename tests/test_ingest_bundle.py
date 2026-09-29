"""Tests for tools/ingest_bundle.py, with bundles built by hand.

    python -m unittest discover tests
"""

import contextlib
import hashlib
import importlib.util
import io
import json
import stat
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("ingest_bundle", ROOT / "tools" / "ingest_bundle.py")
ingest = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = ingest  # dataclasses look the module up
spec.loader.exec_module(ingest)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
PDF = b"%PDF-1.4\n%%EOF\n"
PAGE = b"# Rotate the key\n\n![The key blade](../images/security/rotate-key/blade.png)\n\n[Download the runbook (PDF)](../files/security/rotate-key/runbook.pdf)\n"


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Bundles(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.repo = self.dir / "repo"
        (self.repo / "docs" / "security").mkdir(parents=True)
        (self.repo / "docs" / "security" / "index.md").write_text("# Security\n", encoding="utf-8")

    def tearDown(self):
        self.tmp.cleanup()

    def bundle(self, mode="create", entries=None, manifest=None, change=None):
        """A good bundle for docs/security/rotate-key.md; change(manifest) edits it."""
        entries = dict(entries or {"page.md": PAGE, "images/blade.png": PNG, "files/runbook.pdf": PDF})
        if manifest is None:
            manifest = {
                "version": 1,
                "created": "2026-09-30T10:15:00Z",
                "author": "Sam",
                "mode": mode,
                "page": {"src": "page.md", "target": "docs/security/rotate-key.md", "sha256": sha(PAGE)},
                "assets": [
                    {"src": "images/blade.png", "target": "docs/images/security/rotate-key/blade.png", "sha256": sha(PNG)},
                    {"src": "files/runbook.pdf", "target": "docs/files/security/rotate-key/runbook.pdf", "sha256": sha(PDF)},
                ],
            }
        if change:
            change(manifest)
        path = self.dir / "bundle.zip"
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("manifest.json", json.dumps(manifest))
            for name, data in entries.items():
                if isinstance(data, zipfile.ZipInfo):
                    zf.writestr(data, b"../../etc/passwd")
                else:
                    zf.writestr(name, data)
        return path

    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = ingest.main([str(a) for a in args] + ["--repo-root", str(self.repo)])
        return code, out.getvalue(), err.getvalue()

    def assertRefused(self, path, reason):
        code, out, err = self.run_cli(path)
        self.assertEqual(code, 1, out)
        self.assertIn(reason, err)
        # Nothing was written.
        self.assertFalse((self.repo / "docs" / "security" / "rotate-key.md").exists())
        self.assertFalse((self.repo / "docs" / "images").exists())
        return err

    def test_good_bundle(self):
        path = self.bundle()
        code, out, err = self.run_cli(path, "--dry-run")
        self.assertEqual(code, 0, err)
        self.assertIn("Would place 'Rotate the key'", out)
        self.assertFalse((self.repo / "docs" / "security" / "rotate-key.md").exists())

        result = self.dir / "result.json"
        summary = self.dir / "summary.md"
        code, out, err = self.run_cli(path, "--result-out", result, "--summary-out", summary)
        self.assertEqual(code, 0, err)
        self.assertEqual((self.repo / "docs/security/rotate-key.md").read_bytes(), PAGE)
        self.assertEqual((self.repo / "docs/images/security/rotate-key/blade.png").read_bytes(), PNG)
        self.assertEqual((self.repo / "docs/files/security/rotate-key/runbook.pdf").read_bytes(), PDF)
        self.assertEqual(json.loads(result.read_text())["branch_slug"], "rotate-key")
        self.assertIn("`docs/files/security/rotate-key/runbook.pdf`", summary.read_text())
        self.assertEqual([p.name for p in (self.repo / "docs/security").iterdir() if p.name.startswith(".")], [])

    def test_zip_slip_in_entry(self):
        def change(m):
            m["assets"][0]["src"] = "../blade.png"
        path = self.bundle(entries={"page.md": PAGE, "../blade.png": PNG, "files/runbook.pdf": PDF}, change=change)
        self.assertRefused(path, "'..'")
        self.assertFalse((self.dir / "blade.png").exists())

    def test_zip_slip_in_target(self):
        def change(m):
            m["page"]["target"] = "docs/../../outside.md"
        self.assertRefused(self.bundle(change=change), "'..'")
        self.assertFalse((self.dir / "outside.md").exists())

    def test_absolute_and_backslash(self):
        def absolute(m):
            m["page"]["target"] = "/etc/docs.md"
        self.assertRefused(self.bundle(change=absolute), "absolute path")

        def backslash(m):
            m["assets"][0]["target"] = "docs\\images\\security\\rotate-key\\blade.png"
        self.assertRefused(self.bundle(change=backslash), "backslash")

    def test_hash_mismatch(self):
        def change(m):
            m["assets"][1]["sha256"] = sha(b"something else")
        self.assertRefused(self.bundle(change=change), "doesn't match its sha256")

    def test_overwrite_in_create_mode(self):
        existing = self.repo / "docs/security/rotate-key.md"
        existing.write_text("# The one already there\n", encoding="utf-8")
        code, out, err = self.run_cli(self.bundle(mode="create"))
        self.assertEqual(code, 1)
        self.assertIn("already exist", err)
        self.assertEqual(existing.read_text(encoding="utf-8"), "# The one already there\n")
        self.assertFalse((self.repo / "docs/images").exists())

    def test_update_replaces_page_and_own_folder(self):
        (self.repo / "docs/security/rotate-key.md").write_text("# Old\n", encoding="utf-8")
        old = self.repo / "docs/images/security/rotate-key"
        old.mkdir(parents=True)
        (old / "blade.png").write_bytes(PNG[:8] + b"old")
        (old / "retired.png").write_bytes(PNG)
        code, out, err = self.run_cli(self.bundle(mode="update"))
        self.assertEqual(code, 0, err)
        self.assertEqual((self.repo / "docs/security/rotate-key.md").read_bytes(), PAGE)
        self.assertEqual((old / "blade.png").read_bytes(), PNG)
        self.assertIn("replaces the one there", out)
        self.assertIn("kept   docs/images/security/rotate-key/retired.png", out)

    def test_entry_not_in_manifest(self):
        path = self.bundle(entries={"page.md": PAGE, "images/blade.png": PNG, "files/runbook.pdf": PDF, "files/extra.pdf": PDF})
        self.assertRefused(path, "doesn't list: files/extra.pdf")

    def test_asset_outside_own_folder(self):
        def change(m):
            m["assets"][0]["target"] = "docs/images/logo.png"
        self.assertRefused(self.bundle(change=change), "page's own folder")

    def test_extension_not_allowed(self):
        def change(m):
            m["assets"][1]["src"] = "files/run.exe"
            m["assets"][1]["target"] = "docs/files/security/rotate-key/run.exe"
        path = self.bundle(entries={"page.md": PAGE, "images/blade.png": PNG, "files/run.exe": PDF}, change=change)
        self.assertRefused(path, "only takes")

    def test_symlink_entry(self):
        link = zipfile.ZipInfo("images/blade.png")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        path = self.bundle(entries={"page.md": PAGE, "images/blade.png": link, "files/runbook.pdf": PDF})
        self.assertRefused(path, "symbolic link")

    def test_svg_with_script(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'

        def change(m):
            m["assets"][0].update(src="images/blade.svg", target="docs/images/security/rotate-key/blade.svg", sha256=sha(svg))
        path = self.bundle(entries={"page.md": PAGE, "images/blade.svg": svg, "files/runbook.pdf": PDF}, change=change)
        self.assertRefused(path, "script")

    def test_bad_manifest(self):
        def change(m):
            del m["mode"]
            m["version"] = 2
        self.assertRefused(self.bundle(change=change), "missing mode")


if __name__ == "__main__":
    unittest.main()
