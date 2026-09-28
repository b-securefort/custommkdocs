"""Resolve links, images and icons written in front matter.

Templates such as overrides/home.html read their content from front matter,
which MkDocs doesn't touch. This hook lets editors write front matter the way
they write Markdown, and makes mistakes fail `mkdocs build --strict`:

    link: ../getting-started/index.md#navigation   ->  getting-started/#navigation
    image: images/hero.png                          ->  images/hero.png
    icon:material/rocket-launch-outline            ->  checked against the theme

Paths are relative to the page, as in Markdown. The resulting URLs are
relative to the site root, so templates pass them through the `url` filter.
"""

import logging
import os
import posixpath

log = logging.getLogger("mkdocs.hooks.front_matter")

PATH_KEYS = {"link", "image"}
EXTERNAL = ("http://", "https://", "mailto:", "tel:", "//", "#", "/")


def on_page_markdown(markdown, page, config, files):
    _walk(page.meta, page, config, files)
    return markdown


def _walk(node, page, config, files):
    if isinstance(node, list):
        for item in node:
            _walk(item, page, config, files)
    elif isinstance(node, dict):
        for key, value in node.items():
            if key in PATH_KEYS and isinstance(value, str):
                node[key] = _resolve(value, key, page, files)
            elif key == "icon" and isinstance(value, str):
                node[key] = _check_icon(value, page, config)
            else:
                _walk(value, page, config, files)


def _resolve(value, key, page, files):
    if value.startswith(EXTERNAL):
        return value
    path, _, anchor = value.partition("#")
    target = posixpath.normpath(posixpath.join(posixpath.dirname(page.file.src_uri), path))
    file = files.get_file_from_path(target)
    if file is None or file.inclusion.is_excluded():
        log.warning(f"{page.file.src_uri}: front matter {key} '{value}' doesn't point to a file in docs/")
        return value
    return file.url + ("#" + anchor if anchor else "")


def _check_icon(value, page, config):
    for directory in config.theme.dirs:
        if os.path.isfile(os.path.join(directory, ".icons", value + ".svg")):
            return value
    log.warning(
        f"{page.file.src_uri}: front matter icon '{value}' doesn't exist; "
        "use a name like material/rocket-launch-outline"
    )
    return None
