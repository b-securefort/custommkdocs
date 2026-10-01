"""Hand the page writer (docs/write.md) what it can't work out in the browser.

A page with `writer: true` in its front matter gets a hidden element at the top
of its content with this JSON in its data-json attribute, which
javascripts/writer.js reads. Not a <script type="application/json">: Material's
instant navigation re-creates the scripts in a page it swaps in, keeping only
their text, so the JSON would be run as JavaScript and the element lost.

    folders   where a new page can go, with the title each one has on the site
    pages     every page, so links can be picked instead of typed
    icons     SVGs for the card icons offered in the picker
    ui        SVGs for the writer's own buttons
    platforms names and icons for `applies_to`, as hooks/page_info.py shows them
    files     the images and downloads already in docs/images/ and docs/files/,
              so the writer can tell a missing file from one that's on the site
    repo      extra.writer in mkdocs.yml: the Azure DevOps repository the
              publish instructions point at
    bundle    extra.writer too: the S3 bucket bundles are uploaded to and the
              pipeline that adds them to the repository (pipelines/ingest-bundle.yml),
              and the publish API that does both for the writer
              (tools/writer_api/lambda_function.py), where there is one
    sources   whether the site publishes its pages' Markdown (below)
    glossary  the terms in the files pymdownx.snippets appends to every page
              (includes/abbreviations.md), so the preview shows their tooltips

So that any page can be opened on the Write page and changed there, the
build also copies each published page's Markdown to _writer/src/<path in
docs/>, and gives every other page an "Edit in the page writer" button that
opens it there. Both only where the Write page itself is: with `draft: prod`
on docs/write.md, production gets neither, and readers there can't edit or
read the Markdown; staging gets both. `mkdocs serve` shows draft pages, so
it has both too: it's only ever on the writer's own computer. Set
extra.writer.sources to false to leave them out everywhere.

The site is static, so this is built once and the writer needs no server.
"""

import html
import json
import logging
import os
import posixpath
import re
from urllib.parse import quote

from mkdocs.structure.files import InclusionLevel
from mkdocs.utils import get_relative_url
from mkdocs.utils.meta import get_data

log = logging.getLogger("mkdocs.hooks.writer")

# Where the pages' Markdown is published, under the site.
SOURCES_DIR = "_writer/src"

# Offered in the card icon picker. Any other Material icon can still be typed.
CARD_ICONS = [
    "material/rocket-launch-outline",
    "material/book-open-variant",
    "material/cog-outline",
    "material/shield-check-outline",
    "material/lock-outline",
    "material/account-group-outline",
    "material/cloud-outline",
    "material/server-network",
    "material/database-outline",
    "material/lan",
    "material/console",
    "material/code-braces",
    "material/chart-line",
    "material/cash-multiple",
    "material/bell-outline",
    "material/lifebuoy",
    "material/lightning-bolt-outline",
    "material/puzzle-outline",
    "material/file-document-outline",
    "material/download-outline",
    "material/microsoft-azure",
    "material/aws",
    "material/google-cloud",
    "material/kubernetes",
]

# The writer's own buttons and component labels.
UI_ICONS = [
    "arrow-up", "arrow-down", "content-copy", "trash-can-outline", "plus", "close",
    "download", "file-upload-outline", "file-document-plus-outline",
    "format-bold", "format-italic", "code-tags", "link-variant",
    "cursor-default-click-outline", "keyboard-outline", "format-list-bulleted",
    "format-list-numbered", "image-outline", "alert-outline", "information-outline",
    "check-circle-outline", "format-header-pound", "text", "list-status", "tab",
    "alert-box-outline", "console", "console-line", "form-textbox", "lifebuoy",
    "table", "sitemap-outline", "view-grid-outline", "gesture-tap-button",
    "timeline-text-outline", "magnify", "eye-outline", "source-pull",
    "paperclip", "folder-zip-outline", "pencil-outline", "file-outline",
    "puzzle-outline", "file-cog-outline", "view-split-vertical", "text-box-edit-outline",
    "drag-vertical", "chevron-left", "fullscreen", "fullscreen-exit", "delete-sweep-outline",
    "undo", "redo", "format-strikethrough-variant", "format-color-highlight", "format-quote-close",
    "format-list-checks", "table-plus", "minus", "format-paragraph",
    "format-header-2", "format-header-3", "format-header-4",
    "file-multiple-outline", "history", "format-list-text", "help-circle-outline", "crop",
    "image-edit-outline", "web", "microsoft-azure-devops", "content-paste", "file-document-edit-outline",
    "chevron-down", "rectangle-outline", "blur", "file-compare", "console-line", "backup-restore",
    "check", "folder-open-outline", "menu-down", "arrow-collapse-vertical", "tag-text-outline",
]

# Same names and icons as hooks/page_info.py.
PLATFORMS = {
    "azure": ("Azure", "material/microsoft-azure"),
    "aws": ("AWS", "material/aws"),
    "gcp": ("Google Cloud", "material/google-cloud"),
}

_files = None
# The Write page's address, when this build has it.
_writer_url = None
# Whether the Write page was built this time, so the Markdown it opens is
# published too.
_writer_built = False
# `mkdocs serve`, which shows draft pages, rather than `mkdocs build`.
_serving = False


def on_startup(command, dirty):
    global _serving
    _serving = command == "serve"


def _shown():
    """The pages this build shows: drafts too, under `mkdocs serve`."""
    return InclusionLevel.is_in_serve if _serving else InclusionLevel.is_included


def _icon(name, config):
    for directory in config.theme.dirs:
        path = os.path.join(directory, ".icons", name + ".svg")
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as svg:
                return svg.read().replace("<svg ", '<svg aria-hidden="true" ', 1)
    log.warning(f"writer: icon '{name}' not found in the theme")
    return ""


# A Markdown abbreviation, as the abbr extension reads it: *[TERM]: Meaning
ABBREVIATION = re.compile(r"^\*\[([^\]]+)\][ ]?:[ ]*(.*)$", re.M)


def _glossary(config):
    """The abbreviations in the files appended to every page, by term."""
    snippets = config.mdx_configs.get("pymdownx.snippets") or {}
    bases = snippets.get("base_path") or ["."]
    if isinstance(bases, str):
        bases = [bases]
    root = os.path.dirname(config.config_file_path)
    terms = {}
    for name in snippets.get("auto_append") or []:
        for base in bases:
            path = os.path.join(root, base, name)
            if os.path.isfile(path):
                with open(path, encoding="utf-8") as source:
                    terms.update(ABBREVIATION.findall(source.read()))
                break
    return terms


def _sources(config):
    return (config.extra.get("writer") or {}).get("sources", True) is not False


def on_files(files, config):
    # After hooks/page_visibility.py, which marks `draft` pages: a draft Write
    # page gives no address, except to `mkdocs serve`, which shows drafts.
    global _files, _writer_url, _writer_built
    _files = files
    _writer_url = None
    _writer_built = False
    for file in files.documentation_pages(inclusion=_shown()):
        _, meta = get_data(file.content_string)
        if meta.get("writer"):
            _writer_url = file.url
    return files


def on_page_context(context, page, config, nav):
    global _writer_built
    if not page.meta.get("writer"):
        # The page's "Edit in the page writer" button (overrides/partials/actions.html).
        if _writer_url is not None and _sources(config):
            page.meta["writer_edit"] = get_relative_url(_writer_url, page.url) + "?edit=" + quote(page.file.src_uri)
        return context
    _writer_built = True

    pages = []
    titles = {}
    for file in _files.documentation_pages(inclusion=_shown()):
        if file.page is None or file.page is page:
            continue
        title = file.page.title or file.name
        pages.append({"src": file.src_uri, "title": title, "url": file.url})
        titles[file.src_uri] = title

    folders = {}
    for entry in pages:
        folder = posixpath.dirname(entry["src"])
        if folder not in folders:
            index = posixpath.join(folder, "index.md") if folder else "index.md"
            folders[folder] = titles.get(index) or folder.replace("-", " ").capitalize()
    folders[""] = "Top level (a tab of its own)"

    writer = config.extra.get("writer") or {}
    repo = {key: writer.get(key) or "" for key in ("organization", "project", "repository")}
    repo["branch"] = writer.get("branch") or "main"
    # An empty value leaves a placeholder the writer fills in a Your values box.
    bundle = {key: str(writer.get(key) or "").strip() for key in ("bucket", "prefix", "region", "pipeline_id", "api")}
    bundle["api"] = bundle["api"].rstrip("/")
    bundle["prefix"] = bundle["prefix"].strip("/")

    assets = sorted(
        file.src_uri
        for file in _files
        if not file.is_documentation_page() and file.src_uri.startswith(("images/", "files/"))
    )

    data = {
        "folders": [{"path": path, "title": folders[path]} for path in sorted(folders)],
        "pages": sorted(pages, key=lambda p: p["src"]),
        "icons": {name: _icon(name, config) for name in CARD_ICONS},
        "ui": {name: _icon("material/" + name, config) for name in UI_ICONS},
        "platforms": {
            key: {"label": label, "icon": _icon(icon, config)} for key, (label, icon) in PLATFORMS.items()
        },
        "files": assets,
        "review_months": config.extra.get("review_months", 6),
        "repo": repo,
        "bundle": bundle,
        "sources": _sources(config),
        "glossary": _glossary(config),
    }
    payload = html.escape(json.dumps(data, separators=(",", ":")), quote=True)
    page.content = f'<div id="writer-data" hidden data-json="{payload}"></div>' + page.content
    return context


def on_post_build(config):
    """Each published page's Markdown, as written, for the writer to open.
    Only when the Write page was built: without it, nothing needs them."""
    if not _sources(config) or _files is None or not _writer_built:
        return
    root = os.path.join(config.site_dir, *SOURCES_DIR.split("/"))
    for file in _files.documentation_pages(inclusion=_shown()):
        if file.page is None or file.page.meta.get("writer"):
            continue
        target = os.path.join(root, *file.src_uri.split("/"))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8", newline="\n") as out:
            out.write(file.content_string)
