/* Cloud docs components: the parts that need the reader's browser.
 *
 *   Your values   a .your-values list becomes a form; each <placeholder> it
 *                 names is filled into the page's code as the reader types,
 *                 so copied commands work as pasted. Values are saved in this
 *                 browser and shared across pages that use the same name.
 *   Page details  flags the review date as overdue (hooks/page_info.py
 *                 writes the date; the reader's clock decides).
 *   Diagrams      loads the draw.io viewer only on pages that have a
 *                 diagram, and redraws after instant navigation and when a
 *                 content tab shows a diagram that was hidden.
 *
 * Everything re-mounts on Material's document$, like appearance.js. */
(function () {
  "use strict";

  // Keep in sync with plugins.drawio.viewer_js (the plugin's default).
  var DRAWIO_VIEWER = "https://viewer.diagrams.net/js/viewer-static.min.js";
  var STORAGE_PREFIX = "docs.values.";
  var TOKEN = /<([A-Za-z0-9][\w.-]*)>/g;

  var ICON_PENCIL =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.06 9 .94.94L5.92 19H5v-.92zm3.6-6c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29m-3.6 3.19L3 17.25V21h3.75L17.81 9.94z"/></svg>';

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (e) {
      // Private mode / blocked storage: values just won't carry over.
    }
  }

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  /* ── Your values ── */

  /** Wrap each declared <name> in the code as a .ph span. Pygments splits
   *  "<", "name" and ">" into separate spans, so matches are found on the
   *  code's whole text and cut out with a Range across those nodes. */
  function markPlaceholders(code, names) {
    var nodes = [];
    var walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    var text = "";
    while (walker.nextNode()) {
      nodes.push({ node: walker.currentNode, start: text.length });
      text += walker.currentNode.nodeValue;
    }
    var matches = [];
    TOKEN.lastIndex = 0;
    var m;
    while ((m = TOKEN.exec(text))) {
      if (names.indexOf(m[1]) >= 0) matches.push({ name: m[1], start: m.index, end: m.index + m[0].length });
    }
    if (!matches.length) return;

    function locate(offset, isEnd) {
      for (var i = nodes.length - 1; i >= 0; i--) {
        var n = nodes[i];
        if (isEnd ? offset > n.start : offset >= n.start) return { node: n.node, offset: offset - n.start };
      }
      return { node: nodes[0].node, offset: 0 };
    }

    // Last match first, so earlier offsets stay valid as the DOM changes.
    for (var j = matches.length - 1; j >= 0; j--) {
      var match = matches[j];
      var from = locate(match.start, false);
      var to = locate(match.end, true);
      var range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      range.deleteContents();
      var span = el("span", "ph", { "data-ph": match.name });
      range.insertNode(span);
    }
  }

  /** `pulse` briefly lights up each changed span, so a reader typing in the
   *  form can see which parts of the commands their value went into. */
  function fillPlaceholders(name, value, pulse) {
    var token = "<" + name + ">";
    document.querySelectorAll('.md-typeset .ph[data-ph="' + name + '"]').forEach(function (span) {
      span.textContent = value || token;
      span.classList.toggle("ph--filled", !!value);
      if (value) span.title = token;
      else span.removeAttribute("title");
      if (pulse) {
        span.classList.remove("ph--changed");
        void span.offsetWidth; // restart on every keystroke
        span.classList.add("ph--changed");
      }
    });
    document.querySelectorAll('.your-values__input[data-name="' + name + '"]').forEach(function (input) {
      if (input.value !== value) input.value = value;
    });
  }

  function mountValues() {
    var boxes = document.querySelectorAll(".md-typeset .your-values:not([data-mounted])");
    if (!boxes.length) return;

    var names = [];
    boxes.forEach(function (box, b) {
      box.setAttribute("data-mounted", "");
      var fields = [];
      box.querySelectorAll(":scope > ul > li").forEach(function (item) {
        var code = item.querySelector("code");
        var token = code && /^<([A-Za-z0-9][\w.-]*)>$/.exec(code.textContent.trim());
        if (!token) return;
        code.remove();
        fields.push({ name: token[1], label: item.innerHTML.trim() });
      });
      if (!fields.length) return;

      var head = el("div", "your-values__head");
      var title = el("span", "your-values__title");
      title.innerHTML = ICON_PENCIL + "<span>Your values</span>";
      var note = el("span", "your-values__note");
      note.textContent = "Type yours and the commands on this page use them. Saved in this browser only.";
      var clear = el("button", "md-button md-button--ghost md-button--sm", { type: "button" });
      clear.textContent = "Clear";
      head.appendChild(title);
      head.appendChild(note);
      head.appendChild(clear);

      var grid = el("div", "your-values__fields");
      fields.forEach(function (field) {
        names.push(field.name);
        var id = "your-values-" + b + "-" + field.name;
        var wrap = el("div", "your-values__field");
        var label = el("label", "your-values__label", { for: id });
        label.innerHTML = field.label || field.name;
        var input = el("input", "your-values__input", {
          id: id,
          type: "text",
          "data-name": field.name,
          placeholder: "<" + field.name + ">",
          autocomplete: "off",
          autocapitalize: "off",
          spellcheck: "false",
        });
        input.value = read(STORAGE_PREFIX + field.name) || "";
        input.addEventListener("input", function () {
          var value = input.value.trim();
          write(STORAGE_PREFIX + field.name, value);
          fillPlaceholders(field.name, value, true);
        });
        wrap.appendChild(label);
        wrap.appendChild(input);
        grid.appendChild(wrap);
      });

      clear.addEventListener("click", function () {
        fields.forEach(function (field) {
          write(STORAGE_PREFIX + field.name, null);
          fillPlaceholders(field.name, "", true);
        });
        var first = grid.querySelector("input");
        if (first) first.focus();
      });

      box.innerHTML = "";
      box.appendChild(head);
      box.appendChild(grid);
    });

    if (!names.length) return;
    // Markdown blocks are page source (as on the component pages), never a
    // command to run, so their placeholders stay as written; so does anything
    // inside <div class="no-values">, such as a table naming the placeholders.
    document.querySelectorAll(".md-typeset code").forEach(function (code) {
      if (code.closest(".your-values, .anatomy, .no-values, .language-markdown, .language-md")) return;
      // Marked by an earlier box on this page (the page writer adds boxes as
      // you type); marking again would nest the spans.
      if (code.querySelector(".ph")) return;
      markPlaceholders(code, names);
    });
    names.forEach(function (name) {
      fillPlaceholders(name, read(STORAGE_PREFIX + name) || "");
    });
  }

  /* ── Page details: review due ── */

  function mountReviewDates() {
    document.querySelectorAll(".md-typeset .page-info[data-reviewed]").forEach(function (info) {
      var parts = info.getAttribute("data-reviewed").split("-");
      var months = parseInt(info.getAttribute("data-review-months"), 10) || 6;
      var due = new Date(+parts[0], +parts[1] - 1 + months, +parts[2]);
      if (isNaN(due) || new Date() < due) return;
      var review = info.querySelector(".page-info__review");
      if (!review || review.classList.contains("is-overdue")) return;
      review.classList.add("is-overdue");
      review.title = "Due for review since " + due.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      var key = review.querySelector(".page-info__key");
      if (key) key.textContent = "Review overdue · last reviewed";
    });
  }

  /* ── draw.io diagrams ── */

  var viewerRequested = false;

  // The viewer calls this when it finishes loading, instead of drawing on
  // its own; drawing here too keeps one code path for every page load.
  window.onDrawioViewerLoad = drawDiagrams;

  function drawDiagrams() {
    if (!document.querySelector(".mxgraph")) return;
    if (window.GraphViewer) {
      // Clears and redraws every diagram, so it's safe to call again.
      window.GraphViewer.processElements();
      return;
    }
    // The drawio plugin adds the viewer to pages with a diagram; after
    // instant navigation that tag may not have run, so load it ourselves.
    if (viewerRequested || document.querySelector('script[src="' + DRAWIO_VIEWER + '"]')) return;
    viewerRequested = true;
    document.body.appendChild(el("script", null, { src: DRAWIO_VIEWER, async: "" }));
  }

  // A diagram in a hidden content tab is drawn at zero size; redraw on switch.
  document.addEventListener("change", function (event) {
    if (event.target.matches && event.target.matches(".tabbed-set > input") && window.GraphViewer) {
      var set = event.target.closest(".tabbed-set");
      if (set && set.querySelector(".mxgraph")) window.GraphViewer.processElements();
    }
  });

  /* ── Mount on every page ── */

  function mountAll() {
    mountValues();
    mountReviewDates();
    drawDiagrams();
    // charts.js mounts itself on page loads; this covers the page writer.
    if (window.docsCharts) window.docsCharts.mount();
  }

  // The page writer's preview draws components after the page has loaded.
  window.docsComponents = { mount: mountAll };

  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(mountAll);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll);
  } else {
    mountAll();
  }
})();
