/* Converters for the page writer (javascripts/writer.js), which loads this
 * file on the Write page only: what someone pastes or opens, turned into the
 * Markdown this site builds.
 *
 *   htmlToMarkdown  formatted text from the clipboard: Word, Outlook, Teams,
 *                   Google Docs, web pages, the Azure DevOps wiki, Confluence,
 *                   Excel. Headings, lists, tables, links, code and images
 *                   come across; the styling around them doesn't.
 *   fromAdo         Markdown written for the Azure DevOps wiki (or GitHub):
 *                   [[_TOC_]], ::: mermaid, > [!NOTE] and image sizes, in the
 *                   syntax this site uses instead.
 *   tsvToTable      cells copied as plain text (tab-separated) as a table.
 *
 * Nothing here touches the writer's state: links and images go through the
 * callbacks the writer passes in (opts.link, opts.image), so it can point
 * them at the site's pages and keep the images a page brings.
 *
 * Exposed as window.docsWriterConvert. */
(function () {
  "use strict";

  /* ── Small helpers ── */

  function lines(text) {
    return String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  }

  function repeat(text, n) {
    return new Array(n + 1).join(text);
  }

  // A fence longer than any run of backticks in the code.
  function fenceFor(code) {
    var longest = 2;
    (String(code).match(/^\s*`{3,}/gm) || []).forEach(function (run) {
      longest = Math.max(longest, run.trim().length);
    });
    return repeat("`", longest + 1);
  }

  // Inline code that may itself hold backticks: a longer run around it.
  function codeSpan(text) {
    var longest = 0;
    (text.match(/`+/g) || []).forEach(function (run) {
      longest = Math.max(longest, run.length);
    });
    var ticks = repeat("`", longest + 1);
    var pad = /^`|`$/.test(text) ? " " : "";
    return ticks + pad + text + pad + ticks;
  }

  function styleOf(node) {
    return (node.getAttribute && node.getAttribute("style")) || "";
  }

  // Word, Google Docs and Outlook say bold and italic with styles on spans.
  function styled(node, prop, pattern) {
    var m = new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)", "i").exec(styleOf(node));
    return !!(m && pattern.test(m[1].trim()));
  }

  var MONO = /(consolas|courier|monaco|menlo|monospace|lucida console|source code|jetbrains|fira code|cascadia)/i;

  /* ── Clipboard HTML: is it worth converting? ──
     Formatted text is; so is anything with structure. Code copied from an
     editor like VS Code comes as coloured spans in a monospace box, and the
     plain text is what the writer wants from that. */

  var SEMANTIC = "h1,h2,h3,h4,h5,h6,ul,ol,li,table,pre,blockquote,img,a[href],strong,em,code,hr,dl,s,del,strike,mark,kbd,sup,sub,figure";

  function isRichHtml(html) {
    if (!html || !/<[a-z]/i.test(html)) return false;
    var doc = parse(html);
    var body = doc.body;
    if (!body || !body.textContent.trim() && !body.querySelector("img")) return false;
    var semantic = body.querySelector(SEMANTIC);
    // b and i count unless Google Docs' wrapper, which is a normal-weight <b>.
    var bold = Array.prototype.some.call(body.querySelectorAll("b, i, span"), function (node) {
      if (node.tagName === "B") return !styled(node, "font-weight", /^(normal|[1-5]00)$/);
      if (node.tagName === "I") return true;
      return styled(node, "font-weight", /^(bold|[6-9]00)$/) || styled(node, "font-style", /italic/);
    });
    if (!semantic && !bold) return false;
    // An editor's copy: everything in one box with a monospace font and
    // pre-formatted whitespace, and nothing more than spans inside.
    var box = body.firstElementChild;
    if (box && body.children.length === 1 && (styled(box, "white-space", /pre/) || styled(box, "font-family", MONO)) && !box.querySelector(SEMANTIC.replace(/,?code/, ""))) return false;
    return true;
  }

  function parse(html) {
    // Word puts its lists' bullets inside conditional comments; the parser
    // keeps what's between them, so drop the comment markers only.
    html = String(html)
      .replace(/<!--\[if !supportLists\]-->/gi, "")
      .replace(/<!--\[endif\]-->/gi, "")
      .replace(/<!--StartFragment-->|<!--EndFragment-->/gi, "");
    return new DOMParser().parseFromString(html, "text/html");
  }

  /* ── Tidying the pasted document before it's read ── */

  var DROP = "script, style, meta, link, title, head, noscript, iframe, object, embed, video, audio, canvas, svg, button, select, textarea, form, template, o\\:p, xml";

  function tidy(doc) {
    var body = doc.body;
    body.querySelectorAll(DROP).forEach(function (node) {
      // Word's empty paragraphs are an <o:p> with a space: keep the space.
      if (/^o:p$/i.test(node.tagName)) node.replaceWith(doc.createTextNode(node.textContent));
      else node.remove();
    });
    // Comments that are left.
    var walker = doc.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
    var comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach(function (c) {
      c.remove();
    });
    // Heading permalinks (the ¶ or # a site adds after each heading).
    body.querySelectorAll("h1 a, h2 a, h3 a, h4 a, h5 a, h6 a").forEach(function (a) {
      var text = a.textContent.trim();
      if (!text || /^[¶#§🔗]$/.test(text) || /headerlink|anchor/i.test(a.className)) a.remove();
    });
    wordLists(doc);
    ariaLists(doc);
  }

  // Word writes a list as paragraphs with mso-list in their style and the
  // bullet or number as text in a span: rebuild real lists from them.
  function wordLists(doc) {
    var paras = Array.prototype.filter.call(doc.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6"), function (p) {
      return /mso-list\s*:\s*l\d+\s+level\d+/i.test(styleOf(p));
    });
    if (!paras.length) return;
    var groups = [];
    paras.forEach(function (p) {
      var last = groups[groups.length - 1];
      var prev = last && last[last.length - 1];
      if (prev && nextElement(prev) === p) last.push(p);
      else groups.push([p]);
    });
    groups.forEach(function (group) {
      var root = null;
      var stack = [];
      group.forEach(function (p) {
        var level = +/level(\d+)/i.exec(styleOf(p))[1];
        var marker = "";
        p.querySelectorAll("span").forEach(function (span) {
          if (!marker && /mso-list\s*:\s*ignore/i.test(styleOf(span))) {
            marker = span.textContent.replace(/\s+/g, "");
            span.remove();
          }
        });
        var ordered = /^(\d+|[a-z]{1,4}|[ivxlc]+)[.)]$/i.test(marker);
        while (stack.length > level) stack.pop();
        while (stack.length < level) {
          var list = doc.createElement(ordered ? "ol" : "ul");
          if (!stack.length) {
            root = list;
            p.parentNode.insertBefore(list, p);
          } else {
            var parent = stack[stack.length - 1];
            var host = parent.lastElementChild || parent.appendChild(doc.createElement("li"));
            host.appendChild(list);
          }
          stack.push(list);
        }
        var li = doc.createElement("li");
        while (p.firstChild) li.appendChild(p.firstChild);
        stack[stack.length - 1].appendChild(li);
        p.remove();
      });
      return root;
    });
  }

  function nextElement(node) {
    var next = node.nextSibling;
    while (next && next.nodeType === 3 && !next.textContent.trim()) next = next.nextSibling;
    return next;
  }

  // Google Docs writes nested lists flat, with the depth in aria-level.
  function ariaLists(doc) {
    doc.body.querySelectorAll("ul, ol").forEach(function (list) {
      var items = Array.prototype.filter.call(list.children, function (li) {
        return li.tagName === "LI" && +li.getAttribute("aria-level") > 1;
      });
      if (!items.length || !list.isConnected) return;
      // Each level: its list, and the item a deeper one goes under.
      var stack = [{ level: 1, list: list, last: null }];
      Array.prototype.slice.call(list.children).forEach(function (li) {
        var level = +li.getAttribute("aria-level") || 1;
        while (stack.length > 1 && stack[stack.length - 1].level > level) stack.pop();
        var top = stack[stack.length - 1];
        if (level > top.level && top.last) {
          var sub = doc.createElement(list.tagName);
          top.last.appendChild(sub);
          stack.push({ level: level, list: sub, last: null });
          top = stack[stack.length - 1];
        }
        top.list.appendChild(li);
        top.last = li;
      });
    });
  }

  /* ── Reading HTML into Markdown ──
     Block elements become blocks separated by an empty line. Inline content
     becomes runs of text, each with its formatting, so that bold spans
     next to each other come out as one **run** rather than **a****b**. */

  var BLOCKS = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|TABLE|THEAD|TBODY|TFOOT|TR|HR|FIGURE|FIGCAPTION|DL|DT|DD|SECTION|ARTICLE|MAIN|HEADER|FOOTER|ASIDE|NAV|DETAILS|SUMMARY|ADDRESS|CENTER|BODY)$/;

  function isBlock(node) {
    return node.nodeType === 1 && BLOCKS.test(node.tagName);
  }

  function htmlToMarkdown(html, opts) {
    opts = opts || {};
    var doc = parse(html);
    tidy(doc);
    var ctx = { opts: opts, headings: [], notes: {}, images: 0, lostImages: 0 };
    var md = blocks(doc.body, ctx);
    md = settleHeadings(md, ctx);
    md = md.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "").replace(/^\n+|\n+$/g, "");
    var notes = [];
    if (ctx.lostImages) notes.push(ctx.lostImages === 1 ? "1 image couldn't be copied: paste or drop it on its own" : ctx.lostImages + " images couldn't be copied: paste or drop them on their own");
    return { md: md, notes: notes, images: ctx.images };
  }

  // Headings are written with a marker for their level, then settled here:
  // the page's title is its only # heading, so a paste whose top heading is
  // a # moves every heading down one.
  function settleHeadings(md, ctx) {
    var min = Math.min.apply(null, ctx.headings.concat([7]));
    var shift = min === 1 ? 1 : 0;
    return md.replace(/\u0002(\d)\u0002/g, function (all, level) {
      return repeat("#", Math.min(6, +level + shift));
    });
  }

  // The blocks inside node, as Markdown.
  function blocks(node, ctx) {
    var out = [];
    var inlineNodes = [];
    function flush() {
      if (!inlineNodes.length) return;
      var text = paragraph(inlineNodes, ctx);
      inlineNodes = [];
      if (text.trim()) out.push(text);
    }
    Array.prototype.forEach.call(node.childNodes, function (child) {
      if (isBlock(child)) {
        flush();
        var md = block(child, ctx);
        if (md && md.trim()) out.push(md);
      } else if (holdsBlocks(child)) {
        // An inline element around whole paragraphs, as Google Docs wraps
        // everything in a <b>: read what's inside as blocks.
        flush();
        var inner = blocks(child, ctx);
        if (inner.trim()) out.push(inner);
      } else inlineNodes.push(child);
    });
    flush();
    return out.join("\n\n");
  }

  function holdsBlocks(node) {
    if (node.nodeType !== 1 || node.tagName === "A" && !node.querySelector("p, ul, ol, table, h1, h2, h3, h4, h5, h6")) return false;
    return !!node.querySelector("p, div, ul, ol, table, pre, blockquote, h1, h2, h3, h4, h5, h6, hr, dl, figure");
  }

  function block(node, ctx) {
    var tag = node.tagName;
    var m = /^H([1-6])$/.exec(tag);
    if (m) {
      var text = serialize(runs(node.childNodes, ctx, { heading: true }), ctx).replace(/\s*[\n\u0001]\s*/g, " ").trim();
      if (!text) return "";
      ctx.headings.push(+m[1]);
      return "\u0002" + m[1] + "\u0002 " + text;
    }
    switch (tag) {
      case "UL":
      case "OL":
        return list(node, ctx);
      case "LI":
        return list(wrapIn(node, "ul"), ctx);
      case "BLOCKQUOTE":
        return quote(blocks(node, ctx));
      case "PRE":
        return pre(node);
      case "TABLE":
        return table(node, ctx);
      case "HR":
        return "---";
      case "FIGURE":
        return figure(node, ctx);
      case "DL":
        return definitions(node, ctx);
      case "DETAILS":
        return details(node, ctx);
      case "THEAD":
      case "TBODY":
      case "TFOOT":
      case "TR":
        return table(wrapIn(node, "table"), ctx);
    }
    // A <p class="MsoTitle"> is the document's title.
    if (/\bMsoTitle\b/.test(node.className || "")) {
      var title = serialize(runs(node.childNodes, ctx, { heading: true }), ctx).trim();
      if (!title) return "";
      ctx.headings.push(1);
      return "\u0002" + 1 + "\u0002 " + title;
    }
    return blocks(node, ctx);
  }

  function wrapIn(node, tag) {
    var box = node.ownerDocument.createElement(tag);
    box.appendChild(node.cloneNode(true));
    return box;
  }

  function quote(text) {
    if (!text.trim()) return "";
    return lines(text)
      .map(function (line) {
        return line ? "> " + line : ">";
      })
      .join("\n");
  }

  // Code: the language from the class, as sites and highlighters write it.
  function pre(node) {
    var code = node.querySelector("code") || node;
    var text = code.textContent.replace(/ /g, " ").replace(/\n$/, "");
    if (!text.trim()) return "";
    var lang = "";
    [code, node, node.parentNode, node.parentNode && node.parentNode.parentNode].forEach(function (el) {
      if (lang || !el || !el.className || typeof el.className !== "string") return;
      var m = /(?:^|\s)(?:language|lang|highlight-source|brush:?)-?([\w+#-]+)/.exec(el.className);
      if (m && !/^(plaintext|text|none|highlight)$/i.test(m[1])) lang = m[1].toLowerCase();
    });
    if (!lang && node.getAttribute("lang")) lang = node.getAttribute("lang").toLowerCase();
    var fence = fenceFor(text);
    return fence + (lang ? " " + lang : "") + "\n" + text + "\n" + fence;
  }

  function list(node, ctx) {
    var ordered = node.tagName === "OL";
    var n = parseInt(node.getAttribute("start"), 10) || 1;
    var items = [];
    var loose = false;
    Array.prototype.forEach.call(node.children, function (li) {
      if (li.tagName !== "LI") {
        // A list straight inside a list: it belongs to the item before.
        if (/^(UL|OL)$/.test(li.tagName) && items.length) items[items.length - 1] += "\n" + indent(list(li, ctx), 4);
        return;
      }
      var task = "";
      var box = li.querySelector("input[type=checkbox]");
      if (box && box.closest("li") === li) {
        task = box.checked || box.hasAttribute("checked") ? "[x] " : "[ ] ";
        box.remove();
      }
      // A list inside the item follows its text on the next line.
      var body = blocks(li, ctx).replace(/^\s+/, "").replace(/\n\n(?=(?:[-*+]|\d+[.)]) )/g, "\n");
      // Checkboxes typed as characters, as Word and Loop paste them.
      var mark = /^(☐|□|◻|⬜)\s*/.exec(body) || /^(☑|☒|✅|✓|✔|■)\s*/.exec(body);
      if (!task && mark) {
        task = /^(☐|□|◻|⬜)/.test(mark[1]) ? "[ ] " : "[x] ";
        body = body.slice(mark[0].length);
      }
      if (!body.trim() && !task) return;
      var parts = body.split(/\n\n/);
      if (parts.length > 1 && parts.slice(1).some(function (p) { return !/^(\s*[-*+] |\s*\d+[.)] |    )/.test(p); })) loose = true;
      var marker = ordered ? n++ + ". " : "- ";
      items.push(marker + task + indentRest(body, 4));
    });
    return items.join(loose ? "\n\n" : "\n");
  }

  function indent(text, n) {
    var pad = repeat(" ", n);
    return lines(text)
      .map(function (line) {
        return line.trim() ? pad + line : "";
      })
      .join("\n");
  }

  // Every line but the first, indented: the text under a list marker.
  function indentRest(text, n) {
    var pad = repeat(" ", n);
    return lines(text)
      .map(function (line, i) {
        return i === 0 || !line.trim() ? line : pad + line;
      })
      .join("\n");
  }

  function figure(node, ctx) {
    var img = node.querySelector("img");
    var caption = node.querySelector("figcaption");
    if (!img) return blocks(node, ctx);
    var md = image(img, ctx);
    if (!md) return caption ? paragraph([caption], ctx) : "";
    var text = caption ? serialize(runs(caption.childNodes, ctx, {}), ctx).trim() : "";
    var out = ['<figure class="screenshot" markdown="span">', "  " + md];
    if (text) out.push("  <figcaption>" + text + "</figcaption>");
    out.push("</figure>");
    return out.join("\n");
  }

  function definitions(node, ctx) {
    var out = [];
    Array.prototype.forEach.call(node.children, function (child) {
      if (child.tagName === "DT") out.push((out.length ? "\n" : "") + paragraph(child.childNodes, ctx).replace(/\n/g, " "));
      else if (child.tagName === "DD") out.push(":   " + indentRest(blocks(child, ctx), 4));
    });
    return out.join("\n");
  }

  function details(node, ctx) {
    var summary = node.querySelector("summary");
    var title = summary ? serialize(runs(summary.childNodes, ctx, { heading: true }), ctx).trim() : "";
    if (summary) summary.remove();
    var body = blocks(node, ctx);
    return (node.open ? "???+" : "???") + " note" + (title ? ' "' + title.replace(/"/g, "&quot;") + '"' : "") + (body ? "\n" + indent(body, 4) : "");
  }

  /* Tables: one row per line, header first. A table that's only there for
     layout (one row or one column, as emails use) is read as its content. */

  function table(node, ctx) {
    var rows = [];
    Array.prototype.forEach.call(node.querySelectorAll("tr"), function (tr) {
      if (tr.closest("table") !== node) return;
      var row = [];
      Array.prototype.forEach.call(tr.children, function (cell) {
        if (!/^T[DH]$/.test(cell.tagName)) return;
        row.push(cellText(cell, ctx));
        var span = parseInt(cell.getAttribute("colspan"), 10) || 1;
        for (var k = 1; k < span && k < 20; k++) row.push("");
      });
      if (row.length) rows.push(row);
    });
    // Rows that are empty all the way across, as Excel pastes at the end.
    rows = rows.filter(function (r) {
      return r.some(function (c) {
        return c.trim();
      });
    });
    if (!rows.length) return "";
    var cols = Math.max.apply(null, rows.map(function (r) {
      return r.length;
    }));
    // Columns empty all the way down.
    var keep = [];
    for (var c = 0; c < cols; c++) {
      keep[c] = rows.some(function (r) {
        return (r[c] || "").trim();
      });
    }
    rows = rows.map(function (r) {
      var out = [];
      for (var c = 0; c < cols; c++) if (keep[c]) out.push(r[c] || "");
      return out;
    });
    cols = rows[0].length;
    if (rows.length === 1 || cols === 1) {
      var parts = [];
      node.querySelectorAll("td, th").forEach(function (cell) {
        if (cell.closest("table") !== node) return;
        var text = blocks(cell, ctx);
        if (text.trim()) parts.push(text);
      });
      return parts.join("\n\n");
    }
    return formatTable(rows);
  }

  function cellText(cell, ctx) {
    var text = blocks(cell, ctx);
    return text
      .replace(/\u0002(\d)\u0002 /g, "")
      .replace(/\n\n+/g, "<br>")
      .replace(/\n/g, "<br>")
      .replace(/(^|[^\\])\|/g, "$1\\|")
      .trim();
  }

  // rows: arrays of cell text; the first is the header.
  function formatTable(rows, align) {
    var cols = rows[0].length;
    var widths = [];
    for (var c = 0; c < cols; c++) {
      widths[c] = 3;
      rows.forEach(function (r) {
        widths[c] = Math.max(widths[c], (r[c] || "").length);
      });
    }
    function pad(text, width) {
      text = text || "";
      return text + repeat(" ", Math.max(0, width - text.length));
    }
    function line(r) {
      return "| " + widths.map(function (w, i) {
        return pad(r[i], w);
      }).join(" | ") + " |";
    }
    var sep = "| " + widths.map(function (w, i) {
      var a = (align || [])[i];
      var dashes = repeat("-", w);
      if (a === "center") return ":" + dashes.slice(2) + ":";
      if (a === "right") return dashes.slice(1) + ":";
      if (a === "left") return ":" + dashes.slice(1);
      return dashes;
    }).join(" | ") + " |";
    return [line(rows[0]), sep].concat(rows.slice(1).map(line)).join("\n");
  }

  /* Inline content: runs of text with the formatting each one has. */

  function paragraph(nodes, ctx) {
    var text = joinKeys(serialize(runs(nodes, ctx, {}), ctx));
    // A line break inside a paragraph starts a new one: Markdown has no
    // visible way to write a break, and paragraphs read the same.
    return text
      .split("\u0001")
      .map(function (part) {
        return escapeLineStarts(part.trim());
      })
      .filter(Boolean)
      .join("\n\n");
  }

  // fmt: the formatting the parent gives its content.
  function runs(nodes, ctx, fmt) {
    var out = [];
    Array.prototype.forEach.call(nodes, function (node) {
      collect(node, ctx, fmt, out);
    });
    return out;
  }

  function collect(node, ctx, fmt, out) {
    if (node.nodeType === 3) {
      var text = node.textContent.replace(/[​‌‍﻿]/g, "");
      if (!fmt.code) text = text.replace(/ /g, " ").replace(/\s+/g, " ");
      else text = text.replace(/ /g, " ");
      if (text) out.push({ text: text, fmt: fmt });
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName;
    if (tag === "BR") {
      out.push({ raw: "\u0001", fmt: fmt });
      return;
    }
    if (tag === "IMG") {
      var img = image(node, ctx);
      if (img) out.push({ raw: img, fmt: fmt });
      return;
    }
    if (tag === "INPUT") return;
    if (isBlock(node)) {
      // A block inside inline content (a <div> in a <span>): its own line.
      out.push({ raw: "\u0001", fmt: fmt });
      runs(node.childNodes, ctx, fmt).forEach(function (r) {
        out.push(r);
      });
      out.push({ raw: "\u0001", fmt: fmt });
      return;
    }
    var next = Object.assign({}, fmt);
    if (tag === "A") {
      // Not "#section" links: they point into the page this came from.
      var href = (node.getAttribute("href") || "").trim();
      if (href && href[0] !== "#" && !/^\s*javascript:/i.test(href)) {
        var made = ctx.opts.link ? ctx.opts.link(href) : null;
        next.href = (made && (made.href || made)) || href;
        next.hrefFrom = href;
        next.hrefTitle = (made && made.title) || "";
      }
    } else if (tag === "STRONG" || (tag === "B" && !styled(node, "font-weight", /^(normal|[1-5]00)$/))) next.bold = true;
    else if (tag === "EM" || tag === "I" || tag === "CITE" || tag === "DFN") next.italic = true;
    else if (tag === "S" || tag === "DEL" || tag === "STRIKE") next.strike = true;
    else if (tag === "MARK") next.mark = true;
    else if (tag === "CODE" || tag === "TT" || tag === "SAMP" || tag === "VAR") next.code = true;
    else if (tag === "KBD") next.kbd = true;
    else if (tag === "SUP") next.sup = true;
    else if (tag === "SUB") next.sub = true;
    if (tag === "SPAN" || tag === "FONT" || tag === "B" || tag === "A" || tag === "P") {
      if (styled(node, "font-weight", /^(bold|bolder|[6-9]00)$/)) next.bold = true;
      if (styled(node, "font-weight", /^(normal|[1-5]00)$/) && tag !== "B") next.bold = false;
      if (styled(node, "font-style", /italic|oblique/)) next.italic = true;
      if (styled(node, "text-decoration(?:-line)?", /line-through/)) next.strike = true;
      if (styled(node, "font-family", MONO) || (tag === "FONT" && MONO.test(node.getAttribute("face") || ""))) next.code = true;
      if (styled(node, "vertical-align", /super/)) next.sup = true;
      if (styled(node, "vertical-align", /sub/)) next.sub = true;
    }
    if (fmt.heading) {
      next.bold = false;
      next.italic = false;
    }
    Array.prototype.forEach.call(node.childNodes, function (child) {
      collect(child, ctx, next, out);
    });
  }

  function image(node, ctx) {
    var src = (node.getAttribute("src") || "").trim();
    var alt = (node.getAttribute("alt") || node.getAttribute("title") || "").replace(/[\[\]\n]/g, " ").trim();
    var w = parseInt(node.getAttribute("width"), 10);
    var hgt = parseInt(node.getAttribute("height"), 10);
    // Tracking pixels and spacers.
    if ((w && w <= 2) || (hgt && hgt <= 2)) return "";
    if (!src) return "";
    if (ctx.opts.image) {
      var made = ctx.opts.image(src, alt);
      if (made === null || made === "") {
        ctx.lostImages++;
        return "";
      }
      if (made) src = made;
    } else if (/^(data|blob|file|cid):/i.test(src)) {
      ctx.lostImages++;
      return "";
    }
    ctx.images++;
    // Width only when it was chosen smaller than the image, as a hint.
    return "![" + (alt || "Describe what the image shows") + "](" + src.replace(/ /g, "%20").replace(/\)/g, "%29") + ")" + (w && w >= 40 && w < 1600 && !/^data:/i.test(src) ? '{ width="' + w + '" }' : "");
  }

  function same(a, b, keys) {
    for (var i = 0; i < keys.length; i++) if (!!a[keys[i]] !== !!b[keys[i]]) return false;
    return true;
  }

  var MARKS = [
    ["bold", "**"],
    ["italic", "*"],
    ["strike", "~~"],
    ["mark", "=="],
  ];

  // Runs into Markdown: markers open and close as the formatting changes,
  // and hug the text, with the spaces outside them.
  function serialize(list, ctx) {
    var out = "";
    var i = 0;
    while (i < list.length) {
      var run = list[i];
      if (run.fmt.href) {
        var j = i;
        var inner = [];
        while (j < list.length && list[j].fmt.href === run.fmt.href) {
          var copy = Object.assign({}, list[j]);
          copy.fmt = Object.assign({}, list[j].fmt, { href: null });
          inner.push(copy);
          j++;
        }
        out += link(serialize(inner, ctx), run.fmt);
        i = j;
        continue;
      }
      if ((run.fmt.code || run.fmt.kbd) && run.raw == null) {
        var k = i;
        var code = "";
        while (k < list.length && list[k].raw == null && !list[k].fmt.href && same(list[k].fmt, run.fmt, ["code", "kbd", "bold", "italic", "strike"])) code += list[k++].text;
        var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(code.replace(/\n/g, " "));
        if (m[2]) {
          var span = run.fmt.kbd && keys(m[2]) ? keys(m[2]) : codeSpan(m[2]);
          out += m[1] + wrapMarks(span, run.fmt) + m[3];
        } else out += code;
        i = k;
        continue;
      }
      // A stretch with the same bold/italic/strike/mark: one set of markers.
      var n = i;
      var text = "";
      while (n < list.length && !list[n].fmt.href && (list[n].raw != null || (!list[n].fmt.code && !list[n].fmt.kbd)) && same(list[n].fmt, run.fmt, ["bold", "italic", "strike", "mark", "sup", "sub"])) {
        text += list[n].raw != null ? list[n].raw : escapeText(list[n].text);
        n++;
      }
      if (run.fmt.sup || run.fmt.sub) {
        var mark = run.fmt.sup ? "^" : "~";
        var t = text.trim();
        text = t && !/\s/.test(t) ? text.replace(t, mark + t + mark) : text;
      }
      out += wrapMarks(text, run.fmt);
      i = n > i ? n : i + 1;
    }
    return out;
  }

  // Around the words only: "**bold** " rather than "**bold **". Line breaks
  // (\u0001) end the markers and start them again on the other side.
  function wrapMarks(text, fmt) {
    var open = "";
    var close = "";
    MARKS.forEach(function (pair) {
      if (fmt[pair[0]]) {
        open += pair[1];
        close = pair[1] + close;
      }
    });
    if (!open) return text;
    return text
      .split("\u0001")
      .map(function (part) {
        var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(part);
        return m[2] ? m[1] + open + m[2] + close + m[3] : part;
      })
      .join("\u0001");
  }

  function link(text, fmt) {
    var plain = text.replace(/\\(.)/g, "$1").trim();
    if (!plain) return "";
    var href = fmt.href.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
    // A web address shown as itself: the page's title if it's one of the
    // site's, or <https://…>, which the site makes a link.
    if (plain === fmt.hrefFrom || plain === fmt.hrefFrom.replace(/^mailto:/, "")) {
      if (fmt.hrefTitle) return "[" + escapeText(fmt.hrefTitle) + "](" + href + ")";
      if (/^(https?:|mailto:)/.test(href)) return "<" + href.replace(/^mailto:/, "") + ">";
    }
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    return m[1] + "[" + m[2] + "](" + href + ")" + m[3];
  }

  // <kbd>Ctrl</kbd>+<kbd>C</kbd> or <kbd>Ctrl+C</kbd>: ++ctrl+c++.
  function keys(text) {
    var parts = text.split(/\s*\+\s*/);
    if (!parts.every(function (p) { return /^[\w-]{1,12}$/.test(p); })) return "";
    return "++" + parts.map(function (p) {
      return p.toLowerCase().replace(/^(control)$/, "ctrl").replace(/^(escape)$/, "esc").replace(/^(windows)$/, "win");
    }).join("+") + "++";
  }

  // <kbd>Ctrl</kbd>+<kbd>C</kbd> comes out as ++ctrl++ + ++c++: one ++ctrl+c++.
  function joinKeys(text) {
    var re = /\+\+([a-z0-9-]+(?:\+[a-z0-9-]+)*)\+\+ ?\+ ?\+\+([a-z0-9-]+(?:\+[a-z0-9-]+)*)\+\+/g;
    var before;
    do {
      before = text;
      text = text.replace(re, "++$1+$2++");
    } while (text !== before);
    return text;
  }

  // Text that Markdown would otherwise read as formatting.
  function escapeText(text) {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/([*`])/g, "\\$1")
      .replace(/(^|[^\w])_|_(?=[^\w]|$)/g, function (all) {
        return all.replace("_", "\\_");
      })
      .replace(/<(?=[a-z/!?])/gi, "&lt;");
  }

  // A paragraph line that starts like a heading, a list or a quote.
  function escapeLineStarts(text) {
    return lines(text)
      .map(function (line) {
        return line
          .replace(/^(\s*)(#{1,6}\s|>|[-+]\s|={3}|!{3}|\?{3}|\|)/, function (all, pad, mark) {
            return pad + "\\" + mark;
          })
          .replace(/^(\s*\d+)([.)]\s)/, "$1\\$2");
      })
      .join("\n");
  }

  /* ── Azure DevOps wiki (and GitHub) Markdown ── */

  var ADO_SIGNS = [
    /^\s*\[\[_TO(?:C|SP)_\]\]\s*$/im,
    /^\s*:::\s*mermaid\s*$/im,
    /^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/im,
    /\]\([^)\s]+\s+=\d*x\d*\)/,
    /\]\(\/?\.attachments\//,
  ];

  function looksLikeAdo(md) {
    return ADO_SIGNS.some(function (re) {
      return re.test(md);
    });
  }

  var ALERTS = { NOTE: "note", TIP: "tip", IMPORTANT: "info", WARNING: "warning", CAUTION: "danger" };

  // opts.link(href): a wiki link's new address, or nothing to leave it.
  // Returns { md, notes }; notes say what changed, for the writer's toast.
  function fromAdo(md, opts) {
    opts = opts || {};
    var ls = lines(md);
    var out = [];
    var notes = { toc: 0, mermaid: 0, alerts: 0, sizes: 0, links: 0, attachments: 0, blocks: 0 };
    var fence = null;
    for (var i = 0; i < ls.length; i++) {
      var line = ls[i];
      var f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length && /^\s*(`{3,}|~{3,})\s*$/.test(line)) fence = null;
        out.push(line);
        continue;
      }
      if (f) {
        fence = f[1];
        out.push(line);
        continue;
      }
      if (/^\s*\[\[_TO(?:C|SP)_\]\]\s*$/i.test(line)) {
        notes.toc++;
        // Don't leave two empty lines where it was.
        if (!(ls[i + 1] || "").trim() && (!out.length || !out[out.length - 1].trim())) i++;
        continue;
      }
      var mm = /^(\s*):::\s*mermaid\s*$/i.exec(line);
      if (mm) {
        var body = [];
        var j = i + 1;
        while (j < ls.length && !/^\s*:::\s*$/.test(ls[j])) body.push(ls[j++]);
        out.push(mm[1] + "``` mermaid");
        body.forEach(function (b) {
          out.push(b);
        });
        out.push(mm[1] + "```");
        notes.mermaid++;
        i = j;
        continue;
      }
      if (/^\s*:::\s*[\w-]+/.test(line)) notes.blocks++;
      var alert = /^(\s*)>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(line);
      if (alert) {
        var inner = [];
        if (alert[3].trim()) inner.push(alert[3].trim());
        var k = i + 1;
        while (k < ls.length && /^\s*>/.test(ls[k])) inner.push(ls[k++].replace(/^\s*>\s?/, ""));
        while (inner.length && !inner[inner.length - 1].trim()) inner.pop();
        out.push(alert[1] + "!!! " + ALERTS[alert[2].toUpperCase()]);
        inner.forEach(function (b) {
          out.push(b.trim() ? alert[1] + "    " + b : "");
        });
        notes.alerts++;
        i = k - 1;
        continue;
      }
      out.push(inlineAdo(line, opts, notes));
    }
    var text = out.join("\n");
    var list = [];
    if (notes.toc) list.push("took out [[_TOC_]] (the site shows a table of contents by itself)");
    if (notes.mermaid) list.push("turned " + (notes.mermaid === 1 ? "a ::: mermaid block" : notes.mermaid + " ::: mermaid blocks") + " into ``` mermaid");
    if (notes.alerts) list.push("turned " + (notes.alerts === 1 ? "a > [!NOTE] block into a callout" : notes.alerts + " > [!NOTE] blocks into callouts"));
    if (notes.sizes) list.push("kept " + (notes.sizes === 1 ? "an image's width" : notes.sizes + " image widths"));
    if (notes.links) list.push("pointed " + (notes.links === 1 ? "a wiki link" : notes.links + " wiki links") + " at pages on this site");
    if (notes.attachments) list.push("found " + (notes.attachments === 1 ? "an image or file" : notes.attachments + " images and files") + " in the wiki's .attachments folder: drop them in and the page links them up");
    if (notes.blocks) list.push("left " + (notes.blocks === 1 ? "a ::: block" : notes.blocks + " ::: blocks") + " this site has no match for");
    return { md: text, notes: list, changed: text !== md };
  }

  // ![alt](path =500x250) and wiki links, on one line (outside code).
  function inlineAdo(line, opts, notes) {
    var parts = line.split(/(`+[^`]*`+)/);
    return parts
      .map(function (part, i) {
        if (i % 2) return part;
        return part
          .replace(/(!\[[^\]]*\]\(\s*)([^)\s]+)\s+=(\d*)x(\d*)\s*\)/g, function (all, head, src, w) {
            notes.sizes++;
            return head + src + ")" + (w ? '{ width="' + w + '" }' : "");
          })
          .replace(/(!?\[[^\]]*\]\(\s*)([^)\s]+)/g, function (all, head, href) {
            if (/^\/?\.attachments\//.test(href)) {
              notes.attachments++;
              return all;
            }
            if (head[0] !== "!" && opts.link && href[0] === "/" && href[1] !== "/") {
              var next = opts.link(href);
              if (next && typeof next === "object") next = next.href;
              if (next && next !== href) {
                notes.links++;
                return head + next;
              }
            }
            return all;
          });
      })
      .join("");
  }

  // Markdown with # headings of its own, going under a page's title: each
  // heading down a level (outside code), so the title stays the only #.
  function demoteHeadings(md) {
    var ls = lines(md);
    var fence = null;
    var outside = ls.map(function (line) {
      var f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
        return false;
      }
      if (f) {
        fence = f[1];
        return false;
      }
      return true;
    });
    if (!ls.some(function (line, i) { return outside[i] && /^#\s/.test(line); })) return md;
    return ls
      .map(function (line, i) {
        return outside[i] && /^#{1,5}\s/.test(line) ? "#" + line : line;
      })
      .join("\n");
  }

  /* ── Cells copied as text: tab-separated rows ── */

  function tsvToTable(text) {
    var ls = lines(text);
    while (ls.length && !ls[ls.length - 1].trim()) ls.pop();
    if (ls.length < 2) return null;
    var cols = ls[0].split("\t").length;
    if (cols < 2) return null;
    for (var i = 1; i < ls.length; i++) if (ls[i].split("\t").length !== cols) return null;
    var rows = ls.map(function (line) {
      return line.split("\t").map(function (cell) {
        return cell.trim().replace(/^"([\s\S]*)"$/, "$1").replace(/(^|[^\\])\|/g, "$1\\|");
      });
    });
    return formatTable(rows);
  }

  window.docsWriterConvert = {
    isRichHtml: isRichHtml,
    htmlToMarkdown: htmlToMarkdown,
    looksLikeAdo: looksLikeAdo,
    fromAdo: fromAdo,
    demoteHeadings: demoteHeadings,
    tsvToTable: tsvToTable,
    formatTable: formatTable,
  };
})();
