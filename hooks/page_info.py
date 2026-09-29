"""Show who a page is for and how fresh it is, from its front matter.

    applies_to: [azure, aws]     platforms the page covers
    owner: Platform team         who to ask, and who keeps it current
    last_reviewed: 2026-09-01    when someone last checked it still works
    review_every: 3              months until it's due again (optional;
                                 defaults to extra.review_months)

Any of the keys is enough to draw a strip under the page's title. The build
writes the review date; javascripts/components.js compares it with the
reader's clock and flags the page when it's overdue, so a site built once
still goes stale visibly.
"""

import datetime
import html
import logging
import os
import re

log = logging.getLogger("mkdocs.hooks.page_info")

PLATFORMS = {
    "azure": ("Azure", "material/microsoft-azure"),
    "aws": ("AWS", "material/aws"),
    "gcp": ("Google Cloud", "material/google-cloud"),
}

DEFAULT_REVIEW_MONTHS = 6

H1_END = re.compile(r"</h1>")

_icons = {}


def _icon(name, config):
    if name not in _icons:
        _icons[name] = ""
        for directory in config.theme.dirs:
            path = os.path.join(directory, ".icons", name + ".svg")
            if os.path.isfile(path):
                with open(path, encoding="utf-8") as svg:
                    _icons[name] = svg.read().replace("<svg ", '<svg aria-hidden="true" ', 1)
                break
    return _icons[name]


def _date(value, src_uri):
    if isinstance(value, datetime.date):
        return value
    try:
        return datetime.date.fromisoformat(str(value))
    except ValueError:
        log.warning(f"{src_uri}: last_reviewed '{value}' isn't a date; write it as YYYY-MM-DD")
        return None


def _platforms(meta, src_uri, config):
    value = meta.get("applies_to")
    if not value:
        return ""
    names = [value] if isinstance(value, str) else list(value)
    chips = []
    for name in names:
        key = str(name).lower()
        if key not in PLATFORMS:
            log.warning(f"{src_uri}: unknown platform '{name}' in applies_to; use {sorted(PLATFORMS)}")
            continue
        label, icon = PLATFORMS[key]
        chips.append(f'<span class="platform platform--{key}">{_icon(icon, config)}{label}</span>')
    if not chips:
        return ""
    return (
        '<span class="page-info__item page-info__platforms">'
        f'<span class="page-info__key">Applies to</span>{"".join(chips)}</span>'
    )


def on_page_content(content, page, config, files):
    meta = page.meta
    if not any(key in meta for key in ("applies_to", "owner", "last_reviewed")):
        return content
    src_uri = page.file.src_uri

    items = [_platforms(meta, src_uri, config)]

    if meta.get("owner"):
        items.append(
            '<span class="page-info__item">'
            f'<span class="page-info__key">Owner</span>{html.escape(str(meta["owner"]))}</span>'
        )

    attrs = ""
    if meta.get("last_reviewed"):
        reviewed = _date(meta["last_reviewed"], src_uri)
        if reviewed:
            months = meta.get("review_every", config.extra.get("review_months", DEFAULT_REVIEW_MONTHS))
            if not isinstance(months, int) or months < 1:
                log.warning(f"{src_uri}: review_every should be a whole number of months, not '{months}'")
                months = DEFAULT_REVIEW_MONTHS
            attrs = f' data-reviewed="{reviewed.isoformat()}" data-review-months="{months}"'
            shown = f"{reviewed.day} {reviewed:%b %Y}"
            items.append(
                '<span class="page-info__item page-info__review">'
                '<span class="page-info__key">Reviewed</span>'
                f'<time datetime="{reviewed.isoformat()}">{shown}</time></span>'
            )

    strip = f'<div class="page-info" data-search-exclude{attrs}>{"".join(i for i in items if i)}</div>'

    # Straight under the title. Pages without a Markdown h1 get theirs from
    # the template, above the content, so the strip still lands beneath it.
    match = H1_END.search(content)
    if match:
        return content[: match.end()] + strip + content[match.end() :]
    return strip + content
