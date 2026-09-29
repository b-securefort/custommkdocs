/* Appearance: colour theme, button style, motion level and sidebar groups.
 *
 * All four live as attributes on <html> (data-theme, data-button-style,
 * data-motion, data-nav) that the stylesheets key off. overrides/main.html
 * sets them before first paint from localStorage; this file adds the
 * controls that change them — the palette popover in the header and the
 * panels on the Appearance page — plus the motion effects (theme reveal,
 * ripple, scroll reveal, card spotlight, reading progress, jump highlight,
 * contents marker, copy check).
 *
 * The defaults come from extra.appearance in mkdocs.yml, via
 * window.appearanceDefaults from main.html. The theme can also be "auto",
 * which data-theme never holds: it resolves to auto_light or auto_dark.
 *
 * Keep the id lists below in sync with the pre-paint script in main.html. */
(function () {
  "use strict";

  var THEMES = [
    { id: "meadow", label: "Meadow", description: "Green on white.", swatch: "#ffffff", accent: "#86bc25" },
    { id: "meadow-dark", label: "Meadow Dark", description: "Signature green on true black.", swatch: "#000000", accent: "#86bc25" },
    { id: "dark", label: "Dark", description: "Near-black with electric blue.", swatch: "#0a0a0c", accent: "#0070f3" },
    { id: "midnight", label: "Midnight", description: "Blue-tinted dark, indigo accent.", swatch: "#0a0e1c", accent: "#6366f1" },
    { id: "light", label: "Light", description: "Clean neutral with electric blue.", swatch: "#ffffff", accent: "#0070f3" },
    { id: "sand", label: "Sand", description: "Warm paper with terracotta.", swatch: "#eeece7", accent: "#c2410c" },
  ];

  var BUTTON_STYLES = [
    { id: "rounded", label: "Rounded", description: "Soft corners and a gentle lift on hover." },
    { id: "pill", label: "Pill", description: "Fully rounded ends, a little more breathing room." },
    { id: "sharp", label: "Sharp", description: "Crisp corners with small-caps labels." },
    { id: "tactile", label: "Tactile", description: "Raised with a visible edge that sinks when pressed." },
  ];

  var MOTION_LEVELS = [
    { id: "full", label: "Full", description: "Page transitions, ripples, reveal on scroll and a circular theme wipe." },
    { id: "subtle", label: "Subtle", description: "Fades only. Nothing slides, lifts or loops." },
    { id: "off", label: "Off", description: "No animation at all." },
  ];

  var NAV_MODES = [
    { id: "collapsed", label: "Collapsed", description: "Only the group you're reading in is open. Click a group to open it." },
    { id: "expanded", label: "Expanded", description: "Every group starts open, and you can still close any of them. Wide screens only." },
  ];

  // Set by the pre-paint script in main.html from extra.appearance in mkdocs.yml.
  var DEFAULTS = window.appearanceDefaults;

  // Auto isn't a palette: it shows auto_light or auto_dark as the system
  // setting says, and switches live while it's the reader's choice.
  var AUTO = {
    id: "auto",
    label: "Auto",
    description: "Follows your device: " + find(THEMES, DEFAULTS.autoLight).label + " in light mode, " + find(THEMES, DEFAULTS.autoDark).label + " in dark.",
  };
  var THEME_CHOICES = [AUTO].concat(THEMES);

  var SETTINGS = {
    theme: { attr: "data-theme", key: "docs.theme", options: THEME_CHOICES, noun: "Theme" },
    buttonStyle: { attr: "data-button-style", key: "docs.buttonStyle", options: BUTTON_STYLES, noun: "Button style" },
    motion: { attr: "data-motion", key: "docs.motion", options: MOTION_LEVELS, noun: "Motion" },
    nav: { attr: "data-nav", key: "docs.nav", options: NAV_MODES, noun: "Sidebar" },
  };

  var ICON_PALETTE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22A10 10 0 0 1 2 12 10 10 0 0 1 12 2c5.5 0 10 4 10 9a6 6 0 0 1-6 6h-1.8c-.3 0-.5.2-.5.5 0 .1.1.2.1.3.4.5.6 1.1.6 1.7.1 1.4-1 2.5-2.4 2.5m0-18a8 8 0 0 0-8 8 8 8 0 0 0 8 8c.3 0 .5-.2.5-.5 0-.2-.1-.3-.1-.4-.4-.5-.6-1-.6-1.6 0-1.4 1.1-2.5 2.5-2.5H16a4 4 0 0 0 4-4c0-3.9-3.6-7-8-7m-5.5 6c.8 0 1.5.7 1.5 1.5S7.3 13 6.5 13 5 12.3 5 11.5 5.7 10 6.5 10m3-4c.8 0 1.5.7 1.5 1.5S10.3 9 9.5 9 8 8.3 8 7.5 8.7 6 9.5 6m5 0c.8 0 1.5.7 1.5 1.5S15.3 9 14.5 9 13 8.3 13 7.5 13.7 6 14.5 6m3 4c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5"/></svg>';
  var ICON_CHECK =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 7 9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59z"/></svg>';

  var root = document.documentElement;
  var systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  var systemCalm = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Resolved once against the first page's URL, like Material does, so it
  // stays correct after instant navigation changes location.
  var appearanceUrl = (function () {
    var config = document.getElementById("__config");
    var base = ".";
    try {
      base = JSON.parse(config.textContent).base || ".";
    } catch (e) {}
    return new URL(base.replace(/\/?$/, "/") + "appearance/", location.href).href;
  })();

  /* ── Storage ── */

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {
      // Private mode / blocked storage: the choice just won't persist.
    }
  }

  /* ── State ── */

  function find(options, id) {
    for (var i = 0; i < options.length; i++) if (options[i].id === id) return options[i];
    return null;
  }

  function fallback(name) {
    if (name === "motion" && systemCalm.matches) return "off";
    return DEFAULTS[name];
  }

  /** The value applied to <html>. */
  function current(name) {
    return root.getAttribute(SETTINGS[name].attr);
  }

  // The theme the reader picked, which may be "auto". Kept here, not only in
  // storage, so the choice holds for the visit when storage is blocked.
  var themeChoice = (function () {
    var saved = read(SETTINGS.theme.key);
    return find(THEME_CHOICES, saved) ? saved : DEFAULTS.theme;
  })();

  /** The option the controls show as picked. */
  function selected(name) {
    return name === "theme" ? themeChoice : current(name);
  }

  function resolve(name, id) {
    if (name === "theme" && id === "auto") return systemDark.matches ? DEFAULTS.autoDark : DEFAULTS.autoLight;
    return id;
  }

  function motion() {
    return current("motion") || "full";
  }

  /** Apply a setting. `origin` (an element) is where the theme wipe starts;
   *  `persist` false is used when following a system change. */
  function choose(name, id, origin, persist) {
    var setting = SETTINGS[name];
    var option = find(setting.options, id);
    if (!option) return;
    if (persist !== false) write(setting.key, id);
    var picked = selected(name) !== id;
    if (name === "theme") themeChoice = id;

    // Auto can resolve to the theme already showing: only the controls change.
    var value = resolve(name, id);
    if (current(name) === value) {
      syncControls();
    } else {
      var apply = function () {
        root.setAttribute(setting.attr, value);
        if (name === "theme") syncFavicon(value);
        if (name === "nav") resetNavGroups();
        syncControls();
      };
      if (name === "theme") withThemeTransition(apply, origin);
      else apply();
    }
    if (picked) announce(setting.noun + ": " + option.label);
  }

  // Green favicon for the Meadow themes, its blue twin for the rest — the
  // same split components.css makes for the logo.
  function syncFavicon(theme) {
    var icon = document.querySelector('link[rel="icon"]');
    if (!icon) return;
    var green = theme.indexOf("meadow") === 0;
    var href = icon.getAttribute("href");
    icon.setAttribute("href", green ? href.replace("-blue.", "-green.") : href.replace("-green.", "-blue."));
  }

  function resetAll(origin) {
    Object.keys(SETTINGS).forEach(function (name) {
      write(SETTINGS[name].key, null);
      choose(name, fallback(name), origin, false);
    });
  }

  // Follow the OS as it changes (e.g. sunset dark mode): the theme while Auto
  // is the choice, motion until the reader picks a level.
  onMediaChange(systemDark, function () {
    if (themeChoice === "auto") choose("theme", "auto", null, false);
  });
  onMediaChange(systemCalm, function () {
    if (!read(SETTINGS.motion.key)) choose("motion", fallback("motion"), null, false);
  });

  function onMediaChange(query, handler) {
    if (query.addEventListener) query.addEventListener("change", handler);
    else if (query.addListener) query.addListener(handler);
  }

  /* ── Theme transition ──
     Full motion: a circle grows out of the clicked control (View Transitions).
     Subtle: the browser's default cross-fade. Off / unsupported: instant. */
  function withThemeTransition(apply, origin) {
    var level = motion();
    if (!document.startViewTransition || level === "off" || document.visibilityState !== "visible") {
      apply();
      return;
    }
    // A skipped transition rejects `ready`; the DOM update still runs, so
    // there is nothing to recover — just keep it from surfacing as an error.
    if (level !== "full" || !origin) {
      document.startViewTransition(apply).ready.catch(function () {});
      return;
    }

    var rect = origin.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    var radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

    root.classList.add("theme-reveal");
    var transition = document.startViewTransition(apply);
    transition.ready
      .then(function () {
        root.animate(
          { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + radius + "px at " + x + "px " + y + "px)"] },
          { duration: 650, easing: "cubic-bezier(0.23, 1, 0.32, 1)", pseudoElement: "::view-transition-new(root)" }
        );
      })
      .catch(function () {});
    transition.finished.finally(function () {
      root.classList.remove("theme-reveal");
    });
  }

  /* ── Helpers ── */

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  var liveRegion;
  function announce(text) {
    if (!liveRegion) {
      liveRegion = el("div", "sr-only", { "aria-live": "polite", role: "status" });
      document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = text;
  }

  /** Reflect the current attributes in every rendered control. */
  function syncControls() {
    var theme = selected("theme");
    document.querySelectorAll(".swatch[data-option]").forEach(function (swatch) {
      var on = swatch.getAttribute("data-option") === theme;
      swatch.setAttribute("aria-checked", on ? "true" : "false");
      swatch.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".appearance input[type=radio]").forEach(function (input) {
      input.checked = selected(input.name) === input.value;
    });
  }

  /* ── Header switcher: swatches only, detail lives on the Appearance page ── */

  function mountHeaderSwitch() {
    var inner = document.querySelector(".md-header__inner");
    if (!inner || inner.querySelector(".appearance-switch")) return;

    var wrap = el("div", "appearance-switch");
    var toggle = el("button", "md-header__button md-icon appearance-toggle", {
      type: "button",
      title: "Theme",
      "aria-label": "Change colour theme",
      "aria-haspopup": "true",
      "aria-expanded": "false",
      "aria-controls": "appearance-popover",
    });
    toggle.innerHTML = ICON_PALETTE;

    var popover = el("div", "appearance-popover", { id: "appearance-popover", hidden: "" });
    var label = el("span", "appearance-popover__label", { id: "appearance-popover-label" });
    label.textContent = "Theme";
    var group = el("div", "swatch-row", { role: "radiogroup", "aria-labelledby": "appearance-popover-label" });

    THEME_CHOICES.forEach(function (theme) {
      var swatch = el("button", "swatch", {
        type: "button",
        role: "radio",
        title: theme.label,
        "aria-label": theme.label,
        "data-option": theme.id,
      });
      if (theme === AUTO) {
        // Split between the two themes Auto picks from.
        swatch.classList.add("swatch--auto");
        swatch.style.setProperty("--swatch-light", find(THEMES, DEFAULTS.autoLight).swatch);
        swatch.style.setProperty("--swatch-dark", find(THEMES, DEFAULTS.autoDark).swatch);
      } else {
        swatch.style.setProperty("--swatch-bg", theme.swatch);
        swatch.style.setProperty("--swatch-accent", theme.accent);
      }
      swatch.addEventListener("click", function () {
        choose("theme", theme.id, swatch);
      });
      group.appendChild(swatch);
    });

    // Radio-group keys: arrows move and select, Home/End jump.
    group.addEventListener("keydown", function (event) {
      var swatches = Array.prototype.slice.call(group.querySelectorAll(".swatch"));
      var index = swatches.indexOf(document.activeElement);
      if (index < 0) return;
      var next = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % swatches.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + swatches.length) % swatches.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = swatches.length - 1;
      if (next === null) return;
      event.preventDefault();
      swatches[next].focus();
      swatches[next].click();
    });

    var link = el("a", "appearance-popover__link", { href: appearanceUrl });
    link.innerHTML = "<span>Buttons, motion &amp; more</span><span aria-hidden=\"true\">&rarr;</span>";

    popover.appendChild(label);
    popover.appendChild(group);
    popover.appendChild(link);
    wrap.appendChild(toggle);
    wrap.appendChild(popover);

    var anchor = inner.querySelector('label[for="__search"]') || inner.querySelector(".md-header__source");
    inner.insertBefore(wrap, anchor);

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        popover.removeAttribute("hidden");
        var checked = popover.querySelector('.swatch[aria-checked="true"]');
        if (checked) checked.focus();
      } else {
        popover.setAttribute("hidden", "");
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(popover.hasAttribute("hidden"));
    });
    link.addEventListener("click", function () {
      setOpen(false);
    });
    wrap.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !popover.hasAttribute("hidden")) {
        setOpen(false);
        toggle.focus();
      }
    });
    document.addEventListener("pointerdown", function (event) {
      if (!wrap.contains(event.target)) setOpen(false);
    });

    syncControls();
  }

  /* ── Appearance page panels ── */

  function optionCard(name, option, preview) {
    var card = el("label", "option-card");
    var input = el("input", null, { type: "radio", name: name, value: option.id });
    input.checked = selected(name) === option.id;
    input.addEventListener("change", function () {
      if (input.checked) choose(name, option.id, card);
    });

    var check = el("span", "option-card__check", { "aria-hidden": "true" });
    check.innerHTML = ICON_CHECK;

    var text = el("span", "option-card__text");
    var title = el("span", "option-card__title");
    title.textContent = option.label;
    var desc = el("span", "option-card__desc");
    desc.textContent = option.description;
    text.appendChild(title);
    text.appendChild(desc);

    card.appendChild(input);
    card.appendChild(check);
    card.appendChild(preview);
    card.appendChild(text);
    return card;
  }

  function themePreview(theme) {
    if (theme === AUTO) {
      // The light and dark previews stacked, the dark one cut diagonally.
      var split = el("span", "theme-preview-auto", { "aria-hidden": "true" });
      split.appendChild(themePreview(find(THEMES, DEFAULTS.autoLight)));
      split.appendChild(themePreview(find(THEMES, DEFAULTS.autoDark)));
      return split;
    }
    var preview = el("span", "theme-preview", { "data-theme": theme.id, "aria-hidden": "true" });
    preview.innerHTML =
      '<span class="theme-preview__bar"><i></i><i></i><i></i></span>' +
      '<span class="theme-preview__body">' +
      '<span class="theme-preview__side"><span class="tp-line tp-line--accent"></span><span class="tp-line"></span><span class="tp-line"></span><span class="tp-line"></span></span>' +
      '<span class="theme-preview__main"><span class="tp-line tp-line--head"></span><span class="tp-line"></span><span class="tp-line" style="width:80%"></span><span class="tp-btn"></span></span>' +
      "</span>";
    return preview;
  }

  function buttonPreview(style) {
    var preview = el("span", "button-preview", { "data-button-style": style.id, "aria-hidden": "true" });
    preview.innerHTML =
      '<span class="md-button md-button--primary md-button--sm">Primary</span>' +
      '<span class="md-button md-button--sm">Secondary</span>';
    return preview;
  }

  function motionPreview(level) {
    var preview = el("span", "motion-preview", { "data-demo": level.id, "aria-hidden": "true" });
    preview.appendChild(el("span"));
    return preview;
  }

  // A miniature sidebar: three groups, open or closed as the mode leaves them.
  function navPreview(mode) {
    var preview = el("span", "nav-preview", { "data-demo": mode.id, "aria-hidden": "true" });
    var html = "";
    for (var i = 0; i < 3; i++) {
      var open = mode.id === "expanded" || i === 1;
      html +=
        '<span class="nav-preview__group' + (open ? " is-open" : "") + '">' +
        '<span class="nav-preview__head"><span class="tp-line"></span><i></i></span>' +
        (open ? '<span class="tp-line"></span><span class="tp-line' + (i === 1 ? " tp-line--accent" : "") + '"></span>' : "") +
        "</span>";
    }
    preview.innerHTML = html;
    return preview;
  }

  function fieldset(legendText, gridClass, cards) {
    var set = el("fieldset");
    var legend = el("legend");
    legend.textContent = legendText;
    var grid = el("div", gridClass);
    cards.forEach(function (card) {
      grid.appendChild(card);
    });
    set.appendChild(legend);
    set.appendChild(grid);
    return set;
  }

  function mountAppearancePanel() {
    var host = document.querySelector("[data-appearance-panel]");
    if (!host || host.hasAttribute("data-mounted")) return;
    host.setAttribute("data-mounted", "");
    host.classList.add("appearance");
    host.innerHTML = "";

    host.appendChild(
      fieldset("Colour", "option-grid", THEME_CHOICES.map(function (t) {
        return optionCard("theme", t, themePreview(t));
      }))
    );
    host.appendChild(
      fieldset("Buttons", "option-grid", BUTTON_STYLES.map(function (s) {
        return optionCard("buttonStyle", s, buttonPreview(s));
      }))
    );
    host.appendChild(
      fieldset("Motion", "option-grid option-grid--wide", MOTION_LEVELS.map(function (m) {
        return optionCard("motion", m, motionPreview(m));
      }))
    );
    host.appendChild(
      fieldset("Sidebar", "option-grid option-grid--wide", NAV_MODES.map(function (n) {
        return optionCard("nav", n, navPreview(n));
      }))
    );

    var footer = el("div", "appearance__footer");
    var note = el("span");
    note.textContent = "Saved in this browser. Auto follows your device's light or dark mode.";
    var reset = el("button", "md-button md-button--ghost md-button--sm", { type: "button" });
    reset.textContent = "Reset to defaults";
    reset.addEventListener("click", function () {
      resetAll(reset);
    });
    footer.appendChild(note);
    footer.appendChild(reset);
    host.appendChild(footer);

    // The name attributes double as setting names ("theme", "buttonStyle",
    // "motion", "nav"), which is what syncControls matches on.
    syncControls();
  }

  /* ── Reading progress ── */

  var progressQueued = false;
  function updateProgress() {
    progressQueued = false;
    updateTimelines();
    var bar = document.querySelector(".scroll-progress");
    if (!bar) return;
    var max = document.documentElement.scrollHeight - innerHeight;
    var value = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    bar.style.transform = "scaleX(" + value + ")";
  }

  /* ── Timeline spine ──
     The spine runs from the first tag's centre to the last's; its fill tracks
     a line 60% down the viewport, and each tag the fill has passed gets
     .is-reached (its node fills in). */
  function updateTimelines() {
    var line = innerHeight * 0.6;
    document.querySelectorAll(".md-typeset .timeline > dl").forEach(function (list) {
      var tags = list.querySelectorAll(":scope > dt");
      if (!tags.length) return;
      var box = list.getBoundingClientRect();
      var centre = function (tag) {
        var r = tag.getBoundingClientRect();
        return r.top + r.height / 2 - box.top;
      };
      var start = centre(tags[0]);
      var length = Math.max(0, centre(tags[tags.length - 1]) - start);
      var reached = line - box.top;
      var progress = length > 0 ? Math.min(1, Math.max(0, (reached - start) / length)) : reached >= start ? 1 : 0;
      list.style.setProperty("--tl-start", start + "px");
      list.style.setProperty("--tl-length", length + "px");
      list.style.setProperty("--tl-progress", String(progress));
      tags.forEach(function (tag) {
        tag.classList.toggle("is-reached", centre(tag) <= reached);
      });
    });
  }

  function mountScrollProgress() {
    var header = document.querySelector(".md-header");
    if (header && !header.querySelector(".scroll-progress")) {
      header.appendChild(el("div", "scroll-progress", { "aria-hidden": "true" }));
    }
    updateProgress();
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!progressQueued) {
        progressQueued = true;
        requestAnimationFrame(updateProgress);
      }
    },
    { passive: true }
  );
  window.addEventListener("resize", updateProgress, { passive: true });
  // Web fonts shift line heights after first layout; re-measure the spines.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateProgress);

  /* ── Scroll reveal ── */

  var REVEAL_SELECTOR = [
    ".md-typeset .grid.cards > ul > li",
    ".md-typeset .grid.cards > ol > li",
    ".md-typeset .grid > .card",
    ".md-typeset .admonition",
    ".md-typeset details",
    ".md-typeset .timeline > dl > dt",
    ".md-typeset .timeline > dl > dd",
    ".md-typeset .steps > ol > li",
    ".md-typeset .reveal",
  ].join(",");

  var revealObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          function (entries) {
            var batch = new Map();
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return;
              var node = entry.target;
              revealObserver.unobserve(node);
              // "batch": stagger only among siblings arriving together, so a
              // step scrolled to later doesn't wait behind the ones above it.
              if (node.getAttribute("data-reveal") === "batch") {
                var i = batch.get(node.parentElement) || 0;
                batch.set(node.parentElement, i + 1);
                node.style.setProperty("--reveal-i", String(Math.min(i, 8)));
              }
              node.classList.add("is-revealed");
              // Drop the reveal state once it has played, so the element's own
              // hover transitions aren't slowed by the stagger delay.
              setTimeout(function () {
                node.removeAttribute("data-reveal");
                node.classList.remove("is-revealed");
                node.style.removeProperty("--reveal-i");
              }, 1200);
            });
          },
          { rootMargin: "0px 0px -6% 0px" }
        )
      : null;

  function mountReveal() {
    if (!revealObserver || motion() === "off") return;
    var counts = new Map();
    document.querySelectorAll(REVEAL_SELECTOR).forEach(function (node) {
      if (node.closest(".appearance") || node.parentElement.closest("[data-reveal]")) return;
      var parent = node.parentElement;
      var index = counts.get(parent) || 0;
      counts.set(parent, index + 1);
      // Timeline entries arrive one at a time as you scroll, so a running
      // stagger would only add lag; the entry just trails its tag slightly.
      if (parent.parentElement && parent.parentElement.classList.contains("timeline")) {
        index = node.tagName === "DT" ? 0 : 1;
      }
      node.setAttribute("data-reveal", parent.parentElement && parent.parentElement.classList.contains("steps") ? "batch" : "");
      node.style.setProperty("--reveal-i", String(Math.min(index, 8)));
      revealObserver.observe(node);
    });
  }

  /* ── Pointer effects (delegated once) ── */

  // Card spotlight follows the pointer.
  document.addEventListener(
    "pointermove",
    function (event) {
      var card = event.target.closest && event.target.closest(".md-typeset .grid.cards > ul > li, .md-typeset .grid.cards > ol > li, .md-typeset .grid > .card");
      if (!card) return;
      var rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", event.clientX - rect.left + "px");
      card.style.setProperty("--my", event.clientY - rect.top + "px");
    },
    { passive: true }
  );

  // Ripple from the press point on buttons.
  document.addEventListener("pointerdown", function (event) {
    if (motion() !== "full" || event.button !== 0) return;
    var button = event.target.closest && event.target.closest(".md-typeset .md-button");
    if (!button) return;
    var rect = button.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height) * 2.2;
    var ripple = el("span", "ripple", { "aria-hidden": "true" });
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = event.clientX - rect.left - size / 2 + "px";
    ripple.style.top = event.clientY - rect.top - size / 2 + "px";
    button.appendChild(ripple);
    ripple.addEventListener("animationend", function () {
      ripple.remove();
    });
  });

  /* ── Segmented controls: .button-group--toggle ── */

  function mountToggleGroups() {
    document.querySelectorAll(".md-typeset .button-group--toggle").forEach(function (group) {
      if (group.hasAttribute("data-mounted")) return;
      group.setAttribute("data-mounted", "");
      group.setAttribute("role", "group");
      var buttons = group.querySelectorAll(".md-button");
      var anyPressed = group.querySelector('.md-button[aria-pressed="true"]');
      buttons.forEach(function (button, i) {
        // Links answer Enter but not Space; role=button promises both.
        button.setAttribute("role", "button");
        if (!button.hasAttribute("aria-pressed")) {
          button.setAttribute("aria-pressed", !anyPressed && i === 0 ? "true" : "false");
        }
      });
    });
  }

  function pressSegment(button) {
    var group = button.closest(".button-group--toggle");
    group.querySelectorAll(".md-button").forEach(function (other) {
      other.setAttribute("aria-pressed", other === button ? "true" : "false");
    });
  }

  // Capture phase + stopPropagation: Material's instant navigation listens
  // for link clicks on document.body and doesn't check defaultPrevented, so
  // the click must never get there or "#" reloads the page in place.
  document.addEventListener(
    "click",
    function (event) {
      var button = event.target.closest && event.target.closest(".md-typeset .button-group--toggle .md-button");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      pressSegment(button);
    },
    true
  );

  document.addEventListener("keydown", function (event) {
    if (event.key !== " ") return;
    var button = event.target.closest && event.target.closest(".md-typeset .button-group--toggle .md-button");
    if (!button) return;
    event.preventDefault();
    pressSegment(button);
  });

  /* ── Sidebar groups: data-nav="expanded" ──
     components.css opens every group nobody has touched yet, from the first
     paint — the same "open but closable" state Material's navigation.expand
     uses. The first click on such a group means "close", but it switches the
     checkbox on, so switch it back off and mark the group touched, which lets
     the CSS go and Material's own close animation runs. Wide screens only:
     below 76.25em the menu is a drawer of sliding panels. */
  var wideNav = window.matchMedia("(min-width: 76.25em)");
  var NAV_TOGGLE = ".md-nav--primary .md-nav__item--nested > .md-nav__toggle";

  function navExpanded() {
    return current("nav") === "expanded" && wideNav.matches;
  }

  function syncNavGroups() {
    var expanded = navExpanded();
    document.querySelectorAll(NAV_TOGGLE).forEach(function (toggle) {
      var list = toggle.parentElement.querySelector(":scope > .md-nav");
      if (!list) return;
      var open = toggle.checked || (expanded && !toggle.hasAttribute("data-nav-touched"));
      list.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function resetNavGroups() {
    document.querySelectorAll(NAV_TOGGLE + "[data-nav-touched]").forEach(function (toggle) {
      toggle.removeAttribute("data-nav-touched");
    });
    syncNavGroups();
  }

  document.addEventListener("change", function (event) {
    var toggle = event.target;
    if (!toggle.matches || !toggle.matches(NAV_TOGGLE)) return;
    if (navExpanded() && !toggle.hasAttribute("data-nav-touched")) {
      toggle.setAttribute("data-nav-touched", "");
      toggle.checked = false;
    }
    syncNavGroups();
  });
  onMediaChange(wideNav, syncNavGroups);

  /* ── Jump highlight ──
     Following a #link briefly tints what it points at, so the eye lands on
     the right heading. The click, the hashchange and — since instant
     navigation re-fetches and swaps the page even for a same-page link — the
     remount can each ask for it; the element check below keeps that to one
     flash on whichever heading is actually in the page. */
  var lastJump = { node: null, at: 0 };

  function flashTarget(hash) {
    if (!hash || hash.length < 2) return;
    var id;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch (e) {
      return;
    }
    var target = document.getElementById(id);
    if (!target || !target.closest(".md-content")) return;
    if (lastJump.node === target && Date.now() - lastJump.at < 400) return;
    lastJump = { node: target, at: Date.now() };
    target.classList.remove("is-target");
    void target.offsetWidth; // restart on a repeat jump
    target.classList.add("is-target");
  }

  document.addEventListener("animationend", function (event) {
    if (event.animationName === "targetFlash") event.target.classList.remove("is-target");
  });

  document.addEventListener("click", function (event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    var link = event.target.closest && event.target.closest('a[href*="#"]');
    if (!link || link.target) return;
    var url = new URL(link.href, location.href);
    if (!url.hash || url.pathname !== location.pathname) return;
    flashTarget(url.hash);
  });

  window.addEventListener("hashchange", function () {
    flashTarget(location.hash);
  });

  /* ── Table of contents marker ──
     A bar beside the right-hand contents that glides to the section being
     read. Material moves .md-nav__link--active as you scroll; a
     MutationObserver follows it. */
  var tocObserver = null;
  var queueTocMarker = function () {};

  function mountTocMarker() {
    if (tocObserver) tocObserver.disconnect();
    tocObserver = null;
    queueTocMarker = function () {};
    var nav = document.querySelector(".md-sidebar--secondary .md-nav--secondary");
    if (!nav || !nav.querySelector(":scope > .md-nav__list")) return;
    var marker = nav.querySelector(":scope > .toc-marker");
    if (!marker) {
      marker = el("span", "toc-marker", { "aria-hidden": "true" });
      nav.appendChild(marker);
    }

    var queued = false;
    function place() {
      queued = false;
      var links = nav.querySelectorAll(".md-nav__link--active");
      var link = links[links.length - 1];
      if (!link || !link.offsetParent) {
        marker.classList.remove("is-visible");
        return;
      }
      // Measured against the nav, lined up with the track on its list.
      var box = nav.getBoundingClientRect();
      var list = nav.querySelector(":scope > .md-nav__list");
      marker.style.left = list.getBoundingClientRect().left - box.left + "px";
      marker.style.transform = "translateY(" + (link.getBoundingClientRect().top - box.top) + "px)";
      marker.style.height = link.offsetHeight + "px";
      // The first placement lands without gliding in from the top.
      if (!marker.classList.contains("is-visible")) {
        marker.classList.add("is-visible");
        requestAnimationFrame(function () {
          marker.classList.add("is-ready");
        });
      }
    }
    function queue() {
      if (!queued) {
        queued = true;
        requestAnimationFrame(place);
      }
    }

    tocObserver = new MutationObserver(queue);
    tocObserver.observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
    queueTocMarker = queue;
    queue();
  }

  window.addEventListener(
    "resize",
    function () {
      queueTocMarker();
    },
    { passive: true }
  );
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      queueTocMarker();
    });
  }

  /* ── Copy confirmation: the copy icon turns into a check for a moment ── */
  document.addEventListener("click", function (event) {
    var button =
      event.target.closest && event.target.closest('.md-code__button[data-md-type="copy"], .md-clipboard:not(.md-clipboard--inline)');
    if (!button) return;
    clearTimeout(button._copiedTimer);
    button.classList.remove("is-copied");
    void button.offsetWidth;
    button.classList.add("is-copied");
    button._copiedTimer = setTimeout(function () {
      button.classList.remove("is-copied");
    }, 1600);
  });

  /* ── Mount on every page (Material's instant navigation re-emits document$) ── */

  function mountAll() {
    mountHeaderSwitch();
    mountScrollProgress();
    mountAppearancePanel();
    mountToggleGroups();
    mountReveal();
    mountTocMarker();
    syncNavGroups();
    syncControls();
    flashTarget(location.hash);
  }

  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(mountAll);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountAll);
  } else {
    mountAll();
  }
})();
