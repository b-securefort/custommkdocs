#!/usr/bin/env python3
"""Put a page bundle from the Write page (docs/write.md) into the repository.

    python tools/ingest_bundle.py <bundle.zip> [--repo-root .] [--dry-run]

A bundle is a .zip holding manifest.json, the page, and the images and files
it uses. The manifest says where each one goes:

    {
      "version": 1,
      "created": "2026-09-30T10:15:00Z",
      "author": "optional",
      "mode": "create",                     # or "update"
      "page": {"src": "page.md", "target": "docs/<folder>/<slug>.md", "sha256": "optional",
               "base_sha256": "optional"},
      "assets": [
        {"src": "images/step1.png", "target": "docs/images/<folder>/<slug>/step1.png", "sha256": "..."},
        {"src": "files/template.json", "target": "docs/files/<folder>/<slug>/template.json", "sha256": "..."}
      ]
    }

Anyone who can write a page can make a bundle, so everything is checked
before anything is written, and a bundle is placed whole or not at all:

- every zip entry is a plain file listed in the manifest (no symlinks, no
  absolute paths, no "..", no backslashes, no names outside [A-Za-z0-9._-]);
- every target resolves inside docs/: the page is a .md outside docs/images/
  and docs/files/, and the assets go in the page's own folders,
  docs/images/<folder>/<slug>/ and docs/files/<folder>/<slug>/, with an
  extension allowed there;
- each asset matches its sha256, its size is within the limits below, and
  images and binary files start the way their type says (SVGs may not script);
- "create" never overwrites; "update" only overwrites the page and its own
  folders;
- an "update" with base_sha256 (the page as the writer opened it) is refused
  when the page in the repository is no longer that one: someone else changed,
  moved or removed it since, and placing this bundle would undo their change.

Exits 0 when the bundle was placed (or would be, with --dry-run), 1 when it
was refused, with the reason on stderr. The Write page (javascripts/writer.js)
uses the same limits and extensions; keep the two in step.

Standard library only; Python 3.10+.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
import zipfile
import zlib
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

MB = 1024 * 1024
MAX_ENTRIES = 200            # files in the zip, manifest included
MAX_MANIFEST = 256 * 1024
MAX_PAGE = 1 * MB
MAX_ASSET = 10 * MB          # the Write page takes images up to 5 MB, files up to 10 MB
MAX_TOTAL = 25 * MB          # everything, uncompressed

IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
FILE_EXTS = {
    "pdf", "docx", "xlsx", "pptx", "vsdx", "csv", "json", "yaml", "yml",
    "xml", "txt", "zip", "drawio", "bicep", "tf",
}

# How a file of each type starts. Types missing here are text.
MAGIC = {
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "gif": [b"GIF87a", b"GIF89a"],
    "webp": [b"RIFF"],
    "pdf": [b"%PDF-"],
    "docx": [b"PK\x03\x04"],
    "xlsx": [b"PK\x03\x04"],
    "pptx": [b"PK\x03\x04"],
    "vsdx": [b"PK\x03\x04"],
    "zip": [b"PK\x03\x04", b"PK\x05\x06"],
}

# A browser runs script in an SVG opened on its own, from the docs site.
SVG_UNSAFE = re.compile(rb"<\s*script|<\s*foreignObject|\son[a-z]+\s*=|javascript:|<!ENTITY", re.IGNORECASE)

# Allowed, but a reviewer should look: raw script, frames, and snippets, which
# pull other files from the repository into the page.
PAGE_NOTES = [
    (re.compile(r"<\s*script", re.IGNORECASE), "has a <script> tag"),
    (re.compile(r"<\s*iframe", re.IGNORECASE), "has an <iframe>"),
    (re.compile(r"javascript:", re.IGNORECASE), "has a javascript: link"),
    (re.compile(r"^\s*-{2,}8<-{2,}", re.MULTILINE), "includes other files with --8<-- (snippets)"),
]

SEGMENT = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$")
WINDOWS_RESERVED = re.compile(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$", re.IGNORECASE)
SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")


class BundleError(Exception):
    """The bundle is refused; the message says why, for the person who made it."""


@dataclass
class Item:
    kind: str          # page, image or file
    src: str
    target: str
    data: bytes


@dataclass
class Result:
    mode: str
    base: str | None
    title: str
    slug: str
    created: str
    author: str
    items: list[Item]
    notes: list[str] = field(default_factory=list)
    replaced: list[str] = field(default_factory=list)
    left: list[str] = field(default_factory=list)
    dry_run: bool = False

    @property
    def page(self) -> Item:
        return self.items[0]


def size(n: int) -> str:
    return f"{n / MB:.1f} MB" if n >= MB else f"{max(1, round(n / 1024))} KB"


def check_path(path: object, what: str) -> list[str]:
    """A relative path with / between plain names; returns its parts."""
    if not isinstance(path, str) or not path:
        raise BundleError(f"{what} is missing")
    if "\\" in path:
        raise BundleError(f"{what} {path!r} has a backslash; folders are separated by /")
    if path.startswith("/") or re.match(r"^[A-Za-z]:", path):
        raise BundleError(f"{what} {path!r} is an absolute path")
    parts = path.split("/")
    for part in parts:
        if part in ("", ".", ".."):
            raise BundleError(f"{what} {path!r} has an empty, '.' or '..' part")
        if not SEGMENT.match(part) or WINDOWS_RESERVED.match(part):
            raise BundleError(f"{what} {path!r}: names may only use letters, digits, '.', '-' and '_'")
    return parts


def text_sha256(data: bytes) -> str:
    """The sha256 of a page as the Write page hashes it: UTF-8, no byte
    order mark, and LF line endings, whatever the checkout uses."""
    text = data.decode("utf-8-sig", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def ext(path: str) -> str:
    name = path.rsplit("/", 1)[-1]
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def read_entry(bundle: zipfile.ZipFile, info: zipfile.ZipInfo, limit: int) -> bytes:
    try:
        with bundle.open(info) as stream:
            data = stream.read(limit + 1)
    except (zipfile.BadZipFile, zlib.error, EOFError) as error:
        raise BundleError(f"{info.filename} is damaged ({error})") from None
    except (NotImplementedError, RuntimeError) as error:
        raise BundleError(f"{info.filename} can't be read ({error})") from None
    if len(data) > limit:
        raise BundleError(f"{info.filename} is over {size(limit)}")
    return data


def page_title(markdown: str, fallback: str) -> str:
    lines = markdown.splitlines()
    body = lines
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                for line in lines[1:i]:
                    m = re.match(r"^title:\s*(.+?)\s*$", line)
                    if m:
                        return clean_text(m.group(1).strip("\"'"))
                body = lines[i + 1:]
                break
    for line in body:
        m = re.match(r"^#\s+(.+?)\s*#*\s*$", line)
        if m:
            return clean_text(m.group(1))
    return fallback


def clean_text(text: str, limit: int = 120) -> str:
    """One line of plain text, safe to print in a pipeline log."""
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", text)
    text = re.sub(r"#{2,}", "#", text)  # "##vso[" is a pipeline logging command
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def load(bundle_path: Path, repo_root: Path) -> Result:
    """Check the bundle against the rules above and the repository."""
    docs = repo_root / "docs"
    if not docs.is_dir():
        raise BundleError(f"no docs/ folder in {repo_root}: is --repo-root right?")
    docs = docs.resolve()

    try:
        bundle = zipfile.ZipFile(bundle_path)
    except FileNotFoundError:
        raise BundleError(f"{bundle_path} doesn't exist") from None
    except (zipfile.BadZipFile, OSError) as error:
        raise BundleError(f"{bundle_path} isn't a zip file ({error})") from None

    with bundle:
        infos = bundle.infolist()
        if len(infos) > MAX_ENTRIES:
            raise BundleError(f"the bundle has {len(infos)} entries; at most {MAX_ENTRIES}")
        entries: dict[str, zipfile.ZipInfo] = {}
        for info in infos:
            name = info.filename
            if info.flag_bits & 0x1:
                raise BundleError(f"{name} is encrypted")
            if stat.S_ISLNK(info.external_attr >> 16):
                raise BundleError(f"{name} is a symbolic link")
            if info.is_dir():
                # Some zip tools list the folders too; a bundle only has these.
                if name.rstrip("/") not in ("images", "files"):
                    raise BundleError(f"the bundle has a folder it shouldn't: {name}")
                continue
            check_path(name, "zip entry")
            if name in entries or name.lower() in {n.lower() for n in entries}:
                raise BundleError(f"{name} is in the bundle twice")
            entries[name] = info
        total = sum(info.file_size for info in entries.values())
        if total > MAX_TOTAL:
            raise BundleError(f"the bundle holds {size(total)}; at most {size(MAX_TOTAL)}")

        if "manifest.json" not in entries:
            raise BundleError("the bundle has no manifest.json; make it again on the Write page")
        try:
            manifest = json.loads(read_entry(bundle, entries["manifest.json"], MAX_MANIFEST).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise BundleError(f"manifest.json isn't valid JSON ({error})") from None
        mode, page_spec, asset_specs, created, author = check_manifest(manifest)
        base = page_spec.get("base_sha256")

        # Where the page goes decides where its images and files go.
        page_src = check_path(page_spec["src"], "page src")
        if not page_spec["src"].endswith(".md") or page_src[0] in ("images", "files"):
            raise BundleError(f"page src {page_spec['src']!r} must be a .md file outside images/ and files/")
        target = check_path(page_spec["target"], "page target")
        if target[0] != "docs" or len(target) < 2 or ext(page_spec["target"]) != "md":
            raise BundleError(f"page target {page_spec['target']!r} must be a .md file in docs/")
        if target[1] in ("images", "files"):
            raise BundleError(f"page target {page_spec['target']!r} is in docs/{target[1]}/, which is for images and files")
        slug = target[-1][: -len(".md")]
        own = "/".join(target[1:-1] + [slug])

        items: list[Item] = []
        listed = {"manifest.json"}
        specs = [("page", page_spec)] + [("asset", spec) for spec in asset_specs]
        for role, spec in specs:
            src, dest = spec["src"], spec["target"]
            if role == "asset":
                src_parts = check_path(src, "asset src")
                dest_parts = check_path(dest, "asset target")
                kind = src_parts[0]
                if kind not in ("images", "files") or len(src_parts) != 2:
                    raise BundleError(f"asset src {src!r} must be images/<name> or files/<name>")
                allowed = IMAGE_EXTS if kind == "images" else FILE_EXTS
                if ext(dest) not in allowed:
                    raise BundleError(f"{dest}: docs/{kind}/ only takes " + ", ".join(sorted(allowed)))
                if dest_parts[:-1] != ["docs", kind] + own.split("/"):
                    raise BundleError(f"{dest} must be in the page's own folder, docs/{kind}/{own}/")
                if ext(src) != ext(dest):
                    raise BundleError(f"asset src {src!r} and target {dest!r} have different extensions")
            if src in listed:
                raise BundleError(f"{src} is listed twice in the manifest")
            listed.add(src)
            if src not in entries:
                raise BundleError(f"the manifest lists {src}, but it isn't in the bundle")
            info = entries[src]
            data = read_entry(bundle, info, MAX_PAGE if role == "page" else MAX_ASSET)
            sha = spec.get("sha256")
            if sha is not None and hashlib.sha256(data).hexdigest() != sha.lower():
                raise BundleError(f"{src} doesn't match its sha256 in the manifest: the bundle is damaged or was changed")
            kind_name = "page" if role == "page" else ("image" if src.startswith("images/") else "file")
            items.append(Item(kind_name, src, dest, data))

        extra = sorted(set(entries) - listed)
        if extra:
            raise BundleError("the bundle has files the manifest doesn't list: " + ", ".join(extra))

    targets = [item.target for item in items]
    lowered = [t.lower() for t in targets]
    for t in targets:
        if lowered.count(t.lower()) > 1:
            raise BundleError(f"two entries go to {t}")

    notes: list[str] = []
    try:
        markdown = items[0].data.decode("utf-8")
    except UnicodeDecodeError:
        raise BundleError(f"{items[0].src} isn't UTF-8 text") from None
    for pattern, note in PAGE_NOTES:
        if pattern.search(markdown):
            notes.append(f"The page {note}.")
    for item in items[1:]:
        check_content(item)

    result = Result(mode, base.lower() if base else None, page_title(markdown, slug), slug, created, author, items, notes)
    check_targets(result, repo_root, docs, own)
    return result


def check_manifest(manifest: object):
    if not isinstance(manifest, dict):
        raise BundleError("manifest.json must be a JSON object")
    missing = [key for key in ("version", "created", "mode", "page", "assets") if key not in manifest]
    if missing:
        raise BundleError("manifest.json is missing " + ", ".join(missing))
    version = manifest["version"]
    if version != 1 or isinstance(version, bool):
        raise BundleError(f"manifest version {version!r} isn't one this script reads (1)")
    created = manifest["created"]
    try:
        datetime.fromisoformat(str(created).replace("Z", "+00:00"))
    except ValueError:
        raise BundleError(f"manifest created {created!r} isn't a date and time like 2026-09-30T10:15:00Z") from None
    mode = manifest["mode"]
    if mode not in ("create", "update"):
        raise BundleError(f"manifest mode {mode!r} must be create or update")
    author = manifest.get("author") or ""
    if not isinstance(author, str):
        raise BundleError("manifest author must be text")
    page = manifest["page"]
    if not isinstance(page, dict) or "src" not in page or "target" not in page:
        raise BundleError("manifest page needs src and target")
    for key in ("sha256", "base_sha256"):
        if key in page and not (isinstance(page[key], str) and SHA256.match(page[key])):
            raise BundleError(f"manifest page {key} must be 64 hex characters")
    assets = manifest["assets"]
    if not isinstance(assets, list):
        raise BundleError("manifest assets must be a list")
    for i, asset in enumerate(assets):
        if not isinstance(asset, dict) or not all(key in asset for key in ("src", "target", "sha256")):
            raise BundleError(f"manifest asset {i + 1} needs src, target and sha256")
        if not isinstance(asset["sha256"], str) or not SHA256.match(asset["sha256"]):
            raise BundleError(f"manifest asset {i + 1} sha256 must be 64 hex characters")
    return mode, page, assets, str(created), clean_text(author, 80)


def check_content(item: Item) -> None:
    kind = ext(item.target)
    starts = MAGIC.get(kind)
    if starts and not any(item.data.startswith(s) for s in starts):
        raise BundleError(f"{item.src} isn't a real .{kind} file")
    if kind == "webp" and item.data[8:12] != b"WEBP":
        raise BundleError(f"{item.src} isn't a real .webp file")
    if kind == "svg":
        if b"<svg" not in item.data[:4096].lower():
            raise BundleError(f"{item.src} isn't a real .svg file")
        if SVG_UNSAFE.search(item.data):
            raise BundleError(f"{item.src} has script or event handlers in it; export the SVG again without them, or use a PNG")


def check_targets(result: Result, repo_root: Path, docs: Path, own: str) -> None:
    own_folders = [f"docs/images/{own}/", f"docs/files/{own}/"]
    clashes = []
    for item in result.items:
        dest = (repo_root / item.target).resolve()
        if docs not in dest.parents:
            raise BundleError(f"{item.target} resolves outside docs/")
        if dest.is_dir():
            raise BundleError(f"{item.target} is a folder in the repository")
        if dest.exists():
            clashes.append(item.target)
    if result.mode == "create" and clashes:
        raise BundleError(
            "this is a new page (mode create), but these already exist: " + ", ".join(clashes)
            + ". To change the page, open it on the Write page and choose 'A change to an existing page'; "
            "for a new page, give it another file name."
        )
    for target in clashes:
        if target != result.page.target and not any(target.startswith(folder) for folder in own_folders):
            raise BundleError(f"{target} already exists and isn't this page's own")
    result.replaced = clashes
    if result.mode == "update":
        page = repo_root / result.page.target
        if result.base and not page.exists():
            raise BundleError(
                f"{result.page.target} isn't in the repository any more: someone moved or removed it "
                "since you opened it. Open the page again on the Write page, or make this a new page."
            )
        if result.base and text_sha256(page.read_bytes()) != result.base:
            raise BundleError(
                f"{result.page.target} has changed since you opened it, and publishing this would undo "
                "that change. Open the page again on the Write page to get the latest version, "
                "make your change there, and publish again."
            )
        if not page.exists():
            result.notes.append(f"{result.page.target} didn't exist, so this adds it.")
        placed = {item.target for item in result.items}
        for folder in own_folders:
            path = repo_root / folder
            if path.is_dir():
                result.left += sorted(
                    f"{folder}{p.name}" for p in path.iterdir() if p.is_file() and f"{folder}{p.name}" not in placed
                )


def place(result: Result, repo_root: Path) -> None:
    """Write everything, or nothing: all to temporary files first, then swap."""
    temps = []
    try:
        for item in result.items:
            dest = repo_root / item.target
            dest.parent.mkdir(parents=True, exist_ok=True)
            temp = dest.with_name(f".{dest.name}.ingest")
            temp.write_bytes(item.data)
            temps.append((temp, dest))
        for temp, dest in temps:
            os.replace(temp, dest)
    finally:
        for temp, _ in temps:
            if temp.exists():
                temp.unlink()


def summary(result: Result) -> str:
    verb = "Would place" if result.dry_run else "Placed"
    lines = [f"{verb} '{result.title}' ({result.mode}, made {result.created}{' by ' + result.author if result.author else ''}):"]
    for item in result.items:
        again = "  (replaces the one there)" if item.target in result.replaced else ""
        lines.append(f"  {item.kind:<5}  {item.target}  {size(len(item.data))}{again}")
    for path in result.left:
        lines.append(f"  kept   {path}  (already there, not in this bundle)")
    for note in result.notes:
        lines.append(f"  note: {note}")
    if result.dry_run:
        lines.append("Dry run: nothing was written.")
    return "\n".join(lines)


def summary_markdown(result: Result) -> str:
    """The pull request description."""
    author = f" by {result.author}" if result.author else ""
    verb = "Updates" if result.mode == "update" else "Adds"
    out = [
        f"{verb} **{result.title}** from a Write page bundle made {result.created}{author}.",
        "",
        "| | Path | Size |",
        "| --- | --- | --- |",
    ]
    for item in result.items:
        again = " (replaced)" if item.target in result.replaced else ""
        out.append(f"| {item.kind.capitalize()} | `{item.target}`{again} | {size(len(item.data))} |")
    if result.left:
        out += ["", "Already in the page's folders and not in this bundle, so left as they were:", ""]
        out += [f"- `{path}`" for path in result.left]
    if result.notes:
        out += ["", "**Look closely at:**", ""]
        out += [f"- {note}" for note in result.notes]
    out += ["", "Checked by tools/ingest_bundle.py and `mkdocs build --strict` before this pull request was opened."]
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Put a page bundle from the Write page into the repository.")
    parser.add_argument("bundle", type=Path, help="the .zip downloaded from the Write page")
    parser.add_argument("--repo-root", type=Path, default=Path("."), help="the repository to put it in (default: .)")
    parser.add_argument("--dry-run", action="store_true", help="check the bundle and say what it would do, without writing")
    parser.add_argument("--summary-out", type=Path, help="also write a Markdown summary here, for the pull request")
    parser.add_argument("--result-out", type=Path, help="also write the result here as JSON, for the pipeline")
    args = parser.parse_args(argv)

    try:
        result = load(args.bundle, args.repo_root)
        result.dry_run = args.dry_run
        if not args.dry_run:
            place(result, args.repo_root)
    except BundleError as error:
        print(f"ingest_bundle: refused {args.bundle.name}: {error}", file=sys.stderr)
        return 1

    print(summary(result))
    if args.summary_out:
        args.summary_out.write_text(summary_markdown(result), encoding="utf-8")
    if args.result_out:
        args.result_out.write_text(
            json.dumps(
                {
                    "mode": result.mode,
                    "title": result.title,
                    "slug": result.slug,
                    # A git branch name can't have "..", so keep it simple.
                    "branch_slug": re.sub(r"[^a-z0-9-]+", "-", result.slug.lower()).strip("-")[:60] or "page",
                    "page": result.page.target,
                    "placed": [item.target for item in result.items],
                    "dry_run": result.dry_run,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
