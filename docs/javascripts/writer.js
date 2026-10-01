/* Page writer (docs/write.md): write a page in Markdown with the site's
 * components to hand, preview it with the site's own styles, and download it
 * as a bundle: one .zip with the page, its images and files, and a
 * manifest.json saying where each one goes in the repository
 * (tools/ingest_bundle.py reads it).
 *
 * hooks/writer.py puts the site's folders, pages and icons in the page as
 * JSON, and publishes each page's Markdown under _writer/src/ so any page
 * can be opened here and changed. Nothing is sent anywhere: each page being
 * written is a draft kept in this browser (its images, files and earlier
 * versions in IndexedDB) until the writer downloads it, and "Add to site"
 * says what to do with the bundle. Pasting from Word, web pages and the
 * Azure DevOps wiki goes through javascripts/writer-convert.js.
 *
 * The Markdown is the page. The editor is CodeMirror (vendor/codemirror.min.js,
 * built by tools/codemirror/), with the components in a sidebar to drag or
 * click in, and "/" to type one in. The Markdown is read into blocks as it
 * changes, each knowing where it is in the text: the preview draws them, the
 * checks point at them, and a component's form edits just its own Markdown
 * when the writer asks for it (the Edit button on the block, or Ctrl+.).
 *
 * Mounts on Material's document$, like the other scripts. */
(function () {
  "use strict";

  var SCRIPT = document.currentScript && document.currentScript.src;
  var BASE = SCRIPT ? SCRIPT.replace(/javascripts\/writer\.js(?:[?#].*)?$/, "") : "/";
  var MARKED_SRC = BASE + "javascripts/vendor/marked.min.js";
  var CM_SRC = BASE + "javascripts/vendor/codemirror.min.js";
  // Pasting from Word and the web, and Azure DevOps wiki pages.
  var CONVERT_SRC = BASE + "javascripts/writer-convert.js";
  // The build Material itself loads for pages with diagrams.
  var MERMAID_SRC = "https://unpkg.com/mermaid@11/dist/mermaid.min.js";
  // The drafts: DRAFTS_KEY lists them, and each is kept under DRAFT_PREFIX
  // and its id. DRAFT_KEY is where the one draft lived before there were
  // several: read once, moved, removed.
  var DRAFTS_KEY = "docs.writer.drafts";
  var DRAFT_PREFIX = "docs.writer.draft.";
  var DRAFT_KEY = "docs.writer.draft";
  // Where drafts kept images before IndexedDB: read once, moved, removed.
  var IMAGES_KEY = "docs.writer.images";
  // Markdown, split or preview; and which sidebar panel is open.
  var VIEW_KEY = "docs.writer.view";
  var SIDE_KEY = "docs.writer.side";
  // Images and files are too big for localStorage, and so is each draft's
  // history. Both are keyed "<draft id>/…".
  var DB_NAME = "docs.writer";
  var DB_VERSION = 2;
  var DB_STORE = "assets";
  var HISTORY_STORE = "history";
  // A version of the draft is kept at most this often while someone
  // writes, and this many per draft.
  var VERSION_EVERY = 5 * 60 * 1000;
  var VERSIONS_KEPT = 40;

  /* ── What a page can bring with it (keep in step with tools/ingest_bundle.py) ── */

  var MB = 1024 * 1024;
  var IMAGE_MAX = 5 * MB;
  var FILE_MAX = 10 * MB;
  // The ingest pipeline refuses a bigger bundle.
  var BUNDLE_MAX = 25 * MB;

  var IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

  // Files readers can download: the name used in link text, and the type.
  var FILE_TYPES = {
    pdf: ["PDF", "application/pdf"],
    docx: ["Word", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    xlsx: ["Excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    pptx: ["PowerPoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    vsdx: ["Visio", "application/vnd.ms-visio.drawing"],
    csv: ["CSV", "text/csv"],
    json: ["JSON", "application/json"],
    yaml: ["YAML", "application/yaml"],
    yml: ["YAML", "application/yaml"],
    xml: ["XML", "application/xml"],
    txt: ["text", "text/plain"],
    zip: ["zip", "application/zip"],
    drawio: ["draw.io", "application/xml"],
    bicep: ["Bicep", "text/plain"],
    tf: ["Terraform", "text/plain"],
  };
  var FILE_KINDS = "PDF, Word, Excel, PowerPoint, Visio, CSV, JSON, YAML, XML, text, zip, draw.io, Bicep or Terraform";

  /* ── What the site offers (keep in step with the component pages) ── */

  var CALLOUTS = [
    { id: "note", label: "Note", hint: "background worth knowing" },
    { id: "info", label: "Info", hint: "where or when something applies" },
    { id: "tip", label: "Tip", hint: "a faster or better way" },
    { id: "success", label: "Success", hint: "what they see when it worked" },
    { id: "warning", label: "Warning", hint: "something that will catch them out" },
    { id: "danger", label: "Danger", hint: "data loss, or can't be undone" },
    { id: "example", label: "Example", hint: "a worked example" },
    { id: "question", label: "Question", hint: "a common question" },
    { id: "permissions", label: "Permissions", hint: "the role and scope a task needs" },
    { id: "cost", label: "Cost", hint: "creates billable resources" },
    { id: "security", label: "Security", hint: "exposure, secrets, identity" },
    { id: "preview", label: "Preview", hint: "not generally available yet" },
  ];

  // Callout types Material styles as well as the site's own: an unknown one
  // is drawn as a plain note, which is rarely what was meant.
  var KNOWN_CALLOUTS = CALLOUTS.map(function (k) {
    return k.id;
  }).concat(["abstract", "summary", "tldr", "todo", "check", "done", "help", "faq", "caution", "attention", "failure", "fail", "missing", "error", "bug", "quote", "cite", "troubleshoot"]);

  // Badge words and colours, from the badges table in Choosing components.
  var BADGES = {
    new: ["New", "accent"],
    updated: ["Updated", "accent"],
    stable: ["Stable", "success"],
    supported: ["Supported", "success"],
    beta: ["Beta", "warning"],
    preview: ["Preview", "warning"],
    experimental: ["Experimental", "warning"],
    deprecated: ["Deprecated", "danger"],
    removed: ["Removed", "danger"],
    breaking: ["Breaking", "danger"],
  };

  var BUTTON_STYLES = [
    ["primary", "Primary: the main action"],
    ["", "Secondary"],
    ["outline", "Outline"],
    ["soft", "Soft"],
    ["ghost", "Ghost: least important"],
    ["gradient", "Gradient (launch pages)"],
    ["glow", "Glow (launch pages)"],
    ["danger", "Danger: deletes something"],
  ];

  var TIMELINE_COLOURS = ["", "accent", "alt", "orange", "blue", "green", "teal", "violet", "pink", "red", "grey"];

  var TAB_LABELS = ["Portal", "Azure CLI", "PowerShell", "Bicep", "Terraform", "Console", "AWS CLI", "CloudFormation", "Windows", "macOS / Linux"];
  var TAB_ALIASES = {
    "azure portal": "Portal",
    "the portal": "Portal",
    cli: "Azure CLI",
    "az cli": "Azure CLI",
    az: "Azure CLI",
    powershell: "PowerShell",
    pwsh: "PowerShell",
    "azure powershell": "PowerShell",
    bicep: "Bicep",
    terraform: "Terraform",
    tf: "Terraform",
    "aws console": "Console",
    "management console": "Console",
    "aws management console": "Console",
    "aws cli": "AWS CLI",
    cloudformation: "CloudFormation",
    cfn: "CloudFormation",
    windows: "Windows",
    mac: "macOS / Linux",
    macos: "macOS / Linux",
    linux: "macOS / Linux",
    "mac / linux": "macOS / Linux",
  };

  // The standard names from the Your values page.
  var PLACEHOLDERS = [
    ["subscription-id", "Azure subscription ID"],
    ["tenant-id", "Microsoft Entra tenant ID"],
    ["resource-group", "Resource group name"],
    ["location", "Azure region, such as `westeurope`"],
    ["aws-account-id", "12-digit AWS account ID"],
    ["region", "AWS Region, such as `eu-west-1`"],
    ["cluster-name", "AKS or EKS cluster name"],
    ["environment", "`dev`, `test` or `prod`"],
  ];
  var PLACEHOLDER_ALIASES = {
    rg: "resource-group",
    "rg-name": "resource-group",
    "resource-group-name": "resource-group",
    "resourcegroup": "resource-group",
    subscription: "subscription-id",
    "sub-id": "subscription-id",
    "subscriptionid": "subscription-id",
    tenant: "tenant-id",
    "tenantid": "tenant-id",
    "account-id": "aws-account-id",
    cluster: "cluster-name",
    "aks-name": "cluster-name",
    env: "environment",
  };
  var SECRET_NAME = /(^|[-_.])(password|passwd|secret|token|connection-string|access-key|api-key|sas|client-secret)($|[-_.])/;
  var HTML_TAGS = /^(a|b|i|p|br|hr|em|div|span|code|kbd|pre|ul|ol|li|dl|dt|dd|img|table|tr|td|th|strong|details|summary|figure|figcaption|sup|sub)$/;

  var LANGS = ["bash", "powershell", "json", "yaml", "python", "hcl", "bicep", "text", "markdown", "sql", "javascript", "typescript", "csharp", "xml", "dockerfile", "ini"];

  var KEY_NAMES = {
    ctrl: "Ctrl", control: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Cmd", command: "Cmd", meta: "Meta",
    win: "Win", windows: "Win", enter: "Enter", return: "Return", esc: "Esc", escape: "Esc", tab: "Tab",
    space: "Space", backspace: "Backspace", del: "Del", delete: "Del", up: "Up", down: "Down",
    left: "Left", right: "Right", home: "Home", end: "End", "page-up": "Page Up", "page-down": "Page Down",
  };

  /* ── Small helpers ── */

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return true;
    } catch (e) {
      // Private mode, blocked storage or over quota.
      return false;
    }
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function h(tag, props, children) {
    var node = document.createElement(tag);
    var value = null;
    if (props) {
      Object.keys(props).forEach(function (key) {
        var v = props[key];
        if (v == null || v === false) return;
        if (key === "class") node.className = v;
        else if (key === "text") node.textContent = v;
        else if (key === "html") node.innerHTML = v;
        else if (key === "value") value = v;
        else if (key === "checked") node.checked = true;
        else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2), v);
        else node.setAttribute(key, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (child) {
      if (child == null || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    // After the children, so a <select> has its options before its value.
    if (value != null) node.value = value;
    return node;
  }

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function lines(text) {
    return String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  }

  function indent(text, n) {
    var pad = new Array(n + 1).join(" ");
    return lines(text)
      .map(function (line) {
        return line.trim() ? pad + line : "";
      })
      .join("\n");
  }

  function dedent(list, n) {
    return list.map(function (line) {
      if (!line.trim()) return "";
      if (line[0] === "\t") return line.slice(1);
      var i = 0;
      while (i < n && line[i] === " ") i++;
      return line.slice(i);
    });
  }

  function trimBlank(list) {
    list = list.slice();
    while (list.length && !list[0].trim()) list.shift();
    while (list.length && !list[list.length - 1].trim()) list.pop();
    return list;
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "");
  }

  function plural(n, word, many) {
    return n + " " + (n === 1 ? word : many || word + "s");
  }

  function unquote(value) {
    value = String(value || "").trim();
    var m = /^"(.*)"$/.exec(value) || /^'(.*)'$/.exec(value);
    return m ? m[1] : value;
  }

  function yamlString(value) {
    return /^[A-Za-z0-9][\w .,()&/-]*$/.test(value) ? value : JSON.stringify(value);
  }

  // Paths are relative to docs/, without a leading slash.
  function isExternal(href) {
    return /^([a-z][a-z0-9+.-]*:|\/|#)/i.test(href);
  }

  function joinPath(folder, rel) {
    var parts = folder ? folder.split("/") : [];
    rel.split("/").forEach(function (part) {
      if (part === "..") parts.pop();
      else if (part && part !== ".") parts.push(part);
    });
    return parts.join("/");
  }

  function relPath(folder, target) {
    var from = folder ? folder.split("/") : [];
    var to = target.split("/");
    var i = 0;
    while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
    var up = [];
    for (var j = i; j < from.length; j++) up.push("..");
    return up.concat(to.slice(i)).join("/");
  }

  function dirname(path) {
    var i = path.lastIndexOf("/");
    return i < 0 ? "" : path.slice(0, i);
  }

  function splitHash(href) {
    var i = href.indexOf("#");
    return i < 0 ? [href, ""] : [href.slice(0, i), href.slice(i)];
  }

  // The address a docs/ file is published at (use_directory_urls).
  function siteUrl(path) {
    var parts = splitHash(path);
    var file = parts[0];
    if (/\.md$/.test(file)) file = file.replace(/(^|\/)(index|README)\.md$/, "$1").replace(/\.md$/, "/");
    return BASE + file + parts[1];
  }

  var scripts = {};
  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise(function (resolve, reject) {
        var tag = h("script", { src: src, async: true });
        tag.onload = resolve;
        tag.onerror = reject;
        document.head.appendChild(tag);
      });
    }
    return scripts[src];
  }

  /* ── State ── */

  var data = null; // from hooks/writer.py
  // { meta, body, images, files }: body is the Markdown under the title;
  // images and files map a name to a Blob. state.blocks is read from body.
  var state = null;
  var ui = {};

  function emptyMeta() {
    return {
      title: "",
      folder: defaultFolder(),
      newFolder: "",
      slug: "",
      slugEdited: false,
      visibility: "listed",
      applies_to: [],
      owner: "",
      last_reviewed: "",
      review_every: "",
      extraFront: "",
      mode: "new",
      // Example text a recipe or component brought in, so the checks can
      // point out any that's still there.
      hints: [],
    };
  }

  // id: the draft's, in DRAFTS_KEY. savedJson is the draft as last saved,
  // so a save that changes nothing is skipped and the one before a change
  // can be kept as a version.
  function newState(meta, body, id) {
    return { id: id || newId(), meta: meta, body: body || "", blocks: [], images: {}, files: {}, assetsLoaded: true, assetsSaved: true, savedJson: "", savedAt: 0 };
  }

  function newId() {
    return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function defaultFolder() {
    var folders = (data && data.folders) || [];
    for (var i = 0; i < folders.length; i++) if (folders[i].path) return folders[i].path;
    return "";
  }

  function folderPath() {
    return state.meta.folder === "__new__" ? slugify(state.meta.newFolder) : state.meta.folder;
  }

  function slug() {
    return state.meta.slug || slugify(state.meta.title) || "new-page";
  }

  function fileName() {
    return slug() + ".md";
  }

  function filePath() {
    var folder = folderPath();
    return "docs/" + (folder ? folder + "/" : "") + fileName();
  }

  function isEmpty(block) {
    return TYPES[block.type].empty(block);
  }

  function liveBlocks() {
    return readBlocks().filter(function (b) {
      return !isEmpty(b);
    });
  }

  // The body read into blocks, each with from and to: where its Markdown
  // starts and ends in the body. Read again only when the body changes.
  var blockCache = { body: null, blocks: [] };
  function blocksOf(body) {
    if (blockCache.body === body) return blockCache.blocks;
    var ls = lines(body);
    var starts = [];
    var at = 0;
    ls.forEach(function (line) {
      starts.push(at);
      at += line.length + 1;
    });
    var blocks = parseBlocks(body).map(function (b, i) {
      b.id = "b" + i;
      b.from = starts[b.start];
      b.to = starts[b.end - 1] + ls[b.end - 1].length;
      return b;
    });
    blockCache = { body: body, blocks: blocks };
    return blocks;
  }

  function readBlocks() {
    state.blocks = blocksOf(state.body);
    return state.blocks;
  }

  function blockById(id) {
    var blocks = readBlocks();
    for (var i = 0; i < blocks.length; i++) if (blocks[i].id === id) return blocks[i];
    return null;
  }

  // The block the position is in, or null between blocks.
  function blockAt(pos, blocks) {
    blocks = blocks || readBlocks();
    for (var i = 0; i < blocks.length; i++) if (pos >= blocks[i].from && pos <= blocks[i].to) return blocks[i];
    return null;
  }

  // Calls fn on every string in the blocks; fn returns the replacement.
  function walk(node, fn) {
    if (Array.isArray(node)) {
      node.forEach(function (value, i) {
        if (typeof value === "string") node[i] = fn(value, null);
        else walk(value, fn);
      });
    } else if (node && typeof node === "object") {
      Object.keys(node).forEach(function (key) {
        if (typeof node[key] === "string") node[key] = fn(node[key], key);
        else walk(node[key], fn);
      });
    }
  }

  // Images and files a page brings live in folders named after the page, so
  // two pages can't overwrite each other's step1.png:
  // docs/images/<folder>/<page>/ and docs/files/<folder>/<page>/.
  function assetDir() {
    var folder = folderPath();
    return (folder ? folder + "/" : "") + slug();
  }

  // kind is "images" or "files". dir "" is the flat docs/images/ that drafts
  // used before pages had folders of their own.
  function assetPath(kind, dir, name) {
    return kind + "/" + (dir ? dir + "/" : "") + name;
  }

  function assetRel(kind, name) {
    return relPath(folderPath(), assetPath(kind, assetDir(), name));
  }

  function imageRel(name) {
    return assetRel("images", name);
  }

  function fileRel(name) {
    return assetRel("files", name);
  }

  /* ── Block types ── */

  var TYPES = {};
  function def(type, spec) {
    spec.type = type;
    TYPES[type] = spec;
  }

  function stepHead(action) {
    var text = String(action || "").trim();
    if (!text) return "";
    if (!/[.:!?]$/.test(text)) text += ".";
    return "**" + text + "**";
  }

  // Whether a line can follow the bold action on the same line.
  function startsParagraph(line) {
    return !/^\s*(```|~~~|!!!|\?\?\?|===|[-*+]\s|\d+[.)]\s|\||<|#|!\[|>)/.test(line);
  }

  function fenceFor(code) {
    var longest = 2;
    (String(code).match(/^\s*`{3,}/gm) || []).forEach(function (run) {
      longest = Math.max(longest, run.trim().length);
    });
    return new Array(longest + 2).join("`");
  }

  function attrQuote(value) {
    return String(value).replace(/"/g, "&quot;");
  }

  def("heading", {
    label: "Heading",
    icon: "format-header-pound",
    help: "Readers skim headings: say what the section is for.",
    create: function () {
      return { level: 2, text: "", badge: "" };
    },
    empty: function (b) {
      return !b.text.trim();
    },
    md: function (b) {
      var text = b.text.trim();
      var line = new Array(b.level + 1).join("#") + " " + text;
      var badge = BADGES[b.badge];
      if (badge) line += ' <span class="badge badge--' + badge[1] + '">' + badge[0] + '</span> { data-toc-label="' + attrQuote(text) + '" }';
      return line;
    },
    preview: function (b) {
      var badge = BADGES[b.badge];
      return "<h" + b.level + ">" + inline(b.text) + (badge ? ' <span class="badge badge--' + badge[1] + '">' + badge[0] + "</span>" : "") + "</h" + b.level + ">";
    },
    editor: function (b, box) {
      box.appendChild(
        row([
          field("Level", select(b, "level", [[2, "Section"], [3, "Sub-section"], [4, "Minor"]], true), "narrow"),
          field("Heading", input(b, "text", { placeholder: b.hint || "Reset your password" }), "grow"),
          field(
            "Badge",
            select(
              b,
              "badge",
              [["", "None"]].concat(
                Object.keys(BADGES).map(function (key) {
                  return [key, BADGES[key][0]];
                })
              )
            ),
            "narrow"
          ),
        ])
      );
    },
  });

  def("text", {
    label: "Text",
    icon: "text",
    help: "Plain text is always an option, and usually the best one.",
    create: function () {
      return { md: "" };
    },
    empty: function (b) {
      return !b.md.trim();
    },
    md: function (b) {
      return trimBlank(lines(b.md)).join("\n");
    },
    preview: function (b) {
      return renderMarkdown(b.md);
    },
    editor: function (b, box) {
      box.appendChild(mdField(b, "md", { rows: 4, placeholder: b.hint || "Write here. Leave an empty line between paragraphs." }));
    },
  });

  def("steps", {
    label: "Steps",
    icon: "list-status",
    help: "Start each step with the action. Commands and click paths go in its details.",
    create: function () {
      return { items: [{ action: "", body: "" }, { action: "", body: "" }] };
    },
    empty: function (b) {
      return !b.items.some(stepFilled);
    },
    md: function (b) {
      var out = ['<div class="steps" markdown>', ""];
      b.items.filter(stepFilled).forEach(function (item, i) {
        var body = trimBlank(lines(item.body));
        var head = stepHead(item.action);
        var first;
        var rest;
        if (head && body.length && startsParagraph(body[0])) {
          first = head + " " + body[0].trim();
          rest = body.slice(1);
        } else if (head) {
          first = head;
          rest = body.length ? [""].concat(body) : [];
        } else {
          first = body[0];
          rest = body.slice(1);
        }
        var marker = i + 1 + ".";
        while (marker.length < 4) marker += " ";
        out.push(marker + first);
        if (rest.length) out.push(indent(rest.join("\n"), 4));
        out.push("");
      });
      out.push("</div>");
      return out.join("\n");
    },
    preview: function (b) {
      var items = b.items.filter(stepFilled).map(function (item) {
        var head = stepHead(item.action);
        var body = trimBlank(lines(item.body));
        var md = head && body.length && startsParagraph(body[0]) ? head + " " + body.join("\n") : head + "\n\n" + body.join("\n");
        return "<li>" + renderMarkdown(md.trim()) + "</li>";
      });
      return '<div class="steps"><ol>' + items.join("") + "</ol></div>";
    },
    editor: function (b, box) {
      box.appendChild(
        listEditor(b, "items", {
          itemLabel: "Step",
          addLabel: "Add a step",
          min: 1,
          create: function () {
            return { action: "", body: "" };
          },
          render: function (item, i, card) {
            card.appendChild(field("Action", input(item, "action", { placeholder: item.hint || (i === 0 ? "Install the tools" : "What to do") }), null, i === 0 ? "Shown in bold. Start with a verb." : null));
            card.appendChild(mdField(item, "body", { label: "Details", rows: 2, placeholder: "How to do it, with any command or click path." }));
          },
        })
      );
    },
  });

  function stepFilled(item) {
    return item.action.trim() || item.body.trim();
  }

  function calloutLabel(kind) {
    for (var i = 0; i < CALLOUTS.length; i++) if (CALLOUTS[i].id === kind) return CALLOUTS[i].label;
    return kind.charAt(0).toUpperCase() + kind.slice(1);
  }

  def("callout", {
    label: "Callout",
    icon: "alert-box-outline",
    help: "Give it a title that makes the point. Never two in a row.",
    create: function () {
      return { kind: "note", title: "", body: "", collapse: "" };
    },
    empty: function (b) {
      return !b.title.trim() && !b.body.trim();
    },
    md: function (b) {
      var marker = b.collapse === "closed" ? "???" : b.collapse === "open" ? "???+" : "!!!";
      var head = marker + " " + b.kind + (b.title.trim() ? ' "' + attrQuote(b.title.trim()) + '"' : "");
      var body = trimBlank(lines(b.body));
      return body.length ? head + "\n" + indent(body.join("\n"), 4) : head;
    },
    preview: function (b) {
      var title = b.title.trim() ? inline(b.title) : esc(calloutLabel(b.kind));
      var body = renderMarkdown(b.body);
      if (b.collapse) return '<details class="' + esc(b.kind) + '"' + (b.collapse === "open" ? " open" : "") + "><summary>" + title + "</summary>" + body + "</details>";
      return '<div class="admonition ' + esc(b.kind) + '"><p class="admonition-title">' + title + "</p>" + body + "</div>";
    },
    editor: function (b, box) {
      var kinds = CALLOUTS.slice();
      if (!kinds.some(function (k) { return k.id === b.kind; })) kinds.push({ id: b.kind, label: calloutLabel(b.kind), hint: "" });
      box.appendChild(
        row([
          field(
            "Type",
            select(
              b,
              "kind",
              kinds.map(function (k) {
                return [k.id, k.label + (k.hint ? ": " + k.hint : "")];
              })
            ),
            "grow"
          ),
          field("Shows", select(b, "collapse", [["", "Always open"], ["closed", "Collapsed"], ["open", "Open, can collapse"]]), "narrow"),
        ])
      );
      box.appendChild(field("Title", input(b, "title", { placeholder: b.hint || "Make the point, such as: Back up the database first" })));
      box.appendChild(mdField(b, "body", { label: "Text", rows: 2 }));
    },
  });

  def("troubleshoot", {
    label: "Troubleshooting entry",
    icon: "lifebuoy",
    help: "Title it with the exact error the reader sees, then the cause and the fix.",
    create: function () {
      return { title: "", symptom: "", cause: "", fix: "", open: false };
    },
    empty: function (b) {
      return !b.title.trim() && !b.cause.trim() && !b.fix.trim() && !b.symptom.trim();
    },
    md: function (b) {
      var out = [(b.open ? "???+" : "???") + ' troubleshoot "' + attrQuote(b.title.trim()) + '"'];
      [["Symptom", b.symptom], ["Cause", b.cause], ["Fix", b.fix]].forEach(function (part) {
        var body = trimBlank(lines(part[1]));
        if (!body.length) return;
        out.push("");
        out.push("    " + part[0]);
        out.push("    :   " + body[0]);
        if (body.length > 1) out.push(indent(body.slice(1).join("\n"), 8));
      });
      return out.join("\n");
    },
    preview: function (b) {
      var dl = "";
      [["Symptom", b.symptom], ["Cause", b.cause], ["Fix", b.fix]].forEach(function (part) {
        if (part[1].trim()) dl += "<dt>" + part[0] + "</dt><dd>" + renderMarkdown(part[1]) + "</dd>";
      });
      return '<details class="troubleshoot"' + (b.open ? " open" : "") + "><summary>" + inline(b.title) + "</summary><dl>" + dl + "</dl></details>";
    },
    editor: function (b, box) {
      box.appendChild(field("Error, as the reader sees it", input(b, "title", { placeholder: "`AuthorizationFailed` when creating the resource group" }), null, "Put the error code in backticks, then when it happens."));
      box.appendChild(mdField(b, "symptom", { label: "Symptom (optional)", rows: 1, placeholder: "Only if the title is too short to recognise the problem." }));
      box.appendChild(mdField(b, "cause", { label: "Cause", rows: 1 }));
      box.appendChild(mdField(b, "fix", { label: "Fix", rows: 2, placeholder: "Something to do, with the command or click path." }));
      box.appendChild(checkbox(b, "open", "Start open (only when almost everyone hits it)"));
    },
  });

  def("tabs", {
    label: "Content tabs",
    icon: "tab",
    help: "Use the same labels as other pages, so a reader's choice sticks.",
    create: function () {
      return { tabs: [{ label: "Portal", body: "" }, { label: "Azure CLI", body: "" }] };
    },
    empty: function (b) {
      return !b.tabs.some(function (t) {
        return t.body.trim();
      });
    },
    md: function (b) {
      return b.tabs
        .filter(function (t) {
          return t.label.trim() || t.body.trim();
        })
        .map(function (t) {
          var body = trimBlank(lines(t.body));
          return '=== "' + attrQuote(t.label.trim()) + '"' + (body.length ? "\n\n" + indent(body.join("\n"), 4) : "");
        })
        .join("\n\n");
    },
    preview: function (b) {
      return tabsHtml(
        b.tabs.map(function (t) {
          return [inline(t.label), renderMarkdown(t.body)];
        })
      );
    },
    editor: function (b, box) {
      box.appendChild(
        listEditor(b, "tabs", {
          itemLabel: "Tab",
          addLabel: "Add a tab",
          min: 1,
          create: function () {
            return { label: "", body: "" };
          },
          render: function (tab, i, card) {
            card.appendChild(field("Label", input(tab, "label", { list: "writer-tab-labels", placeholder: "PowerShell" })));
            card.appendChild(mdField(tab, "body", { label: "Content", rows: 3, placeholder: tab.hint || "What readers who pick this tab need." }));
          },
        })
      );
    },
  });

  def("code", {
    label: "Code block",
    icon: "console",
    help: "Anything the reader types or copies. Name the language so it's coloured.",
    create: function () {
      return { lang: "bash", title: "", code: "", extra: "" };
    },
    empty: function (b) {
      return !b.code.trim();
    },
    md: function (b) {
      var fence = fenceFor(b.code);
      var attrs = [b.title.trim() ? 'title="' + attrQuote(b.title.trim()) + '"' : "", b.extra || ""].filter(Boolean).join(" ");
      var lang = b.lang.trim();
      var head = lang ? lang + (attrs ? " " + attrs : "") : attrs ? "{ .text " + attrs + " }" : "";
      return fence + (head ? (b.tight ? "" : " ") + head : "") + "\n" + b.code.replace(/\s+$/, "") + "\n" + fence;
    },
    preview: function (b) {
      return codeHtml(b.lang.trim() || "text", b.title.trim(), b.code, false);
    },
    editor: function (b, box) {
      box.appendChild(
        row([
          field("Language", input(b, "lang", { list: "writer-langs", placeholder: "bash" }), "narrow"),
          field("File name (optional)", input(b, "title", { placeholder: "mkdocs.yml" }), "grow"),
        ])
      );
      box.appendChild(mdField(b, "code", { label: "Code", code: true, rows: 3, placeholder: "az group create --name <resource-group> --location <location>" }));
    },
  });

  def("output", {
    label: "Command output",
    icon: "console-line",
    help: "What the reader should see. Only the lines that prove it worked.",
    create: function () {
      return { lang: "text", title: "", code: "", extra: "" };
    },
    empty: function (b) {
      return !b.code.trim();
    },
    md: function (b) {
      var fence = fenceFor(b.code);
      var attrs = ["." + (b.lang.trim() || "text"), ".output", b.title.trim() ? 'title="' + attrQuote(b.title.trim()) + '"' : "", b.extra || ""].filter(Boolean).join(" ");
      return fence + " { " + attrs + " }\n" + b.code.replace(/\s+$/, "") + "\n" + fence;
    },
    preview: function (b) {
      return codeHtml(b.lang.trim() || "text", b.title.trim(), b.code, true);
    },
    editor: function (b, box) {
      box.appendChild(
        row([
          field("Format", select(b, "lang", [["text", "Text"], ["json", "JSON"]]), "narrow"),
          field("Label (optional)", input(b, "title", { placeholder: "Output" }), "grow"),
        ])
      );
      box.appendChild(mdField(b, "code", { label: "Output", code: true, rows: 3, placeholder: "Name                      Location\n------------------------  ----------\nrg-payments-prod-weu-001  westeurope" }));
    },
  });

  def("values", {
    label: "Your values",
    icon: "form-textbox",
    help: "List every <placeholder> the page's commands use, before the first command.",
    create: function () {
      return { items: [{ name: "", label: "" }] };
    },
    empty: function (b) {
      return !b.items.some(function (item) {
        return item.name.trim();
      });
    },
    md: function (b) {
      var out = ['<div class="your-values" markdown>', ""];
      b.items.forEach(function (item) {
        var name = cleanPlaceholder(item.name);
        if (name) out.push(("- `<" + name + ">` " + item.label.trim()).trim());
      });
      out.push("", "</div>");
      return out.join("\n");
    },
    preview: function (b) {
      var items = b.items
        .filter(function (item) {
          return cleanPlaceholder(item.name);
        })
        .map(function (item) {
          return "<li><code>&lt;" + esc(cleanPlaceholder(item.name)) + "&gt;</code> " + inline(item.label) + "</li>";
        });
      return '<div class="your-values"><ul>' + items.join("") + "</ul></div>";
    },
    editor: function (b, box) {
      var list = listEditor(b, "items", {
        itemLabel: "Value",
        addLabel: "Add a value",
        min: 1,
        compact: true,
        create: function () {
          return { name: "", label: "" };
        },
        render: function (item, i, card) {
          var label = input(item, "label", { placeholder: "Resource group name" });
          var name = input(item, "name", {
            list: "writer-placeholders",
            placeholder: "resource-group",
            onchange: function () {
              item.name = cleanPlaceholder(name.value);
              name.value = item.name;
              var standard = standardLabel(item.name);
              if (standard && !item.label.trim()) {
                item.label = standard;
                label.value = standard;
              }
              changed();
            },
          });
          card.appendChild(row([field("Placeholder", name, "narrow"), field("What it is", label, "grow")]));
        },
      });
      box.appendChild(list);
      box.appendChild(
        h("div", { class: "writer-row writer-row--end" }, [
          button("Add the ones used in this page's code", "magnify", "md-button--ghost md-button--sm", function () {
            var have = b.items.map(function (item) {
              return cleanPlaceholder(item.name);
            });
            var added = 0;
            b.items = b.items.filter(function (item) {
              return item.name.trim();
            });
            usedPlaceholders().forEach(function (name) {
              if (have.indexOf(name) >= 0) return;
              b.items.push({ name: name, label: standardLabel(name) || "" });
              added++;
            });
            if (!b.items.length) b.items.push({ name: "", label: "" });
            redrawBlock(b);
            changed();
            toast(added ? "Added " + plural(added, "placeholder") + "." : "No other placeholders found in the code on this page.");
          }),
        ])
      );
    },
  });

  function cleanPlaceholder(name) {
    return String(name || "")
      .trim()
      .replace(/^<|>$/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function standardLabel(name) {
    for (var i = 0; i < PLACEHOLDERS.length; i++) if (PLACEHOLDERS[i][0] === name) return PLACEHOLDERS[i][1];
    return "";
  }

  def("table", {
    label: "Table",
    icon: "table",
    help: "Put the thing being looked up in the first column. Four or five columns at most.",
    create: function () {
      return { rows: [["", "", ""], ["", "", ""], ["", "", ""]], align: [] };
    },
    empty: function (b) {
      return !b.rows.some(function (r) {
        return r.some(function (c) {
          return c.trim();
        });
      });
    },
    md: function (b) {
      // A table opened from a file keeps its own spacing until it's edited,
      // so editing a page elsewhere doesn't re-pad every table in the diff.
      if (b.raw) return b.raw;
      var cols = b.rows[0].length;
      var cells = b.rows.map(function (r) {
        return r.map(function (c) {
          return c.trim().replace(/\n/g, " ").replace(/(^|[^\\])\|/g, "$1\\|");
        });
      });
      var widths = [];
      for (var c = 0; c < cols; c++) {
        widths[c] = 3;
        cells.forEach(function (r) {
          widths[c] = Math.max(widths[c], r[c].length);
        });
      }
      function pad(text, width) {
        while (text.length < width) text += " ";
        return text;
      }
      function line(r) {
        return "| " + r.map(function (text, i) {
          return pad(text, widths[i]);
        }).join(" | ") + " |";
      }
      var sep = "| " + widths.map(function (w, i) {
        var a = (b.align || [])[i];
        var dashes = new Array(w + 1).join("-");
        if (a === "center") return ":" + dashes.slice(2) + ":";
        if (a === "right") return dashes.slice(1) + ":";
        if (a === "left") return ":" + dashes.slice(1);
        return dashes;
      }).join(" | ") + " |";
      return [line(cells[0]), sep].concat(cells.slice(1).map(line)).join("\n");
    },
    preview: function (b) {
      return renderPlain(TYPES.table.md(b));
    },
    editor: function (b, box) {
      var grid = h("div", { class: "writer-table" });
      function edited() {
        b.raw = "";
        changed();
      }
      function draw() {
        grid.innerHTML = "";
        var cols = b.rows[0].length;
        grid.style.setProperty("--cols", cols);
        b.rows.forEach(function (r, ri) {
          r.forEach(function (cell, ci) {
            grid.appendChild(
              h("input", {
                class: "writer-input" + (ri === 0 ? " writer-table__head" : ""),
                value: cell,
                "aria-label": (ri === 0 ? "Heading " : "Row " + ri + ", column ") + (ci + 1),
                placeholder: ri === 0 ? "Heading" : "",
                oninput: function (event) {
                  r[ci] = event.target.value;
                  edited();
                },
              })
            );
          });
          grid.appendChild(
            iconButton("close", ri === 0 ? "Remove a column" : "Remove this row", ri === 0 ? cols <= 1 : b.rows.length <= 2, function () {
              if (ri === 0) {
                b.rows.forEach(function (x) {
                  x.pop();
                });
                if (b.align) b.align.length = Math.min(b.align.length, cols - 1);
              } else b.rows.splice(ri, 1);
              draw();
              edited();
            })
          );
        });
      }
      draw();
      box.appendChild(grid);
      box.appendChild(
        h("div", { class: "writer-row" }, [
          button("Add a row", "plus", "md-button--sm", function () {
            b.rows.push(b.rows[0].map(function () {
              return "";
            }));
            draw();
            edited();
          }),
          button("Add a column", "plus", "md-button--ghost md-button--sm", function () {
            b.rows.forEach(function (r) {
              r.push("");
            });
            draw();
            edited();
          }),
        ])
      );
    },
  });

  def("image", {
    label: "Screenshot or image",
    icon: "image-outline",
    help: "Screenshots confirm the steps; they don't replace them. Hide IDs and names first.",
    create: function () {
      return { image: "", src: "", alt: "", caption: "", width: "", frame: true };
    },
    empty: function (b) {
      return !b.image && !b.src.trim();
    },
    md: function (b) {
      var src = b.image ? imageRel(b.image) : b.src.trim();
      var img = "![" + b.alt.trim().replace(/[\[\]]/g, "") + "](" + src + ")" + (String(b.width).trim() ? '{ width="' + parseInt(b.width, 10) + '" }' : "");
      if (!b.frame) return img;
      var out = ['<figure class="screenshot" markdown="span">', "  " + img];
      if (b.caption.trim()) out.push("  <figcaption>" + b.caption.trim() + "</figcaption>");
      out.push("</figure>");
      return out.join("\n");
    },
    preview: function (b) {
      var src = b.image ? assetUrl("images", b.image) : previewSrc(b.src.trim());
      var img = '<img src="' + esc(src) + '" alt="' + esc(b.alt) + '"' + (String(b.width).trim() ? ' width="' + parseInt(b.width, 10) + '"' : "") + ">";
      if (!b.frame) return "<p>" + img + "</p>";
      return '<figure class="screenshot">' + img + (b.caption.trim() ? "<figcaption>" + inline(b.caption) + "</figcaption>" : "") + "</figure>";
    },
    editor: function (b, box) {
      var source;
      if (b.image) {
        source = h("div", { class: "writer-image" }, [
          h("img", { class: "writer-image__thumb", src: assetUrl("images", b.image), alt: "" }),
          h("span", { class: "writer-image__name", text: "docs/" + assetPath("images", assetDir(), b.image) }),
          editableImage(b.image)
            ? button("Crop or hide details", "image-edit-outline", "md-button--ghost md-button--sm", function () {
                openImageEditor(b.image);
              })
            : null,
          button("Replace", "file-upload-outline", "md-button--ghost md-button--sm", function () {
            pickImage(function (name) {
              b.image = name;
              redrawBlock(b);
              changed();
            });
          }),
        ]);
      } else {
        source = h("div", { class: "writer-row" }, [
          button("Upload an image", "file-upload-outline", "md-button--sm", function () {
            pickImage(function (name) {
              b.image = name;
              redrawBlock(b);
              changed();
            });
          }),
          field("or a path to an image already on the site", input(b, "src", { placeholder: "../images/portal-create-resource-group.png" }), "grow"),
        ]);
      }
      box.appendChild(source);
      box.appendChild(field("Alt text", input(b, "alt", { placeholder: "The Create a resource group form, with the name filled in" }), null, "What the image shows, for readers who can't see it."));
      box.appendChild(
        row([
          field("Caption", input(b, "caption", { placeholder: "What to notice", disabled: !b.frame }), "grow"),
          field("Width in pixels", input(b, "width", { type: "number", min: "40", placeholder: "Full" }), "narrow"),
        ])
      );
      box.appendChild(
        checkbox(b, "frame", "Frame it as a screenshot, with a caption", function () {
          redrawBlock(b);
        })
      );
    },
  });

  def("diagram", {
    label: "Diagram",
    icon: "sitemap-outline",
    help: "A Mermaid diagram, for flows and how parts connect. About ten boxes at most.",
    create: function () {
      return { code: "" };
    },
    empty: function (b) {
      return !b.code.trim();
    },
    md: function (b) {
      return "``` mermaid\n" + b.code.replace(/\s+$/, "") + "\n```";
    },
    preview: function (b) {
      var code = b.code.trim();
      if (mermaidCache[code]) return '<div class="writer-mermaid">' + mermaidCache[code] + "</div>";
      return '<pre class="writer-mermaid writer-mermaid--pending">' + esc(code) + "</pre>";
    },
    editor: function (b, box) {
      box.appendChild(mdField(b, "code", { label: "Mermaid code", code: true, rows: 4, placeholder: "flowchart LR\n  user[Reader] --> site[Docs site]\n  site --> s3[(S3 bucket)]" }));
      box.appendChild(h("span", { class: "writer-field__hint" }, ["Syntax: ", h("a", { href: "https://mermaid.js.org/intro/syntax-reference.html", target: "_blank", rel: "noopener", text: "Mermaid reference" }), "."]));
    },
  });

  def("cards", {
    label: "Cards",
    icon: "view-grid-outline",
    help: "Doors, not rooms: each card points somewhere. Three or four, six at most.",
    create: function () {
      return { wide: false, items: [newCard(), newCard(), newCard()] };
    },
    empty: function (b) {
      return !b.items.some(function (c) {
        return c.title.trim();
      });
    },
    md: function (b) {
      var out = ['<div class="grid cards' + (b.wide ? " grid--2" : "") + '" markdown>', ""];
      b.items.filter(function (c) {
        return c.title.trim();
      }).forEach(function (c) {
        var title = c.link.trim() ? "[" + c.title.trim() + "](" + c.link.trim() + ")" : c.title.trim();
        out.push("-   " + (c.icon ? ":" + c.icon + ":{ .lg .middle } " : "") + "__" + title + "__");
        out.push("");
        out.push("    ---");
        if (c.text.trim()) out.push("", indent(c.text.trim(), 4));
        out.push("");
      });
      out.push("</div>");
      return out.join("\n");
    },
    preview: function (b) {
      var items = b.items.filter(function (c) {
        return c.title.trim();
      }).map(function (c) {
        var title = c.link.trim() ? '<a href="' + esc(previewHref(c.link.trim())) + '" target="_blank" rel="noopener">' + inline(c.title) + "</a>" : inline(c.title);
        return "<li><p>" + (c.icon ? '<span class="twemoji lg middle">' + iconSvg(c.icon) + "</span> " : "") + "<strong>" + title + "</strong></p><hr>" + renderMarkdown(c.text) + "</li>";
      });
      return '<div class="grid cards' + (b.wide ? " grid--2" : "") + '"><ul>' + items.join("") + "</ul></div>";
    },
    editor: function (b, box) {
      box.appendChild(checkbox(b, "wide", "Two columns (for two cards, or cards with more text)"));
      box.appendChild(
        listEditor(b, "items", {
          itemLabel: "Card",
          addLabel: "Add a card",
          min: 1,
          create: newCard,
          render: function (card, i, box2) {
            var preview = h("span", { class: "writer-card-icon", html: iconSvg(card.icon) });
            var icon = input(card, "icon", {
              list: "writer-icons",
              placeholder: "material-rocket-launch-outline",
              oninput: function () {
                preview.innerHTML = iconSvg(icon.value.trim());
              },
            });
            box2.appendChild(row([field("Icon", h("span", { class: "writer-with-icon" }, [preview, icon]), "grow"), field("Title", input(card, "title", { placeholder: "Get started" }), "grow")]));
            box2.appendChild(field("Links to", linkInput(card, "link"), null, "Pick a page, or paste a web address."));
            box2.appendChild(mdField(card, "text", { label: "Text", rows: 1, placeholder: "A sentence or two on what's there." }));
          },
        })
      );
    },
  });

  function newCard() {
    return { icon: "material-rocket-launch-outline", title: "", link: "", text: "" };
  }

  function iconSvg(shortcode) {
    var name = String(shortcode || "").replace(/^material-/, "material/");
    return (data && data.icons[name]) || '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5"/></svg>';
  }

  def("buttons", {
    label: "Buttons",
    icon: "gesture-tap-button",
    help: "One primary button per screen. Pair it with a quieter one at most.",
    create: function () {
      return { items: [{ text: "", link: "", style: "primary" }] };
    },
    empty: function (b) {
      return !b.items.some(function (x) {
        return x.text.trim();
      });
    },
    md: function (b) {
      var items = b.items.filter(function (x) {
        return x.text.trim();
      }).map(function (x) {
        return "[" + x.text.trim() + "](" + (x.link.trim() || "#") + "){ .md-button" + (x.style ? " .md-button--" + x.style : "") + " }";
      });
      return items.length > 1 ? '<div class="button-row" markdown>\n' + items.join(" ") + "\n</div>" : items[0];
    },
    preview: function (b) {
      var items = b.items.filter(function (x) {
        return x.text.trim();
      }).map(function (x) {
        return '<a class="md-button' + (x.style ? " md-button--" + esc(x.style) : "") + '" href="' + esc(previewHref(x.link.trim() || "#")) + '" target="_blank" rel="noopener">' + inline(x.text) + "</a>";
      });
      return items.length > 1 ? '<div class="button-row"><p>' + items.join(" ") + "</p></div>" : "<p>" + items[0] + "</p>";
    },
    editor: function (b, box) {
      box.appendChild(
        listEditor(b, "items", {
          itemLabel: "Button",
          addLabel: "Add a button",
          min: 1,
          compact: true,
          create: function () {
            return { text: "", link: "", style: "ghost" };
          },
          render: function (x, i, card) {
            card.appendChild(row([field("Text", input(x, "text", { placeholder: "Get started" }), "grow"), field("Style", select(x, "style", BUTTON_STYLES), "narrow")]));
            card.appendChild(field("Links to", linkInput(x, "link")));
          },
        })
      );
    },
  });

  def("timeline", {
    label: "Timeline",
    icon: "timeline-text-outline",
    help: "Things tied to dates: releases, a roadmap. Not for how-to steps.",
    create: function () {
      return { cards: false, rainbow: false, items: [newEntry(), newEntry(), newEntry()] };
    },
    empty: function (b) {
      return !b.items.some(function (x) {
        return x.label.trim();
      });
    },
    md: function (b) {
      var cls = "timeline" + (b.cards ? " timeline--cards" : "") + (b.rainbow ? " timeline--rainbow" : "");
      var out = ['<div class="' + cls + '" markdown>', ""];
      b.items.filter(function (x) {
        return x.label.trim();
      }).forEach(function (x) {
        var text = trimBlank(lines(x.text));
        out.push(x.label.trim() + (x.colour ? " { ." + x.colour + " }" : ""));
        out.push(":   " + (text[0] || ""));
        if (text.length > 1) out.push(indent(text.slice(1).join("\n"), 4));
        out.push("");
      });
      out.push("</div>");
      return out.join("\n");
    },
    preview: function (b) {
      var cls = "timeline" + (b.cards ? " timeline--cards" : "") + (b.rainbow ? " timeline--rainbow" : "");
      var dl = b.items.filter(function (x) {
        return x.label.trim();
      }).map(function (x) {
        return "<dt" + (x.colour ? ' class="' + esc(x.colour) + '"' : "") + ">" + inline(x.label) + "</dt><dd>" + renderMarkdown(x.text) + "</dd>";
      });
      return '<div class="' + cls + '"><dl>' + dl.join("") + "</dl></div>";
    },
    editor: function (b, box) {
      box.appendChild(row([checkbox(b, "cards", "Entries as cards (for longer entries)"), checkbox(b, "rainbow", "Rainbow tags (colours only separate entries)")]));
      box.appendChild(
        listEditor(b, "items", {
          itemLabel: "Entry",
          addLabel: "Add an entry",
          min: 1,
          create: newEntry,
          render: function (x, i, card) {
            card.appendChild(
              row([
                field("Date or version", input(x, "label", { placeholder: "v2.0" }), "grow"),
                field(
                  "Tag colour",
                  select(
                    x,
                    "colour",
                    TIMELINE_COLOURS.map(function (c) {
                      return [c, c ? c.charAt(0).toUpperCase() + c.slice(1) : "Theme accent"];
                    })
                  ),
                  "narrow"
                ),
              ])
            );
            card.appendChild(mdField(x, "text", { label: "What happened", rows: 1, placeholder: "**Released.** Dark mode and the new sidebar." }));
          },
        })
      );
    },
  });

  function newEntry() {
    return { label: "", colour: "", text: "" };
  }

  def("anatomy", {
    label: "Name anatomy",
    icon: "tag-text-outline",
    help: "A resource name split into its parts, each matched to what it means. Each part must be a piece of the name between - _ . / or :.",
    create: function () {
      return { name: "", items: [newPart(), newPart(), newPart()] };
    },
    empty: function (b) {
      return !b.name.trim();
    },
    md: function (b) {
      var out = ['<div class="anatomy" markdown>', "", "`" + b.name.trim() + "`", ""];
      b.items.filter(function (x) {
        return x.part.trim();
      }).forEach(function (x) {
        var part = x.part.trim();
        var text = trimBlank(lines(x.text));
        // Placeholders go in code, so <env> isn't read as an HTML tag.
        out.push(x.code || /[<>]/.test(part) ? "`" + part + "`" : part);
        out.push(":   " + (text[0] || ""));
        if (text.length > 1) out.push(indent(text.slice(1).join("\n"), 4));
        out.push("");
      });
      out.push("</div>");
      return out.join("\n");
    },
    preview: function (b) {
      var ls = lines(TYPES.anatomy.md(b));
      return anatomyHtml("anatomy", ls.slice(1, -1)) || "";
    },
    editor: function (b, box) {
      box.appendChild(field("Example name or pattern", input(b, "name", { placeholder: "<rg>-<geo>-<env>-01" }), "", "Split into parts at - _ . / and :. Use <angle brackets> or [square brackets] for a pattern."));
      box.appendChild(
        listEditor(b, "items", {
          itemLabel: "Part",
          addLabel: "Add a part",
          min: 1,
          create: newPart,
          render: function (x, i, card) {
            card.appendChild(field("Part, as it is in the name", input(x, "part", { placeholder: "<env>" })));
            card.appendChild(mdField(x, "text", { label: "What it means", rows: 1, placeholder: "**Environment.** `dev`, `test` or `prod`." }));
          },
        })
      );
      box.appendChild(
        h("div", { class: "writer-row writer-row--end" }, [
          button("Add a part for each piece of the name", "magnify", "md-button--ghost md-button--sm", function () {
            var have = b.items.map(function (x) {
              return x.part.trim();
            });
            b.items = b.items.filter(function (x) {
              return x.part.trim();
            });
            var added = 0;
            b.name.split(/[-_./:]/).forEach(function (part) {
              part = part.trim();
              if (!part || have.indexOf(part) >= 0) return;
              have.push(part);
              b.items.push({ part: part, code: false, text: "" });
              added++;
            });
            if (!b.items.length) b.items.push(newPart());
            redrawBlock(b);
            changed();
            toast(added ? "Added " + plural(added, "part") + "." : "Every piece of the name already has a part.");
          }),
        ])
      );
    },
  });

  function newPart() {
    return { part: "", code: false, text: "" };
  }

  /* ── What the reader needs → which component (from Choosing components) ── */

  var NEEDS = [
    { need: "A section heading", type: "heading", name: "Heading", basic: true },
    { need: "Paragraphs, lists and links", type: "text", name: "Text", basic: true },
    { need: "Follow steps in order", type: "steps", name: "Steps", rather: "a timeline or cards" },
    { need: "Pick their own version: portal, CLI, OS or tool", type: "tabs", name: "Content tabs", rather: "a heading for each version" },
    { need: "Not miss something that could hurt them", type: "callout", preset: { kind: "warning" }, name: "Warning callout", rather: "bold text in a paragraph" },
    { need: "Know about data loss or something that can't be undone", type: "callout", preset: { kind: "danger" }, name: "Danger callout" },
    { need: "Pick up a faster or better way", type: "callout", preset: { kind: "tip" }, name: "Tip callout" },
    { need: "Skip detail they may not need", type: "callout", preset: { kind: "note", collapse: "closed" }, name: "Collapsed note", rather: "a long page they scroll past" },
    { need: "See what success looks like", type: "callout", preset: { kind: "success" }, name: "Success callout" },
    { need: "Know they have the access a task needs", type: "callout", preset: { kind: "permissions" }, name: "Permissions callout", rather: "finding out at step 6" },
    { need: "Know a step costs money", type: "callout", preset: { kind: "cost" }, name: "Cost callout", rather: "a note at the end" },
    { need: "Follow security guidance", type: "callout", preset: { kind: "security" }, name: "Security callout" },
    { need: "Know a feature is in preview", type: "callout", preset: { kind: "preview" }, name: "Preview callout" },
    { need: "Copy something into a terminal or file", type: "code", name: "Code block", rather: "inline code" },
    { need: "Check a command worked", type: "output", name: "Command output", rather: "output pasted into the command's block" },
    { need: "Run commands with their own names and IDs", type: "values", name: "Your values", rather: "“Replace MY_RG with your resource group”" },
    { need: "Build or decode a resource name", type: "anatomy", name: "Name anatomy", rather: "a paragraph listing the parts" },
    { need: "Fix an error they've hit", type: "troubleshoot", name: "Troubleshooting entry", rather: "a FAQ written as prose" },
    { need: "Compare options on the same points", type: "table", name: "Table", rather: "a paragraph for each option" },
    { need: "Check they're in the right place", type: "image", name: "Screenshot", rather: "a screenshot instead of the instructions" },
    { need: "See how parts connect or a decision flows", type: "diagram", name: "Diagram", rather: "a paragraph describing the arrows" },
    { need: "Choose where to go next", type: "cards", name: "Cards", rather: "a bulleted list of links" },
    { need: "Take the one action the page is about", type: "buttons", name: "Button", rather: "a link at the end of a sentence" },
    { need: "See what changed over time", type: "timeline", name: "Timeline", rather: "a numbered list" },
  ];

  /* ── The Markdown a component starts as ──
     Snippets for CodeMirror: ${text} is a field the writer tabs through and
     can keep; #{text} is example text to replace, which the checks point out
     while it's still there. */

  var CALLOUT_SAMPLES = {
    note: "Worth knowing",
    info: "Where this applies",
    tip: "A faster way",
    success: "You should now see the new resource",
    warning: "Back up the database first",
    danger: "This deletes the data for good",
    example: "An example",
    question: "A common question",
    permissions: "You need Contributor on the resource group",
    cost: "This creates billable resources",
    security: "Keep the key out of source control",
    preview: "This feature is in preview",
  };

  var TROUBLESHOOT_SNIPPET = [
    '??? troubleshoot "`#{ErrorCode}` when #{doing something}"',
    "",
    "    Cause",
    "    :   #{Why it happens.}",
    "",
    "    Fix",
    "    :   #{What to do, with the command or click path.}",
  ].join("\n");

  // image: the path to an image the writer just uploaded, if any.
  function snippetFor(need, image) {
    var p = need.preset || {};
    switch (need.type) {
      case "heading":
        return "## #{Name the section}";
      case "text":
        return "#{Write here.}";
      case "steps":
        return ['<div class="steps" markdown>', "", "1.  **#{Do the first thing.}** #{How to do it, with any command or click path.}", "", "2.  **#{Do the next thing.}**", "", "</div>"].join("\n");
      case "callout":
        var marker = p.collapse === "closed" ? "???" : p.collapse === "open" ? "???+" : "!!!";
        var kind = p.kind || "note";
        return marker + " " + kind + ' "#{' + (CALLOUT_SAMPLES[kind] || "Make the point") + '}"\n    #{What the reader needs to know.}';
      case "troubleshoot":
        return TROUBLESHOOT_SNIPPET;
      case "tabs":
        return ['=== "Portal"', "", "    #{What readers who use the portal do.}", "", '=== "Azure CLI"', "", "    ``` bash", "    ${az group create --name <resource-group> --location <location>}", "    ```"].join("\n");
      case "code":
        return "``` ${bash}\n${az group create --name <resource-group> --location <location>}\n```";
      case "output":
        return "``` { .text .output }\n#{What the command prints: only the lines that prove it worked}\n```";
      case "values":
        return ['<div class="your-values" markdown>', "", "- `<${resource-group}>` ${Resource group name}", "", "</div>"].join("\n");
      case "table":
        return ["| ${Setting} | What it does | Default |", "| ------- | ------------ | ------- |", "| ${} | | |", "| | | |"].join("\n");
      case "image":
        return ['<figure class="screenshot" markdown="span">', "  ![#{Describe what the image shows}](" + (image || "${../images/your-screenshot.png}") + ")", "  <figcaption>#{What to notice}</figcaption>", "</figure>"].join("\n");
      case "diagram":
        return "``` mermaid\nflowchart LR\n  ${user[Reader]} --> ${site[Docs site]}\n```";
      case "cards":
        return [
          '<div class="grid cards" markdown>',
          "",
          "-   :material-rocket-launch-outline:{ .lg .middle } __[#{Get started}](${})__",
          "",
          "    ---",
          "",
          "    #{A sentence or two on what's there.}",
          "",
          "-   :material-book-open-variant:{ .lg .middle } __[#{Guides}](${})__",
          "",
          "    ---",
          "",
          "    #{What the reader finds there.}",
          "",
          "</div>",
        ].join("\n");
      case "buttons":
        return "[#{Get started}](${}){ .md-button .md-button--primary }";
      case "anatomy":
        return [
          '<div class="anatomy" markdown>',
          "",
          "`${<rg>}-${<geo>}-${<env>}-01`",
          "",
          "`${<rg>}`",
          ":   **Type.** #{The resource type's short name: `rg` for a resource group.}",
          "",
          "`${<geo>}`",
          ":   **Region.** #{Three letters, such as `weu` for West Europe.}",
          "",
          "`${<env>}`",
          ":   **Environment.** #{`dev`, `test` or `prod`.}",
          "",
          "01",
          ":   **Instance.** #{Two digits, starting at `01`.}",
          "",
          "</div>",
        ].join("\n");
      case "timeline":
        return ['<div class="timeline" markdown>', "", "#{v2.0} { .green }", ":   #{**Released.** What changed.}", "", "#{v1.0} { .grey }", ":   #{First release.}", "", "</div>"].join("\n");
    }
    return "";
  }

  // The example text in a snippet.
  function snippetHints(template) {
    var out = [];
    template.replace(/#\{([^{}]*)\}/g, function (all, text) {
      if (text.trim() && out.indexOf(text) < 0) out.push(text);
      return all;
    });
    return out;
  }

  // The snippet as it reads once inserted, for a plain textarea or a drag.
  function snippetText(template) {
    return template.replace(/[#$]\{([^{}]*)\}/g, "$1");
  }

  /* ── Page recipes (from the Page recipes in Choosing components) ── */

  var RECIPES = [
    {
      name: "How-to",
      text: "Steps to get one task done.",
      md: [
        "#{One sentence saying what the reader will have at the end.}",
        "",
        "## Before you start",
        "",
        "- [ ] #{An account with access to …}",
        "- [ ] #{The tools installed: …}",
        "",
        "## #{Name the procedure, such as: Create the storage account}",
        "",
        '<div class="steps" markdown>',
        "",
        "1.  **#{Do the first thing.}** #{How to do it.}",
        "",
        "2.  **#{Do the next thing.}**",
        "",
        "3.  **#{Do the last thing.}**",
        "",
        "</div>",
        "",
        '!!! success "#{What they should see now}"',
        "",
        "## Troubleshooting",
        "",
        TROUBLESHOOT_SNIPPET,
        "",
        "[#{The next thing to do}](${}){ .md-button .md-button--primary }",
      ],
    },
    {
      name: "Cloud how-to",
      text: "A task in Azure or AWS, with permissions, your values and portal / CLI tabs.",
      meta: { applies_to: ["azure"] },
      md: [
        "#{One sentence saying what the reader will have at the end.}",
        "",
        '!!! permissions "#{You need Contributor on the resource group}"',
        "",
        '<div class="your-values" markdown>',
        "",
        "- `<subscription-id>` Azure subscription ID",
        "- `<resource-group>` Resource group name",
        "- `<location>` Azure region, such as `westeurope`",
        "",
        "</div>",
        "",
        "## #{Name the procedure, such as: Create the resource group}",
        "",
        '=== "Portal"',
        "",
        "    1. Go to **Home > Resource groups > Create**{ .ui-path }.",
        "    2. #{Fill in the form …}",
        "",
        '=== "Azure CLI"',
        "",
        "    ``` bash",
        "    az group create --name <resource-group> --location <location>",
        "    ```",
        "",
        "``` { .text .output }",
        "#{What the command prints}",
        "```",
        "",
        "## Troubleshooting",
        "",
        TROUBLESHOOT_SNIPPET,
      ],
    },
    {
      name: "Reference",
      text: "Settings or commands people look up.",
      md: [
        "#{One sentence on what's listed here.}",
        "",
        "## #{A group of settings}",
        "",
        "| Setting | What it does | Default |",
        "| ------- | ------------ | ------- |",
        "| ${}     |              |         |",
        "|         |              |         |",
        "",
        "``` ${yaml}",
        "#{An example that uses them}",
        "```",
      ],
    },
    {
      name: "Section landing",
      text: "The first page of a tab: what's in it and where to go.",
      md: ["#{Two sentences on what this section covers.}", "", snippetFor({ type: "cards" })],
    },
    {
      name: "Troubleshooting",
      text: "A page of errors, each with its cause and fix.",
      md: [
        "#{One sentence on what this page helps with.}",
        "",
        "## #{A group, such as: Sign-in}",
        "",
        TROUBLESHOOT_SNIPPET,
        "",
        '??? troubleshoot "`#{AnotherError}` when #{doing something else}"',
        "",
        "    Cause",
        "    :   #{Why that happens.}",
        "",
        "    Fix",
        "    :   #{What to do about it.}",
      ],
    },
    {
      name: "Release notes",
      text: "What changed, release by release.",
      md: [
        "#{One sentence on what these notes cover.}",
        "",
        '<div class="timeline" markdown>',
        "",
        "#{v2.0} { .green }",
        ":   #{**Released.** What's new.}",
        "",
        "#{v1.1} { .accent }",
        ":   #{What changed.}",
        "",
        "#{v1.0} { .grey }",
        ":   #{First release.}",
        "",
        "</div>",
        "",
        '## #{Version 2.0} <span class="badge badge--accent">New</span> { data-toc-label="#{Version 2.0}" }',
        "",
        "#{What's new in this release.}",
        "",
        '!!! danger "#{Breaking: what changed and what to do}"',
      ],
    },
    {
      name: "Blank page",
      text: "Start from nothing.",
      md: [],
    },
  ];

  /* ── Reading Markdown back into blocks ── */

  var RE = {
    heading: /^(#{2,6})\s+(.+?)\s*$/,
    fence: /^(`{3,}|~{3,})\s*(.*)$/,
    admonition: /^(!!!|\?\?\?\+?)\s+([\w-]+)(?:\s+"(.*)")?\s*$/,
    tab: /^===\+?\s+"(.*)"\s*$/,
    div: /^<div class="([^"]*)"[^>]*\bmarkdown\b[^>]*>\s*$/,
    figure: /^<figure class="screenshot"/,
    image: /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(\{[^}]*\})?\s*$/,
    buttons: /^(?:\[[^\]]+\]\([^)]*\)\{\s*\.md-button[^}]*\}\s*)+$/,
    tableSep: /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/,
    badge: /^(.*?)\s+<span class="badge(?: badge--[\w-]+)*">([^<]+)<\/span>(?:\s*\{[^}]*\})?$/,
  };

  // Each block says which lines it came from: start, and end (exclusive).
  function parseBlocks(text) {
    var ls = lines(text);
    var out = [];
    var buf = [];
    var bufStart = 0;
    var i = 0;
    function flush() {
      var a = 0;
      var b = buf.length;
      while (a < b && !buf[a].trim()) a++;
      while (b > a && !buf[b - 1].trim()) b--;
      if (a < b) out.push({ type: "text", md: buf.slice(a, b).join("\n"), start: bufStart + a, end: bufStart + b });
      buf = [];
    }
    function keep(from, to) {
      if (!buf.length) bufStart = from;
      buf = buf.concat(ls.slice(from, to));
    }
    function take(block, next) {
      flush();
      block.start = i;
      block.end = next;
      out.push(block);
      i = next;
    }
    function alone(k) {
      return (k === 0 || !ls[k - 1].trim()) && (k + 1 >= ls.length || !ls[k + 1].trim());
    }
    while (i < ls.length) {
      var line = ls[i];
      var m;
      var r;
      if ((m = RE.fence.exec(line))) {
        r = readFence(ls, i, m);
        take(r.block, r.next);
        continue;
      }
      if ((m = RE.heading.exec(line))) {
        take(parseHeading(m), i + 1);
        continue;
      }
      if ((m = RE.admonition.exec(line))) {
        r = readIndented(ls, i + 1);
        take(parseAdmonition(m, r.lines), r.next);
        continue;
      }
      if (RE.tab.test(line)) {
        r = readTabs(ls, i);
        take(r.block, r.next);
        continue;
      }
      if ((m = RE.div.exec(line)) && (r = readDiv(ls, i))) {
        var block = parseDiv(m[1].split(/\s+/), r.inner);
        if (block) take(block, r.next);
        else {
          // Keep a component the writer can't edit exactly as it was.
          keep(i, r.next);
          i = r.next;
        }
        continue;
      }
      if (RE.figure.test(line) && (r = readFigure(ls, i))) {
        take(r.block, r.next);
        continue;
      }
      if ((m = RE.image.exec(line)) && alone(i)) {
        take(imageBlock(m, false, ""), i + 1);
        continue;
      }
      if (RE.buttons.test(line.trim()) && alone(i)) {
        take(parseButtons(line), i + 1);
        continue;
      }
      if (line.indexOf("|") >= 0 && RE.tableSep.test(ls[i + 1] || "") && (ls[i + 1] || "").indexOf("-") >= 0 && (i === 0 || !ls[i - 1].trim())) {
        r = readTable(ls, i);
        take(r.block, r.next);
        continue;
      }
      keep(i, i + 1);
      i++;
    }
    flush();
    return out;
  }

  function readFence(ls, i, m) {
    var char = m[1][0];
    var len = m[1].length;
    var j = i + 1;
    while (j < ls.length) {
      var close = /^(`{3,}|~{3,})\s*$/.exec(ls[j]);
      if (close && close[1][0] === char && close[1].length >= len) break;
      j++;
    }
    // "tight": written ```yaml, without the space; kept that way.
    var tight = /^(`{3,}|~{3,})\S/.test(ls[i]);
    return { block: fenceBlock(m[2], ls.slice(i + 1, j).join("\n"), tight), next: Math.min(j + 1, ls.length) };
  }

  function fenceBlock(header, code, tight) {
    header = header.trim();
    var lang = "";
    var rest = header;
    var brace = /^\{(.*)\}$/.exec(header);
    if (brace) rest = brace[1];
    else {
      var split = /^([\w+#.-]*)\s*(.*)$/.exec(header);
      lang = split[1];
      rest = split[2];
    }
    var classes = [];
    var title = "";
    var extra = [];
    var token = /(\.[\w-]+)|(title="[^"]*")|(\S+="[^"]*"|\S+)/g;
    var t;
    while ((t = token.exec(rest))) {
      if (t[1]) classes.push(t[1].slice(1));
      else if (t[2]) title = t[2].slice(7, -1).replace(/&quot;/g, '"');
      else extra.push(t[3]);
    }
    var isOutput = classes.indexOf("output") >= 0;
    classes = classes.filter(function (c) {
      return c !== "output";
    });
    if (!lang && classes.length) lang = classes.shift();
    if (isOutput) return { type: "output", lang: lang || "text", title: title, code: code, extra: extra.join(" ") };
    if (lang === "mermaid") return { type: "diagram", code: code };
    return { type: "code", lang: lang, title: title, code: code, extra: extra.join(" "), tight: tight };
  }

  function parseHeading(m) {
    var text = m[2].replace(/\s+#+$/, "");
    var badge = "";
    var b = RE.badge.exec(text);
    if (b) {
      var word = b[2].trim().toLowerCase();
      if (BADGES[word]) {
        badge = word;
        text = b[1];
      }
    }
    return { type: "heading", level: m[1].length, text: text, badge: badge };
  }

  function readIndented(ls, start) {
    var j = start;
    var last = start;
    while (j < ls.length && (!ls[j].trim() || /^( {4}|\t)/.test(ls[j]))) {
      if (ls[j].trim()) last = j + 1;
      j++;
    }
    return { lines: trimBlank(dedent(ls.slice(start, last), 4)), next: last };
  }

  function parseAdmonition(m, body) {
    var marker = m[1];
    var kind = m[2].toLowerCase();
    var title = (m[3] || "").replace(/&quot;/g, '"');
    var collapse = marker === "???" ? "closed" : marker === "???+" ? "open" : "";
    if (kind === "troubleshoot") {
      var entry = parseTroubleshoot(body);
      if (entry) {
        entry.title = title;
        entry.open = collapse === "open";
        return entry;
      }
    }
    return { type: "callout", kind: kind, title: title, body: body.join("\n"), collapse: collapse };
  }

  // A definition list: a term, then ":   text", then text indented by four.
  function readDefinitions(body, allowed) {
    var items = [];
    var i = 0;
    while (i < body.length) {
      if (!body[i].trim()) {
        i++;
        continue;
      }
      if (!/^:\s+/.test(body[i + 1] || "")) return null;
      var term = body[i];
      if (allowed && !allowed.test(term.trim())) return null;
      var dd = [body[i + 1].replace(/^:\s+/, "")];
      var j = i + 2;
      while (j < body.length && (!body[j].trim() || /^( {4}|\t)/.test(body[j]))) dd.push(body[j++]);
      items.push({ term: term, text: trimBlank([dd[0]].concat(dedent(dd.slice(1), 4))).join("\n") });
      i = j;
    }
    return items;
  }

  function parseTroubleshoot(body) {
    var items = readDefinitions(body, /^(symptom|cause|fix)$/i);
    if (!items || !items.length) return null;
    var entry = { type: "troubleshoot", title: "", symptom: "", cause: "", fix: "", open: false };
    items.forEach(function (item) {
      entry[item.term.trim().toLowerCase()] = item.text;
    });
    return entry;
  }

  function readTabs(ls, i) {
    var tabs = [];
    while (i < ls.length) {
      var m = RE.tab.exec(ls[i]);
      if (!m) break;
      var r = readIndented(ls, i + 1);
      tabs.push({ label: m[1].replace(/&quot;/g, '"'), body: r.lines.join("\n") });
      i = r.next;
      var k = i;
      while (k < ls.length && !ls[k].trim()) k++;
      if (k < ls.length && RE.tab.test(ls[k])) i = k;
      else break;
    }
    return { block: { type: "tabs", tabs: tabs }, next: i };
  }

  function readDiv(ls, i) {
    var depth = 0;
    for (var j = i; j < ls.length; j++) {
      depth += (ls[j].match(/<div\b/g) || []).length - (ls[j].match(/<\/div>/g) || []).length;
      if (depth <= 0) {
        if (ls[j].trim() !== "</div>") return null;
        return { inner: ls.slice(i + 1, j), next: j + 1 };
      }
    }
    return null;
  }

  function parseDiv(classes, inner) {
    function has(c) {
      return classes.indexOf(c) >= 0;
    }
    if (has("steps")) return parseSteps(inner);
    if (has("your-values")) return parseValues(inner);
    if (has("timeline")) return parseTimeline(inner, has("timeline--cards"), has("timeline--rainbow"));
    if (has("anatomy") && classes.length === 1) return parseAnatomy(inner);
    if (has("grid") && has("cards")) return parseCards(inner, has("grid--2"));
    if (has("button-row")) {
      var text = trimBlank(inner).join(" ").trim();
      return RE.buttons.test(text) ? parseButtons(text) : null;
    }
    return null;
  }

  function parseSteps(inner) {
    var items = [];
    var current = null;
    var ls = trimBlank(inner);
    for (var k = 0; k < ls.length; k++) {
      var m = /^\d+[.)]\s+(.*)$/.exec(ls[k]);
      if (m) {
        current = { first: m[1], rest: [] };
        items.push(current);
      } else if (current) current.rest.push(ls[k]);
      else if (ls[k].trim()) return null;
    }
    if (!items.length) return null;
    return {
      type: "steps",
      items: items.map(function (item) {
        var body = dedent(item.rest, 4);
        var a = /^\*\*(.+?)\*\*\s*(.*)$/.exec(item.first);
        var first = a ? a[2] : item.first;
        return { action: a ? a[1] : "", body: trimBlank((first.trim() ? [first] : []).concat(body)).join("\n") };
      }),
    };
  }

  function parseValues(inner) {
    var items = [];
    var ls = trimBlank(inner);
    for (var k = 0; k < ls.length; k++) {
      if (!ls[k].trim()) continue;
      var m = /^[-*]\s+`<([\w.-]+)>`\s*(.*)$/.exec(ls[k]);
      if (!m) return null;
      items.push({ name: m[1], label: m[2] });
    }
    return items.length ? { type: "values", items: items } : null;
  }

  function parseTimeline(inner, cards, rainbow) {
    var entries = readDefinitions(trimBlank(inner));
    if (!entries || !entries.length) return null;
    return {
      type: "timeline",
      cards: cards,
      rainbow: rainbow,
      items: entries.map(function (entry) {
        var m = /^(.*?)\s*(?:\{\s*\.([\w-]+)\s*\})?\s*$/.exec(entry.term);
        return { label: m[1], colour: m[2] || "", text: entry.text };
      }),
    };
  }

  function parseAnatomy(inner) {
    var ls = trimBlank(inner);
    var name = /^`([^`]+)`\s*$/.exec(ls[0] || "");
    var entries = name && readDefinitions(ls.slice(1));
    if (!entries || !entries.length) return null;
    return {
      type: "anatomy",
      name: name[1],
      items: entries.map(function (entry) {
        var code = /^`([^`]+)`$/.exec(entry.term.trim());
        return { part: code ? code[1] : entry.term.trim(), code: !!code, text: entry.text };
      }),
    };
  }

  function parseCards(inner, wide) {
    var items = [];
    var current = null;
    var ls = trimBlank(inner);
    for (var k = 0; k < ls.length; k++) {
      var m = /^[-*]\s+(.*)$/.exec(ls[k]);
      if (m) {
        current = { head: m[1], rest: [] };
        items.push(current);
      } else if (current) current.rest.push(ls[k]);
      else if (ls[k].trim()) return null;
    }
    if (!items.length) return null;
    var cards = [];
    for (var i = 0; i < items.length; i++) {
      var head = /^(?::([\w-]+):(?:\{[^}]*\})?\s*)?(?:__|\*\*)(.+?)(?:__|\*\*)\s*$/.exec(items[i].head);
      var body = trimBlank(dedent(items[i].rest, 4));
      if (!head || (body.length && body[0].trim() !== "---")) return null;
      var link = /^\[(.+)\]\((.+)\)$/.exec(head[2]);
      cards.push({ icon: head[1] || "", title: link ? link[1] : head[2], link: link ? link[2] : "", text: trimBlank(body.slice(1)).join("\n") });
    }
    return { type: "cards", wide: wide, items: cards };
  }

  function parseButtons(text) {
    var items = [];
    var re = /\[([^\]]+)\]\(([^)]*)\)\{\s*([^}]*)\}/g;
    var m;
    while ((m = re.exec(text))) {
      var style = "";
      (m[3].match(/\.md-button--([\w-]+)/g) || []).forEach(function (c) {
        var name = c.slice(".md-button--".length);
        if (!style && BUTTON_STYLES.some(function (s) { return s[0] === name; })) style = name;
      });
      items.push({ text: m[1], link: m[2] === "#" ? "" : m[2], style: style });
    }
    return { type: "buttons", items: items };
  }

  function imageBlock(m, frame, caption) {
    var width = /width="?(\d+)/.exec(m[3] || "");
    return { type: "image", image: "", src: m[2], alt: m[1], caption: caption, width: width ? width[1] : "", frame: frame };
  }

  function readFigure(ls, i) {
    for (var j = i; j < ls.length && j < i + 8; j++) {
      if (ls[j].indexOf("</figure>") >= 0) {
        var inner = ls.slice(i, j + 1).join("\n");
        var img = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)(\{[^}]*\})?/.exec(inner);
        if (!img) return null;
        var caption = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(inner);
        return { block: imageBlock(img, true, caption ? caption[1].trim() : ""), next: j + 1 };
      }
    }
    return null;
  }

  function splitRow(line) {
    var text = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    var cells = [];
    var cell = "";
    for (var k = 0; k < text.length; k++) {
      if (text[k] === "\\" && text[k + 1] === "|") {
        cell += "|";
        k++;
      } else if (text[k] === "|") {
        cells.push(cell.trim());
        cell = "";
      } else cell += text[k];
    }
    cells.push(cell.trim());
    return cells;
  }

  function readTable(ls, i) {
    var head = splitRow(ls[i]);
    var align = splitRow(ls[i + 1]).map(function (c) {
      var left = c[0] === ":";
      var right = c[c.length - 1] === ":";
      return left && right ? "center" : right ? "right" : left ? "left" : "";
    });
    var rows = [head];
    var j = i + 2;
    while (j < ls.length && ls[j].trim() && ls[j].indexOf("|") >= 0) rows.push(splitRow(ls[j++]));
    var cols = head.length;
    rows = rows.map(function (r) {
      r = r.slice(0, cols);
      while (r.length < cols) r.push("");
      return r;
    });
    if (rows.length < 2) rows.push(head.map(function () { return ""; }));
    return { block: { type: "table", rows: rows, align: align, raw: ls.slice(i, j).join("\n") }, next: j };
  }

  function parseFront(front, meta) {
    var extra = [];
    var i = 0;
    while (i < front.length) {
      var m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(front[i]);
      var j = i + 1;
      while (j < front.length && (/^\s/.test(front[j]) || !front[j].trim() || /^-\s/.test(front[j]))) j++;
      var key = m && m[1];
      var value = m ? m[2].trim() : "";
      if (key === "applies_to") meta.applies_to = yamlList(value, front.slice(i + 1, j));
      else if (key === "owner") meta.owner = unquote(value);
      else if (key === "last_reviewed") meta.last_reviewed = unquote(value);
      else if (key === "review_every") meta.review_every = unquote(value);
      else if (key === "unlisted" && /^true$/i.test(value)) meta.visibility = "unlisted";
      else if (key === "draft" && /^true$/i.test(value)) meta.visibility = "draft";
      else if (key === "draft" && unquote(value) === "prod") meta.visibility = "draft-prod";
      else extra = extra.concat(front.slice(i, j));
      i = j;
    }
    meta.extraFront = trimBlank(extra).join("\n");
  }

  function yamlList(value, rest) {
    if (/^\[.*\]$/.test(value)) {
      return value
        .slice(1, -1)
        .split(",")
        .map(unquote)
        .filter(Boolean);
    }
    if (value) return [unquote(value)];
    return rest
      .map(function (line) {
        var m = /^\s*-\s*(.+)$/.exec(line);
        return m ? unquote(m[1]) : "";
      })
      .filter(Boolean);
  }

  function parseDocument(text) {
    var ls = lines(text);
    var meta = emptyMeta();
    var body = ls;
    if (ls[0] === "---") {
      var end = ls.indexOf("---", 1);
      if (end > 0) {
        parseFront(ls.slice(1, end), meta);
        body = ls.slice(end + 1);
      }
    }
    var k = 0;
    while (k < body.length && !body[k].trim()) k++;
    var h1 = /^#\s+(.+?)\s*$/.exec(body[k] || "");
    if (h1) {
      meta.title = h1[1];
      body = body.slice(k + 1);
    } else {
      var titled = /^title:\s*(.+)$/m.exec(meta.extraFront);
      // Pages like the home page title themselves in front matter, without
      // a # heading; keep it that way.
      if (titled) {
        meta.title = unquote(titled[1]);
        meta.titleInFront = true;
      }
    }
    return { meta: meta, body: trimBlank(body).join("\n") };
  }

  /* ── Writing Markdown ── */

  // m: the page settings; the draft showing, unless another is given.
  function frontMatter(m) {
    m = m || state.meta;
    var out = [];
    if (m.applies_to.length) out.push("applies_to: [" + m.applies_to.join(", ") + "]");
    if (m.owner.trim()) out.push("owner: " + yamlString(m.owner.trim()));
    if (m.last_reviewed) out.push("last_reviewed: " + m.last_reviewed);
    var every = parseInt(m.review_every, 10);
    if (every > 0) out.push("review_every: " + every);
    if (m.visibility === "unlisted") out.push("unlisted: true");
    else if (m.visibility === "draft-prod") out.push("draft: prod");
    else if (m.visibility === "draft") out.push("draft: true");
    var extra = m.extraFront.replace(/\s+$/, "");
    if (m.titleInFront) extra = extra.replace(/^title:.*$/m, "title: " + yamlString(m.title.trim()));
    if (extra.trim()) out.push(extra);
    return out.length ? "---\n" + out.join("\n") + "\n---\n\n" : "";
  }

  // The file: front matter, the title and the body as written. s: a draft,
  // { meta, body }; the one showing, unless another is given.
  function toMarkdown(s) {
    s = s || state;
    var meta = Object.assign(emptyMeta(), s.meta);
    var parts = [];
    if (meta.title.trim() && !meta.titleInFront) parts.push("# " + meta.title.trim());
    var body = trimBlank(lines(s.body)).join("\n");
    if (body) parts.push(body);
    return frontMatter(meta) + parts.join("\n\n") + "\n";
  }

  /* ── Preview: the same HTML the build produces, styled by the site ── */

  var tabSets = 0;
  var mermaidCache = {};

  function renderMarkdown(md) {
    return parseBlocks(md)
      .map(function (b) {
        return b.type === "text" ? renderPlain(b.md) : TYPES[b.type].preview(b);
      })
      .join("");
  }

  // pymdownx syntax marked doesn't know: ++keys++, ==mark==, ^^insert^^.
  function extensions(md) {
    var codes = [];
    var text = md.replace(/(`+)[\s\S]*?[^`]\1(?!`)/g, function (code) {
      codes.push(code);
      return "\u0000" + (codes.length - 1) + "\u0000";
    });
    text = text
      .replace(/\+\+([a-z0-9-]+(?:\+[a-z0-9-]+)*)\+\+/gi, function (all, keys) {
        return keysHtml(keys);
      })
      .replace(/==(?=\S)([^=\n]*?\S)==/g, "<mark>$1</mark>")
      .replace(/\^\^(?=\S)([^^\n]*?\S)\^\^/g, "<ins>$1</ins>");
    return text.replace(/\u0000(\d+)\u0000/g, function (all, n) {
      return codes[+n];
    });
  }

  function keysHtml(keys) {
    return (
      '<span class="keys">' +
      keys
        .split("+")
        .map(function (key) {
          var name = KEY_NAMES[key.toLowerCase()] || (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1));
          return '<kbd class="key-' + esc(key.toLowerCase()) + '">' + esc(name) + "</kbd>";
        })
        .join("<span>+</span>") +
      "</span>"
    );
  }

  function renderPlain(md) {
    // Glossary definitions (*[TERM]: Meaning) aren't shown: the abbr
    // extension takes them out, and glossary() uses them.
    md = lines(md)
      .filter(function (line) {
        return !ABBREVIATION.test(line);
      })
      .join("\n");
    if (!md.trim()) return "";
    if (!window.marked) return "<p>" + esc(md).replace(/\n\n+/g, "</p><p>") + "</p>";
    // A name anatomy is drawn as hooks/components.py draws it; the rest goes
    // to marked.
    var ls = lines(md);
    var out = "";
    var buf = [];
    function plain() {
      if (buf.join("").trim()) out += finish(window.marked.parse(extensions(pythonish(buf.join("\n")))));
      buf = [];
    }
    for (var i = 0; i < ls.length; i++) {
      var m = RE.div.exec(ls[i]);
      var r = m && m[1].split(/\s+/).indexOf("anatomy") >= 0 && readDiv(ls, i);
      var html = r && anatomyHtml(m[1], r.inner);
      if (html) {
        plain();
        out += html;
        i = r.next - 1;
      } else buf.push(ls[i]);
    }
    plain();
    return out;
  }

  // Segment colours cycle through this many hues, as in hooks/components.py.
  var ANATOMY_HUES = 6;

  // A name in inline code, then a definition list with a term for each part:
  // the name split into coloured parts, each keyed to its term.
  function anatomyHtml(classes, inner) {
    inner = trimBlank(inner);
    var name = /^`([^`]+)`\s*$/.exec(inner[0] || "");
    var items = name && readDefinitions(inner.slice(1));
    if (!items || !items.length) return null;
    var index = {};
    var labels = {};
    var dl = items
      .map(function (x) {
        var dt = inline(x.term.trim());
        var dd = renderMarkdown(x.text);
        var key = textOf(dt);
        if (!(key in index)) index[key] = (Object.keys(index).length % ANATOMY_HUES) + 1;
        var lead = /^\s*(?:<p>)?\s*<strong>([\s\S]*?)<\/strong>/.exec(dd);
        if (lead && !(key in labels)) labels[key] = textOf(lead[1]).replace(/[.:]+$/, "");
        return '<dt data-seg="' + index[key] + '">' + dt + '</dt><dd data-seg="' + index[key] + '">' + dd + "</dd>";
      })
      .join("");
    var parts = name[1].split(/([-_./:])/).filter(Boolean).map(function (part) {
      if (/^[-_./:]$/.test(part)) return '<span class="anatomy__sep">' + esc(part) + "</span>";
      if (!(part in index)) return '<span class="anatomy__seg"><span class="anatomy__value">' + esc(part) + "</span></span>";
      var label = labels[part] ? '<span class="anatomy__label" aria-hidden="true">' + esc(labels[part]) + "</span>" : "";
      return '<span class="anatomy__seg" data-seg="' + index[part] + '"><span class="anatomy__value">' + esc(part) + "</span>" + label + "</span>";
    });
    return '<div class="' + esc(classes) + '"><p class="anatomy__name">' + parts.join("") + "</p><dl>" + dl + "</dl></div>";
  }

  function textOf(html) {
    var box = document.createElement("div");
    box.innerHTML = html;
    return box.textContent.trim();
  }

  // A glossary definition, as the abbr extension reads it.
  var ABBREVIATION = /^\*\[([^\]]+)\] ?:[ ]*(.*)$/;

  // The site's glossary (includes/abbreviations.md, from hooks/writer.py)
  // and the page's own definitions, as the abbr extension marks them up:
  // whole words, case-sensitive, never in code.
  function glossary(root) {
    var terms = Object.assign({}, data.glossary);
    lines(state.body).forEach(function (line) {
      var m = ABBREVIATION.exec(line);
      if (m) terms[m[1]] = m[2];
    });
    var keys = Object.keys(terms)
      .filter(function (k) {
        return k && terms[k];
      })
      .sort(function (a, b) {
        return b.length - a.length;
      });
    if (!keys.length) return;
    var re = new RegExp(
      "\\b(?:" +
        keys
          .map(function (k) {
            return k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          })
          .join("|") +
        ")\\b",
      "g"
    );
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var up = node.parentElement;
        return up && !up.closest("code, pre, kbd, abbr, svg, script, style, textarea, .mermaid, .page-info, .anatomy__name") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    var found = [];
    while (walker.nextNode()) {
      re.lastIndex = 0;
      if (re.test(walker.currentNode.nodeValue)) found.push(walker.currentNode);
    }
    found.forEach(function (node) {
      var text = node.nodeValue;
      var frag = document.createDocumentFragment();
      var last = 0;
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var abbr = document.createElement("abbr");
        abbr.title = terms[m[0]];
        abbr.textContent = m[0];
        frag.appendChild(abbr);
        last = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  // Where the site's build (Python-Markdown) reads Markdown differently from
  // marked, so the preview doesn't show what the page won't: a list or table
  // straight under a line of text stays part of that paragraph, and list
  // items indented by fewer than four spaces aren't nested. (Bare web
  // addresses not being links is in marked's settings, in mount.)
  function pythonish(md) {
    var ls = lines(md);
    var fence = null;
    function text(line) {
      return line.trim() && !/^\s/.test(line) && !LIST_ITEM.test(line) && !/^\s*(#|<|!!!|\?\?\?|===|:\s|>|\||\{)/.test(line);
    }
    for (var i = 0; i < ls.length; i++) {
      var line = ls[i];
      var f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = null;
        continue;
      }
      if (f) {
        fence = f[1];
        continue;
      }
      var prev = i ? ls[i - 1] : "";
      if (text(prev) && /^([-*+]|\d+[.)])\s+\S/.test(line)) {
        ls[i] = line.replace(/^(\d+)([.)])/, "$1\\$2").replace(/^([-*+])/, "\\$1");
        continue;
      }
      if (text(prev) && /\|/.test(line) && RE.tableSep.test(ls[i + 1] || "")) {
        ls[i] = line.replace(/\|/g, "\\|");
        ls[i + 1] = ls[i + 1].replace(/\|/g, "\\|");
        i++;
        continue;
      }
      var item = LIST_ITEM.exec(line);
      if (item && item[1].length > 0 && item[1].length < 4) {
        for (var k = i - 1; k >= 0 && ls[k].trim(); k--) {
          var up = LIST_ITEM.exec(ls[k]);
          if (up && up[1].length < item[1].length) {
            ls[i] = line.slice(item[1].length);
            break;
          }
        }
      }
    }
    return ls.join("\n");
  }

  function inline(md) {
    md = String(md || "");
    if (!window.marked) return esc(md);
    return finish(window.marked.parseInline(extensions(md)));
  }

  function attrString(spec) {
    var classes = [];
    var attrs = "";
    var re = /\.([\w-]+)|#([\w-]+)|([\w-]+)="([^"]*)"|([\w-]+)=(\S+)/g;
    var m;
    while ((m = re.exec(spec))) {
      if (m[1]) classes.push(m[1]);
      else if (m[2]) attrs += ' id="' + esc(m[2]) + '"';
      else if (m[3]) attrs += " " + m[3] + '="' + esc(m[4]) + '"';
      else if (m[5]) attrs += " " + m[5] + '="' + esc(m[6]) + '"';
    }
    return (classes.length ? ' class="' + classes.join(" ") + '"' : "") + attrs;
  }

  // Images and files this page brings aren't on the site yet: show them from
  // the browser's copy. Anything else is loaded from the site as usual.
  function previewSrc(src) {
    if (!src || /^(data:|blob:|https?:|\/\/)/i.test(src)) return src;
    var path = joinPath(folderPath(), src);
    var found = attachedAt(path);
    if (found) return assetUrl(found.kind, found.name);
    return src[0] === "/" ? src : BASE + path;
  }

  function previewHref(href) {
    if (!href || isExternal(href)) return href;
    var parts = splitHash(href);
    var path = joinPath(folderPath(), parts[0]);
    var found = attachedAt(path);
    if (found) return assetUrl(found.kind, found.name);
    return siteUrl(path + parts[1]);
  }

  // A tag with no attributes, such as <env>. Unless it's an HTML, SVG or
  // MathML element it's a placeholder, shown as written (hooks/components.py,
  // whose HTML_ELEMENTS this keeps in step with).
  var BARE_TAG = /<(\/?)([A-Za-z][\w.-]*)>/g;
  var HTML_ELEMENTS = {};
  (
    "a abbr address area article aside audio b base bdi bdo big blockquote body br button canvas caption " +
    "center cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset " +
    "figcaption figure font footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input " +
    "ins kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option " +
    "output p param picture pre progress q rp rt ruby s samp script search section select slot small " +
    "source span strike strong style sub summary sup table tbody td template textarea tfoot th thead time " +
    "title tr track tt u ul var video wbr " +
    "svg g defs symbol use path rect circle ellipse line polyline polygon text tspan textpath " +
    "lineargradient radialgradient stop clippath mask pattern marker filter foreignobject desc image switch " +
    "math mi mo mn ms mrow msup msub msubsup mfrac msqrt mroot mtext mspace mtable mtr mtd semantics annotation"
  )
    .split(" ")
    .forEach(function (name) {
      HTML_ELEMENTS[name] = true;
    });

  // attr_list, the ui-path hook, and a sanitiser: an opened file is shown
  // here, so it mustn't be able to run script in the page.
  function finish(html) {
    html = html
      .replace(BARE_TAG, function (all, slash, name) {
        return HTML_ELEMENTS[name.toLowerCase()] ? all : "&lt;" + slash + name + "&gt;";
      })
      .replace(/(<img\b[^>]*?)\s*\/?>\s*\{\s*([^}]*)\}/g, function (all, tag, spec) {
        return tag + attrString(spec) + ">";
      })
      .replace(/<(a|strong|em|span|code)\b([^>]*)>((?:(?!<\1\b)[\s\S])*?)<\/\1>\{\s*([^}]*)\}/g, function (all, tag, open, inner, spec) {
        return "<" + tag + open + attrString(spec) + ">" + inner + "</" + tag + ">";
      });
    var tpl = document.createElement("template");
    tpl.innerHTML = html;
    var root = tpl.content;
    root.querySelectorAll("script, iframe, object, embed, link, meta, style, base, form").forEach(function (node) {
      node.remove();
    });
    root.querySelectorAll("*").forEach(function (node) {
      Array.prototype.slice.call(node.attributes).forEach(function (attr) {
        if (/^on/i.test(attr.name) || (/^(href|src|xlink:href|action)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value))) node.removeAttribute(attr.name);
      });
    });
    root.querySelectorAll("strong.ui-path").forEach(function (node) {
      var parts = node.innerHTML.trim().split(/\s+&gt;\s+/);
      if (parts.length < 2) return;
      var sep = '<span class="ui-path__sep" aria-hidden="true"></span><span class="sr-only">, </span>';
      node.innerHTML = parts
        .map(function (part) {
          return '<span class="ui-path__item">' + part + "</span>";
        })
        .join(sep);
    });
    root.querySelectorAll("img[src]").forEach(function (img) {
      img.setAttribute("src", previewSrc(img.getAttribute("src")));
    });
    root.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href");
      if (href[0] === "#") return;
      a.setAttribute("href", previewHref(href));
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });
    var box = document.createElement("div");
    box.appendChild(root);
    return box.innerHTML;
  }

  function codeHtml(lang, title, code, output) {
    return (
      '<div class="language-' + esc(lang) + (output ? " output" : "") + " highlight" + (output ? " no-copy" : "") + '">' +
      (title ? '<span class="filename">' + esc(title) + "</span>" : "") +
      "<pre><span></span><code>" + esc(code.replace(/\s+$/, "")) + "</code></pre></div>"
    );
  }

  function tabsHtml(tabs) {
    var set = ++tabSets;
    var inputs = "";
    var labels = "";
    var blocks = "";
    tabs.forEach(function (tab, i) {
      var id = "writer-tab-" + set + "-" + (i + 1);
      inputs += '<input type="radio" name="writer-tab-' + set + '" id="' + id + '"' + (i === 0 ? " checked" : "") + ">";
      labels += '<label for="' + id + '">' + tab[0] + "</label>";
      blocks += '<div class="tabbed-block">' + tab[1] + "</div>";
    });
    return '<div class="tabbed-set tabbed-alternate" data-tabs="' + set + ":" + tabs.length + '">' + inputs + '<div class="tabbed-labels">' + labels + '</div><div class="tabbed-content">' + blocks + "</div></div>";
  }

  // The strip hooks/page_info.py adds under the title.
  function pageInfoHtml() {
    var m = state.meta;
    var items = [];
    if (m.applies_to.length) {
      items.push(
        '<span class="page-info__item page-info__platforms"><span class="page-info__key">Applies to</span>' +
          m.applies_to
            .map(function (key) {
              var p = data.platforms[key];
              return p ? '<span class="platform platform--' + key + '">' + p.icon + esc(p.label) + "</span>" : "";
            })
            .join("") +
          "</span>"
      );
    }
    if (m.owner.trim()) items.push('<span class="page-info__item"><span class="page-info__key">Owner</span>' + esc(m.owner.trim()) + "</span>");
    var attrs = "";
    var date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m.last_reviewed || "");
    if (date) {
      var d = new Date(+date[1], +date[2] - 1, +date[3]);
      var months = parseInt(m.review_every, 10) || data.review_months || 6;
      attrs = ' data-reviewed="' + m.last_reviewed + '" data-review-months="' + months + '"';
      items.push(
        '<span class="page-info__item page-info__review"><span class="page-info__key">Reviewed</span><time datetime="' + m.last_reviewed + '">' +
          d.getDate() + " " + d.toLocaleString("en-GB", { month: "short" }) + " " + d.getFullYear() +
          "</time></span>"
      );
    }
    return items.length ? '<div class="page-info"' + attrs + ">" + items.join("") + "</div>" : "";
  }

  function renderMermaid(root) {
    var nodes = root.querySelectorAll("pre.writer-mermaid--pending");
    if (!nodes.length) return;
    loadScript(MERMAID_SRC).then(function () {
      var mermaid = window.mermaid;
      if (!mermaid) return;
      if (!renderMermaid.ready) {
        var dark = getComputedStyle(document.documentElement).colorScheme === "dark";
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });
        renderMermaid.ready = true;
      }
      nodes.forEach(function (pre) {
        var code = pre.textContent.trim();
        var id = "writer-mermaid-" + ++renderMermaid.count;
        mermaid
          .render(id, code)
          .then(function (result) {
            mermaidCache[code] = result.svg;
            if (!pre.isConnected) return;
            var box = h("div", { class: "writer-mermaid", html: result.svg });
            pre.replaceWith(box);
          })
          .catch(function (error) {
            var stray = document.getElementById("d" + id);
            if (stray) stray.remove();
            pre.classList.remove("writer-mermaid--pending");
            pre.classList.add("writer-mermaid--error");
            pre.setAttribute("data-error", "This diagram has a mistake: " + String((error && error.message) || error).split("\n")[0]);
          });
      });
    }, function () {
      nodes.forEach(function (pre) {
        pre.classList.remove("writer-mermaid--pending");
      });
    });
  }
  renderMermaid.count = 0;

  /* ── Form controls ── */

  function icon(name) {
    return h("span", { class: "writer-icon", "aria-hidden": "true", html: (data && data.ui[name]) || "" });
  }

  function iconButton(name, label, disabled, onclick) {
    return h("button", { type: "button", class: "writer-icon-btn", title: label, "aria-label": label, disabled: !!disabled, onclick: onclick }, [icon(name)]);
  }

  function button(label, iconName, cls, onclick) {
    return h("button", { type: "button", class: "md-button " + (cls || ""), onclick: onclick }, [iconName ? icon(iconName) : null, h("span", { text: label })]);
  }

  function field(label, control, mod, hint) {
    // A <label> only around a single control; groups of checkboxes get a div.
    var tag = control.querySelector && control.querySelector("label, button, input[type=checkbox]") ? "div" : "label";
    return h(tag, { class: "writer-field" + (mod ? " writer-field--" + mod : "") }, [h("span", { class: "writer-field__label", text: label }), control, hint ? h("span", { class: "writer-field__hint", text: hint }) : null]);
  }

  function row(children) {
    return h("div", { class: "writer-row" }, children);
  }

  function input(obj, key, attrs) {
    var node = h(
      "input",
      Object.assign(
        {
          class: "writer-input",
          type: "text",
          value: obj[key] == null ? "" : String(obj[key]),
          oninput: function () {
            obj[key] = node.value;
            changed();
          },
        },
        attrs
      )
    );
    return node;
  }

  function select(obj, key, options, numeric, onchange) {
    var node = h(
      "select",
      {
        class: "writer-input",
        value: String(obj[key] == null ? "" : obj[key]),
        onchange: function () {
          obj[key] = numeric ? parseInt(node.value, 10) : node.value;
          changed();
          if (onchange) onchange();
        },
      },
      options.map(function (o) {
        return h("option", { value: String(o[0]), text: o[1] });
      })
    );
    return node;
  }

  function checkbox(obj, key, label, onchange) {
    var box = h("input", {
      type: "checkbox",
      checked: !!obj[key],
      onchange: function () {
        obj[key] = box.checked;
        changed();
        if (onchange) onchange();
      },
    });
    return h("label", { class: "writer-check" }, [box, h("span", { text: label })]);
  }

  // A link field that offers the site's pages and stores a path relative to
  // the page being written, as the build expects.
  function linkInput(obj, key) {
    var node = input(obj, key, {
      list: "writer-pages",
      placeholder: "Start typing a page title, or https://…",
      onchange: function () {
        var target = pageFromChoice(node.value);
        if (target) {
          obj[key] = relPath(folderPath(), target.src);
          node.value = obj[key];
        }
        changed();
      },
    });
    return node;
  }

  function pageFromChoice(value) {
    var m = /\(([^()]+\.md)\)\s*$/.exec(value || "");
    if (!m) return null;
    for (var i = 0; i < data.pages.length; i++) if (data.pages[i].src === m[1]) return data.pages[i];
    return null;
  }

  function grow(area) {
    area.style.height = "auto";
    area.style.height = area.scrollHeight + 2 + "px";
  }

  // Through execCommand, so the browser's undo still works. area is a
  // textarea, or the editor as one (editorArea()).
  function replaceSelection(area, text) {
    if (area.cm) {
      area.cm.dispatch(area.cm.state.replaceSelection(text));
      area.cm.focus();
      return;
    }
    area.focus();
    var ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      area.setRangeText(text, area.selectionStart, area.selectionEnd, "end");
      area.dispatchEvent(new Event("input"));
    }
  }

  // Bold, italic and the like: around the selection, or the word the cursor
  // is in. Pressed again, the markers come off, whether they're selected
  // too or just outside the selection.
  function toggleWrap(before, after, sample) {
    return function (area) {
      var value = area.value;
      var start = area.selectionStart;
      var end = area.selectionEnd;
      if (start === end) {
        var a = start;
        var b = end;
        while (a > 0 && /[\w'’-]/.test(value[a - 1])) a--;
        while (b < value.length && /[\w'’-]/.test(value[b])) b++;
        if (a < start && b > end) {
          start = a;
          end = b;
          area.setSelectionRange(start, end);
        }
      }
      var sel = value.slice(start, end);
      if (sel.length > before.length + after.length && sel.indexOf(before) === 0 && sel.slice(-after.length) === after) {
        var bare = sel.slice(before.length, sel.length - after.length);
        replaceSelection(area, bare);
        area.setSelectionRange(start, start + bare.length);
        return;
      }
      // * inside ** is bold, not italic.
      var single = before.length === 1 && value[start - 2] === before && value[end + 1] === after;
      if (!single && value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
        area.setSelectionRange(start - before.length, end + after.length);
        replaceSelection(area, sel);
        area.setSelectionRange(start - before.length, start - before.length + sel.length);
        return;
      }
      var inner = sel || sample;
      replaceSelection(area, before + inner + after);
      area.setSelectionRange(start + before.length, start + before.length + inner.length);
    };
  }

  var PREFIX = {
    ul: /^(\s*)[-*+]\s+(?!\[[ xX]\]\s)/,
    ol: /^(\s*)\d+[.)]\s+/,
    task: /^(\s*)[-*+]\s+\[[ xX]\]\s+/,
    quote: /^(\s*)>\s?/,
  };

  // Lists and quotes: on each selected line, or off again when they all
  // have it. A bulleted list turns into a numbered one and back. A list
  // needs an empty line above it on this site, so one is added.
  function togglePrefix(kind) {
    return function (area) {
      var value = area.value;
      var start = value.lastIndexOf("\n", area.selectionStart - 1) + 1;
      var endAt = area.selectionEnd > area.selectionStart && value[area.selectionEnd - 1] === "\n" ? area.selectionEnd - 1 : area.selectionEnd;
      var end = value.indexOf("\n", endAt);
      if (end < 0) end = value.length;
      var ls = value.slice(start, end).split("\n");
      var filled = ls.filter(function (l) {
        return l.trim();
      });
      var re = PREFIX[kind];
      var off = filled.length && filled.every(function (l) {
        return re.test(l);
      });
      var n = 0;
      var out = ls.map(function (line) {
        if (!line.trim()) return kind === "quote" && !off && ls.length > 1 ? ">" : line;
        if (off) return line.replace(re, "$1");
        var ind = /^\s*/.exec(line)[0];
        var bare = line.replace(/^(\s*)(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)/, "$1").slice(ind.length);
        return ind + (kind === "ul" ? "- " : kind === "ol" ? ++n + ". " : kind === "task" ? "- [ ] " : "> ") + bare;
      });
      var text = filled.length ? out.join("\n") : { ul: "- ", ol: "1. ", task: "- [ ] ", quote: "> " }[kind];
      var prev = value.slice(0, Math.max(0, start - 1));
      var prevLine = prev.slice(prev.lastIndexOf("\n") + 1);
      if (!off && start > 0 && prevLine.trim() && !re.test(prevLine) && !PREFIX.ol.test(prevLine) && !PREFIX.ul.test(prevLine) && !PREFIX.task.test(prevLine)) text = "\n" + text;
      area.setSelectionRange(start, end);
      replaceSelection(area, text);
      area.setSelectionRange(start + text.length, start + text.length);
    };
  }

  // Section, sub-section or minor heading, or back to a paragraph (0).
  function setHeading(level) {
    return function (area) {
      var value = area.value;
      var start = value.lastIndexOf("\n", area.selectionStart - 1) + 1;
      var end = value.indexOf("\n", area.selectionStart);
      if (end < 0) end = value.length;
      var line = value.slice(start, end);
      var bare = line.replace(/^#{1,6}\s+/, "");
      var text = level ? new Array(level + 1).join("#") + " " + (bare || "Heading") : bare;
      if (text === line && level) text = bare;
      area.setSelectionRange(start, end);
      replaceSelection(area, text);
      if (level && !bare) area.setSelectionRange(start + level + 1, start + text.length);
    };
  }

  function headingLevelAt(area) {
    var value = area.value;
    var start = value.lastIndexOf("\n", area.selectionStart - 1) + 1;
    var m = /^(#{1,6})\s/.exec(value.slice(start));
    return m ? m[1].length : 0;
  }

  var HEADINGS = [
    [0, "Paragraph", "Ctrl+Alt+0", "format-paragraph"],
    [2, "Section", "Ctrl+Alt+2", "format-header-2"],
    [3, "Sub-section", "Ctrl+Alt+3", "format-header-3"],
    [4, "Minor heading", "Ctrl+Alt+4", "format-header-4"],
  ];

  // main: only on the Markdown's toolbar, not in a component's form; sep:
  // a gap after it; menu: opens a menu under the button instead.
  var TOOLS = [
    { icon: "undo", label: "Undo (Ctrl+Z)", main: true, run: function () { undoRedo("undo"); } },
    { icon: "redo", label: "Redo (Ctrl+Y)", main: true, sep: true, run: function () { undoRedo("redo"); } },
    {
      icon: "format-header-pound",
      label: "Heading: section, sub-section… (Ctrl+Alt+2, 3, 4)",
      main: true,
      sep: true,
      menu: function (area) {
        var level = headingLevelAt(area);
        return HEADINGS.map(function (x) {
          return { label: x[1], hint: x[2], icon: x[3], checked: level === x[0], run: function () { setHeading(x[0])(area); } };
        });
      },
    },
    { icon: "format-bold", label: "Bold (Ctrl+B)", key: "b", run: toggleWrap("**", "**", "bold text") },
    { icon: "format-italic", label: "Italic (Ctrl+I)", key: "i", run: toggleWrap("*", "*", "italic text") },
    { icon: "format-strikethrough-variant", label: "Strikethrough (Ctrl+Shift+X)", run: toggleWrap("~~", "~~", "struck-out text") },
    { icon: "format-color-highlight", label: "Highlight (Ctrl+Shift+H)", run: toggleWrap("==", "==", "highlighted text") },
    { icon: "code-tags", label: "Inline code: names of files, settings and values (Ctrl+E)", key: "e", sep: true, run: toggleWrap("`", "`", "code") },
    { icon: "link-variant", label: "Link to a page or website (Ctrl+K)", key: "k", run: openLinkDialog },
    { icon: "cursor-default-click-outline", label: "Click path, such as Home > Resource groups > Create", run: toggleWrap("**", "**{ .ui-path }", "Home > Resource groups > Create") },
    { icon: "keyboard-outline", label: "Keyboard shortcut, such as ++ctrl+c++", sep: true, run: toggleWrap("++", "++", "ctrl+c") },
    { icon: "format-list-bulleted", label: "Bulleted list (Ctrl+Shift+8)", run: togglePrefix("ul") },
    { icon: "format-list-numbered", label: "Numbered list (Ctrl+Shift+7)", run: togglePrefix("ol") },
    { icon: "format-list-checks", label: "Checklist (Ctrl+Shift+9)", run: togglePrefix("task") },
    { icon: "format-quote-close", label: "Quote", sep: true, run: togglePrefix("quote") },
    { icon: "table-plus", label: "Table", main: true, grid: true },
    {
      icon: "minus",
      label: "Divider: a line across the page",
      main: true,
      run: function () {
        insertSnippet("---", null);
      },
    },
    {
      icon: "image-outline",
      label: "Image (or paste a screenshot)",
      run: function (area) {
        pickImage(function (name, linked) {
          if (!linked) replaceSelection(area, "![Describe what the image shows](" + imageRel(name) + ")");
        });
      },
    },
    {
      icon: "paperclip",
      label: "Attach a file to download: " + FILE_KINDS + ", up to " + FILE_MAX / MB + " MB",
      run: function (area) {
        pickFile(function (name, linked) {
          if (!linked) insertFileLink(area, name);
        });
      },
    },
  ];

  function undoRedo(which) {
    if (ui.cm) {
      window.CM[which](ui.cm);
      ui.cm.focus();
    } else if (ui.textarea) {
      ui.textarea.focus();
      document.execCommand(which);
    }
  }

  // A table of cols × rows, with its headings to fill in (Tab goes to the
  // next); the widths as they'll read once filled in.
  function tableSnippet(cols, rows) {
    var head = [];
    for (var c = 0; c < cols; c++) head.push("Heading " + (c + 1));
    function line(cells, fields) {
      return "| " + cells.map(function (text, i) {
        var pad = new Array(Math.max(0, head[i].length - text.length) + 1).join(" ");
        return (fields[i] ? "${" + text + "}" : text) + pad;
      }).join(" | ") + " |";
    }
    var out = [line(head, head.map(function () { return true; }))];
    out.push("| " + head.map(function (text) {
      return new Array(text.length + 1).join("-");
    }).join(" | ") + " |");
    for (var r = 0; r < rows; r++) out.push(line(head.map(function () { return ""; }), head.map(function (x, i) { return r === 0 && i === 0; })));
    return out.join("\n");
  }

  /* A small menu under a toolbar button: items are { label, hint, icon,
     checked, run }, "-" for a line between, or a node of its own. */

  function openMenu(anchor, items, cls) {
    closeMenu();
    var node = h("div", { class: "writer-menu" + (cls ? " " + cls : ""), role: "menu" });
    items.forEach(function (item) {
      if (item === "-") node.appendChild(h("div", { class: "writer-menu__sep", role: "separator" }));
      else if (item.nodeType) node.appendChild(item);
      else {
        node.appendChild(
          h(
            "button",
            {
              type: "button",
              class: "writer-menu__item",
              role: item.checked === undefined ? "menuitem" : "menuitemradio",
              "aria-checked": item.checked === undefined ? null : item.checked ? "true" : "false",
              onclick: function () {
                closeMenu();
                item.run();
              },
            },
            [item.icon ? icon(item.icon) : h("span", { class: "writer-icon" }), h("span", { class: "writer-menu__label", text: item.label }), item.hint ? h("span", { class: "writer-menu__hint", text: item.hint }) : null]
          )
        );
      }
    });
    ui.root.appendChild(node);
    var rect = anchor.getBoundingClientRect();
    var width = node.offsetWidth;
    node.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + "px";
    node.style.top = rect.bottom + 4 + "px";
    function outside(event) {
      if (!node.contains(event.target) && event.target !== anchor && !anchor.contains(event.target)) closeMenu();
    }
    node.addEventListener("keydown", function (event) {
      var focusables = Array.prototype.slice.call(node.querySelectorAll("button:not(:disabled)"));
      var i = focusables.indexOf(document.activeElement);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        anchor.focus();
      } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !node.classList.contains("writer-menu--grid")) {
        event.preventDefault();
        var next = focusables[(i + (event.key === "ArrowDown" ? 1 : -1) + focusables.length) % focusables.length];
        if (next) next.focus();
      } else if (event.key === "Tab") closeMenu();
    });
    document.addEventListener("mousedown", outside, true);
    ui.menu = { node: node, off: outside, anchor: anchor };
    anchor.setAttribute("aria-expanded", "true");
    var first = node.querySelector("[aria-checked=true]") || node.querySelector("button");
    if (first) first.focus();
    return node;
  }

  function closeMenu() {
    if (!ui.menu) return;
    document.removeEventListener("mousedown", ui.menu.off, true);
    ui.menu.node.remove();
    ui.menu.anchor.setAttribute("aria-expanded", "false");
    ui.menu = null;
  }

  // The table button's menu: a grid to pick the size from, by pointer or
  // with the arrow keys.
  function openTableMenu(anchor) {
    var MAXC = 6;
    var MAXR = 8;
    var size = [3, 2];
    var label = h("div", { class: "writer-grid__label" });
    var grid = h("div", { class: "writer-grid", style: "--cols:" + MAXC });
    function mark() {
      grid.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("writer-grid__cell--on", +b.getAttribute("data-c") <= size[0] && +b.getAttribute("data-r") <= size[1]);
      });
      label.textContent = size[0] + " columns × " + plural(size[1], "row") + ", under a row of headings";
    }
    for (var r = 1; r <= MAXR; r++) {
      for (var c = 1; c <= MAXC; c++) {
        (function (c, r) {
          grid.appendChild(
            h("button", {
              type: "button",
              class: "writer-grid__cell",
              "data-c": c,
              "data-r": r,
              "aria-label": c + " columns, " + r + " rows",
              tabindex: c === 1 && r === 1 ? "0" : "-1",
              onmouseenter: function () {
                size = [c, r];
                mark();
              },
              onclick: function () {
                closeMenu();
                insertSnippet(tableSnippet(c, r), null);
              },
            })
          );
        })(c, r);
      }
    }
    grid.addEventListener("keydown", function (event) {
      var d = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }[event.key];
      if (d) {
        event.preventDefault();
        size = [Math.max(1, Math.min(MAXC, size[0] + d[0])), Math.max(1, Math.min(MAXR, size[1] + d[1]))];
        mark();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        closeMenu();
        insertSnippet(tableSnippet(size[0], size[1]), null);
      }
    });
    openMenu(anchor, [grid, label], "writer-menu--grid");
    mark();
    grid.querySelector("button").focus();
  }

  function insertFileLink(area, name) {
    var label = area.value.slice(area.selectionStart, area.selectionEnd).trim() || downloadLabel(name);
    replaceSelection(area, "[" + label + "](" + fileRel(name) + ")");
  }

  // "onboarding-checklist.pdf" → "Download onboarding checklist (PDF)"
  function downloadLabel(name) {
    var ext = extOf(name);
    var words = name.slice(0, name.length - ext.length - 1).replace(/[-_]+/g, " ").trim();
    return "Download " + (words || "the file") + " (" + (FILE_TYPES[ext] ? FILE_TYPES[ext][0] : ext.toUpperCase()) + ")";
  }

  function mdField(obj, key, opts) {
    var area = h("textarea", {
      class: "writer-input writer-textarea" + (opts.code ? " writer-textarea--code" : ""),
      rows: opts.rows || 3,
      placeholder: opts.placeholder || "",
      "aria-label": opts.label || "Text",
      spellcheck: opts.code ? "false" : "true",
      value: obj[key] || "",
      oninput: function () {
        obj[key] = area.value;
        grow(area);
        changed();
      },
      onkeydown: function (event) {
        if (opts.code && event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          replaceSelection(area, "    ");
          return;
        }
        if (opts.code || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
        for (var i = 0; i < TOOLS.length; i++) {
          if (TOOLS[i].key && !TOOLS[i].main && TOOLS[i].key === event.key.toLowerCase()) {
            event.preventDefault();
            TOOLS[i].run(area);
            return;
          }
        }
      },
      onpaste: opts.code
        ? null
        : function (event) {
            var cd = event.clipboardData;
            var files = cd && cd.files;
            var C = convert();
            var html = cd && cd.getData("text/html");
            // Formatted text, as in the Markdown: headings, lists and bold
            // come across. Word's picture of it doesn't.
            if (C && html && C.isRichHtml(html) && /\S/.test(cd.getData("text/plain"))) {
              var md = C.htmlToMarkdown(html, { image: pastedImage, link: pastedLink }).md;
              if (md.trim()) {
                event.preventDefault();
                replaceSelection(area, md);
              }
              return;
            }
            if (!files || !files.length) return;
            if (/^image\//.test(files[0].type)) {
              event.preventDefault();
              addImageFile(files[0], function (name) {
                replaceSelection(area, "![Describe what the image shows](" + imageRel(name) + ")");
              });
            } else if (FILE_TYPES[extOf(files[0].name)]) {
              event.preventDefault();
              addAttachment(files[0], function (name) {
                insertFileLink(area, name);
              });
            }
          },
    });
    requestAnimationFrame(function () {
      grow(area);
    });
    var toolbar = opts.code
      ? null
      : h(
          "div",
          { class: "writer-toolbar", role: "toolbar", "aria-label": "Formatting" },
          TOOLS.filter(function (tool) {
            return !tool.main;
          }).map(function (tool) {
            return iconButton(tool.icon, tool.label, false, function () {
              tool.run(area);
            });
          })
        );
    return h("div", { class: "writer-field" }, [opts.label ? h("span", { class: "writer-field__label", text: opts.label }) : null, toolbar, area]);
  }

  function listEditor(b, key, opts) {
    var wrap = h("div", { class: "writer-list" + (opts.compact ? " writer-list--compact" : "") });
    function draw() {
      wrap.innerHTML = "";
      var list = b[key];
      list.forEach(function (item, i) {
        var card = h("div", { class: "writer-item" });
        card.appendChild(
          h("div", { class: "writer-item__head" }, [
            h("span", { class: "writer-item__label", text: opts.itemLabel + " " + (i + 1) }),
            iconButton("arrow-up", "Move up", i === 0, function () {
              list.splice(i - 1, 0, list.splice(i, 1)[0]);
              draw();
              changed();
            }),
            iconButton("arrow-down", "Move down", i === list.length - 1, function () {
              list.splice(i + 1, 0, list.splice(i, 1)[0]);
              draw();
              changed();
            }),
            iconButton("close", "Remove", list.length <= (opts.min || 0), function () {
              list.splice(i, 1);
              draw();
              changed();
            }),
          ])
        );
        opts.render(item, i, card);
        wrap.appendChild(card);
      });
      wrap.appendChild(
        button(opts.addLabel, "plus", "md-button--sm writer-add", function () {
          list.push(opts.create());
          draw();
          changed();
          var fields = wrap.querySelectorAll(".writer-item:last-of-type input, .writer-item:last-of-type textarea");
          if (fields.length) fields[0].focus();
        })
      );
    }
    draw();
    return wrap;
  }

  function dialog(title, content, actions) {
    var node = h("dialog", { class: "writer-dialog", "aria-label": title }, [
      h("div", { class: "writer-dialog__head" }, [
        h("span", { class: "writer-dialog__title", text: title }),
        iconButton("close", "Close", false, function () {
          node.close();
        }),
      ]),
      h("div", { class: "writer-dialog__body" }, content),
      actions ? h("div", { class: "writer-dialog__actions" }, actions) : null,
    ]);
    node.addEventListener("close", function () {
      node.remove();
    });
    node.addEventListener("click", function (event) {
      if (event.target === node) node.close();
    });
    ui.root.appendChild(node);
    node.showModal();
    return node;
  }

  function openLinkDialog(area) {
    var start = area.selectionStart;
    var end = area.selectionEnd;
    var text = h("input", { class: "writer-input", value: area.value.slice(start, end), placeholder: "The words readers click" });
    var page = h("input", { class: "writer-input", list: "writer-pages", placeholder: "Start typing a page title" });
    var section = h("input", { class: "writer-input", placeholder: "#reset-your-password" });
    var file = h("select", { class: "writer-input", "aria-label": "Attached file" });
    function listFiles(chosen) {
      var names = Object.keys(state.files).sort();
      file.innerHTML = "";
      file.appendChild(h("option", { value: "", text: names.length ? "Pick an attached file" : "No files attached yet" }));
      names.forEach(function (name) {
        file.appendChild(h("option", { value: name, text: name }));
      });
      file.value = chosen || "";
    }
    listFiles();
    var attach = button("Attach a file", "paperclip", "md-button--ghost md-button--sm", function () {
      pickFile(function (name) {
        listFiles(name);
      });
    });
    var url = h("input", { class: "writer-input", type: "url", placeholder: "https://status.example.com" });
    var node = dialog(
      "Insert a link",
      [
        field("Link text", text),
        field("A page on this site", page, null, "Links to the .md file, so the build checks it exists."),
        field("Section on that page (optional)", section),
        field("Or a file to download", h("span", { class: "writer-with-icon" }, [file, attach]), null, FILE_KINDS + ", up to " + FILE_MAX / MB + " MB. It goes in the bundle with the page."),
        field("Or a web address", url),
      ],
      [
        button("Insert link", "link-variant", "md-button--primary md-button--sm", function () {
          var target = pageFromChoice(page.value);
          var href = url.value.trim();
          var anchor = section.value.trim().replace(/^#?/, "#");
          if (target) href = relPath(folderPath(), target.src) + (anchor.length > 1 ? anchor : "");
          else if (file.value) href = fileRel(file.value);
          if (!href) {
            page.focus();
            return;
          }
          var label = text.value.trim() || (target ? target.title : file.value ? downloadLabel(file.value) : href);
          node.close();
          area.setSelectionRange(start, end);
          replaceSelection(area, "[" + label + "](" + href + ")");
        }),
      ]
    );
    (text.value ? page : text).focus();
  }

  /* ── Images and files the page brings with it ── */

  function extOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  function mimeOf(kind, name) {
    var ext = extOf(name);
    if (kind === "images") return IMAGE_TYPES[ext] || "application/octet-stream";
    return FILE_TYPES[ext] ? FILE_TYPES[ext][1] : "application/octet-stream";
  }

  function megabytes(bytes) {
    return bytes < MB ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / MB).toFixed(1).replace(/\.0$/, "") + " MB";
  }

  // Already on the site, in this page's folder (a page opened to change it).
  function onSite(kind, name) {
    return (data.files || []).indexOf(assetPath(kind, assetDir(), name)) >= 0;
  }

  function uniqueName(kind, name) {
    var dot = name.lastIndexOf(".");
    var stem = name.slice(0, dot);
    var ext = name.slice(dot);
    var candidate = name;
    var n = 2;
    while (state[kind][candidate] || onSite(kind, candidate)) candidate = stem + "-" + n++ + ext;
    return candidate;
  }

  // Read the whole file now: a File only points at the disk, and it may have
  // moved or changed by the time the bundle is made.
  function bytesOf(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(new Uint8Array(reader.result));
      };
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.readAsArrayBuffer(blob);
    });
  }

  // done(name, linked): linked is how many links to the wiki's copy of it
  // (.attachments/…) now point at this one, so the caller needn't add one.
  function addImageFile(file, done) {
    var ext = (file.type.split("/")[1] || extOf(file.name) || "png").replace("jpeg", "jpg").replace(/\+.*/, "");
    if (!IMAGE_TYPES[ext]) {
      toast("Use a PNG, JPEG, GIF, WebP or SVG image.");
      return;
    }
    var stem = file.name && !/^image\.\w+$/i.test(file.name) ? slugify(file.name.replace(/\.[^.]+$/, "")) : "";
    function keep(blob, type) {
      bytesOf(blob).then(
        function (bytes) {
          var name = uniqueName("images", (stem || slug() + "-screenshot") + "." + type);
          addAsset("images", name, new Blob([bytes], { type: IMAGE_TYPES[type] }));
          done(name, linkAttachments(file.name, "images", name));
        },
        function () {
          toast("Couldn't read that image. Save it somewhere else and try again.");
        }
      );
    }
    if (file.size <= IMAGE_MAX) {
      keep(file, ext);
      return;
    }
    // Screenshots from big screens: saved smaller rather than turned away.
    var tooBig = "That image is over " + IMAGE_MAX / MB + " MB. Crop it or save it smaller, then try again.";
    if (ext === "svg" || ext === "gif") {
      toast(tooBig);
      return;
    }
    shrinkImage(file).then(function (small) {
      if (!small) {
        toast(tooBig);
        return;
      }
      keep(small.blob, small.ext);
      toast("Saved the image smaller to fit " + IMAGE_MAX / MB + " MB" + (small.from[0] !== small.to[0] ? ": " + small.from.join(" × ") + " → " + small.to.join(" × ") + " pixels." : ", as " + small.ext.toUpperCase() + "."));
    });
  }

  // A picture under IMAGE_MAX: first the same size as WebP, then smaller
  // until it fits. Resolves with { blob, ext, from: [w, h], to: [w, h] },
  // or null.
  function shrinkImage(blob) {
    if (!window.createImageBitmap) return Promise.resolve(null);
    return createImageBitmap(blob).then(
      function (bitmap) {
        var w = bitmap.width;
        var hgt = bitmap.height;
        var scale = 1;
        function attempt(n) {
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(hgt * scale));
          var canvas = h("canvas", { width: cw, height: ch });
          canvas.getContext("2d").drawImage(bitmap, 0, 0, cw, ch);
          return new Promise(function (resolve) {
            canvas.toBlob(resolve, "image/webp", 0.9);
          }).then(function (out) {
            var ext = out && (out.type.split("/")[1] || "").replace("jpeg", "jpg");
            if (out && out.size <= IMAGE_MAX && IMAGE_TYPES[ext]) return { blob: out, ext: ext, from: [w, hgt], to: [cw, ch] };
            if (n >= 6) return null;
            scale *= 0.75;
            return attempt(n + 1);
          });
        }
        return attempt(0);
      },
      function () {
        return null;
      }
    );
  }

  function addAttachment(file, done) {
    var ext = extOf(file.name);
    if (!FILE_TYPES[ext]) {
      toast("Readers can download " + FILE_KINDS + " files. Save it as one of those, or link to where it already lives.");
      return;
    }
    if (file.size > FILE_MAX) {
      toast("That file is over " + FILE_MAX / MB + " MB. Keep big files somewhere like SharePoint, and link to them there.");
      return;
    }
    bytesOf(file).then(
      function (bytes) {
        var name = uniqueName("files", (slugify(file.name.replace(/\.[^.]+$/, "")) || "download") + "." + ext);
        addAsset("files", name, new Blob([bytes], { type: FILE_TYPES[ext][1] }));
        done(name, linkAttachments(file.name, "files", name));
      },
      function () {
        toast("Couldn't read that file. Save it somewhere else and try again.");
      }
    );
  }

  // many: more than one can be picked (the sidebar's Upload buttons), and
  // done is called for each.
  function pickImage(done, many) {
    var picker = h("input", {
      type: "file",
      accept: "image/png,image/jpeg,image/gif,image/webp,image/svg+xml",
      multiple: !!many,
      onchange: function () {
        Array.prototype.forEach.call(picker.files, function (file) {
          addImageFile(file, done);
        });
      },
    });
    picker.click();
  }

  function pickFile(done, many) {
    var picker = h("input", {
      type: "file",
      accept: Object.keys(FILE_TYPES).map(function (ext) {
        return "." + ext;
      }).join(","),
      multiple: !!many,
      onchange: function () {
        Array.prototype.forEach.call(picker.files, function (file) {
          addAttachment(file, done);
        });
      },
    });
    picker.click();
  }

  function addAsset(kind, name, blob) {
    state[kind][name] = blob;
    storeAsset(kind, name, blob);
    drawAssets(true);
    changed();
  }

  function removeAsset(kind, name) {
    var blob = state[kind][name];
    delete state[kind][name];
    unstoreAsset(kind, name);
    redrawImageBlocks();
    drawAssets(true);
    changed();
    var linked = mentions(toMarkdown(), assetPath(kind, assetDir(), name));
    toast(name + " removed." + (linked ? " The page still points to it: Checks shows where." : ""), "Undo", function () {
      addAsset(kind, name, blob);
      redrawImageBlocks();
    });
  }

  function renameAsset(kind, from, to) {
    var blob = state[kind][from];
    delete state[kind][from];
    state[kind][to] = blob;
    var moves = {};
    moves[assetPath(kind, assetDir(), from)] = assetPath(kind, assetDir(), to);
    var touched = rewriteRefs(folderPath(), folderPath(), function (target) {
      return moves[target] || null;
    });
    if (ui.form && ui.form.block.type === "image" && ui.form.block.image === from) {
      ui.form.block.image = to;
      drawForm();
    }
    unstoreAsset(kind, from);
    storeAsset(kind, to, blob);
    drawAssets(true);
    changed();
    toast("Renamed to " + to + (touched ? ", and the page points to the new name." : "."));
  }

  function openRename(kind, name) {
    var ext = "." + extOf(name);
    var stem = h("input", { class: "writer-input", value: name.slice(0, -ext.length) });
    var node = dialog(
      "Rename " + name,
      [field("New name", h("span", { class: "writer-with-suffix" }, [stem, h("span", { text: ext })]), null, "Lowercase words joined by hyphens. Links and images on this page follow the new name.")],
      [button("Rename", "pencil-outline", "md-button--primary md-button--sm", go)]
    );
    stem.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        go();
      }
    });
    stem.select();
    function go() {
      var next = slugify(stem.value);
      if (!next) {
        stem.focus();
        return;
      }
      next += ext;
      if (next !== name && (state[kind][next] || onSite(kind, next))) {
        toast("There's already a " + next + ". Pick another name.");
        stem.focus();
        return;
      }
      node.close();
      if (next !== name) renameAsset(kind, name, next);
    }
  }

  /* ── Editing a screenshot: crop it, and hide what readers shouldn't see
     (IDs, names, email addresses) under a box or a blur. It's saved over
     the image, in the page's bundle only; Undo in the toast puts it back. */

  function editableImage(name) {
    return /\.(png|jpe?g|webp)$/i.test(name);
  }

  function openImageEditor(name) {
    var blob = state.images[name];
    if (!blob) return;
    if (!editableImage(name)) {
      toast("Only PNG, JPEG and WebP images can be edited here.");
      return;
    }
    createImageBitmap(blob).then(
      function (bitmap) {
        imageEditor(name, blob, bitmap);
      },
      function () {
        toast("Couldn't read " + name + " to edit it.");
      }
    );
  }

  function imageEditor(name, blob, bitmap) {
    var W = bitmap.width;
    var H = bitmap.height;
    var canvas = h("canvas", { class: "writer-imgedit__canvas", width: W, height: H, "aria-label": "The image: drag across it to mark an area" });
    var ctx = canvas.getContext("2d");
    var mode = "hide";
    var style = "box";
    var hides = []; // { x, y, w, h, style }
    var crop = null; // { x, y, w, h }
    var drag = null;
    // A blur strong enough that text under it can't be read.
    var block = Math.max(8, Math.round(Math.max(W, H) / 90));

    function pixelate(r) {
      var tw = Math.max(1, Math.ceil(r.w / block));
      var th = Math.max(1, Math.ceil(r.h / block));
      var tmp = h("canvas", { width: tw, height: th });
      tmp.getContext("2d").drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, tw, th);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, tw, th, r.x, r.y, r.w, r.h);
      ctx.imageSmoothingEnabled = true;
    }
    function applyHides() {
      hides.forEach(function (r) {
        if (r.style === "blur") pixelate(r);
        else {
          ctx.fillStyle = "#1f2328";
          ctx.fillRect(r.x, r.y, r.w, r.h);
        }
      });
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(bitmap, 0, 0);
      applyHides();
      var line = Math.max(2, Math.round(Math.max(W, H) / 500));
      if (crop) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, W, crop.y);
        ctx.fillRect(0, crop.y + crop.h, W, H - crop.y - crop.h);
        ctx.fillRect(0, crop.y, crop.x, crop.h);
        ctx.fillRect(crop.x + crop.w, crop.y, W - crop.x - crop.w, crop.h);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = line;
        ctx.setLineDash([line * 4, line * 3]);
        ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
        ctx.setLineDash([]);
      }
      if (drag && drag.rect) {
        ctx.strokeStyle = mode === "crop" ? "#fff" : "#f59e0b";
        ctx.lineWidth = line;
        ctx.strokeRect(drag.rect.x, drag.rect.y, drag.rect.w, drag.rect.h);
      }
      status.textContent = (hides.length ? plural(hides.length, "area") + " hidden" : "Nothing hidden yet") + (crop ? " · cropped to " + Math.round(crop.w) + " × " + Math.round(crop.h) : " · " + W + " × " + H + " pixels");
      undoBtn.disabled = !hides.length && !crop;
    }
    function point(event) {
      var r = canvas.getBoundingClientRect();
      return { x: Math.max(0, Math.min(W, ((event.clientX - r.left) / r.width) * W)), y: Math.max(0, Math.min(H, ((event.clientY - r.top) / r.height) * H)) };
    }
    function rectOf(a, b) {
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
    }
    canvas.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      drag = { start: point(event), rect: null };
    });
    canvas.addEventListener("pointermove", function (event) {
      if (!drag) return;
      drag.rect = rectOf(drag.start, point(event));
      draw();
    });
    canvas.addEventListener("pointerup", function () {
      if (!drag) return;
      var r = drag.rect;
      drag = null;
      if (r && r.w > 3 && r.h > 3) {
        r = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
        if (mode === "crop") crop = r;
        else {
          r.style = style;
          hides.push(r);
        }
      }
      draw();
    });

    function tab(value, label, iconName) {
      return h("button", {
        type: "button",
        class: "writer-view",
        "aria-pressed": mode === value ? "true" : "false",
        "data-mode": value,
        onclick: function () {
          mode = value;
          modes.querySelectorAll("button").forEach(function (b) {
            b.setAttribute("aria-pressed", b.getAttribute("data-mode") === mode ? "true" : "false");
          });
          styleField.hidden = mode !== "hide";
          hint.textContent = mode === "crop" ? "Drag across the part to keep." : "Drag across each name, ID or email address to hide it.";
        },
      }, [icon(iconName), h("span", { text: label })]);
    }
    var modes = h("div", { class: "writer-views", role: "group", "aria-label": "Tool" }, [tab("hide", "Hide details", "rectangle-outline"), tab("crop", "Crop", "crop")]);
    var styleSelect = h("select", { class: "writer-input", "aria-label": "Hide with" }, [h("option", { value: "box", text: "A solid box (safest)" }), h("option", { value: "blur", text: "A blur" })]);
    styleSelect.addEventListener("change", function () {
      style = styleSelect.value;
    });
    var styleField = h("label", { class: "writer-imgedit__style" }, [h("span", { class: "writer-field__label", text: "Hide with" }), styleSelect]);
    var hint = h("span", { class: "writer-field__hint", text: "Drag across each name, ID or email address to hide it." });
    var status = h("span", { class: "writer-field__hint writer-imgedit__status" });
    var undoBtn = button("Undo", "undo", "md-button--ghost md-button--sm", function () {
      if (crop && (!hides.length || mode === "crop")) crop = null;
      else hides.pop();
      draw();
    });
    var node = dialog(
      "Edit " + name,
      [
        h("div", { class: "writer-row writer-row--center" }, [modes, styleField, undoBtn]),
        hint,
        h("div", { class: "writer-imgedit" }, [canvas]),
        status,
      ],
      [
        button("Cancel", null, "md-button--ghost md-button--sm", function () {
          node.close();
        }),
        button("Save the image", "check", "md-button--primary md-button--sm", function () {
          save();
        }),
      ]
    );
    node.classList.add("writer-dialog--wide", "writer-dialog--image");
    draw();

    function save() {
      if (!hides.length && !crop) {
        node.close();
        return;
      }
      // The hidden areas at full size, then the crop.
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(bitmap, 0, 0);
      applyHides();
      var out = canvas;
      if (crop) {
        out = h("canvas", { width: crop.w, height: crop.h });
        out.getContext("2d").drawImage(canvas, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      }
      var type = blob.type && /^image\/(png|jpeg|webp)$/.test(blob.type) ? blob.type : IMAGE_TYPES[extOf(name)];
      out.toBlob(
        function (next) {
          if (!next) {
            toast("Couldn't save the image.");
            return;
          }
          node.close();
          var before = state.images[name];
          state.images[name] = next;
          storeAsset("images", name, next);
          drawAssets(true);
          redrawImageBlocks();
          changed();
          toast("Saved " + name + (hides.length ? ", with " + plural(hides.length, "area") + " hidden" : "") + (crop ? ", cropped" : "") + ".", "Undo", function () {
            state.images[name] = before;
            storeAsset("images", name, before);
            drawAssets(true);
            redrawImageBlocks();
            changed();
          });
        },
        type,
        0.92
      );
    }
  }

  function redrawImageBlocks() {
    if (ui.form && ui.form.block.type === "image") drawForm();
  }

  // Object URLs for the preview, made once per image or file.
  var urls = {};
  function assetUrl(kind, name) {
    var blob = state[kind][name];
    if (!blob) return "";
    var key = kind + "/" + name;
    if (!urls[key] || urls[key].blob !== blob) {
      if (urls[key]) URL.revokeObjectURL(urls[key].url);
      urls[key] = { blob: blob, url: URL.createObjectURL(blob) };
    }
    return urls[key].url;
  }

  // The image or file of this page's that a docs/ path points at, if any.
  function attachedAt(path) {
    var kinds = ["images", "files"];
    for (var i = 0; i < kinds.length; i++) {
      var prefix = assetPath(kinds[i], assetDir(), "");
      var name = path.indexOf(prefix) === 0 ? path.slice(prefix.length) : "";
      if (name && state[kinds[i]][name]) return { kind: kinds[i], name: name };
    }
    return null;
  }

  // Whether the Markdown points at a docs/ path (and not one that merely
  // starts the same, like step1.png.bak).
  function mentions(md, path) {
    var i = -1;
    while ((i = md.indexOf(path, i + 1)) >= 0) {
      if (!/[\w.-]/.test(md.charAt(i + path.length))) return true;
    }
    return false;
  }

  // The images or files the page uses: only these go in the bundle.
  function usedAssets(kind, md) {
    md = md || toMarkdown();
    return Object.keys(state[kind]).filter(function (name) {
      return mentions(md, assetPath(kind, assetDir(), name));
    });
  }

  function hasAssets() {
    return Object.keys(state.images).length + Object.keys(state.files).length > 0;
  }

  // Rewrites the relative links and image paths in the Markdown. move gets
  // each one's path from docs/ and returns where it points now, or null to
  // leave it. Returns how many changed.
  function rewriteRefs(fromFolder, toFolder, move) {
    var changes = [];
    var re = /(\]\(\s*)([^)\s]+)|(\b(?:src|href)=")([^"]+)/g;
    var m;
    while ((m = re.exec(state.body))) {
      var href = m[2] || m[4];
      if (!href || isExternal(href)) continue;
      var parts = splitHash(href);
      var dest = move(joinPath(fromFolder, parts[0]));
      if (!dest) continue;
      var next = relPath(toFolder, dest) + parts[1];
      if (next === href) continue;
      var from = m.index + (m[1] || m[3]).length;
      changes.push({ from: from, to: from + href.length, insert: next });
    }
    if (changes.length) editBody(changes);
    return changes.length;
  }

  // Links are written relative to the page, and point into the page's own
  // image and file folders; meta.at is where they were written from. When
  // the page moves to another folder or gets another file name, this
  // rewrites the ones that point at known pages, images and files.
  function syncPaths() {
    if (!state.assetsLoaded) return;
    var m = state.meta;
    var from = m.at || { folder: folderPath(), assets: "" };
    var to = { folder: folderPath(), assets: assetDir() };
    m.at = to;
    if (from.folder === to.folder && from.assets === to.assets) return;
    var moves = {};
    data.pages.forEach(function (p) {
      moves[p.src] = p.src;
    });
    (data.files || []).forEach(function (path) {
      moves[path] = path;
    });
    ["images", "files"].forEach(function (kind) {
      Object.keys(state[kind]).forEach(function (name) {
        moves[assetPath(kind, from.assets, name)] = assetPath(kind, to.assets, name);
      });
    });
    rewriteRefs(from.folder, to.folder, function (target) {
      return moves[target] || null;
    });
  }

  /* ── Keeping images and files in this browser (IndexedDB) ── */

  var dbOpen = null;
  function db() {
    if (!dbOpen) {
      dbOpen = new Promise(function (resolve, reject) {
        try {
          var request = window.indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = function () {
            var conn = request.result;
            if (!conn.objectStoreNames.contains(DB_STORE)) conn.createObjectStore(DB_STORE);
            if (!conn.objectStoreNames.contains(HISTORY_STORE)) conn.createObjectStore(HISTORY_STORE);
          };
          request.onsuccess = function () {
            resolve(request.result);
          };
          request.onerror = function () {
            reject(request.error);
          };
          request.onblocked = function () {
            reject(new Error("blocked"));
          };
        } catch (e) {
          // No IndexedDB, or blocked (some private windows).
          reject(e);
        }
      });
    }
    return dbOpen;
  }

  // Runs fn(store) in one transaction and resolves with what fn's request
  // returned, once the transaction is written. name: the store, if not
  // the images and files.
  function tx(mode, fn, name) {
    return db().then(function (conn) {
      return new Promise(function (resolve, reject) {
        try {
          var t = conn.transaction(name || DB_STORE, mode);
          var request = fn(t.objectStore(name || DB_STORE));
          t.oncomplete = function () {
            resolve(request ? request.result : undefined);
          };
          t.onerror = t.onabort = function () {
            reject(t.error || new Error("aborted"));
          };
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  // whole: the write replaces everything, so success means all is kept.
  function track(promise, whole) {
    var mine = state;
    promise.then(
      function () {
        if (whole && state === mine) state.assetsSaved = true;
        updateStatus();
      },
      function () {
        // Over quota, or no IndexedDB: the images and files only live in
        // this tab now. The status line and Add to site say so.
        if (state === mine) state.assetsSaved = false;
        updateStatus();
      }
    );
  }

  // Each draft's rows: "<id>/images/<name>" and "<id>/files/<name>".
  function assetKey(id, kind, name) {
    return id + "/" + kind + "/" + name;
  }

  function draftRange(id) {
    return IDBKeyRange.bound(id + "/", id + "/￿");
  }

  function storeAsset(kind, name, blob) {
    var id = state.id;
    track(
      tx("readwrite", function (store) {
        store.put({ draft: id, kind: kind, name: name, blob: blob }, assetKey(id, kind, name));
      }),
      false
    );
  }

  function unstoreAsset(kind, name) {
    var id = state.id;
    track(
      tx("readwrite", function (store) {
        store.delete(assetKey(id, kind, name));
      }),
      false
    );
  }

  // A new or opened page: its images and files replace what its draft had.
  function storeAllAssets() {
    var mine = state;
    var promise = tx("readwrite", function (store) {
      store.delete(draftRange(mine.id));
      ["images", "files"].forEach(function (kind) {
        Object.keys(mine[kind]).forEach(function (name) {
          store.put({ draft: mine.id, kind: kind, name: name, blob: mine[kind][name] }, assetKey(mine.id, kind, name));
        });
      });
    });
    track(promise, true);
    return promise;
  }

  // When a draft is shown: its images and files. The draft moved over from
  // before there were several also takes the rows kept without a draft id,
  // and any images an older version of this page kept in localStorage.
  function loadAssets() {
    var mine = state;
    function done(rows, stored) {
      if (state !== mine) return;
      var claimed = [];
      (rows || []).forEach(function (row) {
        if (!row || !(row.kind === "images" || row.kind === "files") || !row.blob) return;
        if (row.draft === mine.id) mine[row.kind][row.name] = row.blob;
        else if (!row.draft && mine.claimLegacy) {
          if (!mine[row.kind][row.name]) mine[row.kind][row.name] = row.blob;
          claimed.push(row.kind + "/" + row.name);
        }
      });
      var legacy = mine.claimLegacy ? legacyImages() : {};
      Object.keys(legacy).forEach(function (name) {
        if (!mine.images[name]) mine.images[name] = legacy[name];
      });
      mine.assetsLoaded = true;
      mine.assetsSaved = stored;
      if ((claimed.length || Object.keys(legacy).length) && stored) {
        storeAllAssets().then(function () {
          write(IMAGES_KEY, null);
          tx("readwrite", function (store) {
            claimed.forEach(function (key) {
              store.delete(key);
            });
          });
        });
      }
      mine.claimLegacy = false;
      syncPaths();
      redrawImageBlocks();
      drawAssets(true);
      updateStatus();
      render();
    }
    tx("readonly", function (store) {
      // The old rows have no draft id in their keys: read them all, once.
      return mine.claimLegacy ? store.getAll() : store.getAll(draftRange(mine.id));
    }).then(
      function (rows) {
        done(rows, true);
      },
      function () {
        done([], false);
      }
    );
  }

  function legacyImages() {
    var out = {};
    try {
      var images = JSON.parse(read(IMAGES_KEY) || "{}");
      Object.keys(images || {}).forEach(function (name) {
        var blob = dataUrlBlob(images[name]);
        if (blob) out[name] = blob;
      });
    } catch (e) {
      // Unreadable: nothing to move.
    }
    return out;
  }

  function dataUrlBlob(url) {
    var m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(String(url || ""));
    if (!m) return null;
    var bytes;
    if (m[2]) {
      var raw = atob(m[3]);
      bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    } else bytes = utf8(decodeURIComponent(m[3]));
    return new Blob([bytes], { type: m[1] || "application/octet-stream" });
  }

  /* ── Zip files, written and read here so nothing leaves the browser ──
     Written uncompressed ("stored"): screenshots, PDFs and Office files are
     compressed already and the page itself is small, so compressing gains
     little. That keeps the writer to a CRC and three kinds of header, rather
     than a vendored library to keep up to date. Reading also takes deflated
     entries (DecompressionStream), for a bundle someone zipped up again. */

  function utf8(text) {
    return new TextEncoder().encode(text);
  }

  function fromUtf8(bytes) {
    return new TextDecoder().decode(bytes);
  }

  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  // entries: [{ name, bytes }]. Returns the .zip as a Blob.
  function zipStore(entries) {
    var now = new Date();
    var time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    var parts = [];
    var central = [];
    var offset = 0;
    var dirSize = 0;
    entries.forEach(function (entry) {
      var name = utf8(entry.name);
      var crc = crc32(entry.bytes);
      var size = entry.bytes.length;
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true); // version needed to extract
      local.setUint16(6, 0x0800, true); // names are UTF-8
      local.setUint16(8, 0, true); // stored, not compressed
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, name.length, true);
      parts.push(local, name, entry.bytes);
      var head = new DataView(new ArrayBuffer(46));
      head.setUint32(0, 0x02014b50, true);
      head.setUint16(4, 20, true); // made by MS-DOS: plain files, no Unix modes or links
      head.setUint16(6, 20, true);
      head.setUint16(8, 0x0800, true);
      head.setUint16(12, time, true);
      head.setUint16(14, date, true);
      head.setUint32(16, crc, true);
      head.setUint32(20, size, true);
      head.setUint32(24, size, true);
      head.setUint16(28, name.length, true);
      head.setUint32(42, offset, true);
      central.push(head, name);
      offset += 30 + name.length + size;
      dirSize += 46 + name.length;
    });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, dirSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: "application/zip" });
  }

  // Resolves with [{ name, bytes }], checking each entry's CRC.
  function unzip(bytes) {
    return Promise.resolve()
      .then(function () {
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var end = -1;
        for (var i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65535; i--) {
          if (view.getUint32(i, true) === 0x06054b50) {
            end = i;
            break;
          }
        }
        if (end < 0) throw new Error("it isn't a zip file");
        var count = view.getUint16(end + 10, true);
        var at = view.getUint32(end + 16, true);
        var entries = [];
        for (var n = 0; n < count; n++) {
          if (view.getUint32(at, true) !== 0x02014b50) throw new Error("the zip file is damaged");
          var nameLength = view.getUint16(at + 28, true);
          var local = view.getUint32(at + 42, true);
          var start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
          var entry = {
            name: fromUtf8(bytes.subarray(at + 46, at + 46 + nameLength)),
            method: view.getUint16(at + 10, true),
            crc: view.getUint32(at + 16, true),
            data: bytes.subarray(start, start + view.getUint32(at + 20, true)),
          };
          if (!/\/$/.test(entry.name)) entries.push(entry);
          at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
        }
        return Promise.all(entries.map(inflate));
      });
  }

  function inflate(entry) {
    var data;
    if (entry.method === 0) data = Promise.resolve(entry.data);
    else if (entry.method === 8 && typeof DecompressionStream !== "undefined") {
      var stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      data = new Response(stream).arrayBuffer().then(function (buffer) {
        return new Uint8Array(buffer);
      });
    } else return Promise.reject(new Error(entry.name + " is compressed in a way this browser can't read"));
    return data.then(function (out) {
      if (crc32(out) !== entry.crc) throw new Error(entry.name + " is damaged");
      return { name: entry.name, bytes: out };
    });
  }

  /* ── SHA-256, for the manifest. The browser's own where it has one (it
     needs https or localhost); this copy where it doesn't. ── */

  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function sha256(bytes) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.resolve(sha256Here(bytes));
    return subtle.digest("SHA-256", bytes).then(
      function (buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), function (b) {
          return (b < 16 ? "0" : "") + b.toString(16);
        }).join("");
      },
      function () {
        return sha256Here(bytes);
      }
    );
  }

  function sha256Here(bytes) {
    function ror(x, n) {
      return (x >>> n) | (x << (32 - n));
    }
    var total = Math.ceil((bytes.length + 9) / 64) * 64;
    var buf = new Uint8Array(total);
    buf.set(bytes);
    buf[bytes.length] = 0x80;
    var view = new DataView(buf.buffer);
    view.setUint32(total - 8, Math.floor(bytes.length / 0x20000000), false);
    view.setUint32(total - 4, (bytes.length * 8) >>> 0, false);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Int32Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var t = 0; t < 16; t++) w[t] = view.getInt32(off + t * 4, false);
      for (t = 16; t < 64; t++) {
        var x = w[t - 15];
        var y = w[t - 2];
        w[t] = w[t - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + w[t - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10));
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], k = H[7];
      for (t = 0; t < 64; t++) {
        var t1 = (k + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K256[t] + w[t]) | 0;
        var t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        k = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }
      H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + k) | 0];
    }
    return H.map(function (v) {
      return ("0000000" + (v >>> 0).toString(16)).slice(-8);
    }).join("");
  }

  /* ── The bundle: page.md, images/, files/ and manifest.json, which
     tools/ingest_bundle.py reads to put each one in the repository ── */

  function bundleName() {
    var d = new Date();
    function two(n) {
      return (n < 10 ? "0" : "") + n;
    }
    var stamp = d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + "-" + two(d.getHours()) + two(d.getMinutes());
    var folder = folderPath().replace(/\//g, "-");
    return (folder ? folder + "-" : "") + slug() + "-" + stamp + ".zip";
  }

  function bundleAssets(md) {
    var out = [];
    ["images", "files"].forEach(function (kind) {
      usedAssets(kind, md)
        .sort()
        .forEach(function (name) {
          out.push({ blob: state[kind][name], src: kind + "/" + name, target: "docs/" + assetPath(kind, assetDir(), name) });
        });
    });
    return out;
  }

  function bundleSize(md) {
    return bundleAssets(md).reduce(function (n, asset) {
      return n + asset.blob.size;
    }, utf8(md).length);
  }

  // Changes whenever the bundle would, so Add to site can tell a bundle
  // downloaded before the last edit.
  function signature() {
    var md = toMarkdown();
    var text = md + bundleAssets(md).map(function (a) {
      return a.src + ":" + a.blob.size;
    }).join("|");
    var hash = 0;
    for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return String(hash);
  }

  function frontValue(key) {
    var m = new RegExp("^" + key + ":[ \\t]*(.+)$", "m").exec(state.meta.extraFront || "");
    return m ? unquote(m[1]) : "";
  }

  function buildBundle() {
    syncPaths();
    var md = toMarkdown();
    var page = utf8(md);
    var assets = bundleAssets(md);
    return Promise.all(
      assets.map(function (asset) {
        return bytesOf(asset.blob);
      })
    ).then(function (contents) {
      return Promise.all([sha256(page)].concat(contents.map(sha256))).then(function (hashes) {
        var manifest = { version: 1, created: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
        var author = frontValue("author");
        if (author) manifest.author = author;
        manifest.mode = state.meta.mode === "update" ? "update" : "create";
        manifest.page = { src: "page.md", target: filePath(), sha256: hashes[0] };
        var base = state.meta.base;
        if (manifest.mode === "update" && base && base.path === filePath()) manifest.page.base_sha256 = base.sha256;
        manifest.assets = assets.map(function (asset, i) {
          return { src: asset.src, target: asset.target, sha256: hashes[i + 1] };
        });
        var entries = [
          { name: "manifest.json", bytes: utf8(JSON.stringify(manifest, null, 2) + "\n") },
          { name: "page.md", bytes: page },
        ].concat(
          assets.map(function (asset, i) {
            return { name: asset.src, bytes: contents[i] };
          })
        );
        return zipStore(entries);
      });
    });
  }

  function downloadBundle() {
    if (!hasContent()) {
      toast("Write something first: the bundle would be empty.");
      return;
    }
    if (!state.assetsLoaded) {
      toast("Still loading this page's images and files. Try again in a moment.");
      return;
    }
    var name = bundleName();
    buildBundle().then(
      function (zip) {
        offer(zip, name);
        state.meta.bundle = { name: name, sig: signature() };
        save();
        render();
        toast("Downloaded " + name + ". Add to site says what to do with it.", ui.publishBox ? null : "Add to site", openPublish);
      },
      function (e) {
        toast("Couldn't make the bundle (" + String((e && e.message) || e) + "). Download the .md and each image and file from Add to site instead.");
      }
    );
  }

  function openBundle(file) {
    var entries = {};
    var manifest;
    bytesOf(file)
      .then(unzip)
      .then(function (list) {
        list.forEach(function (entry) {
          entries[entry.name] = entry.bytes;
        });
        try {
          manifest = JSON.parse(fromUtf8(entries["manifest.json"] || new Uint8Array(0)));
        } catch (e) {
          manifest = null;
        }
        if (!manifest || manifest.version !== 1 || !manifest.page || !entries[manifest.page.src]) throw new Error("it has no manifest.json from this page");
        if (!/^docs\/(?:.+\/)?[^/]+\.md$/.test(String(manifest.page.target))) throw new Error("its manifest doesn't say where the page goes");
        var assets = Array.isArray(manifest.assets) ? manifest.assets : [];
        return Promise.all(
          assets.map(function (asset) {
            return entries[asset.src] ? sha256(entries[asset.src]) : "";
          })
        ).then(function (hashes) {
          return assets.filter(function (asset, i) {
            return hashes[i] && hashes[i] === String(asset.sha256).toLowerCase();
          });
        });
      })
      .then(function (assets) {
        var target = /^docs\/(?:(.+)\/)?([^/]+)\.md$/.exec(manifest.page.target);
        var doc = parseDocument(fromUtf8(entries[manifest.page.src]));
        var was = hasContent() || hasAssets() ? state.id : "";
        var id = takeDraft();
        state = newState(doc.meta, doc.body, id);
        state.meta.mode = manifest.mode === "update" ? "update" : "new";
        if (/^[0-9a-f]{64}$/i.test(String(manifest.page.base_sha256 || ""))) state.meta.base = { path: manifest.page.target, sha256: manifest.page.base_sha256.toLowerCase() };
        placePage(target[1] || "", target[2]);
        var dirs = [];
        assets.forEach(function (asset) {
          var kind = /^(images|files)\/[^/]+$/.exec(asset.src);
          var where = /^docs\/(?:images|files)\/(.+)\/[^/]+$/.exec(asset.target || "");
          if (!kind) return;
          var name = asset.src.split("/").pop();
          state[kind[1]][name] = new Blob([entries[asset.src]], { type: mimeOf(kind[1], name) });
          if (where) dirs.push(where[1]);
        });
        // Where the page's links were written from; syncPaths() moves them
        // if the bundle was made for another folder.
        state.meta.at = { folder: folderPath(), assets: dirs[0] || assetDir() };
        loadPage();
        syncPaths();
        state.meta.bundle = { name: file.name, sig: signature() };
        storeAllAssets();
        changed();
        var skipped = (manifest.assets || []).length - assets.length;
        var images = Object.keys(state.images).length;
        var files = Object.keys(state.files).length;
        toast(
          "Opened " + manifest.page.target + (images || files ? " with " + [images ? plural(images, "image") : "", files ? plural(files, "file") : ""].filter(Boolean).join(" and ") : "") + "." +
            (skipped ? " Left out " + plural(skipped, "image or file", "images and files") + " that didn't match the manifest." : "") +
            keptNote(was, id)
        );
      })
      .catch(function (e) {
        toast("Couldn't open " + file.name + ": " + String((e && e.message) || e) + ".");
      });
  }

  // The folder and file name of an opened page or bundle.
  function placePage(folder, name) {
    var m = state.meta;
    var known = data.folders.some(function (f) {
      return f.path === folder;
    });
    m.folder = known ? folder : "__new__";
    m.newFolder = known ? "" : folder;
    m.slug = name;
    m.slugEdited = true;
  }

  /* ── Checks: the "Before you publish" list, where code can check it ── */

  function codeTexts() {
    var out = [];
    readBlocks().forEach(function (b) {
      if (isEmpty(b)) return;
      if (b.type === "code" || b.type === "output") out.push({ id: b.id, text: b.code });
      else if (b.type !== "values") {
        walk(copy(b), function (value, key) {
          if (key !== "hint") {
            (value.match(/```[\s\S]*?```|`[^`\n]+`/g) || []).forEach(function (code) {
              out.push({ id: b.id, text: code });
            });
          }
          return value;
        });
      }
    });
    return out;
  }

  function usedPlaceholders() {
    var names = [];
    codeTexts().forEach(function (entry) {
      var re = /<([a-z0-9][a-z0-9._-]*)>/gi;
      var m;
      while ((m = re.exec(entry.text))) {
        var name = m[1].toLowerCase();
        if (!HTML_TAGS.test(name) && names.indexOf(name) < 0) names.push(name);
      }
    });
    return names;
  }

  // Images and files a block points at under docs/images/ or docs/files/
  // that neither this page nor the site has. Code is left out: a path in a
  // code example isn't a link.
  function missingRefs(b) {
    if (b.type === "code" || b.type === "output" || b.type === "diagram") return [];
    var md = TYPES[b.type].md(b).replace(/(`{3,}|~{3,})[\s\S]*?\1|`[^`\n]+`/g, "");
    var known = {};
    (data.files || []).forEach(function (path) {
      known[path] = true;
    });
    var out = [];
    var re = /\]\(\s*<?([^)\s>]+)|\b(?:src|href)="([^"]+)"/g;
    var m;
    while ((m = re.exec(md))) {
      var href = m[1] || m[2];
      if (isExternal(href)) continue;
      var path = joinPath(folderPath(), splitHash(href)[0]);
      var kind = /^(images|files)\//.exec(path);
      if (!kind || attachedAt(path) || known[path]) continue;
      try {
        if (known[decodeURI(path)]) continue;
      } catch (e) {
        // A stray % in the path: it's missing, then.
      }
      out.push({ kind: kind[1], href: href });
    }
    return out;
  }

  function runChecks() {
    var out = [];
    var m = state.meta;
    // at: where in the block, as text or a pattern to find in its Markdown;
    // or { from, to } in the body. Without it, the block's first line.
    // fix: { label, run } when the writer can put it right itself.
    function add(level, text, id, at, group, fix) {
      out.push({ level: level, text: text, id: id, at: at, group: group, fix: fix });
    }
    if (!m.title.trim()) add("warn", "Give the page a title.");
    var live = liveBlocks();

    // Example text from a recipe or a component, still as it came.
    var body = state.body;
    (m.hints || []).forEach(function (hint) {
      var i = -1;
      var n = 0;
      while ((i = body.indexOf(hint, i + 1)) >= 0 && n++ < 20) {
        var b = blockAt(i);
        add("warn", "“" + hint + "” is example text. Replace it with your own, or delete it.", b && b.id, { from: i, to: i + hint.length }, "hints");
      }
    });

    live.forEach(function (b) {
      if (b.type !== "callout" || KNOWN_CALLOUTS.indexOf(b.kind) >= 0) return;
      add("warn", "“" + b.kind + "” isn't a callout type this site styles. Use one of: " + CALLOUTS.map(function (k) { return k.id; }).join(", ") + ".", b.id, new RegExp("\\s" + b.kind + "\\b"));
    });

    live.forEach(function (b, i) {
      if (i && b.type === "callout" && live[i - 1].type === "callout") add("warn", "Two callouts in a row. Space them out or merge them: when everything is a callout, nothing stands out.", b.id);
    });

    var primaries = 0;
    var loud = null;
    live.forEach(function (b) {
      if (b.type === "buttons") {
        b.items.forEach(function (x) {
          if (!x.text.trim()) return;
          if (x.style === "primary") primaries++;
          if (x.style === "gradient" || x.style === "glow") loud = b.id;
        });
      }
      walk(copy(b), function (value) {
        primaries += (value.match(/md-button--primary/g) || []).length;
        return value;
      });
    });
    if (primaries > 1) add("warn", "More than one primary button. Keep one, and make the others secondary or ghost.");
    if (loud) add("info", "Gradient and glow buttons are for the home page and launch pages, once per page.", loud);

    var values = live.filter(function (b) {
      return b.type === "values";
    });
    var listed = [];
    values.forEach(function (b) {
      b.items.forEach(function (x) {
        var name = cleanPlaceholder(x.name);
        if (name) listed.push(name);
      });
    });
    var used = usedPlaceholders();
    var missing = used.filter(function (n) {
      return listed.indexOf(n) < 0;
    });
    if (missing.length) {
      add(
        "warn",
        (values.length ? "Add these to the Your values box: " : "The code uses placeholders but there's no Your values box. Add one listing: ") +
          missing.map(function (n) {
            return "<" + n + ">";
          }).join(", "),
        values.length ? values[0].id : null,
        null,
        null,
        { label: values.length ? "Add them" : "Add the box", run: function () { addPlaceholders(missing); } }
      );
    }
    var unused = listed.filter(function (n) {
      return used.indexOf(n) < 0;
    });
    if (unused.length) add("info", "Listed in Your values but not used in any code: " + unused.map(function (n) { return "<" + n + ">"; }).join(", "), values[0].id);
    listed.concat(used).forEach(function (name, i, all) {
      if (all.indexOf(name) !== i) return;
      if (SECRET_NAME.test(name)) add("warn", "<" + name + "> looks like a secret. Values are saved unencrypted in the reader's browser: tell readers where to get it instead, such as Key Vault.");
      if (PLACEHOLDER_ALIASES[name]) {
        var at = state.body.indexOf("<" + name + ">");
        add("info", "Use <" + PLACEHOLDER_ALIASES[name] + "> instead of <" + name + ">, so values carry across pages.", null, at >= 0 ? { from: at, to: at + name.length + 2 } : null, null, {
          label: "Use <" + PLACEHOLDER_ALIASES[name] + ">",
          run: function () {
            replaceAll("<" + name + ">", "<" + PLACEHOLDER_ALIASES[name] + ">");
          },
        });
      }
    });
    if (values.length && used.length) {
      var firstCode = codeTexts().filter(function (entry) {
        return /<[a-z0-9]/i.test(entry.text);
      })[0];
      var codeIndex = firstCode ? readBlocks().map(function (b) { return b.id; }).indexOf(firstCode.id) : -1;
      if (codeIndex >= 0 && readBlocks().indexOf(values[0]) > codeIndex) add("warn", "Move the Your values box above the first command.", values[0].id);
    }

    live.forEach(function (b) {
      if (b.type !== "tabs") return;
      b.tabs.forEach(function (t) {
        var standard = TAB_ALIASES[t.label.trim().toLowerCase()];
        if (standard && standard !== t.label.trim()) {
          add("info", "Label the tab “" + standard + "” rather than “" + t.label.trim() + "”, so a reader's choice carries across pages.", b.id, '"' + t.label + '"', null, {
            label: "Rename it",
            run: function () {
              var i = state.body.indexOf('"' + t.label + '"', b.from);
              if (i >= 0 && i <= b.to) editBody([{ from: i, to: i + t.label.length + 2, insert: '"' + standard + '"' }]);
            },
          });
        }
      });
    });

    var level = 1;
    live.forEach(function (b) {
      if (b.type !== "heading") return;
      if (b.level > level + 1) {
        var fixed = level + 1;
        add("warn", "This heading skips a level. Use a Section before a Sub-section.", b.id, null, null, {
          label: "Make it " + new Array(fixed + 1).join("#"),
          run: function () {
            editBody([{ from: b.from, to: b.from + b.level, insert: new Array(fixed + 1).join("#") }]);
          },
        });
      }
      level = b.level;
    });

    live.forEach(function (b) {
      if (b.type === "image" && !b.alt.trim()) add("warn", "Add alt text to the image: what it shows, for readers who can't see it.", b.id, "![]");
      if (b.type === "code" && !b.lang.trim()) add("info", "Name the code block's language so it's coloured.", b.id);
      if (b.type === "steps" && b.items.filter(stepFilled).length === 1) add("info", "A single step reads better as a paragraph.", b.id);
      if (b.type === "cards") {
        var n = b.items.filter(function (c) { return c.title.trim(); }).length;
        if (n === 1) add("info", "A single card is only a box. Write a paragraph instead.", b.id);
        if (n > 6) add("info", "Six cards at most. Split them into groups under headings.", b.id);
      }
      walk(copy(b), function (value, key) {
        if (key === "hint") return value;
        if (b.type !== "image" && /!\[(|Describe what the image shows)\]\(/.test(value)) add("warn", "An image has no alt text. Replace “Describe what the image shows”.", b.id, /!\[(|Describe what the image shows)\]\(/);
        else if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(value)) add("warn", "An <img> has no alt text. Add alt=\"…\" saying what it shows.", b.id, /<img\b(?![^>]*\balt=)[^>]*>/i);
        return value;
      });
    });

    sourceChecks(add);

    var md = toMarkdown();
    ["images", "files"].forEach(function (kind) {
      var unused = Object.keys(state[kind]).filter(function (name) {
        return !mentions(md, assetPath(kind, assetDir(), name));
      });
      if (!unused.length) return;
      if (kind === "files") add("warn", "Nothing links to " + unused.join(", ") + ", so readers can't download it and it's left out of the bundle. Link to it, or remove it under Images and files in the sidebar.");
      else add("info", "Not shown on the page, so left out of the bundle: " + unused.join(", ") + ".");
    });
    live.forEach(function (b) {
      missingRefs(b).forEach(function (ref) {
        if (ref.kind === "files") add("warn", "Links to " + ref.href + ", which isn't attached or on the site. Attach it (Images and files, in the sidebar), or fix the link.", b.id, ref.href);
        else add("warn", "Shows " + ref.href + ", which isn't uploaded or on the site. Upload it again, or fix the path.", b.id, ref.href);
      });
    });
    var size = bundleSize(md);
    if (size > BUNDLE_MAX) add("warn", "The bundle is " + megabytes(size) + ", over the " + BUNDLE_MAX / MB + " MB the pipeline takes. Make screenshots smaller, or link to big files where they already live.");

    var exists = data.pages.some(function (p) {
      return "docs/" + p.src === filePath();
    });
    if (m.mode !== "update" && exists) add("warn", filePath() + " already exists. Give this page another file name, or under Add to site choose “A change to an existing page”.");
    if (m.mode === "update" && !exists && m.title.trim()) add("info", "There's no " + filePath() + " on the site yet, so this adds a new page.");

    var cloudy = codeTexts().some(function (entry) {
      return /(^|\n|`)\s*(az|aws|kubectl|terraform|Connect-AzAccount|New-Az\w+)\s/.test(entry.text);
    });
    if (cloudy && !m.applies_to.length) add("info", "This page runs cloud commands. Under Page settings, set which platforms it applies to.");
    if (m.applies_to.length && (!m.owner.trim() || !m.last_reviewed)) add("info", "Cloud pages name an owner and a last reviewed date (Page settings), so readers know how far to trust them.");
    if (m.visibility === "draft") add("info", "Draft: this page won't be published anywhere until you change Visibility.");
    var opened = openedVisibility();
    if (m.mode === "update" && m.visibility === "draft-prod" && opened && opened !== "draft-prod")
      add("warn", "This page is on production, and Staging only takes it out of production's menu, search and sitemap the next time production is published. To change a live page, keep its Visibility (" + VISIBILITY_NAMES[opened] + "): production keeps the old version until then.");
    return out;
  }

  /* Checks on the Markdown as written, for what reads fine in the Azure
     DevOps wiki or on GitHub but not on this site (Python-Markdown): lists
     and tables straight under text, lists nested by two spaces, bare web
     addresses, and links that go nowhere. */

  // The body's lines, with where each starts and whether it's in a code block.
  function proseLines(body) {
    var out = [];
    var at = 0;
    var fence = null;
    lines(body).forEach(function (line) {
      var f = /^\s*(`{3,}|~{3,})/.exec(line);
      var code = !!fence;
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = null;
      } else if (f) {
        fence = f[1];
        code = true;
      }
      out.push({ text: line, from: at, code: code });
      at += line.length + 1;
    });
    return out;
  }

  var LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+\S/;

  function sourceChecks(add) {
    var ls = proseLines(state.body);
    var shown = {};
    // One of each kind is enough to go on with: the rest say how many.
    function once(kind, level, text, at, fix) {
      shown[kind] = (shown[kind] || 0) + 1;
      if (shown[kind] === 1) add(level, text, null, at, "src-" + kind, fix);
    }
    function lineAt(i) {
      return { from: ls[i].from, to: ls[i].from + ls[i].text.length };
    }
    function isText(l) {
      return l && !l.code && l.text.trim() && !/^\s*(#|<|!!!|\?\?\?|===|:\s|>|\||\{)/.test(l.text) && !LIST_ITEM.test(l.text) && !/^\s/.test(l.text);
    }

    ls.forEach(function (l, i) {
      if (l.code) return;
      var prev = ls[i - 1];
      // A list or table right under a paragraph is read as part of it.
      if (/^([-*+]|\d+[.)])\s+\S/.test(l.text) && isText(prev)) {
        once("list-gap", "warn", "This list follows a line of text with no empty line between, so the site shows it as part of that paragraph. Leave an empty line above it.", lineAt(i), gapFix(l.from));
      }
      if (/\|/.test(l.text) && ls[i + 1] && RE.tableSep.test(ls[i + 1].text) && /-/.test(ls[i + 1].text) && prev && !prev.code && prev.text.trim() && !/^\s*\|/.test(prev.text)) {
        once("table-gap", "warn", "This table follows a line of text with no empty line between, so the site doesn't show it as a table. Leave an empty line above it.", lineAt(i), gapFix(l.from));
      }
      // Nested by two spaces, as GitHub and the wiki allow; here it's four.
      var item = LIST_ITEM.exec(l.text);
      if (item && item[1].length > 0 && item[1].length < 4) {
        for (var k = i - 1; k >= 0 && ls[k].text.trim() && !ls[k].code; k--) {
          var up = LIST_ITEM.exec(ls[k].text);
          if (up && up[1].length < item[1].length) {
            once("nest", "warn", "This list item is indented by " + plural(item[1].length, "space") + ". The site nests lists by four, so it shows at the same level as the one above. Indent nested items by four spaces.", lineAt(i), { label: "Indent by four", run: function () { reindentList(i); } });
            break;
          }
        }
      }
      // Web addresses on their own: text here, not links.
      var bare = bareUrls(l.text);
      bare.forEach(function (u) {
        once("bare-url", "info", "“" + u.url + "” shows as plain text on the site, not a link. Put it in <…>, or make it a link with words of its own (Ctrl+K).", { from: l.from + u.index, to: l.from + u.index + u.url.length }, {
          label: "Make it a link",
          run: function () {
            wrapBareUrls();
          },
        });
      });
    });
    if (shown["bare-url"] > 1) patchCount(add, "src-bare-url", shown["bare-url"], "web addresses");
    if (shown["list-gap"] > 1) patchCount(add, "src-list-gap", shown["list-gap"], "lists");
    if (shown.nest > 1) patchCount(add, "src-nest", shown.nest, "list items");

    // Links: to pages that aren't on the site, to sections this page
    // hasn't got, and wiki-style ones from the site's root.
    var anchors = pageAnchors();
    var pages = {};
    data.pages.forEach(function (p) {
      pages[p.src] = p;
    });
    var self = filePath().replace(/^docs\//, "");
    ls.forEach(function (l) {
      if (l.code) return;
      var text = l.text.replace(/`[^`\n]*`/g, function (c) {
        return new Array(c.length + 1).join(" ");
      });
      var re = /(!?)\[[^\]\n]*\]\(\s*<?([^)\s>]+)/g;
      var m;
      while ((m = re.exec(text))) checkLink(m[2], !!m[1], { from: l.from + m.index + m[0].length - m[2].length, to: l.from + m.index + m[0].length });
      // The title is the page's only # heading.
      if (/^#\s+\S/.test(l.text)) {
        var from = l.from;
        once("h1", "warn", "A # heading: the page's title is its only one, and the table of contents starts at ##. Make it a Section.", lineAt(ls.indexOf(l)), {
          label: "Make it ##",
          run: function () {
            if (state.body.slice(from, from + 2) === "# ") editBody([{ from: from, to: from, insert: "#" }]);
          },
        });
      }
    });

    function checkLink(href, image, at) {
      if (/^\/?\.attachments\//.test(href) || /\/\.attachments\//.test(href)) {
        add("warn", href + " is in the Azure DevOps wiki's .attachments folder, which the site doesn't have. Drop the file in here (from the wiki's repository) and the link follows it.", null, at, "attachments");
        return;
      }
      if (image) return;
      if (href[0] === "#") {
        if (href.length > 1 && !anchors[href.slice(1)]) add("warn", "There's no section " + href + " on this page. Pick one from the suggestions after ](# .", null, at);
        return;
      }
      if (href[0] === "/" && href[1] !== "/") {
        var mapped = wikiLink(href);
        add("warn", href + " starts from the site's root, as wiki links do. Here a link points at the page's .md file" + (mapped ? ", which would be " + mapped : "") + ".", null, at, null, mapped ? { label: "Point it there", run: function () { replaceAt(at, href, mapped); } } : null);
        return;
      }
      if (isExternal(href)) return;
      var parts = splitHash(href);
      var target = joinPath(folderPath(), parts[0]);
      if (/\.md$/.test(target)) {
        if (!pages[target] && target !== self) add("warn", "Links to " + href + ", which isn't a page on the site. Pick a page from the suggestions (type ]( ), or fix the path.", null, at);
      } else if (!/^(images|files)\//.test(target) && !/\.\w{2,5}$/.test(target)) {
        var page = data.pages.filter(function (p) {
          return p.url === target.replace(/\/?$/, "/") || (target === "" && p.url === "");
        })[0];
        if (page) {
          var rel = relPath(folderPath(), page.src) + parts[1];
          add("info", "Point the link at the .md file, " + rel + ", rather than the address: the build then checks it still exists.", null, at, null, { label: "Point it there", run: function () { replaceAt(at, href, rel); } });
        }
      }
    }

    // Wiki syntax that came in some other way than Open or paste.
    var C = convert();
    if (C && C.looksLikeAdo(state.body)) {
      var sign = /^\s*\[\[_TO(?:C|SP)_\]\]|^\s*:::\s*mermaid|^\s*>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]|\s=\d*x\d*\)/im.exec(state.body);
      add("warn", "This page has Azure DevOps wiki syntax the site doesn't read, such as [[_TOC_]], ::: mermaid or > [!NOTE].", null, sign ? { from: sign.index, to: sign.index + sign[0].length } : null, null, { label: "Convert it", run: convertAdoBody });
    }
  }

  // "3 lists…" instead of the first one's text, once there are several.
  function patchCount(add, group, n, what) {
    // The check was added once; the Checks panel says there are more.
    add("info", "…and " + (n - 1) + " more " + what + " like that on this page.", null, null, group + "-more");
  }

  function gapFix(from) {
    return {
      label: "Add an empty line",
      run: function () {
        editBody([{ from: from, to: from, insert: "\n" }]);
      },
    };
  }

  // Replaces text at a range, if it's still what the check saw there.
  function replaceAt(at, was, now) {
    if (state.body.slice(at.from, at.to) !== was) {
      toast("The page has changed since: look again under Checks.");
      return;
    }
    editBody([{ from: at.from, to: at.to, insert: now }]);
  }

  function replaceAll(was, now) {
    var changes = [];
    var i = -1;
    while ((i = state.body.indexOf(was, i + 1)) >= 0) changes.push({ from: i, to: i + was.length, insert: now });
    if (changes.length) editBody(changes);
  }

  // Web addresses in a line of text that aren't links already: not in
  // code, <…>, a link's (…) or an HTML attribute. { url, index }.
  function bareUrls(line) {
    var out = [];
    if (/^\s*\[[^\]]+\]:\s/.test(line)) return out;
    var text = line.replace(/`[^`\n]*`/g, function (c) {
      return new Array(c.length + 1).join(" ");
    });
    var re = /https?:\/\/[^\s<>()"'`\]]+[^\s<>()"'`\].,;:!?]/g;
    var m;
    while ((m = re.exec(text))) {
      var before = text.slice(0, m.index);
      if (/[(<"'=[]$/.test(before) || /\]\(\s*$/.test(before)) continue;
      out.push({ url: m[0], index: m.index });
    }
    return out;
  }

  function wrapBareUrls() {
    var changes = [];
    proseLines(state.body).forEach(function (l) {
      if (l.code) return;
      bareUrls(l.text).forEach(function (u) {
        changes.push({ from: l.from + u.index, to: l.from + u.index, insert: "<" }, { from: l.from + u.index + u.url.length, to: l.from + u.index + u.url.length, insert: ">" });
      });
    });
    if (changes.length) editBody(changes);
    toast("Made " + plural(changes.length / 2, "web address", "web addresses") + " into links. Ctrl+Z undoes it.");
  }

  // The ids this page's sections have: its headings as the build names
  // them, and any { #id } or id="…" written in.
  function pageAnchors() {
    var out = {};
    if (state.meta.title) out[tocSlug(state.meta.title)] = true;
    headingsOf(state.body).forEach(function (x) {
      out[tocSlug(x.text)] = true;
    });
    var re = /\{[^}\n]*#([\w-]+)[^}\n]*\}|\bid="([^"]+)"/g;
    var m;
    while ((m = re.exec(state.body))) out[m[1] || m[2]] = true;
    return out;
  }

  // A list nested by two or three spaces, nested by four: the contiguous
  // lines around line i, each indent in steps of the smallest one.
  function reindentList(i) {
    var ls = proseLines(state.body);
    var a = i;
    var b = i;
    while (a > 0 && ls[a - 1].text.trim() && !ls[a - 1].code) a--;
    while (b < ls.length - 1 && ls[b + 1].text.trim() && !ls[b + 1].code) b++;
    var unit = 4;
    for (var k = a; k <= b; k++) {
      var s = /^ */.exec(ls[k].text)[0].length;
      if (s > 0 && s < unit) unit = s;
    }
    var changes = [];
    for (k = a; k <= b; k++) {
      var pad = /^ */.exec(ls[k].text)[0].length;
      if (!pad) continue;
      var next = Math.max(1, Math.floor(pad / unit)) * 4;
      if (next !== pad) changes.push({ from: ls[k].from, to: ls[k].from + pad, insert: new Array(next + 1).join(" ") });
    }
    if (changes.length) editBody(changes);
  }

  // Placeholders the code uses, into the page's Your values box: added to
  // the one there is, or a new one before the first command that uses one.
  function addPlaceholders(names) {
    var box = liveBlocks().filter(function (b) {
      return b.type === "values";
    })[0];
    if (box) {
      var b = copy(box);
      b.items = b.items.filter(function (x) {
        return x.name.trim();
      }).concat(names.map(function (n) {
        return { name: n, label: standardLabel(n) || "" };
      }));
      editBody([{ from: box.from, to: box.to, insert: TYPES.values.md(b) }]);
      return;
    }
    var first = codeTexts().filter(function (entry) {
      return /<[a-z0-9]/i.test(entry.text);
    })[0];
    var at = first ? blockById(first.id).from : 0;
    var md = TYPES.values.md({ items: names.map(function (n) {
      return { name: n, label: standardLabel(n) || "#{What " + n.replace(/-/g, " ") + " is}" };
    }) });
    addHints(md);
    editBody([{ from: at, to: at, insert: snippetText(md) + "\n\n" }]);
  }

  /* ── Drawing the writer ──
     A bar across the top, the title under it, then the work area: a rail of
     sidebar panels, the Markdown, the preview, and the component form when
     it's asked for. */

  var VIEWS = [
    ["markdown", "Markdown", "code-tags"],
    ["split", "Side by side", "view-split-vertical"],
    ["preview", "Preview", "eye-outline"],
  ];
  var SIDES = [
    ["components", "Components", "puzzle-outline"],
    ["outline", "Outline", "format-list-text"],
    ["page", "Page settings", "file-cog-outline"],
    ["assets", "Images and files", "paperclip"],
    ["checks", "Checks", "check-circle-outline"],
    ["drafts", "Drafts and versions", "file-multiple-outline"],
  ];

  function mount(root) {
    var source = document.getElementById("writer-data");
    if (!source) {
      root.textContent = "The page writer needs hooks/writer.py in mkdocs.yml.";
      return;
    }
    data = JSON.parse(source.getAttribute("data-json"));
    root.setAttribute("data-mounted", "");
    root.innerHTML = "";
    ui = { root: root };
    if (!state) {
      state = startingDraft();
      loadAssets();
      setTimeout(collectGarbage, 5000);
      window.addEventListener("pagehide", flushSave);
    }

    root.appendChild(datalists());
    var fileInput = h("input", {
      type: "file",
      accept: ".md,.markdown,text/markdown,.zip,application/zip",
      hidden: true,
      onchange: function () {
        if (fileInput.files[0]) openFile(fileInput.files[0]);
        fileInput.value = "";
      },
    });
    ui.status = h("span", { class: "writer-status", role: "status" });
    ui.viewButtons = {};
    var views = h(
      "div",
      { class: "writer-views", role: "group", "aria-label": "Show" },
      VIEWS.map(function (v) {
        var btn = h("button", { type: "button", class: "writer-view writer-view--" + v[0], title: v[1], "aria-pressed": "false", onclick: function () { setView(v[0]); } }, [icon(v[2]), h("span", { text: v[1] })]);
        ui.viewButtons[v[0]] = btn;
        return btn;
      })
    );
    ui.focusButton = iconButton("fullscreen", "Focus: fill the window with the writer (Esc leaves)", false, function () {
      setFocus(!root.classList.contains("writer--focus"));
    });
    ui.fileInput = fileInput;
    ui.bar = h("div", { class: "writer__bar" }, [
      button("New page", "file-document-plus-outline", "md-button--ghost md-button--sm", openRecipes),
      button("Open", "folder-open-outline", "md-button--ghost md-button--sm", openDialog),
      fileInput,
      ui.status,
      views,
      h("span", { class: "writer__actions" }, [
        iconButton("content-copy", "Copy the page's Markdown file, with its front matter and title", false, function () {
          copyText(toMarkdown(), "Markdown copied: the whole file, front matter and title included.");
        }),
        iconButton("download", "Download the .md on its own", false, download),
        iconButton("delete-sweep-outline", "Clear the page: title, text, settings, images and files (Undo brings it back)", false, clearPage),
        ui.focusButton,
      ].concat(
        publishApi()
          ? [
              iconButton("folder-zip-outline", "Download the bundle (.zip): the page with its images and files", false, downloadBundle),
              (ui.publishButton = button("Publish", "source-pull", "md-button--primary md-button--sm", openPublish)),
            ]
          : [
              button("Add to site", "source-pull", "md-button--ghost md-button--sm", openPublish),
              button("Download bundle (.zip)", "folder-zip-outline", "md-button--primary md-button--sm", downloadBundle),
            ]
      )),
    ]);

    ui.title = h("input", {
      class: "writer-title__input",
      value: state.meta.title,
      placeholder: "Page title, such as: Create a resource group",
      "aria-label": "Page title",
      oninput: function () {
        var m = state.meta;
        m.title = ui.title.value;
        if (!m.slugEdited) m.slug = "";
        updateTitleBar();
        if (ui.side === "page") drawSetup();
        changed();
      },
      onkeydown: function (event) {
        if ((event.key === "Enter" || (event.key === "Tab" && !event.shiftKey) || event.key === "ArrowDown") && ui.cm) {
          event.preventDefault();
          ui.cm.focus();
        }
      },
    });
    ui.path = h("button", {
      type: "button",
      class: "writer-title__path",
      title: "Where the page goes, and the rest of its settings",
      onclick: function () {
        openSide("page");
      },
    });
    ui.titleBar = h("div", { class: "writer-title" }, [h("span", { class: "writer-title__hash", "aria-hidden": "true", text: "#" }), ui.title, ui.path]);

    // The sidebar: a rail of buttons, and the panel the open one shows.
    ui.railButtons = {};
    ui.sides = {};
    ui.rail = h("nav", { class: "writer-rail", "aria-label": "Writer panels" });
    SIDES.forEach(function (s) {
      var btn = h("button", { type: "button", class: "writer-rail__btn", title: s[1], "aria-label": s[1], "aria-pressed": "false", onclick: function () { openSide(ui.side === s[0] ? "" : s[0]); } }, [icon(s[2])]);
      if (s[0] === "checks") {
        ui.checkCount = h("span", { class: "writer-rail__count", hidden: true });
        btn.appendChild(ui.checkCount);
      }
      ui.railButtons[s[0]] = btn;
      ui.rail.appendChild(btn);
      ui.sides[s[0]] = h("div", { class: "writer-side__panel writer-side__panel--" + s[0], hidden: true });
    });
    ui.sideTitle = h("span", { class: "writer-side__title" });
    ui.sidebar = h("aside", { class: "writer-side", "aria-label": "Sidebar" }, [
      h("div", { class: "writer-side__head" }, [
        ui.sideTitle,
        iconButton("chevron-left", "Close the sidebar", false, function () {
          openSide("");
        }),
      ]),
      h("div", { class: "writer-side__body" }, SIDES.map(function (s) { return ui.sides[s[0]]; })),
    ]);

    // The Markdown: formatting buttons, then the editor.
    var tools = [];
    TOOLS.forEach(function (tool) {
      var btn = iconButton(tool.icon, tool.label, false, function () {
        if (!ui.cm && !ui.textarea) return;
        if (ui.menu && ui.menu.anchor === btn) closeMenu();
        else if (tool.grid) openTableMenu(btn);
        else if (tool.menu) openMenu(btn, tool.menu(editorArea()));
        else tool.run(editorArea());
      });
      if (tool.menu || tool.grid) {
        btn.setAttribute("aria-haspopup", "menu");
        btn.setAttribute("aria-expanded", "false");
        btn.classList.add("writer-icon-btn--menu");
      }
      tools.push(btn);
      if (tool.sep) tools.push(h("span", { class: "writer-toolbar__sep", "aria-hidden": "true" }));
    });
    ui.toolbar = h(
      "div",
      { class: "writer-toolbar writer-editor__tools", role: "toolbar", "aria-label": "Formatting" },
      tools.concat([
        h("button", { type: "button", class: "writer-editor__hint", title: "Keyboard shortcuts and help", onclick: openHelp, html: "Type <kbd>/</kbd> for a component · <kbd>Ctrl</kbd>+<kbd>/</kbd> shortcuts" }),
      ])
    );
    ui.editorHost = h("div", { class: "writer-editor__host" }, [h("div", { class: "writer-editor__loading", text: "Loading the editor…" })]);
    ui.welcome = h("div", { class: "writer-welcome", hidden: true });
    ui.footerPos = h("span", { class: "writer-footer__pos" });
    ui.footerSaved = h("span", { class: "writer-footer__saved" });
    ui.footer = h("div", { class: "writer-footer" }, [ui.footerPos, ui.footerSaved]);
    ui.editorPane = h("section", { class: "writer-editor", "aria-label": "Markdown" }, [ui.toolbar, ui.editorHost, ui.footer, ui.welcome]);
    // "Saved 3 min ago" stays true.
    if (!footerTicker) {
      footerTicker = setInterval(function () {
        if (ui.root && ui.root.isConnected) updateFooter();
      }, 30000);
    }

    ui.preview = h("div", { class: "writer-preview" });
    ui.preview.addEventListener("click", function (event) {
      var part = event.target.closest && event.target.closest(".writer-pv");
      if (!part || event.target.closest("a, label, summary, input, button")) return;
      var b = blockById(part.getAttribute("data-block"));
      if (!b) return;
      if (ui.view === "preview") {
        if (b.type !== "text") openForm(b);
        return;
      }
      goTo(b.from, b.from);
    });
    ui.preview.addEventListener("dblclick", function (event) {
      var part = event.target.closest && event.target.closest(".writer-pv");
      var b = part && blockById(part.getAttribute("data-block"));
      if (b && ui.view === "preview") {
        setView(wide() ? "split" : "markdown");
        goTo(b.from, b.from);
      }
    });
    ui.previewPane = h("section", { class: "writer-previewpane", "aria-label": "Preview" }, [ui.preview]);

    ui.formBox = h("section", { class: "writer-form", hidden: true, "aria-label": "Component form" });
    // Only changes made in the form are written back, so opening it never
    // reformats Markdown the writer typed themselves.
    ["input", "change", "click"].forEach(function (type) {
      ui.formBox.addEventListener(
        type,
        function (event) {
          if (ui.form && !event.target.closest(".writer-form__head")) ui.form.edited = true;
        },
        true
      );
    });
    ui.formBox.addEventListener("keydown", function (event) {
      if (event.key === "Escape" || (event.key === "." && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        event.stopPropagation();
        closeForm(true);
      }
    });

    ui.work = h("div", { class: "writer__work" }, [ui.rail, ui.sidebar, ui.editorPane, ui.previewPane, ui.formBox]);

    root.appendChild(ui.bar);
    root.appendChild(ui.titleBar);
    root.appendChild(ui.work);

    root.addEventListener("dragover", function (event) {
      if (event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types, "Files") >= 0) event.preventDefault();
    });
    root.addEventListener("drop", function (event) {
      var file = event.dataTransfer && event.dataTransfer.files[0];
      if (!file || event.target.closest("textarea, .cm-editor")) return;
      event.preventDefault();
      if (/\.(md|markdown|zip)$/i.test(file.name)) openFile(file);
    });
    root.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && root.classList.contains("writer--focus") && !event.defaultPrevented && !document.querySelector(".writer-dialog[open]")) setFocus(false);
      globalKeys(event);
    });

    drawComponents();
    drawSetup();
    drawAssets(true);
    updateTitleBar();
    setView(read(VIEW_KEY) || "split");
    openSide(read(SIDE_KEY) == null ? "components" : read(SIDE_KEY));
    updateStatus();
    updateWelcome();
    followPublish();
    loadScript(MARKED_SRC).then(function () {
      // Tables and ~~ as the site has them, but not GitHub's links made of
      // bare web addresses: the site doesn't make those (see pythonish()).
      if (window.marked && !window.marked.writerReady) {
        window.marked.use({
          gfm: true,
          tokenizer: {
            url: function () {
              return undefined;
            },
          },
        });
        window.marked.writerReady = true;
      }
      render();
    });
    loadScript(CM_SRC).then(createEditor, fallbackEditor);
    // Pasting still works without it, as plain text.
    loadScript(CONVERT_SRC).catch(function () {});
    render();
    openFromAddress();
  }

  // write/?edit=<page in docs/>: from a page's "Edit in the page writer"
  // button. The address loses it once it's open, so a reload doesn't
  // open the page again.
  function openFromAddress() {
    var params = new URLSearchParams(location.search);
    var src = params.get("edit");
    if (!src) return;
    params.delete("edit");
    var rest = params.toString();
    history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
    openSitePage(src.replace(/^\/+/, ""));
  }

  /* ── Open: a page on the site, or a file ── */

  function draftFor(path) {
    var ix = readIndex();
    return ix.list.filter(function (e) {
      return e.path === path;
    })[0];
  }

  function openDialog() {
    var node;
    var search = h("input", { class: "writer-input", type: "search", placeholder: "Find a page by its title or file name", "aria-label": "Find a page on this site", autocomplete: "off" });
    var list = h("div", { class: "writer-pages", role: "listbox", "aria-label": "Pages on this site" });
    var shown = [];
    var chosen = 0;
    function draw() {
      var words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      shown = data.pages.filter(function (p) {
        var hay = (p.title + " " + p.src).toLowerCase();
        return words.every(function (w) {
          return hay.indexOf(w) >= 0;
        });
      }).slice(0, 100);
      chosen = Math.min(chosen, Math.max(0, shown.length - 1));
      list.innerHTML = "";
      shown.forEach(function (p, i) {
        var drafted = draftFor("docs/" + p.src);
        list.appendChild(
          h(
            "button",
            {
              type: "button",
              class: "writer-page" + (i === chosen ? " writer-page--chosen" : ""),
              role: "option",
              "aria-selected": i === chosen ? "true" : "false",
              onclick: function () {
                go(p);
              },
            },
            [h("span", { class: "writer-page__title", text: p.title }), h("code", { class: "writer-page__path", text: p.src }), drafted ? h("span", { class: "writer-title__tag", title: "You have a draft of this page", text: "Draft" }) : null]
          )
        );
      });
      if (!shown.length) list.appendChild(h("div", { class: "writer-needs__none", text: "No page matches. To add a new page, use New page." }));
    }
    function go(p) {
      node.close();
      openSitePage(p.src);
    }
    search.addEventListener("input", function () {
      chosen = 0;
      draw();
    });
    search.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        chosen = Math.max(0, Math.min(shown.length - 1, chosen + (event.key === "ArrowDown" ? 1 : -1)));
        draw();
        var el = list.children[chosen];
        if (el) el.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" && shown[chosen]) {
        event.preventDefault();
        go(shown[chosen]);
      }
    });
    var fromSite = data.sources
      ? [field("A page on this site", search, null, "Its Markdown opens in a draft of its own. Add to site then makes it a change to that page."), list]
      : [h("p", { class: "writer-dialog__foot", text: "This site doesn't publish its pages' Markdown (extra.writer.sources in mkdocs.yml), so open the .md file from your copy of the repository." })];
    node = dialog(
      "Open a page",
      fromSite.concat([
        h("div", { class: "writer-side__group", text: "Or from your computer" }),
        h("div", { class: "writer-row writer-row--center" }, [
          button("Choose a file…", "file-upload-outline", "md-button--sm", function () {
            node.close();
            ui.fileInput.click();
          }),
          h("span", { class: "writer-field__hint", text: "A .md file, a bundle (.zip) from this page, or a page from the Azure DevOps wiki. You can also drop one on the writer." }),
        ]),
      ])
    );
    node.classList.add("writer-dialog--wide");
    draw();
    search.focus();
  }

  function wide() {
    return window.matchMedia("(min-width: 60em)").matches;
  }

  function setView(mode) {
    if (!ui.viewButtons[mode]) mode = "split";
    ui.view = mode;
    write(VIEW_KEY, mode);
    ui.root.setAttribute("data-view", mode);
    Object.keys(ui.viewButtons).forEach(function (key) {
      ui.viewButtons[key].setAttribute("aria-pressed", key === mode ? "true" : "false");
    });
    renderPreview();
    if (ui.cm) ui.cm.requestMeasure();
  }

  function setFocus(on) {
    ui.root.classList.toggle("writer--focus", on);
    document.documentElement.classList.toggle("writer-focus-lock", on);
    ui.focusButton.replaceWith((ui.focusButton = iconButton(on ? "fullscreen-exit" : "fullscreen", on ? "Leave focus (Esc)" : "Focus: fill the window with the writer (Esc leaves)", false, function () {
      setFocus(!ui.root.classList.contains("writer--focus"));
    })));
    if (ui.cm) {
      ui.cm.requestMeasure();
      ui.cm.focus();
    }
  }

  function openSide(name) {
    if (name && !ui.sides[name]) name = "components";
    ui.side = name || "";
    write(SIDE_KEY, ui.side);
    ui.root.setAttribute("data-side", ui.side);
    SIDES.forEach(function (s) {
      ui.sides[s[0]].hidden = s[0] !== ui.side;
      ui.railButtons[s[0]].setAttribute("aria-pressed", s[0] === ui.side ? "true" : "false");
      if (s[0] === ui.side) ui.sideTitle.textContent = s[1];
    });
    if (ui.side === "page") drawSetup();
    if (ui.side === "assets") drawAssets(true);
    if (ui.side === "checks") renderChecks(runChecks());
    if (ui.side === "outline") drawOutline(true);
    if (ui.side === "drafts") drawDrafts();
    if (ui.side === "components" && ui.componentSearch && document.activeElement === document.body) ui.componentSearch.focus();
    if (ui.cm) ui.cm.requestMeasure();
  }

  function updateTitleBar() {
    if (!ui.path) return;
    var m = state.meta;
    if (document.activeElement !== ui.title && ui.title.value !== m.title) ui.title.value = m.title;
    var tag = { unlisted: "Not in the menu", "draft-prod": "Staging only", draft: "Draft" }[m.visibility];
    ui.path.innerHTML = "";
    ui.path.appendChild(icon("file-cog-outline"));
    ui.path.appendChild(h("code", { text: filePath() }));
    if (m.mode === "update") ui.path.appendChild(h("span", { class: "writer-title__tag", text: "Change" }));
    if (tag) ui.path.appendChild(h("span", { class: "writer-title__tag", text: tag }));
  }

  function datalists() {
    function list(id, values) {
      return h(
        "datalist",
        { id: id },
        values.map(function (v) {
          return h("option", { value: v[0], label: v[1] || null });
        })
      );
    }
    return h("div", { hidden: true }, [
      list("writer-pages", data.pages.map(function (p) { return [p.title + " (" + p.src + ")"]; })),
      list("writer-tab-labels", TAB_LABELS.map(function (l) { return [l]; })),
      list("writer-langs", LANGS.map(function (l) { return [l]; })),
      list("writer-placeholders", PLACEHOLDERS),
      list("writer-icons", Object.keys(data.icons).map(function (name) { return [name.replace("/", "-")]; })),
    ]);
  }

  /* ── Sidebar: components ── */

  function drawComponents() {
    var box = ui.sides.components;
    box.innerHTML = "";
    var search = h("input", { class: "writer-input", type: "search", placeholder: "Search, such as: error, tabs, warning", "aria-label": "Search components" });
    ui.componentSearch = search;
    var list = h("div", { class: "writer-needs writer-needs--side" });
    function draw() {
      var q = search.value.trim().toLowerCase();
      list.innerHTML = "";
      [["Basics", true], ["The reader wants to…", false]].forEach(function (group) {
        var items = NEEDS.filter(function (n) {
          return !!n.basic === group[1] && (!q || (n.need + " " + n.name + " " + (n.rather || "")).toLowerCase().indexOf(q) >= 0);
        });
        if (!items.length) return;
        list.appendChild(h("div", { class: "writer-needs__group", text: group[0] }));
        items.forEach(function (n) {
          var index = NEEDS.indexOf(n);
          list.appendChild(
            h(
              "button",
              {
                type: "button",
                class: "writer-need",
                draggable: "true",
                title: "Click to add it at the cursor, or drag it into the Markdown" + (n.rather ? ". Rather than " + n.rather + "." : "."),
                onclick: function () {
                  insertNeed(n, null, false);
                },
                ondragstart: function (event) {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("application/x-writer-component", String(index));
                  event.dataTransfer.setData("text/plain", snippetText(snippetFor(n)));
                },
              },
              [
                icon(TYPES[n.type].icon),
                h("span", { class: "writer-need__text" }, [h("span", { class: "writer-need__name", text: n.name }), h("span", { class: "writer-need__need", text: n.need })]),
                h("span", { class: "writer-need__drag", "aria-hidden": "true", html: (data.ui["drag-vertical"] || "") }),
              ]
            )
          );
        });
      });
      if (!list.children.length) list.appendChild(h("div", { class: "writer-needs__none", text: "Nothing matches. When nothing fits, write a paragraph: it's usually the best option." }));
    }
    search.addEventListener("input", draw);
    search.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        var first = list.querySelector(".writer-need");
        if (first) first.click();
      }
    });
    draw();
    box.appendChild(search);
    box.appendChild(list);
    box.appendChild(h("p", { class: "writer-side__foot" }, ["Not sure? ", h("a", { href: BASE + "writing-guide/choosing-components/", target: "_blank", rel: "noopener", text: "Choosing components" }), " explains each one."]));
  }

  /* ── Sidebar: page settings ── */

  function drawSetup() {
    var m = state.meta;
    var box = ui.sides && ui.sides.page;
    if (!box) return;
    box.innerHTML = "";
    var slugInput = h("input", {
      class: "writer-input",
      value: m.slug,
      placeholder: slugify(m.title) || "new-page",
      oninput: function () {
        m.slug = slugInput.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        m.slugEdited = !!slugInput.value;
        updateTitleBar();
        changed();
      },
      onchange: function () {
        m.slug = slugify(slugInput.value);
        slugInput.value = m.slug;
        m.slugEdited = !!m.slug;
        updateTitleBar();
        changed();
      },
    });
    var folders = data.folders.map(function (f) {
      return [f.path, f.title + (f.path ? "  —  docs/" + f.path + "/" : "  —  docs/")];
    });
    folders.push(["__new__", "A new folder…"]);
    var folder = select(m, "folder", folders, false, function () {
      syncPaths();
      drawSetup();
      drawAssets(true);
      updateTitleBar();
    });
    box.appendChild(field("Folder (the tab it appears under)", folder));
    if (m.folder === "__new__") {
      box.appendChild(
        field("New folder name", input(m, "newFolder", {
          placeholder: "billing",
          oninput: function (event) {
            m.newFolder = event.target.value;
            updateTitleBar();
            changed();
          },
          onchange: function () {
            syncPaths();
            changed();
          },
        }))
      );
    }
    box.appendChild(field("File name", h("span", { class: "writer-with-suffix" }, [slugInput, h("span", { text: ".md" })]), null, "Lowercase words joined by hyphens. It becomes the page's address."));
    box.appendChild(
      field(
        "Visibility",
        select(m, "visibility", [
          ["listed", "Published, in the menu"],
          ["unlisted", "Published, not in the menu"],
          ["draft-prod", "Staging only, for review"],
          ["draft", "Draft, not published"],
        ], false, updateTitleBar)
      )
    );
    box.appendChild(h("div", { class: "writer-side__group", text: "Who it's for, who owns it, when it was checked" }));
    var platforms = h(
      "div",
      { class: "writer-row" },
      Object.keys(data.platforms).map(function (key) {
        var box2 = h("input", {
          type: "checkbox",
          checked: m.applies_to.indexOf(key) >= 0,
          onchange: function () {
            m.applies_to = Object.keys(data.platforms).filter(function (k) {
              return k === key ? box2.checked : m.applies_to.indexOf(k) >= 0;
            });
            changed();
          },
        });
        return h("label", { class: "writer-check" }, [box2, h("span", { class: "writer-check__icon", html: data.platforms[key].icon }), h("span", { text: data.platforms[key].label })]);
      })
    );
    box.appendChild(field("Applies to", platforms, null, "Leave all unticked for pages that apply everywhere."));
    box.appendChild(field("Owner", input(m, "owner", { placeholder: "Platform team" }), null, "A team, not a person."));
    box.appendChild(
      row([
        field("Last reviewed", input(m, "last_reviewed", { type: "date" }), "grow"),
        field("Review every", input(m, "review_every", { type: "number", min: "1", max: "24", placeholder: String(data.review_months || 6) }), "narrow"),
      ])
    );
    box.appendChild(h("span", { class: "writer-field__hint", text: "Reviewed only after following the page end to end. Review every: months, 3 for previews." }));
    box.appendChild(mdField(m, "extraFront", { label: "Other front matter (YAML, kept as written)", code: true, rows: 1, placeholder: "hide:\n  - toc" }));
  }

  /* ── Sidebar: images and files ──
     Where each goes, and whether the page uses it (only those go in the
     bundle). Redrawn when that changes. */

  function drawAssets(force) {
    var box = ui.sides && ui.sides.assets;
    if (!box) return;
    var md = toMarkdown();
    var dir = assetDir();
    var rows = [];
    ["images", "files"].forEach(function (kind) {
      Object.keys(state[kind]).sort().forEach(function (name) {
        rows.push({ kind: kind, name: name, used: mentions(md, assetPath(kind, dir, name)) });
      });
    });
    var sig = dir + "|" + bundleSize(md) + "|" + rows.map(function (r) {
      return r.kind + "/" + r.name + (r.used ? "+" : "-");
    }).join("|");
    if (!force && sig === ui.assetsSig) return;
    ui.assetsSig = sig;
    box.innerHTML = "";
    box.appendChild(
      h("div", { class: "writer-row" }, [
        button("Upload images", "image-outline", "md-button--sm", function () {
          pickImage(function (name, linked) {
            toast(linked ? "Uploaded " + name + ", and the page's links to the wiki's copy point at it now." : "Uploaded " + name + ". Drag it into the Markdown, or use its + button.");
          }, true);
        }),
        button("Attach files", "paperclip", "md-button--ghost md-button--sm", function () {
          pickFile(function (name, linked) {
            toast(linked ? "Attached " + name + ", and the page's links to the wiki's copy point at it now." : "Attached " + name + ". Drag it into the Markdown where readers should download it, or use its + button.");
          }, true);
        }),
      ])
    );
    if (!rows.length) {
      box.appendChild(h("div", { class: "writer-block__help", text: "Nothing yet. Paste or drop a screenshot into the Markdown, or upload one here. Attach a file for readers to download." }));
    }
    var list = h("div", { class: "writer-assets__list" });
    rows.forEach(function (r) {
      var blob = state[r.kind][r.name];
      list.appendChild(
        h(
          "div",
          {
            class: "writer-asset" + (r.used ? "" : " writer-asset--unused"),
            draggable: "true",
            title: "Drag into the Markdown",
            ondragstart: function (event) {
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("application/x-writer-asset", r.kind + "/" + r.name);
              event.dataTransfer.setData("text/plain", assetMarkdown(r.kind, r.name));
            },
          },
          [
            r.kind === "images"
              ? h("img", { class: "writer-asset__thumb", src: assetUrl(r.kind, r.name), alt: "" })
              : h("span", { class: "writer-asset__thumb writer-asset__thumb--file", text: extOf(r.name) }),
            h("span", { class: "writer-asset__text" }, [
              h("code", { class: "writer-asset__name", title: "docs/" + assetPath(r.kind, dir, r.name), text: r.name }),
              h("span", { class: "writer-asset__meta", text: megabytes(blob.size) + (r.used ? "" : " · not on the page, so not in the bundle") }),
            ]),
            iconButton("plus", r.kind === "images" ? "Show it on the page, at the cursor" : "Link to it, at the cursor", !ui.cm && !ui.textarea, function () {
              if (r.kind === "images") insertSnippet("![#{Describe what the image shows}](" + imageRel(r.name) + ")", null);
              else insertFileLink(editorArea(), r.name);
            }),
            r.kind === "images" && editableImage(r.name)
              ? iconButton("image-edit-outline", "Crop it, or hide names and IDs in it", false, function () {
                  openImageEditor(r.name);
                })
              : null,
            iconButton("pencil-outline", "Rename", false, function () {
              openRename(r.kind, r.name);
            }),
            iconButton("trash-can-outline", "Remove", false, function () {
              removeAsset(r.kind, r.name);
            }),
          ]
        )
      );
    });
    if (rows.length) box.appendChild(list);
    box.appendChild(
      h("div", {
        class: "writer-field__hint",
        text:
          "Images up to " + IMAGE_MAX / MB + " MB; files for readers to download (" + FILE_KINDS + ") up to " + FILE_MAX / MB + " MB. " +
          "They go in docs/images/" + dir + "/ and docs/files/" + dir + "/. " +
          (rows.length ? "The bundle is " + megabytes(bundleSize(md)) + " of the " + BUNDLE_MAX / MB + " MB it can be." : ""),
      })
    );
  }

  function assetMarkdown(kind, name) {
    return kind === "images" ? "![Describe what the image shows](" + imageRel(name) + ")" : "[" + downloadLabel(name) + "](" + fileRel(name) + ")";
  }

  /* ── Sidebar: checks ── */

  function renderChecks(checks) {
    var box = ui.sides.checks;
    box.innerHTML = "";
    var list = h("ul", { class: "writer-checks" });
    // Example text is underlined where it is; here it's one line.
    var hints = checks.filter(function (c) {
      return c.group === "hints";
    });
    if (hints.length > 1) {
      checks = checks.filter(function (c) {
        return c.group !== "hints";
      });
      checks.unshift({ level: "warn", text: plural(hints.length, "piece") + " of example text from a recipe or component " + (hints.length === 1 ? "is" : "are") + " still on the page, underlined in the Markdown. Replace them with your own, or delete them. Show goes to the first.", at: hints[0].at });
    }
    if (!checks.length) list.appendChild(h("li", { class: "writer-checks__item writer-checks__item--ok" }, [icon("check-circle-outline"), h("span", { text: "Nothing to fix that can be checked automatically." })]));
    checks.forEach(function (c) {
      var range = checkRange(c);
      var actions = h("span", { class: "writer-checks__actions" });
      var item = h("li", { class: "writer-checks__item writer-checks__item--" + c.level }, [icon(c.level === "warn" ? "alert-outline" : "information-outline"), h("span", { class: "writer-checks__body" }, [h("span", { text: c.text }), actions])]);
      if (range) {
        actions.appendChild(
          h("button", {
            type: "button",
            class: "writer-link-btn",
            text: "Show",
            onclick: function () {
              if (ui.view === "preview") setView(wide() ? "split" : "markdown");
              goTo(range.from, range.to);
            },
          })
        );
      } else if (/title/.test(c.text)) {
        actions.appendChild(h("button", { type: "button", class: "writer-link-btn", text: "Show", onclick: function () { ui.title.focus(); } }));
      } else if (/Page settings/.test(c.text)) {
        actions.appendChild(h("button", { type: "button", class: "writer-link-btn", text: "Show", onclick: function () { openSide("page"); } }));
      }
      if (c.fix) {
        actions.appendChild(
          h("button", {
            type: "button",
            class: "writer-link-btn writer-link-btn--fix",
            text: c.fix.label,
            onclick: function () {
              c.fix.run();
              changed();
            },
          })
        );
      }
      list.appendChild(item);
    });
    box.appendChild(list);
    box.appendChild(h("p", { class: "writer-panel__lead", text: "Also check by eye before you publish:" }));
    box.appendChild(
      h(
        "ul",
        { class: "writer-checks writer-checks--manual" },
        [
          "Read the page skipping every box, badge and button. It still makes sense.",
          "No subscription IDs, account IDs, tenant names or email addresses in screenshots or examples.",
          "The last reviewed date is from a real run-through, not a typo fix.",
        ].map(function (text) {
          return h("li", { class: "writer-checks__item" }, [icon("check-circle-outline"), h("span", { text: text })]);
        })
      )
    );
  }

  // Where in the body a check points, or null.
  function checkRange(c) {
    if (c.at && typeof c.at === "object" && !(c.at instanceof RegExp)) return c.at;
    var b = c.id ? blockById(c.id) : null;
    if (!b) return null;
    var text = state.body.slice(b.from, b.to);
    if (c.at instanceof RegExp) {
      var m = c.at.exec(text);
      if (m) return { from: b.from + m.index, to: b.from + m.index + m[0].length };
    } else if (c.at) {
      var i = text.indexOf(c.at);
      if (i >= 0) return { from: b.from + i, to: b.from + i + c.at.length };
    }
    var nl = text.indexOf("\n");
    return { from: b.from, to: b.from + (nl < 0 ? text.length : nl) };
  }

  /* ── Help: the shortcuts, and coming from the Azure DevOps wiki ── */

  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  // "Ctrl+Shift+P" as keys, with Mac's names on a Mac.
  function keysNode(text) {
    return h(
      "span",
      { class: "writer-keys" },
      text.split(" / ").map(function (combo, i) {
        return h("span", { class: "writer-keys__combo" }, [i ? h("span", { class: "writer-keys__or", text: "or" }) : null].concat(
          combo.split("+").map(function (key) {
            var name = MAC ? { Ctrl: "⌘", Alt: "⌥", Shift: "⇧" }[key] || key : key;
            return h("kbd", { text: name });
          })
        ));
      })
    );
  }

  // " / " between keys that do the same thing.
  var SHORTCUTS = [
    ["Writing", [
      ["Bold", "Ctrl+B"],
      ["Italic", "Ctrl+I"],
      ["Inline code", "Ctrl+E"],
      ["Strikethrough", "Ctrl+Shift+X"],
      ["Highlight", "Ctrl+Shift+H"],
      ["Link to a page or website", "Ctrl+K"],
      ["Section heading", "Ctrl+Alt+2"],
      ["Sub-section heading", "Ctrl+Alt+3"],
      ["Minor heading", "Ctrl+Alt+4"],
      ["Back to a paragraph", "Ctrl+Alt+0"],
      ["Numbered list", "Ctrl+Shift+7"],
      ["Bulleted list", "Ctrl+Shift+8"],
      ["Checklist", "Ctrl+Shift+9"],
      ["Next list item; on an empty one, end the list", "Enter"],
    ]],
    ["Components", [
      ["Pick a component to add", "/"],
      ["Suggestions: links, icons, placeholders, languages", "Ctrl+Space"],
      ["Next thing to fill in", "Tab"],
      ["Previous thing to fill in", "Shift+Tab"],
      ["Edit the component at the cursor in a form", "Ctrl+."],
      ["Close the form", "Esc"],
    ]],
    ["Tables", [
      ["Next cell, lining the columns up", "Tab"],
      ["Previous cell", "Shift+Tab"],
      ["A new row: Tab in the last cell", "Tab"],
    ]],
    ["Editing", [
      ["Undo", "Ctrl+Z"],
      ["Redo", "Ctrl+Y / Ctrl+Shift+Z"],
      ["Find, and find and replace", "Ctrl+F"],
      ["Select the next match too", "Ctrl+D"],
      ["Move the line up or down", "Alt+↑ / Alt+↓"],
      ["Indent or outdent", "Tab / Shift+Tab"],
      ["Paste as plain text, as it was copied", "Ctrl+Shift+V"],
    ]],
    ["The writer", [
      ["Every command, by name", "Ctrl+Shift+P / F1"],
      ["Save now (it saves as you type anyway)", "Ctrl+S"],
      ["These shortcuts", "Ctrl+/"],
      ["Leave focus mode", "Esc"],
    ]],
  ];

  var FROM_ADO = [
    ["<code>[[_TOC_]]</code>", "Nothing: every page shows its table of contents by itself."],
    ["<code>::: mermaid</code> … <code>:::</code>", "A Diagram: <code>``` mermaid</code> … <code>```</code>."],
    ["<code>&gt; [!NOTE]</code>, <code>&gt; [!WARNING]</code>", "Callouts, with more kinds: type <kbd>/</kbd> and pick one."],
    ["<code>![](/.attachments/x.png =500x)</code>", "Drop the image in and it comes with the page. A width is <code>{ width=\"500\" }</code>."],
    ["Pasting from Word, Teams or a web page", "The same: headings, lists, tables, links and screenshots come across as Markdown."],
    ["A list or table straight under a line of text", "Leave an empty line above it, or it's read as part of that paragraph. The checks point it out."],
    ["Nested list items indented by 2 spaces", "Indent them by 4. The checks point it out and fix it."],
    ["The page tree", "Folders in <code>docs/</code>: a page's folder is its tab. Choose it under Page settings."],
    ["Edit on a page", "The pencil at the top of every page opens it here."],
    ["Revisions", "Drafts and versions, in the sidebar, while you write. Once it's published, the pull request."],
  ];

  function openHelp() {
    var old = document.querySelector(".writer-dialog--help[open]");
    closeDialogs();
    // Ctrl+/ again closes it.
    if (old) return;
    var groups = SHORTCUTS.map(function (group) {
      return h("div", { class: "writer-shortcuts__group" }, [
        h("div", { class: "writer-side__group", text: group[0] }),
        h(
          "dl",
          { class: "writer-shortcuts" },
          group[1].reduce(function (all, row) {
            return all.concat([h("dt", { text: row[0] }), h("dd", {}, [keysNode(row[1])])]);
          }, [])
        ),
      ]);
    });
    var ado = h("table", { class: "writer-ado" }, [
      h("thead", {}, [h("tr", {}, [h("th", { text: "In the Azure DevOps wiki" }), h("th", { text: "Here" })])]),
      h(
        "tbody",
        {},
        FROM_ADO.map(function (row) {
          return h("tr", {}, [h("td", { html: row[0] }), h("td", { html: row[1] })]);
        })
      ),
    ]);
    var node = dialog("Shortcuts and help", [
      h("div", { class: "writer-shortcuts__grid" }, groups),
      h("div", { class: "writer-side__group", text: "Coming from the Azure DevOps wiki?" }),
      h("p", { class: "writer-dialog__foot", text: "Open a page exported from the wiki, or paste one in, and its wiki syntax is turned into this site's. The rest works the way you'd expect:" }),
      ado,
      h("p", { class: "writer-dialog__foot" }, ["More in the ", h("a", { href: BASE + "writing-guide/", target: "_blank", rel: "noopener", text: "writing guide" }), " and ", h("a", { href: BASE + "writing-guide/choosing-components/", target: "_blank", rel: "noopener", text: "Choosing components" }), "."]),
    ]);
    node.classList.add("writer-dialog--wide", "writer-dialog--help");
  }

  /* ── The command palette: every action, component, draft and page, by
     name ── */

  function commands() {
    var out = [];
    function add(group, label, run, keys, words) {
      out.push({ group: group, label: label, run: run, keys: keys || "", words: (label + " " + (words || "") + " " + group).toLowerCase() });
    }
    add("Page", "New page from a recipe", openRecipes, "", "create start template");
    add("Page", "New empty draft", newDraft, "", "blank create");
    add("Page", "Open a page on this site", openDialog, "", "edit existing");
    add("Page", "Open a file from your computer", function () { ui.fileInput.click(); }, "", "md markdown zip bundle import azure devops wiki");
    add("Page", "Download bundle (.zip)", downloadBundle, "", "export save publish");
    add("Page", "Add to site: how to publish", openPublish, "", "publish pull request pipeline azure devops");
    add("Page", "Copy the Markdown", function () { copyText(toMarkdown(), "Markdown copied: the whole file, front matter and title included."); }, "", "clipboard");
    add("Page", "Download the .md on its own", download, "", "export save");
    add("Page", "Clear the page", clearPage, "", "delete empty reset");
    if (state.meta.original) add("Page", "Compare with the page as opened", function () { showDiff(state.meta.original, toMarkdown(), "As opened", "Now"); }, "", "diff changes");
    var C = convert();
    if (C && C.looksLikeAdo(state.body)) add("Page", "Convert Azure DevOps wiki syntax", convertAdoBody, "", "toc mermaid note attachments");
    add("View", "Markdown only", function () { setView("markdown"); });
    add("View", "Side by side", function () { setView("split"); }, "", "split preview");
    add("View", "Preview only", function () { setView("preview"); });
    add("View", ui.root.classList.contains("writer--focus") ? "Leave focus mode" : "Focus mode: fill the window", function () { setFocus(!ui.root.classList.contains("writer--focus")); }, "", "fullscreen zen");
    SIDES.forEach(function (s) {
      add("View", "Show " + s[1].toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }), function () { openSide(s[0]); }, "", "sidebar panel");
    });
    add("Help", "Keyboard shortcuts and help", openHelp, "Ctrl+/", "keys azure devops wiki");
    add("Edit", "Edit the component at the cursor in a form", function () {
      var b = ui.cm && blockAt(ui.cm.state.selection.main.head);
      if (b && b.type !== "text") openForm(b);
      else toast("Put the cursor in a component, such as steps, a callout or tabs, to edit it in a form.");
    }, "Ctrl+.");
    add("Edit", "Line up the table's columns", formatTableAt, "", "format table align");
    add("Edit", "Find and replace", function () { if (ui.cm) window.CM.openSearchPanel(ui.cm); }, "Ctrl+F", "search");
    TOOLS.forEach(function (tool) {
      if (tool.grid || tool.menu) return;
      var m = /^(.*?)(?: \((Ctrl[^)]*)\))?$/.exec(tool.label.split(":")[0]);
      add("Format", m[1], function () { if (ui.cm || ui.textarea) tool.run(editorArea()); }, m[2] || "");
    });
    HEADINGS.forEach(function (x) {
      add("Format", x[0] ? x[1].replace(/( heading)?$/, " heading") : "Paragraph (not a heading)", function () { setHeading(x[0])(editorArea()); }, x[2]);
    });
    NEEDS.forEach(function (n) {
      add("Insert", n.name, function () { insertNeed(n, null, false); }, "", n.need + " " + n.type + " component");
    });
    [[2, 2], [3, 3], [4, 4]].forEach(function (size) {
      add("Insert", "Table, " + size[0] + " columns", function () { insertSnippet(tableSnippet(size[0], size[1]), null); }, "", "grid");
    });
    readIndex().list.slice().sort(function (a, b) {
      return (b.updated || 0) - (a.updated || 0);
    }).forEach(function (e) {
      if (e.id !== state.id) add("Drafts", "Switch to " + (e.title || "the untitled draft"), function () { switchDraft(e.id); }, "", (e.path || "") + " draft");
    });
    if (data.sources) {
      data.pages.forEach(function (p) {
        add("Pages", "Open “" + p.title + "”", function () { openSitePage(p.src); }, "", p.src + " edit");
      });
    }
    return out;
  }

  // Before the palette or the shortcuts: any other dialog of the writer's.
  function closeDialogs() {
    closeMenu();
    document.querySelectorAll(".writer-dialog[open]").forEach(function (node) {
      node.close();
    });
  }

  function openPalette() {
    closeDialogs();
    var all = commands();
    var input = h("input", { class: "writer-input writer-palette__input", type: "search", placeholder: "Type a command, a component or a page", "aria-label": "Command", autocomplete: "off" });
    var list = h("div", { class: "writer-palette__list", role: "listbox", "aria-label": "Commands" });
    var shown = [];
    var chosen = 0;
    function draw() {
      var words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      // Pages only once something's typed: there are a lot of them.
      shown = all.filter(function (c) {
        if (!words.length) return c.group !== "Pages" && c.group !== "Drafts";
        return words.every(function (w) {
          return c.words.indexOf(w) >= 0;
        });
      });
      if (words.length) {
        shown.sort(function (a, b) {
          var pa = a.label.toLowerCase().indexOf(words[0]) === 0 ? 0 : 1;
          var pb = b.label.toLowerCase().indexOf(words[0]) === 0 ? 0 : 1;
          return pa - pb || (a.group === "Pages") - (b.group === "Pages");
        });
      }
      shown = shown.slice(0, 60);
      chosen = Math.min(chosen, Math.max(0, shown.length - 1));
      list.innerHTML = "";
      var group = "";
      shown.forEach(function (c, i) {
        if (c.group !== group && !words.length) {
          group = c.group;
          list.appendChild(h("div", { class: "writer-needs__group", text: group }));
        }
        list.appendChild(
          h(
            "button",
            {
              type: "button",
              class: "writer-page" + (i === chosen ? " writer-page--chosen" : ""),
              role: "option",
              "aria-selected": i === chosen ? "true" : "false",
              onclick: function () {
                go(c);
              },
            },
            [h("span", { class: "writer-page__title", text: c.label }), words.length ? h("span", { class: "writer-palette__group", text: c.group }) : null, c.keys ? keysNode(c.keys) : null]
          )
        );
      });
      if (!shown.length) list.appendChild(h("div", { class: "writer-needs__none", text: "Nothing matches." }));
    }
    function go(c) {
      node.close();
      setTimeout(c.run, 0);
    }
    input.addEventListener("input", function () {
      chosen = 0;
      draw();
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        chosen = Math.max(0, Math.min(shown.length - 1, chosen + (event.key === "ArrowDown" ? 1 : -1)));
        draw();
        var el = list.querySelector(".writer-page--chosen");
        if (el) el.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" && shown[chosen]) {
        event.preventDefault();
        go(shown[chosen]);
      }
    });
    var node = dialog("Commands", [input, list]);
    node.classList.add("writer-dialog--palette");
    draw();
    input.focus();
  }

  // The page's Azure DevOps wiki syntax, turned into this site's.
  function convertAdoBody() {
    var C = convert();
    if (!C) return;
    var res = C.fromAdo(state.body, { link: wikiLink });
    if (!res.changed) {
      toast("Nothing to convert.");
      return;
    }
    editBody([{ from: 0, to: state.body.length, insert: C.demoteHeadings(res.md) }]);
    changed();
    toast("Converted: " + res.notes.join("; ") + ". Ctrl+Z undoes it.");
  }

  /* ── Sidebar: drafts, and the versions of the one showing ── */

  function drawDrafts() {
    var box = ui.sides && ui.sides.drafts;
    if (!box) return;
    box.innerHTML = "";
    var ix = readIndex();
    var list = ix.list.slice().sort(function (a, b) {
      return (b.updated || 0) - (a.updated || 0);
    });
    box.appendChild(
      h("div", { class: "writer-row" }, [
        button("New draft", "file-document-plus-outline", "md-button--sm", newDraft),
        button("Open a page", "folder-open-outline", "md-button--ghost md-button--sm", openDialog),
      ])
    );
    var rows = h("div", { class: "writer-drafts" });
    if (!list.length) rows.appendChild(h("div", { class: "writer-block__help", text: "Nothing yet. Each page you write or open is kept here, in this browser, until you delete it." }));
    list.forEach(function (e) {
      var current = e.id === state.id;
      rows.appendChild(
        h("div", { class: "writer-draft" + (current ? " writer-draft--current" : "") }, [
          h(
            "button",
            {
              type: "button",
              class: "writer-draft__open",
              title: current ? "Showing now" : "Open this draft",
              "aria-current": current ? "true" : null,
              onclick: function () {
                switchDraft(e.id);
              },
            },
            [
              h("span", { class: "writer-draft__title", text: e.title || "Untitled" }),
              h("span", { class: "writer-draft__meta", text: (e.path ? e.path.replace(/^docs\//, "") + " · " : "") + when(e.updated) + (e.words ? " · " + plural(e.words, "word") : "") }),
            ]
          ),
          iconButton("trash-can-outline", "Delete this draft", false, function () {
            deleteDraft(e.id);
          }),
        ])
      );
    });
    box.appendChild(rows);

    box.appendChild(h("div", { class: "writer-side__group", text: "Earlier versions of this draft" }));
    var versions = h("div", { class: "writer-versions" }, [h("div", { class: "writer-block__help", text: "Loading…" })]);
    box.appendChild(versions);
    if (state.meta.original) {
      box.appendChild(
        button("Compare with the page as opened", "file-compare", "md-button--ghost md-button--sm", function () {
          showDiff(state.meta.original, toMarkdown(), "As opened", "Now");
        })
      );
    }
    box.appendChild(h("p", { class: "writer-side__foot", text: "Drafts live in this browser only. To carry on elsewhere, download the bundle and open it there." }));
    var mine = state.id;
    versionsOf(mine).then(
      function (found) {
        if (state.id !== mine || !versions.isConnected) return;
        versions.innerHTML = "";
        if (!found.length) {
          versions.appendChild(h("div", { class: "writer-block__help", text: "None yet. While you write, the page as it was is kept every few minutes, to compare with or go back to." }));
          return;
        }
        found.forEach(function (v) {
          versions.appendChild(
            h("div", { class: "writer-version" }, [
              h("span", { class: "writer-version__text" }, [
                h("span", { class: "writer-version__when", text: when(v.at) }),
                h("span", { class: "writer-draft__meta", text: plural(v.words || 0, "word") + (v.title && v.title !== state.meta.title ? " · “" + v.title + "”" : "") }),
              ]),
              h("button", {
                type: "button",
                class: "writer-link-btn",
                text: "Compare",
                onclick: function () {
                  showDiff(versionMarkdown(v), toMarkdown(), "From " + when(v.at), "Now", v);
                },
              }),
              h("button", {
                type: "button",
                class: "writer-link-btn",
                text: "Restore",
                onclick: function () {
                  restoreVersion(v);
                },
              }),
            ])
          );
        });
      },
      function () {
        versions.innerHTML = "";
        versions.appendChild(h("div", { class: "writer-block__help", text: "This browser can't keep earlier versions." }));
      }
    );
  }

  function versionMarkdown(v) {
    try {
      return toMarkdown(JSON.parse(v.json));
    } catch (e) {
      return "";
    }
  }

  /* Comparing two versions of the page, line by line. */

  // Each line of a and b, marked " " (in both), "-" (a only) or "+" (b only).
  function diffLines(a, b) {
    var x = lines(a);
    var y = lines(b);
    // Most changes are in one place: the lines the same at each end first.
    var start = 0;
    while (start < x.length && start < y.length && x[start] === y[start]) start++;
    var endX = x.length;
    var endY = y.length;
    while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
      endX--;
      endY--;
    }
    var mx = x.slice(start, endX);
    var my = y.slice(start, endY);
    var n = mx.length;
    var m = my.length;
    var middle = [];
    var i;
    var j;
    if (n * m > 4e6) {
      mx.forEach(function (l) {
        middle.push(["-", l]);
      });
      my.forEach(function (l) {
        middle.push(["+", l]);
      });
    } else {
      // The longest run of lines the two share, from the end backwards.
      var dp = [];
      for (i = n; i >= 0; i--) {
        dp[i] = new Uint32Array(m + 1);
        if (i === n) continue;
        for (j = m - 1; j >= 0; j--) dp[i][j] = mx[i] === my[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
      i = 0;
      j = 0;
      while (i < n && j < m) {
        if (mx[i] === my[j]) {
          middle.push([" ", mx[i]]);
          i++;
          j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) middle.push(["-", mx[i++]]);
        else middle.push(["+", my[j++]]);
      }
      while (i < n) middle.push(["-", mx[i++]]);
      while (j < m) middle.push(["+", my[j++]]);
    }
    function same(l) {
      return [" ", l];
    }
    return x.slice(0, start).map(same).concat(middle, x.slice(endX).map(same));
  }

  // v: a version, to offer Restore beside the comparison.
  function showDiff(a, b, labelA, labelB, v) {
    var rows = diffLines(a, b);
    var added = 0;
    var removed = 0;
    rows.forEach(function (r) {
      if (r[0] === "+") added++;
      if (r[0] === "-") removed++;
    });
    var box = h("div", { class: "writer-diff" });
    // Changed lines with three either side; the rest folded away.
    var keep = rows.map(function () {
      return false;
    });
    rows.forEach(function (r, i) {
      if (r[0] === " ") return;
      for (var k = Math.max(0, i - 3); k <= Math.min(rows.length - 1, i + 3); k++) keep[k] = true;
    });
    var skipped = 0;
    function fold() {
      if (!skipped) return;
      box.appendChild(h("div", { class: "writer-diff__fold", text: "⋯ " + plural(skipped, "line") + " the same" }));
      skipped = 0;
    }
    rows.forEach(function (r, i) {
      if (!keep[i]) {
        skipped++;
        return;
      }
      fold();
      box.appendChild(h("div", { class: "writer-diff__line writer-diff__line--" + (r[0] === "+" ? "add" : r[0] === "-" ? "del" : "same") }, [h("span", { class: "writer-diff__mark", "aria-hidden": "true", text: r[0] }), h("span", { class: "sr-only", text: r[0] === "+" ? "Added: " : r[0] === "-" ? "Removed: " : "" }), h("span", { text: r[1] || " " })]));
    });
    fold();
    if (!added && !removed) box.appendChild(h("div", { class: "writer-diff__fold", text: "No differences." }));
    var node = dialog(
      labelA + " → " + labelB,
      [h("p", { class: "writer-dialog__foot" }, [h("span", { class: "writer-diff__stat writer-diff__stat--add", text: "+" + added }), " ", h("span", { class: "writer-diff__stat writer-diff__stat--del", text: "−" + removed }), " lines. Removed lines are what " + labelA.toLowerCase().replace(/^from /, "the version from ") + " had; added lines are what's there now."]), box],
      v
        ? [
            button("Restore this version", "backup-restore", "md-button--primary md-button--sm", function () {
              node.close();
              restoreVersion(v);
            }),
          ]
        : null
    );
    node.classList.add("writer-dialog--wide");
  }

  /* ── Sidebar: the page's outline ── */

  // The body's ## to ###### headings outside code: { level, text, from }
  // with from the start of the heading's line.
  function headingsOf(body) {
    var out = [];
    var at = 0;
    var fence = null;
    lines(body).forEach(function (line) {
      var f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim()) fence = null;
      } else if (f) fence = f[1];
      else {
        var m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
        if (m) out.push({ level: m[1].length, text: m[2].replace(/<[^>]+>|\{[^}]*\}\s*$/g, "").trim(), from: at });
      }
      at += line.length + 1;
    });
    return out;
  }

  // A heading's section: its line to the next heading at its level or above.
  function sectionOf(heads, i) {
    var end = state.body.length;
    for (var k = i + 1; k < heads.length; k++) {
      if (heads[k].level <= heads[i].level) {
        end = heads[k].from;
        break;
      }
    }
    return { from: heads[i].from, to: end };
  }

  // Swaps a section with the one before or after it at the same level,
  // subsections and all.
  function moveSection(i, dir) {
    var heads = headingsOf(state.body);
    var me = heads[i];
    var k = i + dir;
    while (k >= 0 && k < heads.length && heads[k].level > me.level) k += dir;
    if (k < 0 || k >= heads.length || heads[k].level !== me.level) return;
    var first = sectionOf(heads, Math.min(i, k));
    var second = sectionOf(heads, Math.max(i, k));
    var a = state.body.slice(first.from, first.to).replace(/\s+$/, "");
    var b = state.body.slice(second.from, second.to);
    var tail = /\s*$/.exec(b)[0];
    b = b.replace(/\s+$/, "");
    editBody([{ from: first.from, to: second.to, insert: b + "\n\n" + a + tail }]);
    goTo(dir < 0 ? first.from : first.from + b.length + 2);
    toast("Moved “" + me.text + "” " + (dir < 0 ? "up" : "down") + ". Ctrl+Z puts it back.");
  }

  function drawOutline(force) {
    var box = ui.sides && ui.sides.outline;
    if (!box || ui.side !== "outline") return;
    var heads = headingsOf(state.body);
    var head = ui.cm ? ui.cm.state.selection.main.head : 0;
    var active = -1;
    heads.forEach(function (x, i) {
      if (x.from <= head) active = i;
    });
    var sig = active + "|" + heads.map(function (x) {
      return x.level + x.text + ":" + x.from;
    }).join("|") + "|" + wordCount(state.body);
    if (!force && sig === ui.outlineSig) return;
    ui.outlineSig = sig;
    box.innerHTML = "";
    var list = h("div", { class: "writer-outline" });
    if (!heads.length) list.appendChild(h("div", { class: "writer-block__help", text: "No headings yet. Headings (## Section) split the page up, and show here and in the page's table of contents." }));
    var min = Math.min.apply(null, heads.map(function (x) {
      return x.level;
    }).concat([2]));
    heads.forEach(function (x, i) {
      var siblings = function (dir) {
        var k = i + dir;
        while (k >= 0 && k < heads.length && heads[k].level > x.level) k += dir;
        return k >= 0 && k < heads.length && heads[k].level === x.level;
      };
      list.appendChild(
        h("div", { class: "writer-outline__item" + (i === active ? " writer-outline__item--active" : ""), style: "--depth:" + Math.max(0, x.level - min) }, [
          h("button", {
            type: "button",
            class: "writer-outline__link" + (x.level === 1 ? " writer-outline__link--warn" : ""),
            title: x.level === 1 ? "A # heading: the title is the page's only one" : "Go to this heading",
            text: x.text,
            onclick: function () {
              if (ui.view === "preview") setView(wide() ? "split" : "markdown");
              goTo(x.from, x.from);
            },
          }),
          iconButton("arrow-up", "Move this section up", !siblings(-1), function () {
            moveSection(i, -1);
          }),
          iconButton("arrow-down", "Move this section down", !siblings(1), function () {
            moveSection(i, 1);
          }),
        ])
      );
    });
    box.appendChild(list);
    var blocks = readBlocks();
    function count(type) {
      return blocks.filter(function (b) {
        return b.type === type;
      }).length;
    }
    var words = wordCount(state.body);
    var images = (state.body.match(/!\[[^\]]*\]\(/g) || []).length;
    box.appendChild(h("div", { class: "writer-side__group", text: "This page" }));
    box.appendChild(
      h("dl", { class: "writer-stats" }, [
        ["Words", words.toLocaleString("en-GB")],
        ["Reading time", words ? "about " + plural(Math.max(1, Math.round(words / 220)), "minute") : "—"],
        ["Headings", heads.length],
        ["Code blocks", count("code")],
        ["Images", images],
        ["Components", blocks.filter(function (b) { return b.type !== "text" && b.type !== "heading" && b.type !== "code"; }).length],
      ].reduce(function (all, pair) {
        return all.concat([h("dt", { text: pair[0] }), h("dd", { text: String(pair[1]) })]);
      }, []))
    );
  }

  /* ── The line under the Markdown: where the cursor is, how long the page
     is, and when it was last saved ── */

  var footerTicker = null;
  var wordsCache = { body: null, n: 0 };
  function bodyWords() {
    if (wordsCache.body !== state.body) wordsCache = { body: state.body, n: wordCount(state.body) };
    return wordsCache.n;
  }

  function updateFooter() {
    if (!ui.footer) return;
    var parts = [];
    if (ui.cm) {
      var sel = ui.cm.state.selection.main;
      var line = ui.cm.state.doc.lineAt(sel.head);
      parts.push("Ln " + line.number + ", Col " + (sel.head - line.from + 1) + (sel.empty ? "" : " (" + plural(sel.to - sel.from, "character") + " selected)"));
    }
    var words = bodyWords();
    parts.push(plural(words, "word") + (words >= 200 ? " · " + Math.max(1, Math.round(words / 220)) + " min read" : ""));
    ui.footerPos.textContent = parts.join(" · ");
    var saved = hasContent() && state.savedAt && !ui.saveFailed ? "Saved in this browser " + when(state.savedAt) : "";
    ui.footerSaved.textContent = saved;
  }

  /* ── New pages and opened files ── */

  function recipePicker(inDialog, done) {
    var grid = h("div", { class: "writer-recipes" });
    if (!inDialog) {
      grid.appendChild(
        h("div", { class: "writer-recipes__intro" }, [
          h("span", { class: "writer-recipes__title", text: "Start from a recipe" }),
          h("span", { text: "Each lays out a page the way the writing guide recommends, with example text to replace (Tab jumps to the next). Or type a title above and start writing." }),
        ])
      );
    }
    RECIPES.forEach(function (recipe) {
      grid.appendChild(
        h(
          "button",
          {
            type: "button",
            class: "writer-recipe",
            onclick: function () {
              startRecipe(recipe);
              if (done) done();
            },
          },
          [h("span", { class: "writer-recipe__name", text: recipe.name }), h("span", { class: "writer-recipe__text", text: recipe.text })]
        )
      );
    });
    return grid;
  }

  function openRecipes() {
    var node;
    var note = hasContent() ? h("p", { class: "writer-dialog__foot", text: "The page you're writing stays in Drafts, in the sidebar." }) : null;
    node = dialog("Start a new page", [
      note,
      recipePicker(true, function () {
        node.close();
      }),
    ]);
    node.classList.add("writer-dialog--wide");
  }

  function hasContent() {
    return !!(state.meta.title.trim() || state.body.trim());
  }

  // The welcome card over an empty editor, until there's something to edit:
  // the recipes, then the ways in for a page that exists already.
  function updateWelcome() {
    if (!ui.welcome) return;
    var show = !hasContent() && !ui.welcomeDone;
    if (show && !ui.welcome.firstChild) {
      ui.welcome.appendChild(recipePicker(false));
      ui.welcome.appendChild(
        h("div", { class: "writer-welcome__more" }, [
          h("div", { class: "writer-welcome__card" }, [
            h("span", { class: "writer-recipes__title", text: "Change a page that's on the site" }),
            h("span", { text: "Open it here, or select the pencil at the top of the page itself. It opens in a draft of its own." }),
            button("Open a page", "folder-open-outline", "md-button--ghost md-button--sm", openDialog),
          ]),
          h("div", { class: "writer-welcome__card" }, [
            h("span", { class: "writer-recipes__title", text: "Coming from the Azure DevOps wiki?" }),
            h("span", { text: "Paste a page in, from the wiki or from Word: headings, lists, tables, links and screenshots come across, and [[_TOC_]], ::: mermaid and > [!NOTE] turn into this site's syntax." }),
            button("What's different here", "help-circle-outline", "md-button--ghost md-button--sm", openHelp),
          ]),
        ])
      );
    }
    ui.welcome.hidden = !show;
  }

  function startRecipe(recipe) {
    var was = hasContent() || hasAssets() ? state.id : "";
    var id = takeDraft();
    state = newState(Object.assign(emptyMeta(), copy(recipe.meta || {})), "", id);
    state.meta.at = { folder: folderPath(), assets: assetDir() };
    storeAllAssets();
    loadPage();
    if (keptNote(was, id)) toast(keptNote(was, id).trim());
    ui.welcomeDone = true;
    var template = recipe.md.join("\n");
    if (template) {
      addHints(template);
      if (ui.cm) window.CM.snippet(template)(ui.cm, null, 0, 0);
      else editBody([{ from: 0, to: 0, insert: snippetText(template) }]);
    }
    updateWelcome();
    changed();
    ui.title.focus();
  }

  // Empties the page, settings and all; the toast's Undo puts it back.
  function clearPage() {
    if (!hasContent() && !hasAssets()) return;
    var before = state;
    closeForm(false);
    state = newState(emptyMeta(), "", before.id);
    state.meta.at = { folder: folderPath(), assets: assetDir() };
    storeAllAssets();
    loadPage();
    ui.welcomeDone = false;
    updateWelcome();
    changed();
    toast("Page cleared.", "Undo", function () {
      closeForm(false);
      state = before;
      storeAllAssets();
      loadPage();
      changed();
    });
  }

  function openFile(file) {
    if (/\.zip$/i.test(file.name)) {
      openBundle(file);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var matches = data.pages.filter(function (p) {
        return p.src.split("/").pop() === file.name;
      });
      var page = matches.length === 1 ? matches[0] : null;
      openMarkdown(String(reader.result), { name: file.name, page: page });
    };
    reader.readAsText(file);
  }

  // A page's Markdown, in a draft of its own. source: { name, the file's
  // name; page, the site's page it is, if known; site, true when it came
  // from the site itself }. A page from an Azure DevOps wiki is turned into
  // this site's syntax, and takes its title from its file name as the wiki
  // does.
  function openMarkdown(text, source) {
    var C = convert();
    var notes = [];
    var stem = source.name.replace(/\.(md|markdown)$/i, "");
    var adoTitle = "";
    text = lines(text).join("\n");
    var opened = text;
    if (!source.site && C && C.looksLikeAdo(text)) {
      var res = C.fromAdo(text, { link: wikiLink });
      text = res.md;
      notes = res.notes;
      adoTitle = wikiTitle(stem);
      var first = /^\s*#\s+(.+?)\s*$/m.exec(text.replace(/^---\n[\s\S]*?\n---\n/, ""));
      if (!(first && first.index === text.replace(/^---\n[\s\S]*?\n---\n/, "").search(/\S/) && first[1].toLowerCase() === adoTitle.toLowerCase())) text = C.demoteHeadings(text);
      else adoTitle = "";
    }
    var was = hasContent() || hasAssets() ? state.id : "";
    var id = takeDraft();
    var doc = parseDocument(text);
    state = newState(doc.meta, doc.body, id);
    if (adoTitle) state.meta.title = adoTitle;
    state.meta.mode = source.page ? "update" : adoTitle ? "new" : "update";
    if (source.page) placePage(dirname(source.page.src), source.page.src.split("/").pop().replace(/\.md$/, ""));
    else {
      state.meta.slug = adoTitle ? slugify(adoTitle) : slugify(stem) || stem;
      state.meta.slugEdited = true;
    }
    // Its images are already on the site, flat in docs/images/ for older
    // pages; they stay where they are. New ones go in the page's folders.
    state.meta.at = { folder: folderPath(), assets: assetDir() };
    storeAllAssets();
    loadPage();
    // The page as it was opened, to compare with before it's published.
    state.meta.original = toMarkdown();
    if (source.page) rememberBase("docs/" + source.page.src, opened);
    ui.welcomeDone = true;
    changed();
    var where = source.page ? " from docs/" + source.page.src + "." : adoTitle ? ". Choose the folder it goes in, under Page settings." : ". Check the folder it belongs in, under Page settings.";
    toast("Opened " + (source.site ? "“" + state.meta.title + "”" : source.name) + where + (notes.length ? " From the Azure DevOps wiki: " + notes.join("; ") + "." : "") + keptNote(was, id), source.page || adoTitle ? null : "Page settings", function () {
      openSide("page");
    });
  }

  // The page's file as it was opened, hashed: the bundle sends it as
  // base_sha256, and the ingest pipeline refuses the change if the file in
  // the repository isn't that one any more (someone else changed it since).
  function rememberBase(path, text) {
    var id = state.id;
    sha256(utf8(lines(text).join("\n"))).then(function (hash) {
      if (state.id !== id) return;
      state.meta.base = { path: path, sha256: hash };
      save();
    });
  }

  // "Set-up-billing" → "Set up billing": the wiki writes spaces in a page's
  // name as hyphens, and a hyphen as %2D.
  function wikiTitle(stem) {
    var text = stem.replace(/-/g, " ");
    try {
      text = decodeURIComponent(text);
    } catch (e) {
      // A stray %: keep it as it is.
    }
    return text.trim();
  }

  // A link written for the wiki, /Folder/Page-name, to one of this site's
  // pages with that name, when there's exactly one.
  function wikiLink(href) {
    var parts = splitHash(href);
    var last = parts[0].replace(/\/+$/, "").split("/").pop().replace(/\.md$/i, "");
    if (!last) return null;
    var want = slugify(wikiTitle(last));
    var found = data.pages.filter(function (p) {
      var stem = p.src.split("/").pop().replace(/\.md$/, "");
      return stem === want || slugify(p.title) === want;
    });
    return found.length === 1 ? relPath(folderPath(), found[0].src) + parts[1] : null;
  }

  // One of the site's pages, from its source (hooks/writer.py publishes
  // them under _writer/src/). An earlier draft of the same page is offered
  // back first, so nothing is written over.
  function openSitePage(src, fresh) {
    var page = null;
    for (var i = 0; i < data.pages.length; i++) if (data.pages[i].src === src) page = data.pages[i];
    if (!page) {
      toast("There's no page " + src + " on the site to open.");
      return;
    }
    if (!fresh) {
      var ix = readIndex();
      var existing = ix.list.filter(function (e) {
        return e.path === "docs/" + src;
      }).sort(function (a, b) {
        return (b.updated || 0) - (a.updated || 0);
      })[0];
      if (existing) {
        if (existing.id !== state.id) switchDraft(existing.id);
        toast("You already have a draft of “" + page.title + "”, from " + when(existing.updated) + ". Carrying on with it.", "Start again from the site", function () {
          openSitePage(src, true);
        });
        return;
      }
    }
    if (!data.sources) {
      toast("This site doesn't publish its pages' Markdown, so open " + src.split("/").pop() + " from your copy of the repository instead.");
      return;
    }
    fetch(BASE + "_writer/src/" + src.split("/").map(encodeURIComponent).join("/"), { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error(response.status + " " + response.statusText);
        return response.text();
      })
      .then(
        function (text) {
          openMarkdown(text, { name: src.split("/").pop(), page: page, site: true });
        },
        function (e) {
          toast("Couldn't load " + src + " (" + String((e && e.message) || e) + "). Open the .md file from the repository instead.");
        }
      );
  }

  // Shows the page in state: a new, opened or loaded one.
  function loadPage() {
    blockCache = { body: null, blocks: [] };
    state.body = lines(state.body).join("\n");
    if (ui.cm) ui.cm.setState(window.CM.EditorState.create({ doc: state.body, extensions: ui.extensions }));
    else if (ui.textarea) ui.textarea.value = state.body;
    if (ui.title) ui.title.value = state.meta.title;
    ui.lastActive = null;
    drawSetup();
    drawAssets(true);
    updateTitleBar();
    updateWelcome();
    followPublish();
  }

  function addHints(template) {
    var hints = state.meta.hints || (state.meta.hints = []);
    snippetHints(template).forEach(function (hint) {
      if (hints.indexOf(hint) < 0) hints.push(hint);
    });
    if (hints.length > 300) hints.splice(0, hints.length - 300);
  }

  /* ── Changing the Markdown ── */

  // changes: [{ from, to, insert }] in the body, as it is now.
  function editBody(changes) {
    if (ui.cm) {
      ui.cm.dispatch({ changes: changes });
      return;
    }
    var body = state.body;
    changes
      .slice()
      .sort(function (a, b) {
        return b.from - a.from;
      })
      .forEach(function (c) {
        body = body.slice(0, c.from) + (c.insert || "") + body.slice(c.to == null ? c.from : c.to);
      });
    state.body = body;
    if (ui.textarea) ui.textarea.value = body;
    scheduleRender();
  }

  // The editor, as the formatting tools expect a textarea to be.
  function editorArea() {
    if (ui.textarea || !ui.cm) return ui.textarea;
    var view = ui.cm;
    return {
      cm: view,
      get value() {
        return view.state.doc.toString();
      },
      get selectionStart() {
        return view.state.selection.main.from;
      },
      get selectionEnd() {
        return view.state.selection.main.to;
      },
      setSelectionRange: function (from, to) {
        view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
      },
      focus: function () {
        view.focus();
      },
    };
  }

  function goTo(from, to) {
    if (ui.cm) {
      ui.cm.dispatch({ selection: { anchor: from, head: to == null ? from : to }, effects: window.CM.EditorView.scrollIntoView(from, { y: "center" }) });
      ui.cm.focus();
    } else if (ui.textarea) {
      ui.textarea.focus();
      ui.textarea.setSelectionRange(from, to == null ? from : to);
    }
  }

  // Lines of the body: { from, to, text, number } like CodeMirror's.
  function lineAt(pos) {
    var body = state.body;
    var from = body.lastIndexOf("\n", pos - 1) + 1;
    var to = body.indexOf("\n", pos);
    if (to < 0) to = body.length;
    return { from: from, to: to, text: body.slice(from, to) };
  }

  // The component, or the paragraph, a position is in.
  function unitAt(pos) {
    var b = blockAt(pos);
    if (b && b.type !== "text") return { from: b.from, to: b.to };
    var line = lineAt(pos);
    var first = line;
    var last = line;
    var body = state.body;
    while (first.from > 0) {
      var prev = lineAt(first.from - 1);
      if (!prev.text.trim()) break;
      first = prev;
    }
    while (last.to < body.length) {
      var next = lineAt(last.to + 1);
      if (!next.text.trim()) break;
      last = next;
    }
    return { from: first.from, to: last.to };
  }

  // Where a component goes: after what the cursor is in, or right there on
  // an empty line. With drop, before or after, whichever half it's over.
  function insertionPoint(pos, drop) {
    var line = lineAt(pos);
    if (!line.text.trim()) return line.from;
    var unit = unitAt(pos);
    if (!drop) return unit.to;
    var before = state.body.slice(unit.from, line.from).split("\n").length;
    var after = state.body.slice(line.to, unit.to).split("\n").length;
    return before <= after ? unit.from : unit.to;
  }

  function insertNeed(n, pos, dropped) {
    if (n.type === "image" && !dropped) {
      pickImage(function (name) {
        insertSnippet(snippetFor(n, imageRel(name)), pos);
      });
      return;
    }
    var at = insertSnippet(snippetFor(n), pos);
    // Dropped: there was no click to open a file picker with. The form has
    // an Upload button.
    if (n.type === "image" && at != null) {
      var b = blockAt(at);
      if (b && b.type === "image") openForm(b);
    }
  }

  // Inserts a snippet as a block of its own, with an empty line either
  // side. pos: a line boundary from insertionPoint(), or null for after
  // the cursor. Returns where it went.
  function insertSnippet(template, pos) {
    addHints(template);
    ui.welcomeDone = true;
    updateWelcome();
    if (pos == null) {
      var head = ui.cm ? ui.cm.state.selection.main.head : ui.textarea ? ui.textarea.selectionStart : state.body.length;
      pos = insertionPoint(head, false);
    }
    var before = state.body.slice(0, pos);
    var after = state.body.slice(pos);
    var pre = !before || /\n\n$/.test(before) ? "" : /\n$/.test(before) ? "\n" : "\n\n";
    var post = !after || /^\n\n/.test(after) ? "" : /^\n/.test(after) ? "\n" : "\n\n";
    var at = pos + pre.length;
    if (ui.cm) {
      // The gap first, so the snippet starts on a line with no indent.
      ui.cm.dispatch({ changes: { from: pos, insert: pre + post }, selection: { anchor: at } });
      window.CM.snippet(template)(ui.cm, null, at, at);
      ui.cm.focus();
    } else {
      editBody([{ from: pos, to: pos, insert: pre + snippetText(template) + post }]);
      if (ui.textarea) ui.textarea.focus();
    }
    changed();
    return at;
  }

  /* ── The editor (CodeMirror) ── */

  function createEditor() {
    var CM = window.CM;
    if (!CM || !ui.root || !ui.root.isConnected) {
      if (!CM) fallbackEditor();
      return;
    }
    ui.extensions = editorExtensions(CM);
    ui.editorHost.innerHTML = "";
    ui.cm = new CM.EditorView({
      parent: ui.editorHost,
      state: CM.EditorState.create({ doc: state.body, extensions: ui.extensions }),
    });
    ui.cm.scrollDOM.addEventListener("scroll", syncScroll, { passive: true });
    drawAssets(true);
    render();
  }

  // Without CodeMirror (it didn't load): a plain textarea still works.
  function fallbackEditor() {
    if (!ui.editorHost || ui.cm) return;
    ui.editorHost.innerHTML = "";
    ui.textarea = h("textarea", {
      class: "writer-input writer-textarea writer-editor__fallback",
      spellcheck: "true",
      "aria-label": "Page Markdown",
      value: state.body,
      oninput: function () {
        state.body = ui.textarea.value;
        scheduleRender();
      },
    });
    ui.editorHost.appendChild(ui.textarea);
    ui.editorHost.appendChild(h("p", { class: "writer-note writer-note--warn", text: "The editor didn't load, so this is plain text: no colours or suggestions. Reload the page to try again." }));
  }

  function editorExtensions(CM) {
    return [
      CM.lineNumbers(),
      // Sections fold away under their heading, for long pages.
      CM.foldGutter({ openText: "▾", closedText: "▸" }),
      CM.highlightActiveLineGutter(),
      CM.highlightSpecialChars(),
      CM.history(),
      CM.drawSelection(),
      CM.EditorState.tabSize.of(4),
      CM.indentUnit.of("    "),
      CM.indentOnInput(),
      CM.closeBrackets(),
      CM.markdownLanguage.data.of({ closeBrackets: { brackets: ["(", "[", "{"] } }),
      CM.rectangularSelection(),
      CM.highlightActiveLine(),
      CM.highlightSelectionMatches(),
      CM.EditorView.lineWrapping,
      CM.markdown({ base: CM.markdownLanguage, codeLanguages: CM.codeLanguages }),
      CM.syntaxHighlighting(highlightStyle(CM)),
      // Tab takes the highlighted suggestion, ahead of the snippet's next
      // field and indenting; with no list open it does those as before.
      CM.Prec.highest(CM.keymap.of([{ key: "Tab", run: CM.acceptCompletion }])),
      CM.autocompletion({ override: completionSources(CM), icons: false, addToOptions: [{ render: completionIcon, position: 20 }], activateOnTyping: true, closeOnBlur: true, maxRenderedOptions: 60 }),
      CM.linter(lintSource, { delay: 400 }),
      CM.lintGutter(),
      CM.search({ top: true }),
      CM.placeholder("Write in Markdown. Type / for a component, or drag one in from the sidebar."),
      componentField(CM),
      dropField(CM),
      pymdownMarks(CM),
      CM.Prec.high(CM.keymap.of(writerKeys(CM))),
      CM.keymap.of([].concat(CM.closeBracketsKeymap, CM.searchKeymap, CM.historyKeymap, CM.foldKeymap, CM.lintKeymap, CM.defaultKeymap, [CM.indentWithTab])),
      CM.EditorView.updateListener.of(onEditorUpdate),
      CM.EditorView.domEventHandlers(editorEvents(CM)),
      CM.EditorView.contentAttributes.of({ "aria-label": "Page Markdown", spellcheck: "true", autocorrect: "off" }),
    ];
  }

  function writerKeys(CM) {
    // A toolbar button's action, by its icon.
    function tool(name) {
      return function () {
        for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].icon === name) TOOLS[i].run(editorArea());
        return true;
      };
    }
    function heading(level) {
      return function () {
        setHeading(level)(editorArea());
        return true;
      };
    }
    return [
      { key: "Mod-b", run: tool("format-bold") },
      { key: "Mod-i", run: tool("format-italic") },
      { key: "Mod-e", run: tool("code-tags") },
      { key: "Mod-k", run: tool("link-variant") },
      { key: "Mod-Shift-x", run: tool("format-strikethrough-variant") },
      { key: "Mod-Shift-h", run: tool("format-color-highlight") },
      { key: "Mod-Shift-7", run: tool("format-list-numbered") },
      { key: "Mod-Shift-8", run: tool("format-list-bulleted") },
      { key: "Mod-Shift-9", run: tool("format-list-checks") },
      { key: "Mod-Alt-0", run: heading(0) },
      { key: "Mod-Alt-2", run: heading(2) },
      { key: "Mod-Alt-3", run: heading(3) },
      { key: "Mod-Alt-4", run: heading(4) },
      { key: "Tab", run: tableTab(1) },
      { key: "Shift-Tab", run: tableTab(-1) },
      {
        key: "Mod-.",
        run: function (view) {
          var b = blockAt(view.state.selection.main.head);
          if (ui.form && b && ui.form.from === b.from) closeForm(true);
          else if (b && b.type !== "text") openForm(b);
          else toast("Put the cursor in a component, such as steps, a callout or tabs, to edit it in a form.");
          return true;
        },
      },
      {
        key: "Escape",
        run: function () {
          if (ui.form) {
            closeForm(true);
            return true;
          }
          return false;
        },
      },
      // Ahead of CodeMirror's own Ctrl+/, which comments a line out.
      {
        key: "Mod-/",
        run: function () {
          openHelp();
          return true;
        },
      },
    ];
  }

  /* Tables in the Markdown: Tab and Shift+Tab go from cell to cell and
     line the columns up; Tab in the last cell adds a row. */

  // The table the cursor is in: { from, to, first, rows, align, ind, row,
  // col }, row and col being the cell's (the separator line isn't a row).
  function tableAt(st, pos) {
    var line = st.doc.lineAt(pos);
    if (!/^\s*\|/.test(line.text) || inFence(st.doc, pos)) return null;
    var first = line.number;
    var last = line.number;
    while (first > 1 && /^\s*\|/.test(st.doc.line(first - 1).text)) first--;
    while (last < st.doc.lines && /^\s*\|/.test(st.doc.line(last + 1).text)) last++;
    if (last === first || !RE.tableSep.test(st.doc.line(first + 1).text)) return null;
    var ls = [];
    for (var n = first; n <= last; n++) ls.push(st.doc.line(n).text);
    var ind = /^\s*/.exec(ls[0])[0];
    var align = splitRow(ls[1]).map(function (c) {
      var l = c[0] === ":";
      var r = c[c.length - 1] === ":";
      return l && r ? "center" : r ? "right" : l ? "left" : "";
    });
    var rows = [ls[0]].concat(ls.slice(2)).map(splitRow);
    var cols = Math.max.apply(null, rows.map(function (r) {
      return r.length;
    }));
    rows.forEach(function (r) {
      while (r.length < cols) r.push("");
    });
    var before = line.text.slice(0, pos - line.from).replace(/\\\|/g, "");
    var col = Math.max(0, Math.min(cols - 1, (before.match(/\|/g) || []).length - 1));
    var row = line.number - first;
    row = row === 0 ? 0 : Math.max(1, row - 1);
    return { from: st.doc.line(first).from, to: st.doc.line(last).to, rows: rows, align: align, ind: ind, row: row, col: col };
  }

  // The table's lines, and where each cell's text starts and ends in them.
  function layoutTable(t) {
    var text = TYPES.table.md({ rows: t.rows, align: t.align });
    var out = lines(text).map(function (l) {
      return t.ind + l;
    });
    var cells = [];
    var at = 0;
    out.forEach(function (l, i) {
      if (i !== 1) {
        var spots = [];
        var re = /(^|[^\\])\|/g;
        var m;
        var pipes = [];
        while ((m = re.exec(l))) pipes.push(m.index + m[1].length);
        for (var k = 0; k + 1 < pipes.length; k++) {
          var inner = l.slice(pipes[k] + 1, pipes[k + 1]);
          var lead = inner.length - inner.replace(/^\s+/, "").length;
          var body = inner.trim();
          // An empty cell: just after the space that follows its |.
          var from = at + pipes[k] + 1 + (body ? lead : Math.min(1, inner.length));
          spots.push({ from: from, to: from + body.length });
        }
        cells.push(spots);
      }
      at += l.length + 1;
    });
    return { text: out.join("\n"), cells: cells };
  }

  function tableTab(dir) {
    return function (view) {
      var st = view.state;
      var sel = st.selection.main;
      if (st.doc.lineAt(sel.from).number !== st.doc.lineAt(sel.to).number) return false;
      var t = tableAt(st, sel.head);
      if (!t) return false;
      var row = t.row;
      var col = t.col + dir;
      var cols = t.rows[0].length;
      if (col >= cols) {
        col = 0;
        row++;
      } else if (col < 0) {
        col = cols - 1;
        row--;
      }
      if (row < 0) {
        row = 0;
        col = 0;
      }
      if (row >= t.rows.length) t.rows.push(t.rows[0].map(function () { return ""; }));
      var laid = layoutTable(t);
      var spot = laid.cells[row][col];
      view.dispatch({ changes: { from: t.from, to: t.to, insert: laid.text }, selection: { anchor: t.from + spot.from, head: t.from + spot.to }, scrollIntoView: true, userEvent: "input" });
      return true;
    };
  }

  // Lines the columns of the table at the cursor up, from the palette.
  function formatTableAt() {
    if (!ui.cm) return;
    var st = ui.cm.state;
    var t = tableAt(st, st.selection.main.head);
    if (!t) {
      toast("Put the cursor in a table first.");
      return;
    }
    var laid = layoutTable(t);
    var spot = laid.cells[t.row][t.col];
    ui.cm.dispatch({ changes: { from: t.from, to: t.to, insert: laid.text }, selection: { anchor: t.from + spot.to } });
    ui.cm.focus();
  }

  // Anywhere in the writer: save, the shortcuts, and the command palette.
  function globalKeys(event) {
    if (event.defaultPrevented) return;
    var mod = event.ctrlKey || event.metaKey;
    var key = event.key.toLowerCase();
    if (mod && !event.altKey && !event.shiftKey && key === "s") {
      event.preventDefault();
      flushSave();
      toast(ui.saveFailed ? "Couldn't save in this browser: download the bundle to keep this page." : "Saved in this browser. When the page is ready, Add to site says how to publish it.");
    } else if (mod && !event.altKey && key === "/") {
      event.preventDefault();
      openHelp();
    } else if ((mod && event.shiftKey && key === "p") || (event.key === "F1" && !mod)) {
      event.preventDefault();
      openPalette();
    }
  }

  // Beside a suggestion's name: a callout's own icon and colour, or a
  // component's icon from the sidebar.
  function completionIcon(completion) {
    var need = completion.need;
    var kind = completion.callout || (need && need.type === "callout" && need.preset && need.preset.kind);
    if (kind) return h("span", { class: "writer-callout-icon writer-callout-icon--" + kind, "aria-hidden": "true" });
    if (need) return h("span", { class: "writer-completion-icon" }, [icon(TYPES[need.type].icon)]);
    return null;
  }

  function onEditorUpdate(u) {
    if (u.docChanged) {
      state.body = u.state.doc.toString();
      if (ui.form && !ui.form.writing) formFollow(u);
      if (hasContent() && !ui.welcomeDone) {
        ui.welcomeDone = true;
        updateWelcome();
      }
      scheduleRender();
    }
    if (u.docChanged || u.selectionSet) {
      var b = blockAt(u.state.selection.main.head);
      setActive(b ? b.id : null);
      updateFooter();
      if (!u.docChanged) drawOutline();
    }
  }

  // Colours from the site's own code palette (themes.css), through the
  // --writer-cm-* variables in writer.css, so all six themes carry over.
  function highlightStyle(CM) {
    var t = CM.tags;
    function v(name) {
      return "var(--writer-cm-" + name + ")";
    }
    return CM.HighlightStyle.define([
      { tag: t.heading1, color: v("heading"), fontWeight: "700", fontSize: "1.15em" },
      { tag: t.heading2, color: v("heading"), fontWeight: "700", fontSize: "1.08em" },
      { tag: [t.heading3, t.heading4, t.heading5, t.heading6], color: v("heading"), fontWeight: "700" },
      { tag: t.strong, fontWeight: "700", color: v("strong") },
      { tag: t.emphasis, fontStyle: "italic" },
      { tag: t.strikethrough, textDecoration: "line-through" },
      { tag: t.link, color: v("link") },
      { tag: t.url, color: v("url"), textDecoration: "underline", textDecorationColor: "color-mix(in srgb, currentColor 35%, transparent)" },
      { tag: t.monospace, color: v("code"), fontFamily: "var(--md-code-font-family)" },
      { tag: t.quote, color: v("quote"), fontStyle: "italic" },
      { tag: [t.processingInstruction, t.contentSeparator, t.labelName], color: v("mark") },
      { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.modifier, t.operatorKeyword], color: "var(--md-code-hl-keyword-color)" },
      { tag: [t.string, t.special(t.string), t.regexp, t.attributeValue, t.inserted], color: "var(--md-code-hl-string-color)" },
      { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--md-code-hl-comment-color)", fontStyle: "italic" },
      { tag: [t.number, t.integer, t.float, t.unit], color: "var(--md-code-hl-number-color)" },
      { tag: [t.bool, t.null, t.atom, t.self, t.constant(t.variableName)], color: "var(--md-code-hl-constant-color)" },
      { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName, t.attributeName], color: "var(--md-code-hl-function-color)" },
      { tag: [t.propertyName, t.definition(t.propertyName), t.tagName, t.typeName, t.className, t.namespace], color: "var(--md-code-hl-keyword-color)" },
      { tag: [t.variableName, t.definition(t.variableName)], color: "var(--md-code-hl-variable-color)" },
      { tag: [t.operator, t.punctuation, t.bracket, t.angleBracket, t.separator], color: "var(--md-code-hl-punctuation-color)" },
      { tag: [t.meta, t.escape, t.character, t.changed], color: "var(--md-code-hl-special-color)" },
      { tag: t.deleted, color: "var(--md-code-hl-number-color)" },
      { tag: t.invalid, color: "var(--writer-warn)" },
    ]);
  }

  /* Components in the editor: a tint down the side of each one, and on the
     one the cursor is in, a button that opens its form. */

  function ChipWidget(label) {
    this.label = label;
  }

  function componentField(CM) {
    ChipWidget.prototype = Object.create(CM.WidgetType.prototype);
    ChipWidget.prototype.constructor = ChipWidget;
    ChipWidget.prototype.eq = function (other) {
      return other.label === this.label;
    };
    ChipWidget.prototype.toDOM = function () {
      var node = h("button", { type: "button", class: "cm-writer-chip", title: "Edit this " + this.label.toLowerCase() + " in a form (Ctrl+.)", tabindex: "-1" }, [icon("text-box-edit-outline"), h("span", { text: "Edit " + this.label })]);
      node.addEventListener("mousedown", function (event) {
        event.preventDefault();
      });
      node.addEventListener("click", function (event) {
        event.preventDefault();
        var view = ui.cm;
        var b = view && blockAt(view.posAtDOM(node));
        if (b && b.type !== "text") openForm(b);
      });
      return node;
    };
    ChipWidget.prototype.ignoreEvent = function () {
      return true;
    };

    function build(st) {
      var doc = st.doc;
      var body = doc.toString();
      var head = st.selection.main.head;
      var ranges = [];
      blocksOf(body).forEach(function (b) {
        if (b.type === "text") return;
        var active = head >= b.from && head <= b.to;
        var first = doc.lineAt(b.from).number;
        var last = doc.lineAt(b.to).number;
        for (var n = first; n <= last; n++) {
          var cls = "cm-comp" + (active ? " cm-comp--active" : "") + (n === first ? " cm-comp--first" : "") + (n === last ? " cm-comp--last" : "");
          ranges.push(CM.Decoration.line({ class: cls }).range(doc.line(n).from));
        }
        if (active) ranges.push(CM.Decoration.widget({ widget: new ChipWidget(TYPES[b.type].label), side: -1 }).range(b.from));
      });
      return CM.Decoration.set(ranges, true);
    }
    return CM.StateField.define({
      create: build,
      update: function (deco, tr) {
        return tr.docChanged || tr.selection ? build(tr.state) : deco;
      },
      provide: function (f) {
        return CM.EditorView.decorations.from(f);
      },
    });
  }

  // Where a dragged component will land: a line across the editor.
  var setDrop = null;
  function dropField(CM) {
    setDrop = CM.StateEffect.define();
    return CM.StateField.define({
      create: function () {
        return CM.Decoration.none;
      },
      update: function (deco, tr) {
        deco = deco.map(tr.changes);
        tr.effects.forEach(function (e) {
          if (!e.is(setDrop)) return;
          if (e.value == null) deco = CM.Decoration.none;
          else {
            var line = tr.state.doc.lineAt(e.value);
            var before = e.value === line.from;
            deco = CM.Decoration.set([CM.Decoration.line({ class: before ? "cm-drop-before" : "cm-drop-after" }).range(line.from)]);
          }
        });
        return deco;
      },
      provide: function (f) {
        return CM.EditorView.decorations.from(f);
      },
    });
  }

  // Colours for the pymdownx syntax the Markdown grammar doesn't know:
  // callout and tab lines, { attribute lists }, ++keys++ and <placeholders>.
  function pymdownMarks(CM) {
    var deco = {
      admonition: CM.Decoration.mark({ class: "cm-pm-admonition" }),
      tab: CM.Decoration.mark({ class: "cm-pm-tab" }),
      attr: CM.Decoration.mark({ class: "cm-pm-attr" }),
      keys: CM.Decoration.mark({ class: "cm-pm-keys" }),
      placeholder: CM.Decoration.mark({ class: "cm-pm-placeholder" }),
      def: CM.Decoration.mark({ class: "cm-pm-def" }),
    };
    var matcher = new CM.MatchDecorator({
      regexp: /^\s*(?:!!!|\?\?\?\+?)\s+[\w-]+(?:\s+"[^"]*")?|^\s*===\+?\s+"[^"]*"|\{\s*[.#:][^{}\n]*\}|\{\s*[\w-]+="[^"\n]*"\s*\}|\+\+[\w-]+(?:\+[\w-]+)*\+\+|<[a-z0-9][a-z0-9._-]*>|^\s*:\s{3}/gi,
      decorate: function (add, from, to, match) {
        var text = match[0];
        var trimmed = text.trim();
        var kind = /^(!!!|\?\?\?)/.test(trimmed) ? "admonition" : /^===/.test(trimmed) ? "tab" : trimmed[0] === "{" ? "attr" : /^\+\+/.test(trimmed) ? "keys" : trimmed[0] === ":" ? "def" : "placeholder";
        if (kind === "placeholder" && HTML_TAGS.test(trimmed.slice(1, -1).toLowerCase())) return;
        var start = from + (text.length - text.replace(/^\s+/, "").length);
        if (start < to) add(start, to, deco[kind]);
      },
    });
    return CM.ViewPlugin.fromClass(
      function (view) {
        this.decorations = matcher.createDeco(view);
        this.update = function (u) {
          this.decorations = matcher.updateDeco(u, this.decorations);
        };
      },
      {
        decorations: function (plugin) {
          return plugin.decorations;
        },
      }
    );
  }

  function editorEvents(CM) {
    function hasType(event, type) {
      return event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types, type) >= 0;
    }
    function ours(event) {
      return hasType(event, "application/x-writer-component") || hasType(event, "application/x-writer-asset");
    }
    function posOf(view, event) {
      var pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      return pos == null ? view.state.doc.length : pos;
    }
    function clearDrop(view) {
      if (setDrop) view.dispatch({ effects: setDrop.of(null) });
    }
    return {
      dragover: function (event, view) {
        if (!ours(event)) return false;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        var at = hasType(event, "application/x-writer-component") ? insertionPoint(posOf(view, event), true) : posOf(view, event);
        if (at !== ui.dropAt) {
          ui.dropAt = at;
          view.dispatch({ effects: setDrop.of(at) });
        }
        return true;
      },
      dragleave: function (event, view) {
        if (event.relatedTarget && view.dom.contains(event.relatedTarget)) return false;
        ui.dropAt = null;
        clearDrop(view);
        return false;
      },
      drop: function (event, view) {
        var dt = event.dataTransfer;
        ui.dropAt = null;
        clearDrop(view);
        if (!dt) return false;
        var pos = posOf(view, event);
        var comp = dt.getData("application/x-writer-component");
        if (comp !== "" && NEEDS[+comp]) {
          event.preventDefault();
          insertNeed(NEEDS[+comp], insertionPoint(pos, true), true);
          return true;
        }
        var asset = dt.getData("application/x-writer-asset");
        if (asset) {
          event.preventDefault();
          var kind = asset.split("/")[0];
          var name = asset.slice(kind.length + 1);
          if (kind === "images") insertSnippet("![#{Describe what the image shows}](" + imageRel(name) + ")", insertionPoint(pos, true));
          else {
            view.dispatch({ changes: { from: pos, insert: assetMarkdown(kind, name) }, selection: { anchor: pos + assetMarkdown(kind, name).length } });
            view.focus();
          }
          return true;
        }
        var files = Array.prototype.slice.call((dt.files) || []);
        if (!files.length) return false;
        event.preventDefault();
        if (files.length === 1 && /\.(md|markdown|zip)$/i.test(files[0].name)) {
          openFile(files[0]);
          return true;
        }
        dropFiles(files, pos);
        return true;
      },
      paste: onPaste,
    };
  }

  // Images and files dropped on the Markdown, one or many: each shown or
  // linked where they were dropped, unless the page already pointed at it
  // in a wiki's .attachments folder.
  function dropFiles(files, pos) {
    var skipped = [];
    files.forEach(function (file) {
      if (/^image\//.test(file.type)) {
        addImageFile(file, function (name, linked) {
          if (!linked) insertSnippet("![#{Describe what the image shows}](" + imageRel(name) + ")", insertionPoint(Math.min(pos, state.body.length), true));
        });
      } else if (FILE_TYPES[extOf(file.name)]) {
        addAttachment(file, function (name, linked) {
          if (linked) return;
          var at = Math.min(pos, state.body.length);
          editBody([{ from: at, to: at, insert: assetMarkdown("files", name) }]);
        });
      } else skipped.push(file.name);
    });
    if (skipped.length) toast("Can't use " + skipped.join(", ") + ". Drop images (PNG, JPEG, GIF, WebP or SVG), files for readers to download (" + FILE_KINDS + "), or one .md or bundle to open.");
  }

  /* ── Pasting ──
     Formatted text (Word, Outlook, Teams, web pages, the Azure DevOps wiki,
     Confluence, Excel) comes in as Markdown; a web address as a link; cells
     copied as text as a table; Markdown from the Azure DevOps wiki in this
     site's syntax; and a whole page, into an empty draft, as the page. The
     toast after each offers the text as it was. Ctrl+Shift+V pastes plain
     text, and anything pasted into code stays as it is. */

  function convert() {
    return window.docsWriterConvert || null;
  }

  // What an address on this site points at: { page, path, hash } for one of
  // its pages, { path } for an image or file in docs/. null for elsewhere.
  function sitePath(href) {
    var abs;
    var base;
    try {
      abs = new URL(href, location.href);
      base = new URL(BASE, location.href);
    } catch (e) {
      return null;
    }
    if (abs.origin !== base.origin || abs.pathname.indexOf(base.pathname) !== 0) return null;
    var rest = abs.pathname.slice(base.pathname.length);
    try {
      rest = decodeURIComponent(rest);
    } catch (e) {
      return null;
    }
    rest = rest.replace(/(^|\/)index\.html$/, "$1");
    for (var i = 0; i < data.pages.length; i++) {
      var p = data.pages[i];
      if (p.url === rest || p.url === rest + "/") return { page: p, path: p.src, hash: abs.hash };
    }
    if ((data.files || []).indexOf(rest) >= 0) return { path: rest, hash: "" };
    return null;
  }

  // A link in something pasted: to one of the site's pages, written as a
  // path to its .md file, with the page's title in case the text is only
  // the address. A page in an Azure DevOps wiki goes to the site's page of
  // the same name, if there's one.
  function pastedLink(href) {
    var found = sitePath(href);
    if (found) return { href: relPath(folderPath(), found.path) + (found.hash || ""), title: found.page ? found.page.title : "" };
    var wiki = /\/_wiki\/wikis\/[^?#]*?\/([^/?#]+)(?:[?#].*)?$/.exec(href);
    var mapped = wiki && wikiLink("/" + wiki[1]);
    if (mapped) {
      var target = joinPath(folderPath(), splitHash(mapped)[0]);
      var page = data.pages.filter(function (p) {
        return p.src === target;
      })[0];
      return { href: mapped, title: page ? page.title : "" };
    }
    return null;
  }

  // An image in pasted HTML: one on the site stays there; one the clipboard
  // holds (data:) comes with the page; one on the web is left where it is.
  // null when it can't be copied, like Word's file: pictures.
  function pastedImage(src) {
    var found = sitePath(src);
    if (found) return relPath(folderPath(), found.path);
    if (/^data:image\//i.test(src)) {
      var blob = dataUrlBlob(src);
      if (!blob || blob.size > IMAGE_MAX) return null;
      var ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/\+.*/, "");
      if (!IMAGE_TYPES[ext]) return null;
      var name = uniqueName("images", slug() + "-pasted." + ext);
      addAsset("images", name, blob);
      return imageRel(name);
    }
    if (/^https?:\/\//i.test(src)) return src;
    return null;
  }

  function onPaste(event, view) {
    var cd = event.clipboardData;
    if (!cd) return false;
    var sel = view.state.selection.main;
    var code = inCode(view.state, sel.from);
    var html = cd.getData("text/html");
    var text = cd.getData("text/plain");
    var files = Array.prototype.slice.call(cd.files || []);
    var C = convert();
    var rich = !code && !!C && !!html && C.isRichHtml(html) && /\S/.test(text);
    // A screenshot or a file. Word and Excel put a picture of what was
    // copied on the clipboard too: then the text wins.
    if (files.length && !rich) {
      if (/^image\//.test(files[0].type)) {
        event.preventDefault();
        addImageFile(files[0], function (name, linked) {
          if (!linked) replaceSelection(editorArea(), "![Describe what the image shows](" + imageRel(name) + ")");
          if (editableImage(name)) {
            toast("Pasted " + name + ". Anything readers shouldn't see in it, like IDs or names?", "Edit image", function () {
              openImageEditor(name);
            });
          }
        });
        return true;
      }
      if (FILE_TYPES[extOf(files[0].name)]) {
        event.preventDefault();
        addAttachment(files[0], function (name, linked) {
          if (!linked) insertFileLink(editorArea(), name);
        });
        return true;
      }
      return false;
    }
    if (code || !C) return false;
    if (rich) {
      var result = C.htmlToMarkdown(html, { image: pastedImage, link: pastedLink });
      if (!result.md.trim()) return false;
      event.preventDefault();
      var plainish = result.md.replace(/\s+/g, " ").trim() === text.replace(/\s+/g, " ").trim();
      if (wholePage(result.md, text)) return true;
      var done = insertPasted(view, result.md);
      if (!plainish || result.notes.length) toast("Pasted with its formatting, as Markdown" + (result.notes.length ? ". " + result.notes.join(". ") : "") + ".", "Paste as plain text", undoPaste(view, done, text));
      return true;
    }
    if (!text) return false;
    var trimmed = text.trim();
    if (/^https?:\/\/\S+$/.test(trimmed) && pasteUrl(view, trimmed)) {
      event.preventDefault();
      return true;
    }
    if (C.looksLikeAdo(text)) {
      event.preventDefault();
      var ado = C.fromAdo(text, { link: wikiLink });
      if (wholePage(ado.md, text, ado.notes)) return true;
      var put = insertPasted(view, C.demoteHeadings(ado.md));
      toast("Pasted from the Azure DevOps wiki: " + ado.notes.join("; ") + ".", "Paste as it was", undoPaste(view, put, text));
      return true;
    }
    if (wholePage(text, text)) {
      event.preventDefault();
      return true;
    }
    var table = C.tsvToTable(text);
    if (table) {
      event.preventDefault();
      var cells = insertPasted(view, table);
      toast("Pasted the cells as a table.", "Paste as plain text", undoPaste(view, cells, text));
      return true;
    }
    return false;
  }

  // Inserts pasted Markdown. More than a line of text goes in as blocks of
  // its own, with an empty line either side, indented like the line it's
  // pasted on (inside a step or a tab). Returns { from, text } for Undo.
  function insertPasted(view, md) {
    var st = view.state;
    var sel = st.selection.main;
    var block = /\n/.test(md) || /^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\||`{3}|!!!|\?\?\?|===|<(div|figure))/.test(md);
    var from = sel.from;
    var to = sel.to;
    var insert = md;
    // Where the cursor ends up: after the pasted text, before the gap.
    var end = md.length;
    if (block) {
      var line = st.doc.lineAt(from);
      var ind = /^ */.exec(line.text)[0];
      var atStart = !st.sliceDoc(line.from, from).trim();
      var body = lines(md)
        .map(function (l) {
          return l.trim() ? ind + l : "";
        })
        .join("\n");
      var pre;
      if (atStart) {
        from = line.from;
        var before = st.sliceDoc(0, from);
        pre = !before || /\n[ \t]*\n$/.test(before) || before === "\n" ? "" : "\n";
      } else pre = "\n\n";
      var after = st.sliceDoc(to);
      var rest = st.sliceDoc(to, st.doc.lineAt(to).to);
      var post = !after.trim() ? "" : rest.trim() ? "\n\n" + ind : /^[ \t]*\n[ \t]*\n/.test(after) ? "" : "\n";
      if (atStart && !rest.trim()) to = st.doc.lineAt(to).to;
      insert = pre + body + post;
      end = pre.length + body.length;
    }
    view.dispatch({ changes: { from: from, to: to, insert: insert }, selection: { anchor: from + end }, scrollIntoView: true, userEvent: "input.paste" });
    view.focus();
    return { from: from, text: insert };
  }

  // The toast's action after a paste: the text as it was copied.
  function undoPaste(view, done, text) {
    return function () {
      var now = view.state.sliceDoc(done.from, done.from + done.text.length);
      if (now !== done.text) {
        toast("The page has changed since the paste: Ctrl+Z undoes it instead.");
        return;
      }
      view.dispatch({ changes: { from: done.from, to: done.from + done.text.length, insert: text }, selection: { anchor: done.from + text.length }, userEvent: "input.paste" });
      view.focus();
    };
  }

  // A web address: over selected words, a link with them as its text; on
  // its own, the page's title for one of the site's pages, or <address>.
  // In a link's address already, it's left as it is (false).
  function pasteUrl(view, url) {
    var st = view.state;
    var sel = st.selection.main;
    var lead = st.sliceDoc(st.doc.lineAt(sel.from).from, sel.from);
    if (/\]\(\s*[^)\s]*$/.test(lead) || /<$/.test(lead) || /\b(src|href)=["']?$/.test(lead) || /^\s*\[[^\]]*\]:\s*$/.test(lead)) return false;
    var selected = st.sliceDoc(sel.from, sel.to);
    var link = pastedLink(url);
    var href = link ? link.href : url;
    var insert;
    if (selected.trim() && !/^https?:/.test(selected.trim()) && !/\n/.test(selected)) insert = "[" + selected + "](" + href + ")";
    else if (link) insert = "[" + (link.title || href) + "](" + href + ")";
    else insert = "<" + url + ">";
    view.dispatch({ changes: { from: sel.from, to: sel.to, insert: insert }, selection: { anchor: sel.from + insert.length }, scrollIntoView: true, userEvent: "input.paste" });
    if (!ui.urlTold && !selected.trim() && !link) {
      ui.urlTold = true;
      toast("Web addresses go in <…> so they're links on the site. Select some words first to link them instead.", "Paste as plain text", undoPaste(view, { from: sel.from, text: insert }, url));
    }
    return true;
  }

  // A whole page (front matter, or a # title on its first line) pasted into
  // an empty draft: the title and settings go where they belong.
  function wholePage(md, text, notes) {
    if (hasContent() || !/^\s*(---\n[\s\S]*?\n---(\n|$)|#\s+\S)/.test(lines(md).join("\n"))) return false;
    var doc = parseDocument(md);
    if (!doc.meta.title) return false;
    var m = state.meta;
    ["title", "applies_to", "owner", "last_reviewed", "review_every", "visibility", "extraFront", "titleInFront"].forEach(function (key) {
      if (doc.meta[key] !== undefined) m[key] = doc.meta[key];
    });
    if (!m.slugEdited) m.slug = "";
    closeForm(false);
    state.body = doc.body;
    loadPage();
    ui.welcomeDone = true;
    updateWelcome();
    changed();
    toast("Pasted a whole page: its title went to the title" + (/^\s*---\n/.test(md) ? ", and its settings to Page settings" : "") + "." + (notes && notes.length ? " From the Azure DevOps wiki: " + notes.join("; ") + "." : ""), "Paste as plain text", function () {
      m.title = "";
      state.body = lines(text).join("\n");
      loadPage();
      changed();
    });
    return true;
  }

  // A page from the Azure DevOps wiki points at its images and files in
  // the wiki's .attachments folder. One dropped in with the same name: the
  // links point at the copy the page brings now. Returns how many did.
  function linkAttachments(original, kind, name) {
    var changes = [];
    var re = /(\]\(\s*<?)((?:\.\.\/)*\/?\.attachments\/([^)\s>]+))/g;
    var m;
    while ((m = re.exec(state.body))) {
      var file = m[3];
      try {
        file = decodeURIComponent(file);
      } catch (e) {
        // A stray %: compare it as written.
      }
      if (file.toLowerCase() !== String(original || "").toLowerCase()) continue;
      var from = m.index + m[1].length;
      changes.push({ from: from, to: from + m[2].length, insert: assetRel(kind, name) });
    }
    if (changes.length) editBody(changes);
    return changes.length;
  }

  /* ── Suggestions as the writer types ── */

  // Whether pos is in a fenced code block: an odd number of fences above.
  function inFence(doc, pos) {
    var line = doc.lineAt(pos);
    var fences = 0;
    var fence = null;
    for (var n = 1; n < line.number; n++) {
      var m = /^\s*(`{3,}|~{3,})/.exec(doc.line(n).text);
      if (!m) continue;
      if (!fence) {
        fence = m[1];
        fences++;
      } else if (m[1][0] === fence[0] && m[1].length >= fence.length && /^\s*(`{3,}|~{3,})\s*$/.test(doc.line(n).text)) {
        fence = null;
        fences++;
      }
    }
    return fences % 2 === 1;
  }

  function inCode(st, pos) {
    if (inFence(st.doc, pos)) return true;
    var line = st.doc.lineAt(pos);
    return ((line.text.slice(0, pos - line.from).match(/`/g) || []).length % 2) === 1;
  }

  // The id Python-Markdown's toc gives a heading.
  function tocSlug(text) {
    return text
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^}]*\}\s*$/, "")
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, "-");
  }

  function completionSources(CM) {
    function rest(ctx) {
      var line = ctx.state.doc.lineAt(ctx.pos);
      return line.text.slice(ctx.pos - line.from);
    }

    // "/" at the start of a line: the components, by name or need, with the
    // callouts in a group of their own after the rest.
    var COMPONENT_SECTION = { name: "Components", rank: 0 };
    var CALLOUT_SECTION = { name: "Callouts", rank: 1 };
    function components(ctx) {
      var m = ctx.matchBefore(/^\s*\/[\w -]*$/);
      if (!m || inFence(ctx.state.doc, ctx.pos)) return null;
      var slash = m.from + m.text.indexOf("/");
      var q = m.text.slice(m.text.indexOf("/") + 1).trim().toLowerCase();
      var options = NEEDS.filter(function (n) {
        return !q || (n.name + " " + n.need + " " + n.type).toLowerCase().indexOf(q) >= 0;
      }).map(function (n) {
        return {
          label: n.name,
          detail: n.need,
          type: "component",
          need: n,
          section: n.type === "callout" ? CALLOUT_SECTION : COMPONENT_SECTION,
          boost: q && n.name.toLowerCase().indexOf(q) === 0 ? 1 : 0,
          apply: function (view, completion, from, to) {
            var doc = view.state.doc;
            var line = doc.lineAt(from);
            if (n.type === "image") {
              view.dispatch({ changes: { from: from, to: to } });
              insertNeed(n, line.from, false);
              return;
            }
            var prevBlank = line.number === 1 || !doc.line(line.number - 1).text.trim();
            var nextBlank = line.number === doc.lines || !doc.line(line.number + 1).text.trim();
            var template = (prevBlank ? "" : "\n") + snippetFor(n) + (nextBlank ? "" : "\n");
            addHints(template);
            CM.snippet(template)(view, completion, from, to);
          },
        };
      });
      if (!options.length) return null;
      // Unfiltered options keep their order, and boost is ignored: a name
      // that starts with what was typed goes first here instead.
      options.sort(function (a, b) {
        return b.boost - a.boost;
      });
      return { from: slash, options: options, filter: false };
    }

    // After !!! or ???: the callout types.
    function callouts(ctx) {
      var m = ctx.matchBefore(/^\s*(?:!!!|\?\?\?\+?)\s+[\w-]*$/);
      if (!m) return null;
      var word = /[\w-]*$/.exec(m.text)[0];
      var alone = !rest(ctx).trim();
      var kinds = CALLOUTS.concat([{ id: "troubleshoot", label: "Troubleshooting entry", hint: "an error, its cause and its fix" }]);
      return {
        from: ctx.pos - word.length,
        validFor: /^[\w-]*$/,
        options: kinds.map(function (k) {
          var body = k.id === "troubleshoot" ? TROUBLESHOOT_SNIPPET.replace(/^\?\?\? /, "") : k.id + ' "#{' + (CALLOUT_SAMPLES[k.id] || "Make the point") + '}"\n    #{What the reader needs to know.}';
          return {
            label: k.id,
            detail: k.hint,
            type: "keyword",
            callout: k.id,
            apply: alone
              ? function (view, completion, from, to) {
                  addHints(body);
                  CM.snippet(body)(view, completion, from, to);
                }
              : k.id,
          };
        }),
      };
    }

    // In === "…": the site's standard tab labels.
    function tabs(ctx) {
      var m = ctx.matchBefore(/^\s*===\+?\s+"[^"]*$/);
      if (!m) return null;
      var typed = /"([^"]*)$/.exec(m.text)[1];
      var closed = rest(ctx)[0] === '"';
      return {
        from: ctx.pos - typed.length,
        options: TAB_LABELS.map(function (label) {
          return { label: label, type: "text", detail: "a standard label", apply: closed ? label : label + '"' };
        }),
      };
    }

    // After an opening ```: languages, for the colours.
    function fences(ctx) {
      var m = ctx.matchBefore(/^\s*(?:`{3,}|~{3,}) ?[\w+#-]*$/);
      if (!m || inFence(ctx.state.doc, ctx.pos)) return null;
      var word = /[\w+#-]*$/.exec(m.text)[0];
      if (!word && !ctx.explicit) return null;
      var open = /^(\s*)(`{3,}|~{3,})/.exec(m.text);
      var close = !rest(ctx).trim() && !fenceClosed(ctx.state.doc, ctx.pos, open[2]);
      function option(label, detail, info) {
        return {
          label: label,
          type: "type",
          detail: detail,
          // A new block gets its closing fence too, with the cursor inside.
          apply: function (view, completion, from, to) {
            var text = info || label;
            var cursor = from + text.length;
            if (close) {
              text += "\n" + open[1] + "\n" + open[1] + open[2];
              cursor += 1 + open[1].length;
            }
            view.dispatch({ changes: { from: from, to: to, insert: text }, selection: { anchor: cursor }, userEvent: "input.complete" });
          },
        };
      }
      return {
        from: ctx.pos - word.length,
        validFor: /^[\w+#-]*$/,
        options: LANGS.map(function (lang) {
          return option(lang);
        }).concat([option("mermaid", "a diagram"), option("output", "command output", "{ .text .output }")]),
      };
    }

    // Whether the fence opened on pos's line already has its closing one:
    // the next fence of its kind below is a bare one.
    function fenceClosed(doc, pos, fence) {
      for (var n = doc.lineAt(pos).number + 1; n <= doc.lines; n++) {
        var m = /^\s*(`{3,}|~{3,})(.*)$/.exec(doc.line(n).text);
        if (m && m[1][0] === fence[0] && m[1].length >= fence.length) return !m[2].trim();
      }
      return false;
    }

    // In a link or image: pages, headings on this page, images and files.
    function links(ctx) {
      var m = ctx.matchBefore(/(!?)\[[^\]\n]*\]\([^)\s]*$/);
      if (!m) return null;
      var open = m.text.lastIndexOf("](");
      var typed = m.text.slice(open + 2);
      var image = m.text[0] === "!";
      var q = typed.toLowerCase();
      var options = [];
      function offer(label, detail, type, boost) {
        if (q && (label + " " + detail).toLowerCase().indexOf(q) < 0) return;
        options.push({ label: label, detail: detail, type: type, boost: boost });
      }
      if (typed[0] === "#") {
        lines(state.body).forEach(function (line) {
          var hm = /^#{2,6}\s+(.+?)\s*$/.exec(line);
          if (hm) offer("#" + tocSlug(hm[1]), hm[1].replace(/<[^>]+>|\{[^}]*\}/g, "").trim(), "anchor", 0);
        });
      } else {
        Object.keys(state.images).sort().forEach(function (name) {
          offer(imageRel(name), "Image on this page", "image", image ? 3 : 1);
        });
        Object.keys(state.files).sort().forEach(function (name) {
          offer(fileRel(name), "File on this page", "file", image ? -1 : 1);
        });
        if (!image) {
          data.pages.forEach(function (p) {
            offer(relPath(folderPath(), p.src), p.title, "page", 0);
          });
        }
        (data.files || []).forEach(function (path) {
          var isImage = /^images\//.test(path);
          if (image !== isImage && !(!image && /^files\//.test(path))) return;
          offer(relPath(folderPath(), path), "On the site", isImage ? "image" : "file", -2);
        });
      }
      if (!options.length) return null;
      return { from: m.from + open + 2, options: options.slice(0, 200), filter: false };
    }

    // :material-…: the icons offered for cards.
    function icons(ctx) {
      var m = ctx.matchBefore(/:[a-z][\w-]*$/);
      if (!m || m.text.length < 3) return null;
      var before = ctx.state.sliceDoc(m.from - 1, m.from);
      if (before && !/[\s(>]/.test(before)) return null;
      var closed = rest(ctx)[0] === ":";
      return {
        from: m.from,
        options: Object.keys(data.icons).map(function (name) {
          var code = ":" + name.replace("/", "-") + ":";
          return {
            label: code,
            type: "icon",
            apply: closed ? code.slice(0, -1) : code,
            info: function () {
              return h("span", { class: "writer-card-icon writer-card-icon--info", html: data.icons[name] });
            },
          };
        }),
      };
    }

    // <…> in code: the standard placeholders and this page's Your values.
    function placeholders(ctx) {
      var m = ctx.matchBefore(/<[a-z0-9][\w.-]*$/i);
      if (!m && !(ctx.explicit && (m = ctx.matchBefore(/<$/)))) return null;
      if (!inCode(ctx.state, ctx.pos)) return null;
      var seen = {};
      var options = [];
      PLACEHOLDERS.forEach(function (p) {
        seen[p[0]] = true;
        options.push({ label: p[0], detail: p[1].replace(/`/g, ""), type: "variable" });
      });
      readBlocks().forEach(function (b) {
        if (b.type !== "values") return;
        b.items.forEach(function (item) {
          var name = cleanPlaceholder(item.name);
          if (name && !seen[name]) {
            seen[name] = true;
            options.push({ label: name, detail: item.label.replace(/`/g, ""), type: "variable", boost: 1 });
          }
        });
      });
      var closed = rest(ctx)[0] === ">";
      options.forEach(function (o) {
        o.apply = closed ? o.label : o.label + ">";
      });
      return { from: m.from + 1, validFor: /^[\w.-]*$/, options: options };
    }

    // .md-button--…: the button styles.
    function buttons(ctx) {
      var m = ctx.matchBefore(/\.md-button--[\w-]*$/);
      if (!m) return null;
      return {
        from: m.from + ".md-button--".length,
        validFor: /^[\w-]*$/,
        options: BUTTON_STYLES.filter(function (s) {
          return s[0];
        }).map(function (s) {
          return { label: s[0], detail: s[1], type: "class" };
        }),
      };
    }

    // ++ctrl+…++: key names.
    function keys(ctx) {
      var m = ctx.matchBefore(/\+\+(?:[\w-]+\+)*[\w-]*$/);
      if (!m) return null;
      var word = /[\w-]*$/.exec(m.text)[0];
      if (!word && !ctx.explicit) return null;
      var seen = {};
      return {
        from: ctx.pos - word.length,
        validFor: /^[\w-]*$/,
        options: Object.keys(KEY_NAMES).filter(function (k) {
          if (seen[KEY_NAMES[k]]) return false;
          seen[KEY_NAMES[k]] = true;
          return true;
        }).map(function (k) {
          return { label: k, detail: KEY_NAMES[k], type: "keyword" };
        }),
      };
    }

    return [components, callouts, tabs, fences, links, icons, placeholders, buttons, keys];
  }

  /* ── Checks in the editor ── */

  function lintSource(view) {
    if (view.state.doc.toString() !== state.body) return [];
    var out = [];
    runChecks().forEach(function (c) {
      var range = checkRange(c);
      if (!range) return;
      var d = { from: range.from, to: Math.max(range.to, range.from), severity: c.level === "warn" ? "warning" : "info", source: "Checks", message: c.text };
      if (c.fix) {
        d.actions = [
          {
            name: c.fix.label,
            apply: function () {
              c.fix.run();
              changed();
            },
          },
        ];
      }
      out.push(d);
    });
    return out;
  }

  /* ── The component form ──
     Opened on request for the component the cursor is in. It edits a copy
     of the block; each change writes the block's Markdown back in place. */

  function openForm(b) {
    if (!ui.formBox) return;
    var block = copy(b);
    // An image this page brings: shown with its thumbnail and Replace.
    if (block.type === "image" && block.src) {
      var found = attachedAt(joinPath(folderPath(), block.src.trim()));
      if (found && found.kind === "images") {
        block.image = found.name;
        block.src = "";
      }
    }
    ui.form = { block: block, from: b.from, to: b.to, edited: false };
    drawForm();
    ui.formBox.hidden = false;
    ui.root.classList.add("writer--form");
    var first = ui.formBox.querySelector(".writer-form__body input:not([type=checkbox]), .writer-form__body textarea, .writer-form__body select");
    if (first) first.focus({ preventScroll: true });
  }

  function drawForm() {
    var f = ui.form;
    if (!f) return;
    var t = TYPES[f.block.type];
    var box = ui.formBox;
    var scroll = box.scrollTop;
    box.innerHTML = "";
    box.appendChild(
      h("div", { class: "writer-form__head" }, [
        h("span", { class: "writer-block__type" }, [icon(t.icon), h("span", { text: t.label })]),
        h("span", { class: "writer-block__actions" }, [
          iconButton("trash-can-outline", "Delete this component", false, function () {
            var from = f.from;
            var to = f.to;
            var after = state.body.slice(to);
            var gap = /^\n*/.exec(after)[0].length;
            closeForm(false);
            editBody([{ from: from, to: to + Math.min(gap, 2), insert: "" }]);
            toast(t.label + " deleted. Ctrl+Z in the Markdown brings it back.");
            goTo(Math.min(from, state.body.length));
          }),
          iconButton("close", "Close the form (Esc)", false, function () {
            closeForm(true);
          }),
        ]),
      ])
    );
    if (t.help) box.appendChild(h("div", { class: "writer-block__help", text: t.help }));
    var body = h("div", { class: "writer-block__body writer-form__body" });
    t.editor(f.block, body);
    box.appendChild(body);
    box.appendChild(h("p", { class: "writer-form__foot", text: "Changes here rewrite this component's Markdown as you type. Ctrl+Z in the Markdown undoes them." }));
    box.scrollTop = scroll;
  }

  function closeForm(focusEditor) {
    if (!ui.form) return;
    var from = ui.form.from;
    ui.form = null;
    if (ui.formBox) {
      ui.formBox.hidden = true;
      ui.formBox.innerHTML = "";
    }
    if (ui.root) ui.root.classList.remove("writer--form");
    if (focusEditor) goTo(Math.min(from, state.body.length));
  }

  function writeForm() {
    var f = ui.form;
    if (!f || !f.edited) return;
    var text = TYPES[f.block.type].md(f.block);
    if (state.body.slice(f.from, f.to) === text) return;
    f.writing = true;
    try {
      editBody([{ from: f.from, to: f.to, insert: text }]);
    } finally {
      f.writing = false;
    }
    f.to = f.from + text.length;
  }

  // The Markdown changed in the editor while the form was open: keep up
  // with where the block went, and redraw the form if it was edited.
  function formFollow(u) {
    var f = ui.form;
    var touched = false;
    u.changes.iterChangedRanges(function (fromA, toA) {
      if (fromA <= f.to && toA >= f.from) touched = true;
    });
    f.from = u.changes.mapPos(f.from, 1);
    f.to = Math.max(f.from, u.changes.mapPos(f.to, -1));
    if (!touched) return;
    var b = blockAt(f.from);
    if (!b || b.type !== f.block.type) {
      closeForm(false);
      return;
    }
    ui.form = null;
    var focus = document.activeElement;
    openForm(b);
    if (focus && focus !== document.body && !ui.formBox.contains(focus)) focus.focus({ preventScroll: true });
  }

  // Editors call this when a change needs the whole form drawn again.
  function redrawBlock(b) {
    if (ui.form && ui.form.block === b) drawForm();
  }

  /* ── The preview, following the cursor ── */

  function setActive(id) {
    if (ui.active === id) return;
    ui.active = id;
    markActive(true);
  }

  function markActive(scroll) {
    if (!ui.preview) return;
    ui.preview.querySelectorAll(".writer-pv--active").forEach(function (node) {
      node.classList.remove("writer-pv--active");
    });
    var part = ui.active && ui.preview.querySelector('[data-block="' + ui.active + '"]');
    if (!part) return;
    part.classList.add("writer-pv--active");
    if (scroll && ui.view === "split") {
      var box = ui.previewPane;
      var top = part.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 60) box.scrollTo({ top: Math.max(0, top - 40), behavior: "smooth" });
    }
  }

  // Side by side: the preview scrolls with the Markdown.
  function syncScroll() {
    if (ui.view !== "split" || !ui.cm || ui.scrollQueued) return;
    ui.scrollQueued = true;
    requestAnimationFrame(function () {
      ui.scrollQueued = false;
      var view = ui.cm;
      var scroller = view.scrollDOM;
      var box = ui.previewPane;
      if (scroller.scrollTop <= 2) {
        box.scrollTop = 0;
        return;
      }
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
        box.scrollTop = box.scrollHeight;
        return;
      }
      var top = scroller.scrollTop;
      var pos = view.lineBlockAtHeight(top).from;
      var blocks = readBlocks();
      var b = null;
      for (var i = 0; i < blocks.length; i++) {
        if (blocks[i].to >= pos) {
          b = blocks[i];
          break;
        }
      }
      var part = b && ui.preview.querySelector('[data-block="' + b.id + '"]');
      if (!part) return;
      var start = view.lineBlockAt(b.from).top;
      var end = view.lineBlockAt(b.to).bottom;
      var frac = end > start ? Math.min(1, Math.max(0, (top - start) / (end - start))) : 0;
      box.scrollTop = part.offsetTop + frac * part.offsetHeight - 12;
    });
  }

  /* ── Rendering ── */

  var timer = null;
  function scheduleRender() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      syncPaths();
      save();
      render();
    }, 180);
  }

  // Called by every form control: the form's Markdown goes back into the
  // page, then the preview and checks catch up.
  function changed() {
    writeForm();
    scheduleRender();
  }

  function render() {
    if (!ui.root || !ui.root.isConnected) return;
    readBlocks();
    updateTitleBar();
    drawAssets(false);
    var checks = runChecks();
    var warnings = checks.filter(function (c) {
      return c.level === "warn";
    }).length;
    ui.checkCount.textContent = warnings ? String(warnings) : "";
    ui.checkCount.hidden = !warnings;
    if (ui.side === "checks") renderChecks(checks);
    drawOutline();
    updateFooter();
    renderPreview();
    updateWelcome();
    if (ui.publishBox && ui.publishBox.isConnected) renderPublish();
    if (ui.cm && window.CM) window.CM.forceLinting(ui.cm);
  }

  function renderPreview() {
    if (!ui.preview || ui.view === "markdown") return;
    tabSets = 0;
    var box = ui.previewPane;
    var scroll = box.scrollTop;
    var checked = [];
    ui.preview.querySelectorAll("input[type=radio]:checked").forEach(function (node) {
      checked.push(node.id);
    });
    var open = [];
    ui.preview.querySelectorAll("details").forEach(function (node) {
      open.push(node.open);
    });
    var m = state.meta;
    var html = "<h1>" + (m.title.trim() ? inline(m.title) : '<span class="writer-ghost-text">Page title</span>') + "</h1>" + pageInfoHtml();
    var blocks = readBlocks();
    blocks.forEach(function (b) {
      var inner = b.type === "text" ? renderPlain(b.md) : TYPES[b.type].preview(b);
      html += '<div class="writer-pv writer-pv--' + b.type + '" data-block="' + b.id + '"' + (b.type === "text" ? "" : ' title="' + esc(TYPES[b.type].label) + (ui.view === "preview" ? ": click to edit" : "") + '"') + ">" + inner + "</div>";
    });
    if (!blocks.length) html += '<div class="writer-ghost">Nothing here yet. What you write in the Markdown shows here, as it will on the site.</div>';
    ui.preview.innerHTML = html;
    checked.forEach(function (id) {
      var node = document.getElementById(id);
      if (node && ui.preview.contains(node)) node.checked = true;
    });
    ui.preview.querySelectorAll("details").forEach(function (node, i) {
      if (i < open.length) node.open = open[i];
    });
    glossary(ui.preview);
    if (window.docsComponents) window.docsComponents.mount();
    renderMermaid(ui.preview);
    markActive(false);
    box.scrollTop = scroll;
  }

  /* ── Add to site ── */

  function openPublish() {
    ui.publishBox = h("div", { class: "writer-panel writer-panel--publish" });
    var node = dialog(publishApi() ? "Publish" : "Add to site", [ui.publishBox]);
    if (publishApi()) whoAmI();
    node.classList.add("writer-dialog--wide", "writer-dialog--publish");
    node.addEventListener("close", function () {
      ui.publishBox = null;
    });
    renderPublish();
  }

  function renderPublish() {
    var box = ui.publishBox;
    if (!box) return;
    var m = state.meta;
    var repo = data.repo || {};
    var cfg = data.bundle || {};
    var folder = folderPath();
    var name = fileName();
    var md = toMarkdown();
    var images = usedAssets("images", md).sort();
    var files = usedAssets("files", md).sort();
    var imageDir = "docs/" + assetPath("images", assetDir(), "");
    var fileDir = "docs/" + assetPath("files", assetDir(), "");
    var update = m.mode === "update";
    var branch = repo.branch || "main";
    var org = String(repo.organization || "").replace(/\/+$/, "");
    var configured = !!(org && repo.project && repo.repository);
    var ORG = org || "https://dev.azure.com/<organization>";
    var PROJECT = repo.project || "<project>";
    var REPO = repo.repository || "<repository>";
    var BUCKET = cfg.bucket || "<bucket>";
    var PREFIX = cfg.prefix || "<prefix>";
    var REGION = cfg.region || "<region>";
    var PIPELINE = cfg.pipeline_id || "<pipeline-id>";
    var work = "docs/" + (update ? "update-" : "") + slug();
    var message = (update ? "Update " : "Add ") + (m.title.trim() || slug()).replace(/"/g, "'");
    var docsDir = "docs/" + (folder ? folder + "/" : "");
    var repoUrl = ORG + "/" + (repo.project ? encodeURIComponent(repo.project) : PROJECT) + "/_git/" + (repo.repository ? encodeURIComponent(repo.repository) : REPO);

    // Redrawn as the page changes: keep the tabs the writer picked.
    var checked = [];
    box.querySelectorAll("input[type=radio]:checked").forEach(function (node) {
      checked.push(node.id);
    });
    var scroll = box.scrollTop;
    box.innerHTML = "";
    tabSets = 100;

    box.appendChild(
      h("div", { class: "writer-row" }, [
        field(
          "This is",
          select(m, "mode", [["new", "A new page"], ["update", "A change to an existing page"]], false, function () {
            renderPublish();
          }),
          "grow"
        ),
      ])
    );

    var html = "";
    var missing = [];
    if (!org) missing.push(["organization", "Azure DevOps organization (the name in dev.azure.com/…)"]);
    if (!repo.project) missing.push(["project", "Azure DevOps project"]);
    if (!repo.repository) missing.push(["repository", "Docs repository name"]);
    if (!cfg.bucket) missing.push(["bucket", "S3 bucket that takes the bundles"]);
    if (!cfg.prefix) missing.push(["prefix", "Folder in that bucket, such as <code>incoming</code>"]);
    if (!cfg.region) missing.push(["region", "AWS Region, such as <code>eu-west-1</code>"]);
    if (!cfg.pipeline_id) missing.push(["pipeline-id", "The ingest pipeline's number (after <code>definitionId=</code> in its address)"]);
    // With the Publish button, the steps by hand are only a fallback.
    if (missing.length && !publishApi()) {
      html +=
        '<div class="your-values"><ul>' +
        missing.map(function (v) {
          return "<li><code>&lt;" + v[0] + "&gt;</code> " + v[1] + "</li>";
        }).join("") +
        "</ul></div>";
    }

    /* Upload the bundle */

    var zip = m.bundle ? m.bundle.name : bundleName();
    var key = PREFIX + "/" + zip;
    var stale = m.bundle && m.bundle.sig !== signature();
    var bucketLink = cfg.bucket && cfg.region ? "https://s3.console.aws.amazon.com/s3/buckets/" + encodeURIComponent(cfg.bucket) + "?region=" + encodeURIComponent(cfg.region) + (cfg.prefix ? "&prefix=" + encodeURIComponent(cfg.prefix + "/") : "") : "";
    var pipelineLink = org && repo.project ? org + "/" + encodeURIComponent(repo.project) + "/_build" + (cfg.pipeline_id ? "?definitionId=" + encodeURIComponent(cfg.pipeline_id) : "") : "";
    var contents = [images.length ? plural(images.length, "image") : "", files.length ? plural(files.length, "file") : ""].filter(Boolean).join(" and ");
    var got = m.bundle
      ? stale
        ? '<p class="writer-note writer-note--warn">You\'ve changed the page since you downloaded <code>' + esc(zip) + "</code>. Download it again, and upload the new one.</p>"
        : '<p class="writer-note">Downloaded as <code>' + esc(zip) + "</code>.</p>"
      : "";
    var upload =
      '<div class="steps"><ol>' +
      "<li><p><strong>Download the bundle.</strong> It holds the page" + (contents ? ", the " + contents + " it uses," : "") + " and a <code>manifest.json</code> saying where each one goes.</p>" +
      '<p><button type="button" class="md-button md-button--primary md-button--sm" data-bundle>' + iconHtml("folder-zip-outline") + "<span>Download bundle (.zip)</span></button></p>" + got + "</li>" +
      "<li><p><strong>Upload it to S3</strong>, into <code>s3://" + esc(BUCKET) + "/" + esc(PREFIX) + "/</code>. " +
      (bucketLink ? '<a href="' + esc(bucketLink) + '" target="_blank" rel="noopener">Open that folder in the S3 console</a>, select' : "In the S3 console, open the bucket and the folder, then select") +
      " <strong>Upload</strong>, add the file, and select <strong>Upload</strong> again. Or with the AWS CLI, from PowerShell or a terminal:</p>" +
      copyable("bash", 'aws s3 cp "$HOME/Downloads/' + zip + '" "s3://' + BUCKET + "/" + key + '" --region ' + REGION) + "</li>" +
      "<li><p><strong>Run the ingest pipeline.</strong> " +
      (pipelineLink ? '<a href="' + esc(pipelineLink) + '" target="_blank" rel="noopener">Open ' + (cfg.pipeline_id ? "the pipeline" : "Pipelines") + " in Azure DevOps</a>" + (cfg.pipeline_id ? "" : " and open <strong>ingest-bundle</strong>") : "In Azure DevOps, go to <strong>Pipelines</strong> and open <strong>ingest-bundle</strong>") +
      ". Select <strong>Run pipeline</strong>, paste the bundle's key into <strong>bundleKey</strong>, and select <strong>Run</strong>. The key:</p>" +
      copyable("text", key) +
      "<p>Or start it from a terminal:</p>" +
      copyable("bash", "az pipelines run --id " + PIPELINE + " --parameters bundleKey=" + key + " --organization " + ORG + ' --project "' + PROJECT + '"') + "</li>" +
      "<li><p><strong>Review the pull request.</strong> The pipeline checks the bundle, builds the site with the page in it, and opens a pull request from a branch named <code>ingest/" + esc(slug()) + "-…</code>. Once it's approved and merged, the page goes live.</p>" +
      "<p>If the run fails, its log says why. Fix the page here, then download the bundle again and start over.</p></li>" +
      "</ol></div>";

    /* Do it by hand */

    var assetGroups = [[images, imageDir, "images"], [files, fileDir, "files"]];
    var list = '<div class="writer-files">' + fileRowHtml(name, docsDir, "page");
    assetGroups.forEach(function (group) {
      group[0].forEach(function (asset) {
        list += fileRowHtml(asset, group[1], group[2] + "/" + asset);
      });
    });
    list += "</div>";

    var moveWin = [];
    var moveNix = [];
    if (m.folder === "__new__") {
      moveWin.push('New-Item -ItemType Directory -Force "' + docsDir.replace(/\//g, "\\") + '" | Out-Null');
      moveNix.push("mkdir -p " + docsDir);
    }
    assetGroups.forEach(function (group) {
      if (!group[0].length) return;
      moveWin.push('New-Item -ItemType Directory -Force "' + group[1].replace(/\//g, "\\") + '" | Out-Null');
      moveNix.push("mkdir -p " + group[1]);
    });
    var force = update ? " -Force" : "";
    moveWin.push('Move-Item "$HOME\\Downloads\\' + name + '" "' + (docsDir + name).replace(/\//g, "\\") + '"' + force);
    moveNix.push("mv ~/Downloads/" + name + " " + docsDir + name);
    var added = [docsDir + name];
    assetGroups.forEach(function (group) {
      group[0].forEach(function (asset) {
        moveWin.push('Move-Item "$HOME\\Downloads\\' + asset + '" "' + (group[1] + asset).replace(/\//g, "\\") + '"' + force);
        moveNix.push("mv ~/Downloads/" + asset + " " + group[1] + asset);
        added.push(group[1] + asset);
      });
    });
    var add = "git add " + added.join(" ");

    function steps(move) {
      return [
        "cd " + REPO,
        "git switch " + branch,
        "git pull",
        "git switch -c " + work,
      ]
        .concat(move)
        .concat([add, 'git commit -m "' + message + '"', "git push -u origin " + work, "az repos pr create --repository " + REPO + " --source-branch " + work + " --target-branch " + branch + ' --title "' + message + '" --open'])
        .join("\n");
    }

    var terminal =
      "<p>The first time only: install the Azure DevOps extension, sign in and get a copy of the docs.</p>" +
      copyable("powershell", ["az extension add --name azure-devops", "az login", "az devops configure --defaults organization=" + ORG + ' project="' + PROJECT + '"', 'git clone "' + repoUrl + '"'].join("\n")) +
      "<p>Then for each page, from the folder you cloned into:</p>" +
      tabsHtml([
        ["Windows", copyable("powershell", steps(moveWin))],
        ["macOS / Linux", copyable("bash", steps(moveNix))],
      ]) +
      "<p>The last command opens the pull request in your browser. Once it's approved and merged, the next build publishes the page. Downloads saved somewhere other than your Downloads folder need that path in the move commands.</p>" +
      "<p>To check the page first, run <code>mkdocs serve</code> in the repository and open <a href=\"http://127.0.0.1:8000\" target=\"_blank\" rel=\"noopener\">http://127.0.0.1:8000</a>.</p>";

    var folderLink = configured ? repoUrl + "?path=/" + encodeURI(docsDir.replace(/\/$/, "")) + "&version=GB" + encodeURIComponent(branch) : "";
    var fileLink = configured ? repoUrl + "?path=/" + encodeURI(docsDir + name) + "&version=GB" + encodeURIComponent(branch) : "";
    var uiPath = function (parts) {
      return '<strong class="ui-path">' + parts.map(function (p) { return '<span class="ui-path__item">' + esc(p) + "</span>"; }).join('<span class="ui-path__sep" aria-hidden="true"></span><span class="sr-only">, </span>') + "</strong>";
    };
    var assetStep = images.length || files.length
      ? "<li><p><strong>Add the " + (images.length && files.length ? "images and files" : images.length ? "images" : "files") + "</strong> on the same branch: pick <code>" + esc(work) + "</code> in the branch list, then upload them to " +
        [images.length ? "<code>" + esc(imageDir) + "</code>" : "", files.length ? "<code>" + esc(fileDir) + "</code>" : ""].filter(Boolean).join(" and ") +
        " with " + uiPath(["⋮", "Upload file(s)"]) + ". These folders are new, just for this page; if the website won't make them, use the Terminal steps or upload the bundle.</p></li>"
      : "";
    var website = update
      ? '<div class="steps"><ol>' +
        "<li><p><strong>Open the page's file.</strong> " + (configured ? '<a href="' + esc(fileLink) + '" target="_blank" rel="noopener">Open ' + esc(docsDir + name) + " in Azure DevOps</a>." : "In Azure DevOps, go to " + uiPath(["Repos", "Files"]) + " and open <code>" + esc(docsDir + name) + "</code>.") + "</p></li>" +
        "<li><p><strong>Replace its text.</strong> Select <strong>Edit</strong>, select all the text, and paste this page's Markdown: " +
          '<button type="button" class="md-button md-button--ghost md-button--sm" data-copy-md>' + iconHtml("content-copy") + "<span>Copy the Markdown</span></button> copies the whole file.</p></li>" +
        "<li><p><strong>Commit to a new branch.</strong> Select <strong>Commit</strong>. Under <strong>Branch name</strong>, type <code>" + esc(work) + "</code>, keep <strong>Create a pull request</strong> ticked, and commit.</p></li>" +
        assetStep +
        "<li><p><strong>Create the pull request</strong> and ask for a review. Once it's merged, the next build publishes the change.</p></li></ol></div>"
      : '<div class="steps"><ol>' +
        "<li><p><strong>Open the folder.</strong> " + (configured && m.folder !== "__new__" ? '<a href="' + esc(folderLink) + '" target="_blank" rel="noopener">Open ' + esc(docsDir) + " in Azure DevOps</a>." : "In Azure DevOps, go to " + uiPath(["Repos", "Files"]) + " and open <code>" + esc(docsDir) + "</code>" + (m.folder === "__new__" ? " (the terminal steps can create a new folder; the website can't)" : "") + ".") + "</p></li>" +
        "<li><p><strong>Upload the file.</strong> Next to the folder's name, open its menu " + uiPath(["⋮", "Upload file(s)"]) + " and choose <code>" + esc(name) + "</code>.</p></li>" +
        "<li><p><strong>Commit to a new branch.</strong> Under <strong>Branch name</strong>, type <code>" + esc(work) + "</code>, keep <strong>Create a pull request</strong> ticked, and commit.</p></li>" +
        assetStep +
        "<li><p><strong>Create the pull request</strong> and ask for a review. Once it's merged, the next build publishes the page.</p></li></ol></div>";

    var byHand =
      "<p>Download " + (added.length > 1 ? "these files" : "the file") + ", then put " + (added.length > 1 ? "each one" : "it") + " in the folder shown:</p>" +
      list +
      tabsHtml([
        ["Azure DevOps website", website],
        ["Terminal", terminal],
      ]);

    html += tabsHtml(
      (publishApi() ? [["Publish to staging", publishHtml()]] : []).concat([
        ["Upload the bundle", upload],
        ["Do it by hand", byHand],
      ])
    );
    box.appendChild(h("div", { class: "writer-publish", html: html }));

    if (hasAssets() && state.assetsSaved === false) box.appendChild(h("p", { class: "writer-note writer-note--warn", text: "This browser can't keep the images and files: download the bundle before you close the page." }));
    var navNote = m.folder === "__new__"
      ? "A new folder becomes a tab. It also needs an index.md (its landing page) and a line in docs/.nav.yml: see the writing guide, under The menu."
      : "The page appears at the end of this folder's sidebar. To choose its place, add “- " + name + "” to " + docsDir + ".nav.yml.";
    if (!update) box.appendChild(h("p", { class: "writer-note", text: navNote }));

    box.querySelectorAll(".writer-copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var code = btn.parentElement.querySelector("code");
        copyText(code.textContent, "Copied.");
      });
    });
    box.querySelectorAll("[data-bundle]").forEach(function (btn) {
      btn.addEventListener("click", downloadBundle);
    });
    box.querySelectorAll("[data-publish]").forEach(function (btn) {
      btn.addEventListener("click", publishToStaging);
    });
    box.querySelectorAll("[data-publish-check]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var p = m.published;
        p.stopped = p.expired = false;
        p.message = "";
        p.followFrom = Date.now();
        ui.pollErrors = 0;
        save();
        refreshPublish();
        pollSoon(state.id, 0);
      });
    });
    box.querySelectorAll("[data-publish-reopen]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openSitePage(m.published.path.replace(/^docs\//, ""), true);
      });
    });
    box.querySelectorAll("[data-visibility]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        m.visibility = btn.getAttribute("data-visibility");
        drawSetup();
        changed();
        renderPublish();
      });
    });
    box.querySelectorAll("[data-copy-md]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyText(toMarkdown(), "Markdown copied.");
      });
    });
    box.querySelectorAll("[data-download]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var what = btn.getAttribute("data-download");
        if (what === "page") download();
        else {
          var kind = what.split("/")[0];
          var asset = what.slice(kind.length + 1);
          if (state[kind][asset]) offer(state[kind][asset], asset);
        }
      });
    });
    checked.forEach(function (id) {
      var node = document.getElementById(id);
      if (node && box.contains(node)) node.checked = true;
    });
    if (window.docsComponents) window.docsComponents.mount();
    box.scrollTop = scroll;
  }

  /* ── Publish to staging, through the publish API
     (tools/writer_api/lambda_function.py, extra.writer.api): it takes the
     bundle straight to S3 and runs the ingest pipeline, whose pull request
     merges itself, and the merge starts the staging pipeline. The draft
     keeps how that's getting on in meta.published, so a reload picks it up:
     { stage, at, path, mode, sig, pageSha, key, runId, runUrl, prUrl,
       stagingUrl, message, failedStep, stopped } ── */

  var PUBLISH_STEPS = ["Upload the bundle", "Check the page and build the site", "Merge into main", "Publish to staging", "Live on staging"];
  // Which of those each stage the API reports is at.
  var STAGE_STEP = { uploading: 0, queued: 1, checking: 1, merging: 2, deploying: 3, merged: 3, live: 4 };
  // Stop asking how a run is getting on after this long.
  var FOLLOW_FOR = 60 * 60 * 1000;
  var VISIBILITY_NAMES = { listed: "Published, in the menu", unlisted: "Published, not in the menu", "draft-prod": "Staging only", draft: "Draft" };

  function publishApi() {
    return (data && data.bundle && data.bundle.api) || "";
  }

  // Still on its way: not live, failed or given up on.
  function publishing(p) {
    p = p === undefined ? state && state.meta.published : p;
    return !!p && p.stage !== "failed" && p.stage !== "live" && p.stage !== "merged" && !p.stopped;
  }

  // The Visibility the page had when it was opened, from the site or a file.
  var openedCache = { text: null, visibility: "" };
  function openedVisibility() {
    var text = state.meta.original || "";
    if (openedCache.text !== text) openedCache = { text: text, visibility: text ? parseDocument(text).meta.visibility : "" };
    return openedCache.visibility;
  }

  // The load balancer signs readers in; a sign-in that has run out comes
  // back as a redirect to Entra ID (or a bare 401), not as the API's JSON.
  function apiCall(method, path, body) {
    var headers = { "X-Writer": "1" };
    if (body) headers["Content-Type"] = "application/json";
    return fetch(publishApi() + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      redirect: "manual",
      cache: "no-store",
    }).then(function (res) {
      if (res.type === "opaqueredirect" || res.status === 0) throw { expired: true };
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (out) {
          if (res.status === 401 && !out.error) throw { expired: true };
          if (!res.ok) throw new Error(out.error || res.status + " " + res.statusText);
          return out;
        });
    });
  }

  function publishError(e) {
    if (e && e.expired) return "Your sign-in to the site has run out. Reload the page (your draft is kept) and publish again.";
    return String((e && e.message) || e).replace(/\.$/, "") + ".";
  }

  // Who the load balancer signed in, and whether they may publish.
  function whoAmI() {
    if (ui.me && !ui.me.error) return;
    apiCall("GET", "/me").then(
      function (me) {
        ui.me = me;
        refreshPublish();
      },
      function (e) {
        ui.me = { error: publishError(e) };
        refreshPublish();
      }
    );
  }

  // S3 takes a presigned POST as a form, with the file last.
  function uploadBundle(up, zip, name) {
    var form = new FormData();
    Object.keys(up.fields || {}).forEach(function (k) {
      form.append(k, up.fields[k]);
    });
    form.append("file", zip, name);
    return fetch(up.url, { method: "POST", body: form }).then(
      function (res) {
        if (res.ok) return;
        return res.text().then(function (xml) {
          var code = /<Code>([^<]+)<\/Code>/.exec(xml);
          throw new Error("S3 refused the upload (" + (code ? code[1] : res.status) + ")");
        });
      },
      function () {
        throw new Error("Couldn't reach S3 to upload the bundle. The bucket's CORS settings may not include this site");
      }
    );
  }

  function publishToStaging() {
    var m = state.meta;
    if (publishing()) return;
    if (!hasContent()) return toast("Write something first: there's nothing to publish.");
    if (!m.title.trim()) return toast("Give the page a title first.");
    if (!state.assetsLoaded) return toast("Still loading this page's images and files. Try again in a moment.");
    if (ui.me && (ui.me.error || ui.me.allowed === false)) return toast(ui.me.error || ui.me.email + " can't publish from here.");
    syncPaths();
    var md = toMarkdown();
    if (bundleSize(md) > BUNDLE_MAX) return toast("The bundle is over the " + BUNDLE_MAX / MB + " MB the pipeline takes. Make screenshots smaller, or link to big files where they already live.");
    var id = state.id;
    var name = bundleName();
    var p = { stage: "uploading", at: Date.now(), path: filePath(), mode: m.mode === "update" ? "update" : "new", sig: signature() };
    m.published = p;
    save();
    refreshPublish();
    Promise.all([buildBundle(), sha256(utf8(md))])
      .then(function (made) {
        p.pageSha = made[1];
        return apiCall("POST", "/uploads", { name: name }).then(function (up) {
          p.key = up.key;
          return uploadBundle(up, made[0], name);
        });
      })
      .then(function () {
        p.uploaded = true;
        return apiCall("POST", "/publishes", { key: p.key });
      })
      .then(
        function (run) {
          p.stage = "queued";
          p.runId = run.runId;
          p.runUrl = run.runUrl;
          storePublished(id, p);
          pollSoon(id, 3000);
        },
        function (e) {
          p.stage = "failed";
          p.failedStep = p.uploaded ? 1 : 0;
          p.message = publishError(e);
          storePublished(id, p);
          if (state.id === id) toast("Couldn't publish: " + p.message, ui.publishBox ? null : "Details", openPublish);
        }
      );
  }

  // p belongs to draft id, which may not be the one showing any more.
  function storePublished(id, p) {
    if (state.id === id) {
      state.meta.published = p;
      save();
      refreshPublish();
      return;
    }
    var other = loadDraft(id);
    if (other) {
      other.meta.published = p;
      write(DRAFT_PREFIX + id, draftJson(other));
    }
  }

  // When a draft is shown: carry on following its publish, if it has one.
  function followPublish() {
    if (!ui.root) return;
    clearTimeout(ui.pollTimer);
    refreshPublish();
    var p = state && state.meta.published;
    if (p && p.expired) {
      p.stopped = p.expired = false;
      p.message = "";
      p.followFrom = Date.now();
    }
    if (!publishApi() || !p || !p.runId || !publishing(p)) return;
    pollSoon(state.id, 500);
  }

  function pollSoon(id, delay) {
    clearTimeout(ui.pollTimer);
    ui.pollTimer = setTimeout(function () {
      pollOnce(id);
    }, delay);
  }

  function pollOnce(id) {
    // Another draft is showing: this one carries on when it's shown again.
    if (!state || state.id !== id) return;
    var p = state.meta.published;
    if (!p || !p.runId || !publishing(p)) return;
    if (Date.now() - (p.followFrom || p.at) > FOLLOW_FOR) {
      p.stopped = true;
      p.message = "Stopped checking on it after an hour.";
      save();
      refreshPublish();
      return;
    }
    apiCall("GET", "/runs/" + encodeURIComponent(p.runId)).then(
      function (run) {
        if (state.id !== id || state.meta.published !== p) return;
        ui.pollErrors = 0;
        var before = JSON.stringify(p);
        ["runUrl", "prUrl", "stagingUrl"].forEach(function (k) {
          if (run[k]) p[k] = run[k];
        });
        p.message = run.message || "";
        p.stage = STAGE_STEP[run.stage] != null || run.stage === "failed" ? run.stage : p.stage;
        if (p.stage === "failed") p.failedStep = p.stagingUrl ? 3 : p.prUrl ? 2 : 1;
        // Merged: main has the page as it was published, so a change made
        // from here on is a change to that.
        if ((STAGE_STEP[p.stage] >= 3 || p.failedStep === 3) && p.pageSha && !p.merged) {
          p.merged = true;
          state.meta.base = { path: p.path, sha256: p.pageSha };
          state.meta.mode = "update";
        }
        if (JSON.stringify(p) !== before) {
          save();
          refreshPublish();
          if (p.stage !== JSON.parse(before).stage) announcePublish(p);
        }
        if (publishing(p)) pollSoon(id, p.stage === "checking" || p.stage === "queued" ? 5000 : 8000);
      },
      function (e) {
        if (state.id !== id || state.meta.published !== p) return;
        ui.pollErrors = (ui.pollErrors || 0) + 1;
        if ((e && e.expired) || ui.pollErrors >= 5) {
          p.stopped = true;
          // Signing in again is a reload, which carries on from here.
          p.expired = !!(e && e.expired);
          p.message = e && e.expired ? publishError(e) : "Couldn't get how it's going (" + publishError(e).replace(/\.$/, "") + ").";
          save();
          refreshPublish();
          return;
        }
        pollSoon(id, 15000);
      }
    );
  }

  function announcePublish(p) {
    if (p.stage === "live") {
      toast("“" + (state.meta.title.trim() || "The page") + "” is live on staging.", state.meta.visibility === "draft" ? null : "Open it", function () {
        window.open(siteUrl(p.path.replace(/^docs\//, "")), "_blank", "noopener");
      });
    } else if (p.stage === "merged") toast("Merged into main. Staging shows it once its pipeline has run.");
    else if (p.stage === "failed") toast("Publishing didn't work: " + (p.message || "the pipeline failed."), ui.publishBox ? null : "Details", openPublish);
  }

  function refreshPublish() {
    if (ui.publishButton) {
      var busy = publishing();
      ui.publishButton.classList.toggle("writer-busy", busy);
      ui.publishButton.lastChild.textContent = busy ? "Publishing…" : "Publish";
    }
    if (ui.publishBox && ui.publishBox.isConnected) renderPublish();
    updateStatus();
  }

  // The Publish to staging tab, in Publish (renderPublish).
  function publishHtml() {
    var m = state.meta;
    var p = m.published;
    var me = ui.me;
    var busy = publishing(p);
    var path = filePath();
    var update = m.mode === "update";
    var md = toMarkdown();
    var images = usedAssets("images", md).length;
    var files = usedAssets("files", md).length;
    var out = "";

    function note(text, warn, visibility, label) {
      return (
        '<div class="writer-note' + (warn ? " writer-note--warn" : "") + '"><p>' + text + "</p>" +
        (visibility ? '<p><button type="button" class="md-button md-button--ghost md-button--sm" data-visibility="' + visibility + '">' + esc(label) + "</button></p>" : "") +
        "</div>"
      );
    }

    if (!me) out += '<p class="writer-note">Checking your sign-in…</p>';
    else if (me.error) out += note(esc(me.error), true);
    else if (!me.allowed) out += note(esc(me.email) + " can't publish from here yet. Ask for it to be added to the publish service's list of writers (WRITERS); until then, use Upload the bundle.", true);
    else out += '<p class="writer-note">Publishing as <strong>' + esc(me.name) + "</strong> (" + esc(me.email) + ").</p>";

    var contents = [images ? plural(images, "image") : "", files ? plural(files, "file") : ""].filter(Boolean).join(" and ");
    out +=
      "<p>" + (update ? "Changes" : "Adds") + " <code>" + esc(path) + "</code>" + (contents ? ", with its " + contents : "") +
      ". Once the pipeline has checked the page and built the site with it, the change merges into main by itself, and staging shows it a few minutes later. " +
      "Production gets it the next time someone runs the production pipeline.</p>";

    // Staging only (draft: prod) holds a new page back from production. A
    // live page keeps its Visibility: production keeps the old version
    // until its pipeline runs, and Staging only would take it off there.
    var opened = openedVisibility();
    if (m.visibility === "draft") out += note("Visibility is <strong>Draft</strong>, so staging won't show this page either. To review it there, make it Staging only.", true, "draft-prod", "Make it Staging only");
    else if (update && m.visibility === "draft-prod" && opened && opened !== "draft-prod")
      out += note("This page is on production. <strong>Staging only</strong> would take it out of production's menu, search and sitemap the next time production is published. To change a live page, keep its Visibility: production keeps the old version until then.", true, opened, "Keep it " + VISIBILITY_NAMES[opened]);
    else if (!update && m.visibility !== "draft-prod")
      out += note("Production publishes everything on main, this page included, the next time someone runs it. If the page shouldn't reach readers until it's been reviewed, make it <strong>Staging only</strong>, and change that when it's ready.", false, "draft-prod", "Make it Staging only");
    else if (!update) out += note("<strong>Staging only</strong>: production leaves this page out. When it's ready for readers, change Visibility under Page settings and publish again.");

    var again = p && !busy && p.stage !== "failed" && p.path === path;
    var blocked = busy || (me && (me.error || !me.allowed));
    out +=
      '<p><button type="button" class="md-button md-button--primary' + (busy ? " writer-busy" : "") + '" data-publish' + (blocked ? " disabled" : "") + ">" +
      iconHtml("source-pull") + "<span>" + (busy ? "Publishing…" : again ? "Publish again" : "Publish to staging") + "</span></button></p>";
    if (again && p.sig !== signature()) out += '<p class="writer-note writer-note--warn">You\'ve changed the page since you published it. Publish again to send the changes.</p>';
    if (p) out += publishProgressHtml(p);
    return out;
  }

  function publishProgressHtml(p) {
    var at = p.stage === "failed" ? p.failedStep || 0 : STAGE_STEP[p.stage] || 0;
    var links = [
      null,
      p.runUrl ? ["the run", p.runUrl] : null,
      p.prUrl ? ["the pull request", p.prUrl] : null,
      p.stagingUrl ? ["the staging run", p.stagingUrl] : null,
      p.stage === "live" && state.meta.visibility !== "draft" ? ["open the page", siteUrl(p.path.replace(/^docs\//, ""))] : null,
    ];
    var items = PUBLISH_STEPS.map(function (label, i) {
      var kind = i < at || (i === at && p.stage === "live") ? "done" : i > at ? "todo" : p.stage === "failed" ? "failed" : p.stopped || p.stage === "merged" ? "waiting" : "current";
      var mark = kind === "done" ? iconHtml("check") : kind === "failed" ? iconHtml("close") : kind === "current" ? '<span class="writer-spinner"></span>' : String(i + 1);
      var said = { done: "done", failed: "failed", current: "in progress", waiting: "waiting", todo: "to come" }[kind];
      var link = links[i] ? ' · <a href="' + esc(links[i][1]) + '" target="_blank" rel="noopener">' + links[i][0] + "</a>" : "";
      var message = i === at && p.message ? '<span class="writer-pubstep__msg">' + esc(p.message) + "</span>" : "";
      if (i === at && p.stage === "merged") message = '<span class="writer-pubstep__msg">Merged. Staging shows it once its pipeline has run, in a few minutes.</span>';
      return (
        '<li class="writer-pubstep writer-pubstep--' + kind + '"><span class="writer-pubstep__mark" aria-hidden="true">' + mark + "</span>" +
        '<span class="writer-pubstep__text">' + label + '<span class="sr-only"> (' + said + ")</span>" + link + message + "</span></li>"
      );
    });
    var extra = "";
    if (p.stage === "failed" && p.mode === "update" && /changed since you opened it|conflicts with main|isn't in the repository any more/.test(p.message || ""))
      extra += '<p class="writer-note"><button type="button" class="md-button md-button--ghost md-button--sm" data-publish-reopen>' + iconHtml("file-document-edit-outline") + "<span>Open the latest version</span></button> in a draft of its own; this one stays in Drafts and versions, to copy your change from.</p>";
    if (p.stopped && p.runId) extra += '<p><button type="button" class="md-button md-button--ghost md-button--sm" data-publish-check>' + iconHtml("history") + "<span>Check again</span></button></p>";
    if (p.stage === "live") extra += '<p class="writer-note">Production gets it the next time someone runs the production pipeline.</p>';
    return '<div class="writer-pub"><p class="writer-pub__when">Published ' + esc(when(p.at)) + "</p><ol class=\"writer-pubsteps\">" + items.join("") + "</ol>" + extra + "</div>";
  }

  function iconHtml(name) {
    return '<span class="writer-icon" aria-hidden="true">' + ((data && data.ui[name]) || "") + "</span>";
  }

  // what: "page", or the image or file as "images/<name>" / "files/<name>".
  function fileRowHtml(name, folder, what) {
    return (
      '<div class="writer-file"><span class="writer-file__name"><code>' + esc(name) + "</code></span>" +
      '<span class="writer-file__arrow" aria-hidden="true">→</span>' +
      '<span class="writer-file__folder"><code>' + esc(folder) + "</code></span>" +
      '<button type="button" class="md-button md-button--ghost md-button--sm" data-download="' + esc(what) + '">' + iconHtml("download") + "<span>Download</span></button></div>"
    );
  }

  function copyable(lang, code) {
    return '<div class="language-' + lang + ' highlight writer-copyable"><button type="button" class="writer-copy md-button md-button--ghost md-button--sm">Copy</button><pre><span></span><code>' + esc(code) + "</code></pre></div>";
  }

  function copyText(text, done) {
    var ok = function () {
      toast(done);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
    function fallback() {
      var area = h("textarea", { value: text, style: "position:fixed;opacity:0" });
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        ok();
      } catch (e) {
        toast("Couldn't copy. Select the text and copy it yourself.");
      }
      area.remove();
    }
  }

  // The .md on its own, for the by-hand steps. The bundle has everything.
  function download() {
    syncPaths();
    offer(new Blob([toMarkdown()], { type: "text/markdown;charset=utf-8" }), fileName());
    var md = toMarkdown();
    var assets = usedAssets("images", md).length + usedAssets("files", md).length;
    toast("Downloaded " + fileName() + "." + (assets ? " It doesn't include the page's " + plural(assets, "image or file", "images and files") + ": download each from Add to site, or the bundle instead." : " Add to site says where it goes."), ui.publishBox ? null : "Add to site", openPublish);
  }

  function offer(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = h("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1000);
  }

  var toastTimer = null;
  function toast(message, action, onaction) {
    var old = document.querySelector(".writer-toast");
    if (old) old.remove();
    var node = h("div", { class: "writer-toast", role: "status" }, [
      h("span", { text: message }),
      action
        ? h("button", {
            type: "button",
            class: "writer-link-btn",
            text: action,
            onclick: function () {
              node.remove();
              onaction();
            },
          })
        : null,
    ]);
    document.body.appendChild(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.remove();
    }, action ? 8000 : 4000);
  }

  /* ── Drafts, kept in this browser ──
     Each page being written is a draft of its own, so opening another page
     never loses one. DRAFTS_KEY lists them, newest first when shown:
     { current, list: [{ id, title, path, updated, words }] }. A draft with
     nothing in it isn't listed. */

  function readIndex() {
    var ix = null;
    try {
      ix = JSON.parse(read(DRAFTS_KEY) || "null");
    } catch (e) {
      ix = null;
    }
    if (!ix || !Array.isArray(ix.list)) ix = { current: "", list: [] };
    return ix;
  }

  function writeIndex(ix) {
    return write(DRAFTS_KEY, JSON.stringify(ix));
  }

  function indexEntry(ix, id) {
    for (var i = 0; i < ix.list.length; i++) if (ix.list[i].id === id) return ix.list[i];
    return null;
  }

  function draftJson(s) {
    return JSON.stringify({ meta: s.meta, body: s.body });
  }

  function save() {
    var text = draftJson(state);
    if (text === state.savedJson) {
      updateStatus();
      return;
    }
    var ok = write(DRAFT_PREFIX + state.id, text);
    var ix = readIndex();
    var entry = indexEntry(ix, state.id);
    if (hasContent() || hasAssets()) {
      if (!entry) ix.list.push((entry = { id: state.id }));
      entry.title = state.meta.title.trim();
      entry.path = filePath();
      entry.updated = Date.now();
      entry.words = wordCount(state.body);
    }
    ix.current = state.id;
    ok = writeIndex(ix) && ok;
    ui.saveFailed = !ok;
    if (ok) {
      // What the draft was before this change, as a version to go back to.
      if (state.savedJson) keepVersion(state, state.savedJson, state.savedAt, false);
      state.savedJson = text;
      state.savedAt = Date.now();
    }
    updateStatus();
    if (ui.side === "drafts") drawDrafts();
  }

  // A draft from localStorage, or null. Its images and files come from
  // IndexedDB afterwards: loadAssets().
  function loadDraft(id) {
    try {
      var raw = read(DRAFT_PREFIX + id);
      var draft = JSON.parse(raw || "null");
      if (!draft || !draft.meta) return null;
      var s = newState(Object.assign(emptyMeta(), draft.meta), "", id);
      s.assetsLoaded = false;
      if (typeof draft.body === "string") s.body = lines(draft.body).join("\n");
      else if (Array.isArray(draft.blocks)) {
        // A draft from before the Markdown editor: a list of blocks. Their
        // Markdown needs the draft's folder, so it's the state meanwhile.
        var was = state;
        state = s;
        s.body = draft.blocks
          .filter(function (b) {
            return b && TYPES[b.type] && !isEmpty(b);
          })
          .map(function (b) {
            return TYPES[b.type].md(b);
          })
          .join("\n\n");
        state = was;
      } else return null;
      s.savedJson = draftJson(s);
      var entry = indexEntry(readIndex(), id);
      s.savedAt = (entry && entry.updated) || Date.now();
      return s;
    } catch (e) {
      return null;
    }
  }

  // The draft the writer opens with: the last one shown. The one draft kept
  // before there were several becomes the first on the list.
  function startingDraft() {
    var ix = readIndex();
    var legacy = read(DRAFT_KEY);
    var claim = false;
    if (legacy && !ix.list.length) {
      var id = newId();
      var title = "";
      try {
        title = (JSON.parse(legacy).meta || {}).title || "";
      } catch (e) {
        title = "";
      }
      if (write(DRAFT_PREFIX + id, legacy)) {
        ix.list.push({ id: id, title: String(title).trim(), path: "", updated: Date.now() });
        ix.current = id;
        writeIndex(ix);
        write(DRAFT_KEY, null);
        claim = true;
      }
    }
    var s = (ix.current && loadDraft(ix.current)) || null;
    if (!s) {
      var sorted = ix.list.slice().sort(function (a, b) {
        return (b.updated || 0) - (a.updated || 0);
      });
      for (var i = 0; i < sorted.length && !s; i++) s = loadDraft(sorted[i].id);
    }
    if (!s) {
      s = newState(emptyMeta(), "");
      s.assetsLoaded = false;
    }
    // Images and files kept before drafts had ids belong to this one.
    if (claim || (legacy && !ix.list.length)) s.claimLegacy = true;
    else if (read(IMAGES_KEY)) s.claimLegacy = true;
    return s;
  }

  // Opening a page, a bundle or a recipe: into a draft of its own, so the
  // page being written stays in Drafts. An empty draft is used as it is.
  // Returns the id for the new state.
  function takeDraft() {
    closeForm(false);
    if (!state) return newId();
    flushSave();
    // Not a draft whose images are still loading: it may have some.
    if (hasContent() || hasAssets() || !state.assetsLoaded) return newId();
    return state.id;
  }

  // After takeDraft(): where the page that was showing went, for a toast.
  function keptNote(was, id) {
    return was && was !== id ? " The page you were writing is in Drafts." : "";
  }

  // Shows a draft and makes it the current one.
  function showDraft(s) {
    state = s;
    loadPage();
    if (!s.assetsLoaded) loadAssets();
    var ix = readIndex();
    ix.current = s.id;
    writeIndex(ix);
    updateStatus();
    render();
    if (ui.side === "drafts") drawDrafts();
  }

  function switchDraft(id) {
    if (state.id === id) return;
    var next = loadDraft(id);
    if (!next) {
      toast("That draft can't be read any more, so it's been taken off the list.");
      dropFromIndex(id);
      drawDrafts();
      return;
    }
    closeForm(false);
    flushSave();
    showDraft(next);
    toast("Opened " + (next.meta.title.trim() || "the untitled draft") + ".");
  }

  function newDraft() {
    closeForm(false);
    flushSave();
    if (!hasContent() && !hasAssets()) {
      ui.welcomeDone = false;
      updateWelcome();
      ui.title.focus();
      return;
    }
    var s = newState(emptyMeta(), "");
    ui.welcomeDone = false;
    showDraft(s);
    ui.title.focus();
  }

  function dropFromIndex(id) {
    var ix = readIndex();
    var entry = indexEntry(ix, id);
    ix.list = ix.list.filter(function (e) {
      return e.id !== id;
    });
    if (ix.current === id) ix.current = "";
    writeIndex(ix);
    return entry;
  }

  // Drafts deleted in this visit whose Undo is still on offer: kept until
  // it's gone, even from collectGarbage().
  var deleting = {};

  // Off the list at once; its text, images and history go a little later,
  // unless Undo puts it back.
  function deleteDraft(id) {
    var entry = dropFromIndex(id);
    if (!entry) return;
    if (state.id === id) {
      var ix = readIndex();
      var sorted = ix.list.slice().sort(function (a, b) {
        return (b.updated || 0) - (a.updated || 0);
      });
      var next = null;
      for (var i = 0; i < sorted.length && !next; i++) next = loadDraft(sorted[i].id);
      closeForm(false);
      state.savedJson = draftJson(state);
      showDraft(next || newState(emptyMeta(), ""));
    }
    drawDrafts();
    deleting[id] = true;
    var timer = setTimeout(function () {
      delete deleting[id];
      if (!indexEntry(readIndex(), id) && state.id !== id) purgeDraft(id);
    }, 15000);
    toast("Deleted " + (entry.title ? "“" + entry.title + "”" : "the untitled draft") + ".", "Undo", function () {
      clearTimeout(timer);
      delete deleting[id];
      var ix = readIndex();
      if (!indexEntry(ix, id)) ix.list.push(entry);
      writeIndex(ix);
      drawDrafts();
    });
  }

  function purgeDraft(id) {
    write(DRAFT_PREFIX + id, null);
    tx("readwrite", function (store) {
      store.delete(draftRange(id));
    }).catch(function () {});
    tx("readwrite", function (store) {
      store.delete(draftRange(id));
    }, HISTORY_STORE).catch(function () {});
  }

  // Drafts deleted in an earlier visit, or left behind: their text, images
  // and history. Not rows without a draft id: a draft moved over from
  // before takes those (loadAssets).
  function collectGarbage() {
    var ix = readIndex();
    var live = {};
    ix.list.forEach(function (e) {
      live[e.id] = true;
    });
    Object.keys(deleting).forEach(function (id) {
      live[id] = true;
    });
    if (state) live[state.id] = true;
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var key = localStorage.key(i);
        if (key && key.indexOf(DRAFT_PREFIX) === 0 && !live[key.slice(DRAFT_PREFIX.length)]) localStorage.removeItem(key);
      }
    } catch (e) {
      // No localStorage: nothing kept to collect.
    }
    [DB_STORE, HISTORY_STORE].forEach(function (name) {
      tx("readonly", function (store) {
        return store.getAllKeys();
      }, name).then(function (keys) {
        var dead = (keys || []).filter(function (key) {
          var id = String(key).split("/")[0];
          return /^d[0-9a-z]+$/.test(id) && !live[id];
        });
        if (dead.length) {
          tx("readwrite", function (store) {
            dead.forEach(function (key) {
              store.delete(key);
            });
          }, name);
        }
      }).catch(function () {});
    });
  }

  // Before the page closes: a change the timer hasn't saved yet.
  function flushSave() {
    if (!state) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
      syncPaths();
    }
    save();
  }

  /* Versions: what a draft was before it changed, at most every few
     minutes, to compare with or go back to. versionAt: when each draft's
     last one was kept, in this visit. */

  var versionAt = {};

  function keepVersion(s, json, at, force) {
    var last = versionAt[s.id] || 0;
    if (!force && Date.now() - last < VERSION_EVERY) return;
    var draft;
    try {
      draft = JSON.parse(json);
    } catch (e) {
      return;
    }
    // A page with no text yet is nothing to go back to.
    if (!draft || !String(draft.body || "").trim()) return;
    versionAt[s.id] = Date.now();
    var id = s.id;
    var when = at || Date.now();
    tx("readwrite", function (store) {
      store.put({ draft: id, at: when, title: (draft.meta && draft.meta.title) || "", words: wordCount(draft.body || ""), json: json }, id + "/" + String(when).padStart(14, "0"));
    }, HISTORY_STORE)
      .then(function () {
        return tx("readonly", function (store) {
          return store.getAllKeys(draftRange(id));
        }, HISTORY_STORE);
      })
      .then(function (keys) {
        if (keys && keys.length > VERSIONS_KEPT) {
          var old = keys.slice(0, keys.length - VERSIONS_KEPT);
          return tx("readwrite", function (store) {
            old.forEach(function (key) {
              store.delete(key);
            });
          }, HISTORY_STORE);
        }
      })
      .then(function () {
        if (ui.side === "drafts" && state.id === id) drawDrafts();
      })
      .catch(function () {});
  }

  function versionsOf(id) {
    return tx("readonly", function (store) {
      return store.getAll(draftRange(id));
    }, HISTORY_STORE).then(function (rows) {
      return (rows || []).sort(function (a, b) {
        return b.at - a.at;
      });
    });
  }

  function restoreVersion(v) {
    var draft;
    try {
      draft = JSON.parse(v.json);
    } catch (e) {
      toast("That version can't be read.");
      return;
    }
    var before = draftJson(state);
    keepVersion(state, before, Date.now(), true);
    closeForm(false);
    state.meta = Object.assign(emptyMeta(), draft.meta || {});
    state.body = lines(draft.body || "").join("\n");
    loadPage();
    changed();
    toast("Went back to the version from " + when(v.at) + ".", "Undo", function () {
      var was = JSON.parse(before);
      closeForm(false);
      state.meta = Object.assign(emptyMeta(), was.meta);
      state.body = was.body;
      loadPage();
      changed();
    });
  }

  // "just now", "12 min ago", "today 14:32", "yesterday 09:10", "12 Sep 16:05".
  function when(at) {
    var d = new Date(at);
    var now = new Date();
    var mins = Math.round((now - d) / 60000);
    function two(n) {
      return (n < 10 ? "0" : "") + n;
    }
    var clock = two(d.getHours()) + ":" + two(d.getMinutes());
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (d >= day) return "today " + clock;
    if (d >= new Date(day - 864e5)) return "yesterday " + clock;
    return d.getDate() + " " + d.toLocaleString("en-GB", { month: "short" }) + (d.getFullYear() !== now.getFullYear() ? " " + d.getFullYear() : "") + " " + clock;
  }

  // Words of text, not counting code.
  function wordCount(md) {
    var text = String(md || "")
      .replace(/(`{3,}|~{3,})[\s\S]*?\1/g, " ")
      .replace(/`[^`\n]*`/g, " x ")
      .replace(/<[^>]+>|\{[^}\n]*\}|\]\([^)]*\)/g, " ")
      .replace(/[#>*_=|~+\-[\]!:]+/g, " ");
    return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length;
  }

  function updateStatus() {
    if (!ui.status) return;
    var assetsLost = state.assetsSaved === false && hasAssets();
    var warn = ui.saveFailed
      ? "Can't keep a draft in this browser: download before you leave."
      : assetsLost
        ? "Can't keep the images and files in this browser: download the bundle before you leave."
        : "";
    ui.status.textContent = ui.status.title = warn || (publishApi() && publishing() ? "Publishing to staging…" : "");
    ui.status.classList.toggle("writer-status--warn", !!warn);
    updateFooter();
  }

  /* ── Mount on every page ── */

  function mountWriter() {
    var root = document.querySelector(".md-typeset #writer:not([data-mounted])");
    if (root) mount(root);
  }

  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(mountWriter);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWriter);
  } else {
    mountWriter();
  }
})();
