"""Turn plain Markdown into the site's cloud-docs components at build time.

Writers type ordinary Markdown; this rewrites the HTML it produces, so the
page needs no JavaScript for any of it and reads fine if a rule doesn't match.

    <rg>-<geo>-<env>-01
        -> shown as written: a word in angle brackets that isn't an HTML
           element is a placeholder, not a tag the browser would hide

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

# A tag with no attributes, such as <env> or </env>. Python-Markdown passes
# these through as HTML, and a browser shows nothing for a tag it doesn't know.
BARE_TAG = re.compile(r"<(/?)([A-Za-z][\w.-]*)>")
# Skipped: what's in them isn't text on the page.
SCRIPT_STYLE = re.compile(r"(<(script|style)\b.*?</\2>)", re.S | re.I)
# HTML, SVG and MathML elements: any other bare tag is a placeholder.
# Keep in step with HTML_ELEMENTS in javascripts/writer.js.
HTML_ELEMENTS = frozenset("""
    a abbr address area article aside audio b base bdi bdo big blockquote body br button canvas caption
    center cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset
    figcaption figure font footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input
    ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option
    output p param picture pre progress q rp rt ruby s samp script search section select slot small
    source span strike strong style sub summary sup table tbody td template textarea tfoot th thead time
    title tr track tt u ul var video wbr
    svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textpath
    lineargradient radialgradient stop clippath mask pattern marker filter foreignobject desc image switch
    math mi mo mn ms mrow msup msub msubsup mfrac msqrt mroot mtext mspace mtable mtr mtd semantics annotation
""".split())

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


# ── Placeholders ──

def _placeholder(match):
    if match.group(2).lower() in HTML_ELEMENTS:
        return match.group(0)
    return f"&lt;{match.group(1)}{match.group(2)}&gt;"


def _placeholders(html_content):
    parts = SCRIPT_STYLE.split(html_content)
    # split() gives text, script or style, its tag name, text, ...
    return "".join(
        BARE_TAG.sub(_placeholder, part) if i % 3 == 0 else part
        for i, part in enumerate(parts)
    )


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
    # Before the anatomy, so a part written as <env> matches its term.
    html_content = _placeholders(html_content)
    html_content = UI_PATH.sub(_ui_path, html_content)
    html_content = ANATOMY.sub(lambda m: _anatomy(m, page), html_content)
    html_content = OUTPUT_BLOCK.sub(lambda m: f'<div class="{m.group(1)} no-copy"', html_content)
    html_content = DRAWIO_IMG.sub(_drawio, html_content)
    html_content = DRAWIO_ALONE.sub(r"\1", html_content)
    return html_content
