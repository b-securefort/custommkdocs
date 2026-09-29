"""Hand the page writer (docs/write.md) what it can't work out in the browser.

A page with `writer: true` in its front matter gets a JSON block at the top of
its content, which javascripts/writer.js reads:

    folders   where a new page can go, with the title each one has on the site
    pages     every page, so links can be picked instead of typed
    icons     SVGs for the card icons offered in the picker
    ui        SVGs for the writer's own buttons
    platforms names and icons for `applies_to`, as hooks/page_info.py shows them
    repo      extra.writer in mkdocs.yml: the Azure DevOps repository the
              publish instructions point at

The site is static, so this is built once and the writer needs no server.
"""

import json
import logging
import os
import posixpath

log = logging.getLogger("mkdocs.hooks.writer")

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
]

# Same names and icons as hooks/page_info.py.
PLATFORMS = {
    "azure": ("Azure", "material/microsoft-azure"),
    "aws": ("AWS", "material/aws"),
    "gcp": ("Google Cloud", "material/google-cloud"),
}

_files = None


def _icon(name, config):
    for directory in config.theme.dirs:
        path = os.path.join(directory, ".icons", name + ".svg")
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as svg:
                return svg.read().replace("<svg ", '<svg aria-hidden="true" ', 1)
    log.warning(f"writer: icon '{name}' not found in the theme")
    return ""


def on_files(files, config):
    global _files
    _files = files
    return files


def on_page_context(context, page, config, nav):
    if not page.meta.get("writer"):
        return context

    pages = []
    titles = {}
    for file in _files.documentation_pages():
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

    repo = dict(config.extra.get("writer") or {})
    repo.setdefault("branch", "main")

    data = {
        "folders": [{"path": path, "title": folders[path]} for path in sorted(folders)],
        "pages": sorted(pages, key=lambda p: p["src"]),
        "icons": {name: _icon(name, config) for name in CARD_ICONS},
        "ui": {name: _icon("material/" + name, config) for name in UI_ICONS},
        "platforms": {
            key: {"label": label, "icon": _icon(icon, config)} for key, (label, icon) in PLATFORMS.items()
        },
        "review_months": config.extra.get("review_months", 6),
        "repo": repo,
    }
    payload = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    page.content = f'<script type="application/json" id="writer-data">{payload}</script>' + page.content
    return context
