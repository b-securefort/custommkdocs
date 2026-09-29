"""Turn plain Markdown into the site's cloud-docs components at build time.

Writers type ordinary Markdown; this rewrites the HTML it produces, so the
page needs no JavaScript for any of it and reads fine if a rule doesn't match.

    **Home > Resource groups > Create**{ .ui-path }
        -> a click path, with chevrons between the parts

    <div class="anatomy" markdown> + `rg-app-prod-001` + a definition list
        -> the name split into coloured segments, keyed to the list

    ``` { .text .output }
        -> command output: no copy button (Material skips .no-copy)

    ![Hub and spoke](hub.drawio)
        -> prepared for the drawio plugin: alt text kept on a wrapper, the
           first diagram page shown, and the lightbox plugin told to skip it
"""

import html
import logging
import re

from mkdocs.plugins import event_priority

log = logging.getLogger("mkdocs.hooks.components")

# Segment colours cycle through this many hues (see .anatomy in components.css).
ANATOMY_HUES = 6

UI_PATH = re.compile(r'<strong class="([^"]*\bui-path\b[^"]*)">(.*?)</strong>', re.S)
UI_PATH_SPLIT = re.compile(r"\s+&gt;\s+")

ANATOMY = re.compile(
    # Inside content tabs the div keeps a stray markdown="" attribute.
    r'(<div class="(?:[^"]*\s)?anatomy(?:\s[^"]*)?"[^>]*>\s*)<p><code>(.*?)</code></p>(.*?</dl>)',
    re.S,
)
DT_DD = re.compile(r"<dt>(.*?)</dt>(\s*)<dd>(.*?)</dd>", re.S)
LEAD_LABEL = re.compile(r"^\s*(?:<p>)?\s*<strong>(.*?)</strong>", re.S)
NAME_SPLIT = re.compile(r"([-_./:])")

OUTPUT_BLOCK = re.compile(r'<div class="([^"]*\boutput\b[^"]*\bhighlight\b[^"]*)"')

DRAWIO_IMG = re.compile(r'<img\b[^>]*\bsrc="[^"]*\.drawio(?:\.svg|\.png)?"[^>]*>', re.I)
DRAWIO_ALONE = re.compile(r'<p>\s*(<div class="drawio"[^>]*><img\b[^>]*></div>)\s*</p>')


def _text(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()


# ── UI paths ──

def _ui_path(match):
    parts = UI_PATH_SPLIT.split(match.group(2).strip())
    if len(parts) < 2:
        return match.group(0)
    # The chevron is drawn by CSS; screen readers hear a pause instead of
    # "greater than".
    sep = '<span class="ui-path__sep" aria-hidden="true"></span><span class="sr-only">, </span>'
    items = sep.join(f'<span class="ui-path__item">{part}</span>' for part in parts)
    return f'<strong class="{match.group(1)}">{items}</strong>'


# ── Name anatomy ──

def _anatomy(match, page):
    opening, name, legend = match.groups()

    index = {}
    labels = {}

    def mark(entry):
        dt, gap, dd = entry.groups()
        key = _text(dt)
        if key not in index:
            index[key] = len(index) % ANATOMY_HUES + 1
        lead = LEAD_LABEL.match(dd)
        if lead and key not in labels:
            labels[key] = _text(lead.group(1)).rstrip(".:")
        seg = index[key]
        return f'<dt data-seg="{seg}">{dt}</dt>{gap}<dd data-seg="{seg}">{dd}</dd>'

    legend = DT_DD.sub(mark, legend)

    parts = []
    found = set()
    for part in NAME_SPLIT.split(html.unescape(name)):
        if not part:
            continue
        text = html.escape(part)
        if NAME_SPLIT.fullmatch(part):
            parts.append(f'<span class="anatomy__sep">{text}</span>')
        elif part in index:
            found.add(part)
            label = labels.get(part)
            label_html = f'<span class="anatomy__label" aria-hidden="true">{html.escape(label)}</span>' if label else ""
            parts.append(
                f'<span class="anatomy__seg" data-seg="{index[part]}">'
                f'<span class="anatomy__value">{text}</span>{label_html}</span>'
            )
        else:
            parts.append(f'<span class="anatomy__seg"><span class="anatomy__value">{text}</span></span>')

    for key in index:
        if key not in found:
            # Usually a typo: the legend describes a part the name doesn't have.
            log.warning(f"{page.file.src_uri}: anatomy term '{key}' isn't a part of '{html.unescape(name)}'")

    return f'{opening}<p class="anatomy__name">{"".join(parts)}</p>{legend}'


# ── draw.io ──

def _drawio(match):
    tag = match.group(0)
    alt = re.search(r'\balt="([^"]*)"', tag)
    # The drawio plugin reads a missing `page` from the alt text and warns
    # when no diagram page has that name. An empty page means "the first".
    if not re.search(r"\bpage=", tag):
        tag = tag.replace("<img", '<img page=""', 1)
    if re.search(r'\bclass="', tag):
        tag = re.sub(r'\bclass="', 'class="off-glb ', tag, count=1)
    else:
        tag = tag.replace("<img", '<img class="off-glb"', 1)
    # The plugin swaps the <img> for the viewer and drops its alt, so the
    # wrapper carries it.
    label = f' role="figure" aria-label="{alt.group(1)}"' if alt and alt.group(1) else ""
    return f'<div class="drawio"{label}>{tag}</div>'


# Before the lightbox plugin (priority 0) wraps every image in a link.
@event_priority(50)
def on_page_content(html_content, page, config, files):
    html_content = UI_PATH.sub(_ui_path, html_content)
    html_content = ANATOMY.sub(lambda m: _anatomy(m, page), html_content)
    html_content = OUTPUT_BLOCK.sub(lambda m: f'<div class="{m.group(1)} no-copy"', html_content)
    html_content = DRAWIO_IMG.sub(_drawio, html_content)
    html_content = DRAWIO_ALONE.sub(r"\1", html_content)
    return html_content
