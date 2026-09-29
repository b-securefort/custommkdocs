/* Page writer (docs/write.md): build a page from the site's components in the
 * browser, preview it with the site's own styles, and download it as a bundle:
 * one .zip with the page, its images and files, and a manifest.json saying
 * where each one goes in the repository (tools/ingest_bundle.py reads it).
 *
 * hooks/writer.py puts the site's folders, pages and icons in the page as
 * JSON. Nothing is sent anywhere: the draft is kept in this browser (images
 * and files in IndexedDB) until the writer downloads it, and "Add to site"
 * says what to do with the bundle.
 *
 * A page is a list of blocks. Each block type draws its form, writes its
 * Markdown and previews itself with the HTML the build would produce.
 * Opening a .md file parses it back into blocks; anything the parser doesn't
 * recognise stays as a Text block, word for word, so nothing is lost.
 *
 * Mounts on Material's document$, like the other scripts. */
(function () {
  "use strict";

  var SCRIPT = document.currentScript && document.currentScript.src;
  var BASE = SCRIPT ? SCRIPT.replace(/javascripts\/writer\.js(?:[?#].*)?$/, "") : "/";
  var MARKED_SRC = BASE + "javascripts/vendor/marked.min.js";
  // The build Material itself loads for pages with diagrams.
  var MERMAID_SRC = "https://unpkg.com/mermaid@11/dist/mermaid.min.js";
  var DRAFT_KEY = "docs.writer.draft";
  // Where drafts kept images before IndexedDB: read once, moved, removed.
  var IMAGES_KEY = "docs.writer.images";
  var PANEL_KEY = "docs.writer.panel";
  // Images and files are too big for localStorage.
  var DB_NAME = "docs.writer";
  var DB_STORE = "assets";

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
  // { meta, blocks, images, files }: images and files map a name to a Blob.
  var state = null;
  var ui = {};
  var nextId = 1;

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
    };
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

  function makeBlock(type, preset) {
    var block = TYPES[type].create();
    if (preset) Object.assign(block, copy(preset));
    block.type = type;
    block.id = "b" + nextId++;
    return block;
  }

  function isEmpty(block) {
    return TYPES[block.type].empty(block);
  }

  function liveBlocks() {
    return state.blocks.filter(function (b) {
      return !isEmpty(b);
    });
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
    { need: "Fix an error they've hit", type: "troubleshoot", name: "Troubleshooting entry", rather: "a FAQ written as prose" },
    { need: "Compare options on the same points", type: "table", name: "Table", rather: "a paragraph for each option" },
    { need: "Check they're in the right place", type: "image", name: "Screenshot", rather: "a screenshot instead of the instructions" },
    { need: "See how parts connect or a decision flows", type: "diagram", name: "Diagram", rather: "a paragraph describing the arrows" },
    { need: "Choose where to go next", type: "cards", name: "Cards", rather: "a bulleted list of links" },
    { need: "Take the one action the page is about", type: "buttons", name: "Button", rather: "a link at the end of a sentence" },
    { need: "See what changed over time", type: "timeline", name: "Timeline", rather: "a numbered list" },
  ];

  /* ── Page recipes (from the Page recipes in Choosing components) ── */

  var RECIPES = [
    {
      name: "How-to",
      text: "Steps to get one task done.",
      blocks: [
        ["text", { hint: "One sentence saying what the reader will have at the end." }],
        ["heading", { text: "Before you start" }],
        ["text", { hint: "Prerequisites as a checklist:\n- [ ] An account with access to …\n- [ ] The tools installed: …" }],
        ["heading", { hint: "Name the procedure, such as: Create the storage account" }],
        ["steps", { items: [{ action: "", body: "" }, { action: "", body: "" }, { action: "", body: "" }] }],
        ["callout", { kind: "success", hint: "What they should see now" }],
        ["heading", { text: "Troubleshooting" }],
        ["troubleshoot", {}],
        ["buttons", { items: [{ text: "", link: "", style: "primary" }] }],
      ],
    },
    {
      name: "Cloud how-to",
      text: "A task in Azure or AWS, with permissions, your values and portal / CLI tabs.",
      meta: { applies_to: ["azure"] },
      blocks: [
        ["text", { hint: "One sentence saying what the reader will have at the end." }],
        ["callout", { kind: "permissions", hint: "You need Contributor on the resource group" }],
        ["values", { items: [{ name: "subscription-id", label: "Azure subscription ID" }, { name: "resource-group", label: "Resource group name" }, { name: "location", label: "Azure region, such as `westeurope`" }] }],
        ["heading", { hint: "Name the procedure, such as: Create the resource group" }],
        [
          "tabs",
          {
            tabs: [
              { label: "Portal", body: "", hint: "1. Go to **Home > Resource groups > Create**{ .ui-path }.\n2. …" },
              { label: "Azure CLI", body: "", hint: "``` bash\naz group create --name <resource-group> --location <location>\n```" },
            ],
          },
        ],
        ["output", {}],
        ["heading", { text: "Troubleshooting" }],
        ["troubleshoot", {}],
      ],
    },
    {
      name: "Reference",
      text: "Settings or commands people look up.",
      blocks: [
        ["text", { hint: "One sentence on what's listed here." }],
        ["heading", { hint: "A group of settings" }],
        ["table", { rows: [["Setting", "What it does", "Default"], ["", "", ""], ["", "", ""]] }],
        ["code", {}],
      ],
    },
    {
      name: "Section landing",
      text: "The first page of a tab: what's in it and where to go.",
      blocks: [
        ["text", { hint: "Two sentences on what this section covers." }],
        ["cards", {}],
      ],
    },
    {
      name: "Troubleshooting",
      text: "A page of errors, each with its cause and fix.",
      blocks: [
        ["text", { hint: "One sentence on what this page helps with." }],
        ["heading", { hint: "A group, such as: Sign-in" }],
        ["troubleshoot", {}],
        ["troubleshoot", {}],
      ],
    },
    {
      name: "Release notes",
      text: "What changed, release by release.",
      blocks: [
        ["text", { hint: "One sentence on what these notes cover." }],
        ["timeline", { items: [{ label: "", colour: "green", text: "" }, { label: "", colour: "accent", text: "" }, { label: "", colour: "grey", text: "" }] }],
        ["heading", { badge: "new", hint: "v2.0" }],
        ["text", { hint: "What's new in this release." }],
        ["callout", { kind: "danger", hint: "Breaking: what changed and what to do" }],
      ],
    },
    {
      name: "Blank page",
      text: "Start from nothing.",
      blocks: [["text", {}]],
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

  function parseBlocks(text) {
    var ls = lines(text);
    var out = [];
    var buf = [];
    var i = 0;
    function flush() {
      var t = trimBlank(buf);
      if (t.length) out.push({ type: "text", md: t.join("\n") });
      buf = [];
    }
    function take(block, next) {
      flush();
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
          buf = buf.concat(ls.slice(i, r.next));
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
      buf.push(line);
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
    return { meta: meta, blocks: parseBlocks(body.join("\n")) };
  }

  /* ── Writing Markdown ── */

  function frontMatter() {
    var m = state.meta;
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

  function toMarkdown() {
    var parts = [];
    if (state.meta.title.trim() && !state.meta.titleInFront) parts.push("# " + state.meta.title.trim());
    liveBlocks().forEach(function (b) {
      parts.push(TYPES[b.type].md(b));
    });
    return frontMatter() + parts.join("\n\n") + "\n";
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
    if (!md.trim()) return "";
    if (!window.marked) return "<p>" + esc(md).replace(/\n\n+/g, "</p><p>") + "</p>";
    return finish(window.marked.parse(extensions(md)));
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

  // attr_list, the ui-path hook, and a sanitiser: an opened file is shown
  // here, so it mustn't be able to run script in the page.
  function finish(html) {
    html = html
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

  // Through execCommand, so the browser's undo still works.
  function replaceSelection(area, text) {
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

  function wrapper(before, after, sample) {
    return function (area) {
      var start = area.selectionStart;
      var inner = area.value.slice(start, area.selectionEnd) || sample;
      replaceSelection(area, before + inner + after);
      area.setSelectionRange(start + before.length, start + before.length + inner.length);
    };
  }

  function linePrefix(numbered) {
    return function (area) {
      var value = area.value;
      var start = value.lastIndexOf("\n", area.selectionStart - 1) + 1;
      var end = value.indexOf("\n", area.selectionEnd);
      if (end < 0) end = value.length;
      area.setSelectionRange(start, end);
      var n = 0;
      var text = value
        .slice(start, end)
        .split("\n")
        .map(function (line) {
          return line.trim() ? (numbered ? ++n + ". " : "- ") + line.replace(/^\s*([-*+]|\d+\.)\s+/, "") : line;
        })
        .join("\n");
      replaceSelection(area, text || (numbered ? "1. " : "- "));
    };
  }

  var TOOLS = [
    { icon: "format-bold", label: "Bold (Ctrl+B)", key: "b", run: wrapper("**", "**", "bold text") },
    { icon: "format-italic", label: "Italic (Ctrl+I)", key: "i", run: wrapper("*", "*", "italic text") },
    { icon: "code-tags", label: "Inline code: names of files, settings and values", run: wrapper("`", "`", "code") },
    { icon: "link-variant", label: "Link to a page or website (Ctrl+K)", key: "k", run: openLinkDialog },
    { icon: "cursor-default-click-outline", label: "Click path, such as Home > Resource groups > Create", run: wrapper("**", "**{ .ui-path }", "Home > Resource groups > Create") },
    { icon: "keyboard-outline", label: "Keyboard shortcut", run: wrapper("++", "++", "ctrl+c") },
    { icon: "format-list-bulleted", label: "Bulleted list", run: linePrefix(false) },
    { icon: "format-list-numbered", label: "Numbered list", run: linePrefix(true) },
    {
      icon: "image-outline",
      label: "Image (or paste a screenshot)",
      run: function (area) {
        pickImage(function (name) {
          replaceSelection(area, "![Describe what the image shows](" + imageRel(name) + ")");
        });
      },
    },
    {
      icon: "paperclip",
      label: "Attach a file to download: " + FILE_KINDS + ", up to " + FILE_MAX / MB + " MB",
      run: function (area) {
        pickFile(function (name) {
          insertFileLink(area, name);
        });
      },
    },
  ];

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
          if (TOOLS[i].key && TOOLS[i].key === event.key.toLowerCase()) {
            event.preventDefault();
            TOOLS[i].run(area);
            return;
          }
        }
      },
      onpaste: opts.code
        ? null
        : function (event) {
            var files = event.clipboardData && event.clipboardData.files;
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
          TOOLS.map(function (tool) {
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

  function addImageFile(file, done) {
    if (file.size > IMAGE_MAX) {
      toast("That image is over " + IMAGE_MAX / MB + " MB. Crop it or save it smaller, then try again.");
      return;
    }
    var ext = (file.type.split("/")[1] || extOf(file.name) || "png").replace("jpeg", "jpg").replace(/\+.*/, "");
    if (!IMAGE_TYPES[ext]) {
      toast("Use a PNG, JPEG, GIF, WebP or SVG image.");
      return;
    }
    bytesOf(file).then(
      function (bytes) {
        var stem = file.name && !/^image\.\w+$/i.test(file.name) ? slugify(file.name.replace(/\.[^.]+$/, "")) : "";
        var name = uniqueName("images", (stem || slug() + "-screenshot") + "." + ext);
        addAsset("images", name, new Blob([bytes], { type: IMAGE_TYPES[ext] }));
        done(name);
      },
      function () {
        toast("Couldn't read that image. Save it somewhere else and try again.");
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
        done(name);
      },
      function () {
        toast("Couldn't read that file. Save it somewhere else and try again.");
      }
    );
  }

  function pickImage(done) {
    var picker = h("input", {
      type: "file",
      accept: "image/png,image/jpeg,image/gif,image/webp,image/svg+xml",
      onchange: function () {
        if (picker.files[0]) addImageFile(picker.files[0], done);
      },
    });
    picker.click();
  }

  function pickFile(done) {
    var picker = h("input", {
      type: "file",
      accept: Object.keys(FILE_TYPES).map(function (ext) {
        return "." + ext;
      }).join(","),
      onchange: function () {
        if (picker.files[0]) addAttachment(picker.files[0], done);
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
    if (kind === "images") {
      state.blocks.forEach(function (b) {
        if (b.type !== "image" || b.image !== from) return;
        b.image = to;
        if (touched.indexOf(b) < 0) touched.push(b);
      });
    }
    touched.forEach(redrawBlock);
    unstoreAsset(kind, from);
    storeAsset(kind, to, blob);
    drawAssets(true);
    changed();
    toast("Renamed to " + to + (touched.length ? ", and the page points to the new name." : "."));
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

  function redrawImageBlocks() {
    state.blocks.forEach(function (b) {
      if (b.type === "image" && b.image) redrawBlock(b);
    });
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

  // Rewrites the relative links and image paths in every block. move gets
  // each one's path from docs/ and returns where it points now, or null to
  // leave it. Returns the blocks that changed.
  function rewriteRefs(fromFolder, toFolder, move) {
    function fix(href) {
      if (!href || isExternal(href)) return href;
      var parts = splitHash(href);
      var dest = move(joinPath(fromFolder, parts[0]));
      return dest ? relPath(toFolder, dest) + parts[1] : href;
    }
    var touched = [];
    state.blocks.forEach(function (b) {
      var before = JSON.stringify(b);
      walk(b, function (value, key) {
        if (key === "hint") return value;
        if (key === "link" || key === "src") return fix(value);
        return value
          .replace(/(\]\(\s*)([^)\s]+)/g, function (all, open, href) {
            return open + fix(href);
          })
          .replace(/(\b(?:src|href)=")([^"]+)/g, function (all, open, href) {
            return open + fix(href);
          });
      });
      if (JSON.stringify(b) !== before) touched.push(b);
    });
    return touched;
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
    }).forEach(redrawBlock);
  }

  /* ── Keeping images and files in this browser (IndexedDB) ── */

  var dbOpen = null;
  function db() {
    if (!dbOpen) {
      dbOpen = new Promise(function (resolve, reject) {
        try {
          var request = window.indexedDB.open(DB_NAME, 1);
          request.onupgradeneeded = function () {
            request.result.createObjectStore(DB_STORE);
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
  // returned, once the transaction is written.
  function tx(mode, fn) {
    return db().then(function (conn) {
      return new Promise(function (resolve, reject) {
        try {
          var t = conn.transaction(DB_STORE, mode);
          var request = fn(t.objectStore(DB_STORE));
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

  function storeAsset(kind, name, blob) {
    track(
      tx("readwrite", function (store) {
        store.put({ kind: kind, name: name, blob: blob }, kind + "/" + name);
      }),
      false
    );
  }

  function unstoreAsset(kind, name) {
    track(
      tx("readwrite", function (store) {
        store.delete(kind + "/" + name);
      }),
      false
    );
  }

  // A new or opened page: its images and files replace the last page's.
  function storeAllAssets() {
    var mine = state;
    var promise = tx("readwrite", function (store) {
      store.clear();
      ["images", "files"].forEach(function (kind) {
        Object.keys(mine[kind]).forEach(function (name) {
          store.put({ kind: kind, name: name, blob: mine[kind][name] }, kind + "/" + name);
        });
      });
    });
    track(promise, true);
    return promise;
  }

  // Once, when the page loads with a draft: its images and files, plus any
  // images an older version of this page kept in localStorage.
  function loadAssets() {
    var mine = state;
    function done(rows, stored) {
      if (state !== mine) return;
      (rows || []).forEach(function (row) {
        if (row && (row.kind === "images" || row.kind === "files") && row.blob) mine[row.kind][row.name] = row.blob;
      });
      var legacy = legacyImages();
      Object.keys(legacy).forEach(function (name) {
        if (!mine.images[name]) mine.images[name] = legacy[name];
      });
      mine.assetsLoaded = true;
      mine.assetsSaved = stored;
      if (Object.keys(legacy).length && stored) {
        storeAllAssets().then(function () {
          write(IMAGES_KEY, null);
        });
      }
      syncPaths();
      redrawImageBlocks();
      drawAssets(true);
      updateStatus();
      render();
    }
    tx("readonly", function (store) {
      return store.getAll();
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
        toast("Downloaded " + name + ". Add to site says what to do with it.", ui.panel === "publish" ? null : "Add to site", function () {
          showPanel("publish");
        });
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
        if (hasContent() && !window.confirm("Replace the page you're writing with the one in " + file.name + "? Download it first if you want to keep it.")) return;
        var target = /^docs\/(?:(.+)\/)?([^/]+)\.md$/.exec(manifest.page.target);
        var doc = parseDocument(fromUtf8(entries[manifest.page.src]));
        nextId = 1;
        state = {
          meta: doc.meta,
          blocks: doc.blocks.map(function (b) {
            b.id = "b" + nextId++;
            return b;
          }),
          images: {},
          files: {},
          assetsLoaded: true,
          assetsSaved: true,
        };
        state.meta.mode = manifest.mode === "update" ? "update" : "new";
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
        syncPaths();
        // An image block pointing at one of the bundle's images is that
        // uploaded image again, with its thumbnail and Replace button.
        state.blocks.forEach(function (b) {
          var found = b.type === "image" && b.src && attachedAt(joinPath(folderPath(), b.src.trim()));
          if (found && found.kind === "images") {
            b.image = found.name;
            b.src = "";
          }
        });
        state.meta.bundle = { name: file.name, sig: signature() };
        storeAllAssets();
        drawSetup();
        drawAssets(true);
        drawBlocks();
        changed();
        var skipped = (manifest.assets || []).length - assets.length;
        var images = Object.keys(state.images).length;
        var files = Object.keys(state.files).length;
        toast(
          "Opened " + manifest.page.target + (images || files ? " with " + [images ? plural(images, "image") : "", files ? plural(files, "file") : ""].filter(Boolean).join(" and ") : "") + "." +
            (skipped ? " Left out " + plural(skipped, "image or file", "images and files") + " that didn't match the manifest." : "")
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
    state.blocks.forEach(function (b) {
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
    function add(level, text, id) {
      out.push({ level: level, text: text, id: id });
    }
    if (!m.title.trim()) add("warn", "Give the page a title.");
    var empties = state.blocks.filter(isEmpty);
    if (empties.length) add("info", plural(empties.length, "empty component") + " will be left out of the file.", empties[0].id);
    var live = liveBlocks();

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
        values.length ? values[0].id : null
      );
    }
    var unused = listed.filter(function (n) {
      return used.indexOf(n) < 0;
    });
    if (unused.length) add("info", "Listed in Your values but not used in any code: " + unused.map(function (n) { return "<" + n + ">"; }).join(", "), values[0].id);
    listed.concat(used).forEach(function (name, i, all) {
      if (all.indexOf(name) !== i) return;
      if (SECRET_NAME.test(name)) add("warn", "<" + name + "> looks like a secret. Values are saved unencrypted in the reader's browser: tell readers where to get it instead, such as Key Vault.");
      if (PLACEHOLDER_ALIASES[name]) add("info", "Use <" + PLACEHOLDER_ALIASES[name] + "> instead of <" + name + ">, so values carry across pages.");
    });
    if (values.length && used.length) {
      var firstCode = codeTexts().filter(function (entry) {
        return /<[a-z0-9]/i.test(entry.text);
      })[0];
      var codeIndex = firstCode ? state.blocks.map(function (b) { return b.id; }).indexOf(firstCode.id) : -1;
      if (codeIndex >= 0 && state.blocks.indexOf(values[0]) > codeIndex) add("warn", "Move the Your values box above the first command.", values[0].id);
    }

    live.forEach(function (b) {
      if (b.type !== "tabs") return;
      b.tabs.forEach(function (t) {
        var standard = TAB_ALIASES[t.label.trim().toLowerCase()];
        if (standard && standard !== t.label.trim()) add("info", "Label the tab “" + standard + "” rather than “" + t.label.trim() + "”, so a reader's choice carries across pages.", b.id);
      });
    });

    var level = 1;
    live.forEach(function (b) {
      if (b.type !== "heading") return;
      if (b.level > level + 1) add("warn", "This heading skips a level. Use a Section before a Sub-section.", b.id);
      level = b.level;
    });

    live.forEach(function (b) {
      if (b.type === "image" && !b.alt.trim()) add("warn", "Add alt text to the image: what it shows, for readers who can't see it.", b.id);
      if (b.type === "code" && !b.lang.trim()) add("info", "Name the code block's language so it's coloured.", b.id);
      if (b.type === "steps" && b.items.filter(stepFilled).length === 1) add("info", "A single step reads better as a paragraph.", b.id);
      if (b.type === "cards") {
        var n = b.items.filter(function (c) { return c.title.trim(); }).length;
        if (n === 1) add("info", "A single card is only a box. Write a paragraph instead.", b.id);
        if (n > 6) add("info", "Six cards at most. Split them into groups under headings.", b.id);
      }
      walk(copy(b), function (value, key) {
        if (key === "hint") return value;
        if (/!\[(|Describe what the image shows)\]\(/.test(value)) add("warn", "An image has no alt text. Replace “Describe what the image shows”.", b.id);
        else if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(value)) add("warn", "An <img> has no alt text. Add alt=\"…\" saying what it shows.", b.id);
        return value;
      });
    });

    var md = toMarkdown();
    ["images", "files"].forEach(function (kind) {
      var unused = Object.keys(state[kind]).filter(function (name) {
        return !mentions(md, assetPath(kind, assetDir(), name));
      });
      if (!unused.length) return;
      if (kind === "files") add("warn", "Nothing links to " + unused.join(", ") + ", so readers can't download it and it's left out of the bundle. Link to it, or remove it under Images and files.");
      else add("info", "Not shown on the page, so left out of the bundle: " + unused.join(", ") + ".");
    });
    live.forEach(function (b) {
      missingRefs(b).forEach(function (ref) {
        if (ref.kind === "files") add("warn", "Links to " + ref.href + ", which isn't attached or on the site. Attach it (the paperclip), or fix the link.", b.id);
        else add("warn", "Shows " + ref.href + ", which isn't uploaded or on the site. Upload it again, or fix the path.", b.id);
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
    if (cloudy && !m.applies_to.length) add("info", "This page runs cloud commands. Under Page details, set which platforms it applies to.");
    if (m.applies_to.length && (!m.owner.trim() || !m.last_reviewed)) add("info", "Cloud pages name an owner and a last reviewed date (Page details), so readers know how far to trust them.");
    if (m.visibility === "draft") add("info", "Draft: this page won't be published anywhere until you change Visibility.");
    return out;
  }

  /* ── Drawing the writer ── */

  function mount(root) {
    var source = document.getElementById("writer-data");
    if (!source) {
      root.textContent = "The page writer needs hooks/writer.py in mkdocs.yml.";
      return;
    }
    data = JSON.parse(source.textContent);
    root.setAttribute("data-mounted", "");
    root.innerHTML = "";
    ui = { root: root };
    if (!state) {
      state = loadDraft() || { meta: emptyMeta(), blocks: [], images: {}, files: {}, assetsSaved: true };
      loadAssets();
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
    ui.bar = h("div", { class: "writer__bar" }, [
      button("New page", "file-document-plus-outline", "md-button--ghost md-button--sm", function () {
        openRecipes();
      }),
      button("Open a .md or bundle", "file-upload-outline", "md-button--ghost md-button--sm", function () {
        fileInput.click();
      }),
      fileInput,
      ui.status,
      button("Download bundle (.zip)", "folder-zip-outline", "md-button--primary md-button--sm writer__download", downloadBundle),
    ]);

    ui.setup = h("section", { class: "writer-card writer-setup", "aria-label": "Page" });
    ui.assets = h("section", { class: "writer-card writer-assets", "aria-label": "Images and files" });
    ui.blocks = h("div", { class: "writer-blocks" });
    ui.addLast = button("Add a component", "plus", "writer-add-last", function () {
      openInsert(state.blocks.length);
    });
    ui.editor = h("div", { class: "writer__editor" }, [ui.setup, ui.assets, ui.blocks, ui.addLast]);

    ui.panels = {};
    ui.tabButtons = {};
    var tabbar = h("div", { class: "writer-tabs", role: "tablist", "aria-label": "Output" });
    [["preview", "Preview", "eye-outline"], ["markdown", "Markdown", "code-tags"], ["checks", "Checks", "check-circle-outline"], ["publish", "Add to site", "source-pull"]].forEach(function (p) {
      var tab = h("button", { type: "button", role: "tab", class: "writer-tab", id: "writer-tab-" + p[0], "aria-controls": "writer-panel-" + p[0], onclick: function () { showPanel(p[0]); } }, [icon(p[2]), h("span", { text: p[1] })]);
      if (p[0] === "checks") {
        ui.checkCount = h("span", { class: "writer-tab__count" });
        tab.appendChild(ui.checkCount);
      }
      ui.tabButtons[p[0]] = tab;
      tabbar.appendChild(tab);
      ui.panels[p[0]] = h("div", { class: "writer-panel writer-panel--" + p[0], role: "tabpanel", id: "writer-panel-" + p[0], "aria-labelledby": "writer-tab-" + p[0], hidden: true });
    });
    ui.preview = h("div", { class: "writer-preview" });
    ui.preview.addEventListener("click", function (event) {
      var part = event.target.closest && event.target.closest(".writer-pv");
      if (!part || event.target.closest("a, label, summary, input")) return;
      var card = ui.blocks.querySelector('[data-block="' + part.getAttribute("data-block") + '"]');
      if (card) {
        card.scrollIntoView({ block: "center", behavior: "smooth" });
        var first = card.querySelector("input, textarea, select");
        if (first) first.focus({ preventScroll: true });
      }
    });
    ui.panels.preview.appendChild(ui.preview);
    ui.side = h("div", { class: "writer__side" }, [tabbar].concat(Object.keys(ui.panels).map(function (k) { return ui.panels[k]; })));

    root.appendChild(ui.bar);
    root.appendChild(ui.editor);
    root.appendChild(ui.side);

    root.addEventListener("dragover", function (event) {
      if (event.dataTransfer && Array.prototype.indexOf.call(event.dataTransfer.types, "Files") >= 0) event.preventDefault();
    });
    root.addEventListener("drop", function (event) {
      var file = event.dataTransfer && event.dataTransfer.files[0];
      if (!file || event.target.closest("textarea")) return;
      event.preventDefault();
      if (/\.(md|markdown|zip)$/i.test(file.name)) openFile(file);
    });

    drawSetup();
    drawAssets(true);
    drawBlocks();
    showPanel(read(PANEL_KEY) || "preview");
    updateStatus();
    loadScript(MARKED_SRC).then(function () {
      if (window.marked) window.marked.use({ gfm: true });
      render();
    });
    render();
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

  function drawSetup() {
    var m = state.meta;
    var box = ui.setup;
    box.innerHTML = "";
    var slugInput = h("input", {
      class: "writer-input",
      value: m.slug,
      placeholder: slugify(m.title) || "new-page",
      oninput: function () {
        m.slug = slugInput.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
        m.slugEdited = !!slugInput.value;
        changed();
      },
      onchange: function () {
        m.slug = slugify(slugInput.value);
        slugInput.value = m.slug;
        m.slugEdited = !!m.slug;
        changed();
      },
    });
    var title = input(m, "title", {
      class: "writer-input writer-input--title",
      placeholder: "Page title, such as: Create a resource group",
      oninput: function () {
        m.title = title.value;
        if (!m.slugEdited) {
          m.slug = "";
          slugInput.placeholder = slugify(m.title) || "new-page";
        }
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
      drawBlocks();
    });
    box.appendChild(h("div", { class: "writer-setup__head" }, [h("span", { class: "writer-block__type" }, [icon("file-document-plus-outline"), h("span", { text: "Page" })])]));
    box.appendChild(field("Title", title));
    var where = [field("Folder (the tab it appears under)", folder, "grow")];
    if (m.folder === "__new__") {
      where.push(
        field("New folder name", input(m, "newFolder", {
          placeholder: "billing",
          onchange: function () {
            syncPaths();
            changed();
          },
        }), "narrow")
      );
    }
    box.appendChild(row(where));
    box.appendChild(
      row([
        field("File name", h("span", { class: "writer-with-suffix" }, [slugInput, h("span", { text: ".md" })]), "grow", "Lowercase words joined by hyphens. It becomes the page's address."),
        field(
          "Visibility",
          select(m, "visibility", [
            ["listed", "Published, in the menu"],
            ["unlisted", "Published, not in the menu"],
            ["draft-prod", "Staging only, for review"],
            ["draft", "Draft, not published"],
          ]),
          "narrow"
        ),
      ])
    );

    var details = h("div", { class: "writer-setup__details", hidden: !ui.detailsOpen });
    var toggle = h(
      "button",
      {
        type: "button",
        class: "writer-disclosure",
        "aria-expanded": ui.detailsOpen ? "true" : "false",
        onclick: function () {
          ui.detailsOpen = !ui.detailsOpen;
          toggle.setAttribute("aria-expanded", ui.detailsOpen ? "true" : "false");
          details.hidden = !ui.detailsOpen;
        },
      },
      [h("span", { text: "Page details" }), h("span", { class: "writer-disclosure__hint", text: "Who it's for, who owns it, when it was checked" })]
    );
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
    details.appendChild(field("Applies to", platforms, null, "Leave all unticked for pages that apply everywhere."));
    details.appendChild(
      row([
        field("Owner", input(m, "owner", { placeholder: "Platform team" }), "grow", "A team, not a person."),
        field("Last reviewed", input(m, "last_reviewed", { type: "date" }), "narrow", "Only after following the page end to end."),
        field("Review every", input(m, "review_every", { type: "number", min: "1", max: "24", placeholder: String(data.review_months || 6) }), "narrow", "Months. 3 for previews."),
      ])
    );
    details.appendChild(mdField(m, "extraFront", { label: "Other front matter (YAML, kept as written)", code: true, rows: 1, placeholder: "hide:\n  - toc" }));
    box.appendChild(toggle);
    box.appendChild(details);
  }

  // The images and files the page brings: where each goes, and whether the
  // page uses it (only those go in the bundle). Redrawn when that changes.
  function drawAssets(force) {
    var box = ui.assets;
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
      h("div", { class: "writer-setup__head" }, [
        h("span", { class: "writer-block__type" }, [icon("paperclip"), h("span", { text: "Images and files" })]),
        h("span", { class: "writer-block__actions" }, [
          button("Attach a file", "paperclip", "md-button--ghost md-button--sm", function () {
            pickFile(function (name) {
              toast("Attached " + name + ". Now link to it from the text: the link button next to it copies a link to paste.");
            });
          }),
        ]),
      ])
    );
    if (!rows.length) {
      box.appendChild(h("div", { class: "writer-block__help", text: "Nothing yet. Add a screenshot with the Screenshot component or the image button in any text box, or paste one. Attach a file for readers to download with the paperclip." }));
    }
    var list = h("div", { class: "writer-assets__list" });
    rows.forEach(function (r) {
      var blob = state[r.kind][r.name];
      list.appendChild(
        h("div", { class: "writer-asset" + (r.used ? "" : " writer-asset--unused") }, [
          r.kind === "images"
            ? h("img", { class: "writer-asset__thumb", src: assetUrl(r.kind, r.name), alt: "" })
            : h("span", { class: "writer-asset__thumb writer-asset__thumb--file", text: extOf(r.name) }),
          h("span", { class: "writer-asset__text" }, [
            h("code", { class: "writer-asset__name", title: "docs/" + assetPath(r.kind, dir, r.name), text: r.name }),
            h("span", { class: "writer-asset__meta", text: megabytes(blob.size) + (r.used ? "" : " · not on the page, so not in the bundle") }),
          ]),
          r.kind === "files"
            ? iconButton("link-variant", "Copy a link to it, to paste into the text", false, function () {
                copyText("[" + downloadLabel(r.name) + "](" + fileRel(r.name) + ")", "Link copied. Paste it where readers should download the file.");
              })
            : null,
          iconButton("pencil-outline", "Rename", false, function () {
            openRename(r.kind, r.name);
          }),
          iconButton("trash-can-outline", "Remove", false, function () {
            removeAsset(r.kind, r.name);
          }),
        ])
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

  function drawBlocks() {
    ui.blocks.innerHTML = "";
    if (!state.blocks.length) {
      ui.blocks.appendChild(recipePicker(false));
      ui.addLast.hidden = true;
      return;
    }
    ui.addLast.hidden = false;
    state.blocks.forEach(function (b, i) {
      ui.blocks.appendChild(blockCard(b, i));
    });
  }

  function blockCard(b, i) {
    var t = TYPES[b.type];
    var card = h("section", {
      class: "writer-card writer-block writer-block--" + b.type,
      "data-block": b.id,
      "aria-label": t.label,
      onfocusin: function () {
        setActive(b.id);
      },
    });
    card.appendChild(
      h("div", { class: "writer-block__head" }, [
        h("span", { class: "writer-block__type" }, [icon(t.icon), h("span", { text: t.label })]),
        h("span", { class: "writer-block__actions" }, [
          iconButton("arrow-up", "Move up", i === 0, function () {
            moveBlock(i, -1);
          }),
          iconButton("arrow-down", "Move down", i === state.blocks.length - 1, function () {
            moveBlock(i, 1);
          }),
          iconButton("content-copy", "Duplicate", false, function () {
            var twin = copy(b);
            twin.id = "b" + nextId++;
            state.blocks.splice(i + 1, 0, twin);
            drawBlocks();
            changed();
          }),
          iconButton("plus", "Add a component below", false, function () {
            openInsert(i + 1);
          }),
          iconButton("trash-can-outline", "Delete", false, function () {
            deleteBlock(i);
          }),
        ]),
      ])
    );
    if (t.help) card.appendChild(h("div", { class: "writer-block__help", text: t.help }));
    var body = h("div", { class: "writer-block__body" });
    t.editor(b, body);
    card.appendChild(body);
    return card;
  }

  function redrawBlock(b) {
    var old = ui.blocks.querySelector('[data-block="' + b.id + '"]');
    if (old) old.replaceWith(blockCard(b, state.blocks.indexOf(b)));
  }

  function moveBlock(i, delta) {
    var j = i + delta;
    if (j < 0 || j >= state.blocks.length) return;
    var b = state.blocks.splice(i, 1)[0];
    state.blocks.splice(j, 0, b);
    drawBlocks();
    changed();
    var card = ui.blocks.querySelector('[data-block="' + b.id + '"]');
    if (card) {
      var again = card.querySelectorAll(".writer-block__actions .writer-icon-btn")[delta < 0 ? 0 : 1];
      if (again && !again.disabled) again.focus();
      else card.querySelector(".writer-block__actions .writer-icon-btn:not([disabled])").focus();
    }
  }

  function deleteBlock(i) {
    var b = state.blocks.splice(i, 1)[0];
    drawBlocks();
    changed();
    toast(TYPES[b.type].label + " deleted.", "Undo", function () {
      state.blocks.splice(Math.min(i, state.blocks.length), 0, b);
      drawBlocks();
      changed();
    });
  }

  function insertBlock(index, type, preset) {
    var b = makeBlock(type, preset);
    state.blocks.splice(index, 0, b);
    drawBlocks();
    changed();
    var card = ui.blocks.querySelector('[data-block="' + b.id + '"]');
    if (card) {
      card.scrollIntoView({ block: "center", behavior: "smooth" });
      var first = card.querySelector(".writer-block__body input:not([type=checkbox]), .writer-block__body textarea");
      if (first) first.focus({ preventScroll: true });
    }
  }

  function openInsert(index) {
    var search = h("input", { class: "writer-input", type: "search", placeholder: "Search, such as: error, tabs, warning", "aria-label": "Search components" });
    var list = h("div", { class: "writer-needs" });
    var node;
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
          list.appendChild(
            h(
              "button",
              {
                type: "button",
                class: "writer-need",
                onclick: function () {
                  node.close();
                  insertBlock(index, n.type, n.preset);
                },
              },
              [
                icon(TYPES[n.type].icon),
                h("span", { class: "writer-need__text" }, [
                  h("span", { class: "writer-need__need", text: n.need }),
                  h("span", { class: "writer-need__name", text: n.name + (n.rather ? " · rather than " + n.rather : "") }),
                ]),
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
        // Otherwise the Enter lands in the new block's first field.
        event.preventDefault();
        var first = list.querySelector(".writer-need");
        if (first) first.click();
      }
    });
    draw();
    node = dialog("What does the reader need?", [
      search,
      list,
      h("p", { class: "writer-dialog__foot" }, ["Not sure? ", h("a", { href: BASE + "writing-guide/choosing-components/", target: "_blank", rel: "noopener", text: "Choosing components" }), " explains each one."]),
    ]);
    node.classList.add("writer-dialog--wide");
    search.focus();
  }

  function recipePicker(inDialog, done) {
    var grid = h("div", { class: "writer-recipes" });
    if (!inDialog) {
      grid.appendChild(
        h("div", { class: "writer-recipes__intro" }, [
          h("span", { class: "writer-recipes__title", text: "Start from a recipe" }),
          h("span", { text: "Each one lays out a page the way the writing guide recommends. Or open a .md file to edit it." }),
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
    var warn = hasContent() ? h("p", { class: "writer-dialog__warn", text: "This replaces the page you're writing. Download it first if you want to keep it." }) : null;
    node = dialog("Start a new page", [
      warn,
      recipePicker(true, function () {
        node.close();
      }),
    ]);
    node.classList.add("writer-dialog--wide");
  }

  function hasContent() {
    return state.meta.title.trim() || liveBlocks().length;
  }

  function startRecipe(recipe) {
    nextId = 1;
    state = { meta: Object.assign(emptyMeta(), copy(recipe.meta || {})), blocks: [], images: {}, files: {}, assetsLoaded: true, assetsSaved: true };
    recipe.blocks.forEach(function (spec) {
      state.blocks.push(makeBlock(spec[0], spec[1]));
    });
    state.meta.at = { folder: folderPath(), assets: assetDir() };
    storeAllAssets();
    drawSetup();
    drawAssets(true);
    drawBlocks();
    changed();
    var title = ui.setup.querySelector(".writer-input--title");
    if (title) title.focus();
  }

  function openFile(file) {
    if (/\.zip$/i.test(file.name)) {
      openBundle(file);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      if (hasContent() && !window.confirm("Replace the page you're writing with " + file.name + "? Download it first if you want to keep it.")) return;
      var doc = parseDocument(String(reader.result));
      nextId = 1;
      state = {
        meta: doc.meta,
        blocks: doc.blocks.map(function (b) {
          b.id = "b" + nextId++;
          return b;
        }),
        images: {},
        files: {},
        assetsLoaded: true,
        assetsSaved: true,
      };
      state.meta.mode = "update";
      state.meta.slug = file.name.replace(/\.(md|markdown)$/i, "");
      state.meta.slugEdited = true;
      var matches = data.pages.filter(function (p) {
        return p.src.split("/").pop() === file.name;
      });
      if (matches.length === 1) state.meta.folder = dirname(matches[0].src);
      // Its images are already on the site, flat in docs/images/ for older
      // pages; they stay where they are. New ones go in the page's folders.
      state.meta.at = { folder: folderPath(), assets: assetDir() };
      storeAllAssets();
      drawSetup();
      drawAssets(true);
      drawBlocks();
      changed();
      toast("Opened " + file.name + (matches.length === 1 ? " from docs/" + matches[0].src + "." : ". Check the folder it belongs in."));
    };
    reader.readAsText(file);
  }

  function showPanel(name) {
    if (!ui.panels[name]) name = "preview";
    ui.panel = name;
    write(PANEL_KEY, name);
    Object.keys(ui.panels).forEach(function (key) {
      ui.panels[key].hidden = key !== name;
      ui.tabButtons[key].setAttribute("aria-selected", key === name ? "true" : "false");
      ui.tabButtons[key].tabIndex = key === name ? 0 : -1;
    });
    render();
  }

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
    if (scroll && ui.panel === "preview") {
      var box = ui.panels.preview;
      var top = part.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 60) box.scrollTo({ top: Math.max(0, top - 40), behavior: "smooth" });
    }
  }

  /* ── Rendering the panels ── */

  var timer = null;
  function changed() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      syncPaths();
      save();
      render();
    }, 180);
  }

  function render() {
    if (!ui.root || !ui.root.isConnected) return;
    drawAssets(false);
    var checks = runChecks();
    var warnings = checks.filter(function (c) {
      return c.level === "warn";
    }).length;
    ui.checkCount.textContent = warnings ? String(warnings) : "";
    ui.checkCount.hidden = !warnings;
    if (ui.panel === "preview") renderPreview();
    else if (ui.panel === "markdown") renderSource();
    else if (ui.panel === "checks") renderChecks(checks);
    else if (ui.panel === "publish") renderPublish();
  }

  function renderPreview() {
    tabSets = 0;
    var box = ui.panels.preview;
    var scroll = box.scrollTop;
    var checked = [];
    ui.preview.querySelectorAll("input[type=radio]:checked").forEach(function (node) {
      checked.push(node.id);
    });
    var open = [];
    ui.preview.querySelectorAll("details").forEach(function (node, i) {
      open.push(node.open);
    });
    var m = state.meta;
    var html = "<h1>" + (m.title.trim() ? inline(m.title) : '<span class="writer-ghost-text">Page title</span>') + "</h1>" + pageInfoHtml();
    state.blocks.forEach(function (b) {
      var t = TYPES[b.type];
      var inner = isEmpty(b) ? '<div class="writer-ghost">' + esc(t.label) + ": fill it in, or it's left out of the file.</div>" : t.preview(b);
      html += '<div class="writer-pv" data-block="' + b.id + '">' + inner + "</div>";
    });
    ui.preview.innerHTML = html;
    checked.forEach(function (id) {
      var node = document.getElementById(id);
      if (node && ui.preview.contains(node)) node.checked = true;
    });
    ui.preview.querySelectorAll("details").forEach(function (node, i) {
      if (i < open.length) node.open = open[i];
    });
    if (window.docsComponents) window.docsComponents.mount();
    renderMermaid(ui.preview);
    markActive(false);
    box.scrollTop = scroll;
  }

  function renderSource() {
    var box = ui.panels.markdown;
    box.innerHTML = "";
    box.appendChild(
      h("div", { class: "writer-panel__actions" }, [
        h("code", { class: "writer-path", text: filePath() }),
        button("Copy", "content-copy", "md-button--ghost md-button--sm", function () {
          copyText(toMarkdown(), "Markdown copied.");
        }),
        button("Download .md only", "download", "md-button--ghost md-button--sm", download),
        button("Download bundle (.zip)", "folder-zip-outline", "md-button--primary md-button--sm", downloadBundle),
      ])
    );
    box.appendChild(h("pre", { class: "writer-source language-markdown" }, [h("code", { text: toMarkdown() })]));
  }

  function renderChecks(checks) {
    var box = ui.panels.checks;
    box.innerHTML = "";
    var list = h("ul", { class: "writer-checks" });
    if (!checks.length) list.appendChild(h("li", { class: "writer-checks__item writer-checks__item--ok" }, [icon("check-circle-outline"), h("span", { text: "Nothing to fix that can be checked automatically." })]));
    checks.forEach(function (c) {
      var item = h("li", { class: "writer-checks__item writer-checks__item--" + c.level }, [icon(c.level === "warn" ? "alert-outline" : "information-outline"), h("span", { text: c.text })]);
      if (c.id) {
        item.appendChild(
          h("button", {
            type: "button",
            class: "writer-link-btn",
            text: "Show",
            onclick: function () {
              var card = ui.blocks.querySelector('[data-block="' + c.id + '"]');
              if (!card) return;
              card.scrollIntoView({ block: "center", behavior: "smooth" });
              var first = card.querySelector("input, textarea, select");
              if (first) first.focus({ preventScroll: true });
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

  function renderPublish() {
    var box = ui.panels.publish;
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
    if (missing.length) {
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
        "<li><p><strong>Replace its text.</strong> Select <strong>Edit</strong>, select all the text, and paste the Markdown from the <em>Markdown</em> tab here (its <strong>Copy</strong> button copies it).</p></li>" +
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

    html += tabsHtml([
      ["Upload the bundle", upload],
      ["Do it by hand", byHand],
    ]);
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
    toast("Downloaded " + fileName() + "." + (assets ? " It doesn't include the page's " + plural(assets, "image or file", "images and files") + ": download each from Add to site, or the bundle instead." : " Add to site says where it goes."), ui.panel === "publish" ? null : "Add to site", function () {
      showPanel("publish");
    });
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

  /* ── Saving the draft in this browser ── */

  function save() {
    var ok = write(DRAFT_KEY, JSON.stringify({ meta: state.meta, blocks: state.blocks }));
    ui.saveFailed = !ok;
    updateStatus();
  }

  function loadDraft() {
    try {
      var draft = JSON.parse(read(DRAFT_KEY) || "null");
      if (!draft || !draft.meta || !Array.isArray(draft.blocks)) return null;
      var blocks = draft.blocks.filter(function (b) {
        return b && TYPES[b.type];
      });
      blocks.forEach(function (b) {
        var n = parseInt(String(b.id).slice(1), 10);
        if (n >= nextId) nextId = n + 1;
      });
      // Images and files come from IndexedDB afterwards: loadAssets().
      return { meta: Object.assign(emptyMeta(), draft.meta), blocks: blocks, images: {}, files: {}, assetsLoaded: false, assetsSaved: true };
    } catch (e) {
      return null;
    }
  }

  function updateStatus() {
    if (!ui.status) return;
    var assetsLost = state.assetsSaved === false && hasAssets();
    ui.status.textContent = ui.saveFailed
      ? "Can't keep a draft in this browser: download before you leave."
      : assetsLost
        ? "Can't keep the images and files in this browser: download the bundle before you leave."
        : hasContent()
          ? "Draft kept in this browser only"
          : "";
    ui.status.classList.toggle("writer-status--warn", !!ui.saveFailed || assetsLost);
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
