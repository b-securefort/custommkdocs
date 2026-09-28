"""Hide or hold back pages from their front matter, without touching mkdocs.yml.

    unlisted: true   built and reachable by link, but left out of the menu,
                     site search and search engines
    draft: true      not built at all (`mkdocs serve` still shows it)

Instead of `true`, either key takes an environment name or a list of them, and
then only applies there: `draft: prod` keeps a page off production but
publishes it on staging. The current environment is `extra.environment` in
the config being built (mkdocs.yml or mkdocsstaging.yml).
"""

import logging

from mkdocs.structure.files import InclusionLevel
from mkdocs.utils.meta import get_data

ENVIRONMENTS = {"prod", "staging"}

log = logging.getLogger("mkdocs.hooks.page_visibility")


def _applies(value, environment, key, src_uri):
    if isinstance(value, bool) or value is None:
        return bool(value)
    names = [value] if isinstance(value, str) else value
    unknown = [name for name in names if name not in ENVIRONMENTS]
    if unknown:
        # A typo here would silently publish the page, so fail strict builds.
        log.warning(
            f"{src_uri}: unknown environment {unknown} in '{key}'; "
            f"use true or one of {sorted(ENVIRONMENTS)}"
        )
    return environment in names


def on_config(config):
    environment = config.extra.get("environment")
    if environment not in ENVIRONMENTS:
        log.warning(
            f"extra.environment is {environment!r}; expected one of {sorted(ENVIRONMENTS)}"
        )


def on_files(files, config):
    environment = config.extra.get("environment")
    for file in files.documentation_pages(inclusion=InclusionLevel.is_in_serve):
        _, meta = get_data(file.content_string)
        if _applies(meta.get("draft"), environment, "draft", file.src_uri):
            file.inclusion = InclusionLevel.DRAFT
        elif _applies(meta.get("unlisted"), environment, "unlisted", file.src_uri):
            file.inclusion = InclusionLevel.NOT_IN_NAV
    return files


def on_page_markdown(markdown, page, config, files):
    # Replace the raw value with the result for this environment, so the
    # template (noindex) and search don't treat `unlisted: prod` as true on staging.
    page.meta["unlisted"] = page.file.inclusion == InclusionLevel.NOT_IN_NAV
    if page.meta["unlisted"]:
        page.meta.setdefault("search", {})["exclude"] = True
    return markdown
