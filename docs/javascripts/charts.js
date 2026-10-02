/* Charts: a ``` chart fence holding JSON becomes a themed chart card.
 *
 *   ``` chart
 *   { "type": "bar", "title": "Spend by service", "format": "currency",
 *     "labels": ["Virtual machines", "Storage"],
 *     "series": [{ "name": "September", "data": [12480, 4310] }] }
 *   ```
 *
 * Types (each shown on docs/components/chart-types.md):
 *   kpi        stat tiles: value, delta and a sparkline
 *   bar        grouped, stacked, 100% stacked, diverging, or with a line
 *   line       one or many lines, or stacked areas
 *   donut      one ring, or several rings to compare periods
 *   gauge      one score against its maximum
 *   radar      scores across the same few areas
 *   waterfall  how one total became another, step by step
 *   scatter    two measures per item; a "size" makes it a bubble chart
 *   heatmap    a grid of values, darker where higher
 *   progress   a list of meters against their targets
 *   treemap    shares of a total as nested rectangles
 *
 * The first seven are drawn by Chart.js (vendor/chart.umd.min.js, copied
 * there by tools/chartjs/), which loads only on pages with one of them; the
 * last three are plain HTML. Each chart is drawn when it first scrolls into
 * view.
 *
 * Colours come from charts.css: an eight-hue categorical palette and a
 * one-hue severity ramp, each with light and dark steps validated for
 * colour-blind readers, plus the theme's accent and greys. Switching theme or
 * motion level redraws every chart in place.
 *
 * Live data: a chart with an "id" takes new figures from
 *   window.docsCharts.set("<id>", { labels: [...], series: [...] })
 * and a chart with "src" fetches that JSON (the same fields) on load; the
 * figures in the page show until it arrives.
 *
 * Everything re-mounts on Material's document$, like components.js. */
(function () {
  "use strict";

  var SCRIPT = document.currentScript && document.currentScript.src;
  var BASE = SCRIPT ? SCRIPT.replace(/javascripts\/charts\.js(?:[?#].*)?$/, "") : "/";
  var CHART_SRC = BASE + "javascripts/vendor/chart.umd.min.js";
  var CHARTJS_TYPES = ["bar", "line", "donut", "gauge", "radar", "waterfall", "scatter"];
  var HTML_TYPES = ["heatmap", "progress", "treemap"];
  var TYPES = ["kpi"].concat(CHARTJS_TYPES, HTML_TYPES);
  var SEVERITY = ["low", "medium", "high", "critical"];

  var ICON_TABLE =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 4v4h6V8zm8 0v4h6V8zm-8 6v4h6v-4zm8 0v4h6v-4z"/></svg>';
  var ICON_CHART =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 21H2V3h2v16h2v-9h4v9h2V6h4v13h2v-5h4z"/></svg>';
  var ICON_UP =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 15l5-5 5 5z"/></svg>';
  var ICON_DOWN =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>';

  var entries = [];
  var chartJs = null;
  var observer = null;
  var uid = 0;

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function text(tag, className, value) {
    var node = el(tag, className);
    node.textContent = value == null ? "" : String(value);
    return node;
  }

  function loadChartJs() {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (!chartJs) {
      chartJs = new Promise(function (resolve, reject) {
        var tag = el("script", null, { src: CHART_SRC, async: "" });
        tag.onload = function () {
          resolve(window.Chart);
        };
        tag.onerror = function () {
          chartJs = null;
          reject(new Error("Couldn't load " + CHART_SRC));
        };
        document.head.appendChild(tag);
      });
    }
    return chartJs;
  }

  /* ── Colour ── */

  function rgb(color) {
    var m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color);
    if (m) return [+m[1], +m[2], +m[3]];
    m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color).trim());
    if (!m) return null;
    var hex = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    return [0, 2, 4].map(function (i) {
      return parseInt(hex.slice(i, i + 2), 16);
    });
  }

  function alpha(color, a) {
    var c = rgb(color);
    return c ? "rgba(" + c.join(",") + "," + a + ")" : color;
  }

  function mix(color, other, t) {
    var a = rgb(color);
    var b = rgb(other);
    if (!a || !b) return color;
    return "rgb(" + a.map(function (v, i) {
      return Math.round(v + (b[i] - v) * t);
    }).join(",") + ")";
  }

  /** White on a fill while it clears 3:1, otherwise near-black. */
  function inkOn(color) {
    var c = rgb(color);
    if (!c) return "#ffffff";
    var lum = c.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var l = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
    return 1.05 / (l + 0.05) >= 3 ? "#ffffff" : "#141414";
  }

  /** The chart's colours, read where it sits so a themed ancestor counts. */
  function readTheme(node) {
    var probe = el("span", null, { "aria-hidden": "true" });
    probe.style.display = "none";
    node.appendChild(probe);
    function read(name) {
      probe.style.color = "";
      probe.style.color = "var(" + name + ")";
      return getComputedStyle(probe).color;
    }
    var theme = { series: [], severity: {} };
    for (var i = 1; i <= 8; i++) theme.series.push(read("--viz-" + i));
    SEVERITY.forEach(function (level) {
      theme.severity[level] = read("--viz-sev-" + level);
    });
    theme.accent = read("--accent");
    theme.onAccent = read("--on-accent");
    theme.muted = read("--viz-muted");
    theme.text = read("--base-100");
    theme.text2 = read("--base-400");
    theme.axis = read("--base-500");
    theme.line = read("--base-700");
    theme.surface = read("--base-900");
    theme.good = read("--success");
    theme.font = getComputedStyle(node).fontFamily;
    probe.remove();
    theme.grid = alpha(theme.line, 0.7);
    return theme;
  }

  /** "1"–"8" a palette slot, a severity, accent, muted or good, or a hex. */
  function colorFor(name, index, theme) {
    if (name != null) {
      var key = String(name).toLowerCase();
      if (/^[1-8]$/.test(key)) return theme.series[+key - 1];
      if (theme.severity[key]) return theme.severity[key];
      if (key === "accent" || key === "muted" || key === "good") return theme[key];
      if (rgb(key)) return "rgb(" + rgb(key).join(",") + ")";
    }
    // Past eight, more hues stop being told apart: fold the rest into "Other".
    return index < 8 ? theme.series[index] : theme.muted;
  }

  /** The fill for a value, by the first band it falls in (gauge, progress). */
  function bandColor(spec, value, fallback, theme) {
    var bands = Array.isArray(spec.bands) ? spec.bands : [];
    for (var i = 0; i < bands.length; i++) {
      if (bands[i].to == null || value <= bands[i].to) return colorFor(bands[i].color, 0, theme);
    }
    return colorFor(fallback || "accent", 0, theme);
  }

  /** Blue where a change goes the good way, red where it doesn't. */
  function changeColors(spec, theme) {
    var good = theme.series[0];
    var bad = theme.series[7];
    var down = spec.good === "down";
    return { up: down ? bad : good, down: down ? good : bad };
  }

  /* ── Numbers ── */

  function formatter(spec) {
    var locale = document.documentElement.lang || undefined;
    var kind = spec.format || "number";
    return function (value, compact, withUnit) {
      if (value == null || value === "" || isNaN(value)) return "–";
      var options = {};
      // 1,284 stays whole; from five figures, compact reads better: 12.9K.
      if (compact && Math.abs(value) >= 10000) options.notation = "compact";
      var places = spec.decimals != null ? spec.decimals : options.notation ? 1 : kind === "currency" ? 0 : 1;
      options.maximumFractionDigits = places;
      options.minimumFractionDigits = Math.min(places, spec.decimals != null ? spec.decimals : 0);
      if (kind === "currency") {
        options.style = "currency";
        options.currency = spec.currency || "USD";
      }
      var out;
      try {
        out = new Intl.NumberFormat(locale, options).format(value);
      } catch (e) {
        out = String(value);
      }
      if (kind === "percent") out += "%";
      if (withUnit !== false && spec.unit) out += " " + spec.unit;
      return out.replace(/^-/, "−");
    };
  }

  function signed(fmt, value, compact) {
    return (value > 0 ? "+" : "") + fmt(value, compact, false);
  }

  function percentText(value) {
    return value == null ? "–" : Math.round(value * 10) / 10 + "%";
  }

  /** "+4 pts", "−$2.1K": signed, in the delta's own unit when it has one. */
  function deltaText(item, fmt) {
    var d = Number(item.delta);
    var sign = d > 0 ? "+" : d < 0 ? "−" : "";
    var body = item.deltaUnit != null
      ? formatter({ decimals: item.deltaDecimals })(Math.abs(d), false, false) + item.deltaUnit
      : fmt(Math.abs(d), true, false);
    return sign + body;
  }

  function deltaNode(item, fmt) {
    var d = Number(item.delta);
    var goodWhen = item.good === "down" ? -1 : 1;
    var state = !d || item.good === "neither" ? "flat" : d * goodWhen > 0 ? "good" : "bad";
    var node = el("span", "chart-delta chart-delta--" + state);
    if (d) node.innerHTML = d > 0 ? ICON_UP : ICON_DOWN;
    node.appendChild(text("span", null, deltaText(item, fmt)));
    if (item.deltaLabel) node.appendChild(text("span", "chart-delta__label", item.deltaLabel));
    return node;
  }

  function motionLevel(node) {
    if (node.closest(".writer-preview")) return "off";
    return document.documentElement.getAttribute("data-motion") || "full";
  }

  /** Counts a figure up from zero when it's revealed, at full motion. */
  function countUp(node, value, fmt, compact) {
    var final = fmt(value, compact);
    if (motionLevel(node) !== "full" || typeof value !== "number") {
      node.textContent = final;
      return;
    }
    var start = performance.now();
    var duration = 1100;
    (function frame(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 4);
      node.textContent = t < 1 ? fmt(value * eased, compact) : final;
      if (t < 1 && node.isConnected) requestAnimationFrame(frame);
    })(start);
  }

  /* ── Data ── */

  function seriesOf(spec) {
    if (Array.isArray(spec.series)) return spec.series;
    if (Array.isArray(spec.data)) return [{ name: spec.title || "Value", data: spec.data }];
    return [];
  }

  function num(value) {
    return value == null || value === "" ? null : Number(value);
  }

  function sum(values) {
    return values.reduce(function (total, v) {
      return total + (num(v) || 0);
    }, 0);
  }

  function wrapLabel(label, width) {
    var words = String(label).split(" ");
    var lines = [""];
    words.forEach(function (word) {
      var line = lines[lines.length - 1];
      if (line && (line + " " + word).length > width) lines.push(word);
      else lines[lines.length - 1] = line ? line + " " + word : word;
    });
    return lines.length > 1 ? lines : lines[0];
  }

  /** Waterfall steps: the first value is the starting total, the rest are
   *  changes; indexes in "totals" are subtotals, and "end" names the last. */
  function waterfallSteps(spec) {
    var data = (seriesOf(spec)[0] || { data: [] }).data.map(num);
    var totals = Array.isArray(spec.totals) ? spec.totals : [];
    var running = 0;
    var steps = data.map(function (v, i) {
      if (i === 0 || totals.indexOf(i) >= 0) {
        running = v == null ? running : v;
        return { label: spec.labels[i], kind: "total", from: 0, to: running, change: running };
      }
      var step = { label: spec.labels[i], kind: v < 0 ? "down" : "up", from: running, to: running + (v || 0), change: v || 0 };
      running = step.to;
      return step;
    });
    if (spec.end) steps.push({ label: spec.end, kind: "total", from: 0, to: running, change: running });
    return steps;
  }

  /** Items for progress and treemap: "items", or "labels" with one series. */
  function itemsOf(spec) {
    if (Array.isArray(spec.items)) return spec.items;
    var data = (seriesOf(spec)[0] || { data: [] }).data;
    return (spec.labels || []).map(function (label, i) {
      return { label: label, value: data[i], group: spec.groups && spec.groups[i] };
    });
  }

  /* ── Chart.js plugins ──
     Inline plugins, given to each chart; their options live under
     options.plugins.<id> so a re-theme replaces them with the rest. */

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  /** A soft band behind the hovered category, or a crosshair on lines. */
  var hoverPlugin = {
    id: "vizHover",
    beforeDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.color) return;
      var active = chart.tooltip ? chart.tooltip.getActiveElements() : [];
      if (!active.length) return;
      var area = chart.chartArea;
      var horizontal = chart.options.indexAxis === "y";
      var scale = horizontal ? chart.scales.y : chart.scales.x;
      var at = scale.getPixelForValue(active[0].index);
      var ctx = chart.ctx;
      ctx.save();
      if (opts.crosshair) {
        ctx.strokeStyle = opts.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(at) + 0.5, area.top);
        ctx.lineTo(Math.round(at) + 0.5, area.bottom);
        ctx.stroke();
      } else {
        var count = Math.max(1, chart.data.labels.length);
        var size = ((horizontal ? area.bottom - area.top : area.right - area.left) / count) * 0.92;
        ctx.fillStyle = opts.color;
        if (horizontal) roundRect(ctx, area.left - 4, at - size / 2, area.right - area.left + 8, size, 8);
        else roundRect(ctx, at - size / 2, area.top - 4, size, area.bottom - area.top + 4, 8);
        ctx.fill();
      }
      ctx.restore();
    },
  };

  function pill(ctx, label, x, y, opts) {
    ctx.font = "600 11px " + opts.font;
    var w = ctx.measureText(label).width + 12;
    ctx.fillStyle = opts.surface;
    roundRect(ctx, x, y, w, 18, 9);
    ctx.fill();
    ctx.strokeStyle = opts.border;
    ctx.stroke();
    ctx.fillStyle = opts.text;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(label, x + w / 2, y + 9.5);
    return w;
  }

  /** A budget or goal: a dashed rule across the plot, labelled at its start. */
  var targetPlugin = {
    id: "vizTarget",
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || opts.value == null) return;
      var horizontal = chart.options.indexAxis === "y";
      var scale = horizontal ? chart.scales.x : chart.scales.y;
      var at = Math.round(scale.getPixelForValue(opts.value)) + 0.5;
      var area = chart.chartArea;
      if (horizontal ? at < area.left || at > area.right : at < area.top || at > area.bottom) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(at, area.top);
        ctx.lineTo(at, area.bottom);
      } else {
        ctx.moveTo(area.left, at);
        ctx.lineTo(area.right, at);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "600 11px " + opts.font;
      var w = ctx.measureText(opts.label).width + 12;
      // At the start of the rule: series tend to end near a budget, not start there.
      pill(ctx, opts.label, horizontal ? at - w / 2 : area.left + 6, horizontal ? area.top - 2 : at - 22, opts);
      ctx.restore();
    },
  };

  /** A shaded region of a scatter plot, such as "rightsizing candidates". */
  var regionPlugin = {
    id: "vizRegion",
    beforeDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.region) return;
      var r = opts.region;
      var x = chart.scales.x;
      var y = chart.scales.y;
      var area = chart.chartArea;
      var left = r.x && r.x[0] != null ? x.getPixelForValue(r.x[0]) : area.left;
      var right = r.x && r.x[1] != null ? x.getPixelForValue(r.x[1]) : area.right;
      var bottom = r.y && r.y[0] != null ? y.getPixelForValue(r.y[0]) : area.bottom;
      var top = r.y && r.y[1] != null ? y.getPixelForValue(r.y[1]) : area.top;
      left = Math.max(area.left, left);
      right = Math.min(area.right, right);
      top = Math.max(area.top, top);
      bottom = Math.min(area.bottom, bottom);
      if (right <= left || bottom <= top) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = opts.fill;
      roundRect(ctx, left, top, right - left, bottom - top, 6);
      ctx.fill();
      if (r.label) {
        ctx.font = "600 11px " + opts.font;
        ctx.fillStyle = opts.text;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(r.label, left + 8, top + 7);
      }
      ctx.restore();
    },
  };

  /** Values at the bar tips, or one total at the end of each stack. */
  var valuesPlugin = {
    id: "vizValues",
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.show) return;
      var horizontal = chart.options.indexAxis === "y";
      var ctx = chart.ctx;
      var bars = [];
      chart.data.datasets.forEach(function (ds, i) {
        if (ds.type !== "line" && chart.isDatasetVisible(i)) bars.push(i);
      });
      if (!bars.length) return;
      ctx.save();
      ctx.font = "600 11px " + opts.font;
      ctx.fillStyle = opts.color;
      chart.data.labels.forEach(function (label, index) {
        var total = 0;
        var tip = null;
        bars.forEach(function (d) {
          var value = num(chart.data.datasets[d].data[index]);
          if (value == null) return;
          total += value;
          if (opts.stacked || bars.length === 1) tip = chart.getDatasetMeta(d).data[index];
        });
        if (!tip || (opts.stacked && !total)) return;
        var pos = tip.getProps(["x", "y", "base"], false);
        var negative = horizontal ? pos.x < pos.base : pos.y > pos.base;
        var shown = opts.signed ? signed(opts.format, total, true) : opts.format(total, true, false);
        ctx.textAlign = horizontal ? (negative ? "right" : "left") : "center";
        ctx.textBaseline = horizontal ? "middle" : negative ? "top" : "bottom";
        if (horizontal) ctx.fillText(shown, pos.x + (negative ? -8 : 8), pos.y);
        else ctx.fillText(shown, pos.x, pos.y + (negative ? 6 : -6));
      });
      ctx.restore();
    },
  };

  /** Waterfall: a hairline from each bar's end to the next bar, and each
   *  bar's change (or a total's value) above it. */
  var waterfallPlugin = {
    id: "vizWaterfall",
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.steps) return;
      var bars = chart.getDatasetMeta(0).data;
      var y = chart.scales.y;
      var ctx = chart.ctx;
      // Too narrow for a value over every bar: the tooltip and table have them.
      var roomy = (chart.chartArea.right - chart.chartArea.left) / Math.max(1, bars.length) >= 52;
      ctx.save();
      ctx.strokeStyle = opts.connector;
      ctx.lineWidth = 1;
      opts.steps.forEach(function (step, i) {
        var bar = bars[i];
        var next = bars[i + 1];
        if (!bar) return;
        var props = bar.getProps(["x", "width"], false);
        if (next && opts.steps[i + 1].kind !== "total") {
          var at = Math.round(y.getPixelForValue(step.to)) + 0.5;
          var to = next.getProps(["x", "width"], false);
          ctx.beginPath();
          ctx.moveTo(props.x + props.width / 2, at);
          ctx.lineTo(to.x - to.width / 2, at);
          ctx.stroke();
        }
        if (!roomy) return;
        var shown = step.kind === "total" ? opts.format(step.to, true, false) : signed(opts.format, step.change, true);
        ctx.font = "600 11px " + opts.font;
        ctx.fillStyle = opts.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(shown, props.x, y.getPixelForValue(Math.max(step.from, step.to)) - 6);
      });
      ctx.restore();
    },
  };

  /** The figure in a donut's hole or under a gauge's arc. */
  var centerPlugin = {
    id: "vizCenter",
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.content) return;
      var inner = chart.getDatasetMeta(chart.data.datasets.length - 1).data[0];
      if (!inner) return;
      var shown = opts.content(chart);
      var props = inner.getProps(["x", "y", "innerRadius", "outerRadius"], true);
      var ctx = chart.ctx;
      var size = Math.max(15, Math.min(34, props.innerRadius * 0.4));
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = opts.text;
      ctx.font = "650 " + size + "px " + opts.font;
      ctx.textBaseline = "alphabetic";
      var y = props.y + (opts.gauge ? size * 0.15 : size * 0.28);
      ctx.fillText(shown.value, props.x, y);
      ctx.fillStyle = opts.muted;
      ctx.font = "500 12px " + opts.font;
      ctx.textBaseline = "top";
      ctx.fillText(shown.label, props.x, y + 8, props.innerRadius * 1.7);
      if (opts.gauge && opts.ends) {
        // The scale's two ends, just under where the arc starts and stops.
        var meta = chart.getDatasetMeta(0).data;
        var radius = (props.innerRadius + props.outerRadius) / 2;
        var from = meta[0].getProps(["startAngle"], true).startAngle;
        var to = meta[meta.length - 1].getProps(["endAngle"], true).endAngle;
        ctx.font = "500 11px " + opts.font;
        [[from, opts.ends[0]], [to, opts.ends[1]]].forEach(function (end) {
          ctx.fillText(end[1], props.x + Math.cos(end[0]) * radius, props.y + Math.sin(end[0]) * radius + 12);
        });
      }
      ctx.restore();
    },
  };

  var PLUGINS = [hoverPlugin, regionPlugin, targetPlugin, valuesPlugin, waterfallPlugin, centerPlugin];

  /* ── Tooltip: the value leads, the series follows ── */

  /** content: { title, rows: [{ color, shape, value, name }], total } */
  function showTip(entry, content, x, y) {
    var tip = entry.tip;
    tip.textContent = "";
    tip.appendChild(text("div", "chart-tip__title", content.title));
    content.rows.forEach(function (row) {
      var node = el("div", "chart-tip__row");
      var key = el("span", "chart-tip__key chart-tip__key--" + (row.shape || "rect"));
      key.style.setProperty("--key", row.color || "transparent");
      node.appendChild(key);
      node.appendChild(text("strong", "chart-tip__value", row.value));
      node.appendChild(text("span", "chart-tip__name", row.name));
      tip.appendChild(node);
    });
    if (content.total != null) {
      var foot = el("div", "chart-tip__row chart-tip__row--total");
      foot.appendChild(el("span", "chart-tip__key chart-tip__key--none"));
      foot.appendChild(text("strong", "chart-tip__value", content.total));
      foot.appendChild(text("span", "chart-tip__name", "Total"));
      tip.appendChild(foot);
    }
    tip.classList.add("is-visible");
    var box = entry.plot;
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var left = x + 16;
    if (left + w > box.clientWidth) left = x - 16 - w;
    left = Math.max(0, Math.min(left, box.clientWidth - w));
    var top = Math.max(0, Math.min(y - h / 2, box.clientHeight - h));
    tip.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
  }

  function hideTip(entry) {
    entry.tip.classList.remove("is-visible");
  }

  /** Every visible series at the hovered category. */
  function seriesTip(entry, chart, points) {
    var spec = entry.spec;
    var fmt = entry.fmt;
    var index = points[0].dataIndex;
    var bars = [];
    var lines = [];
    var total = 0;
    chart.data.datasets.forEach(function (ds, d) {
      var raw = ds.vizRaw ? ds.vizRaw[index] : num(ds.data[index]);
      if (!chart.isDatasetVisible(d) || raw == null) return;
      var row = {
        color: Array.isArray(ds.backgroundColor) ? ds.backgroundColor[index] : ds.vizColor,
        shape: ds.vizShape,
        value: spec.percent && ds.type !== "line" ? percentText(ds.data[index]) : fmt(raw),
        name: spec.percent && ds.type !== "line" ? ds.label + " · " + fmt(raw) : ds.label,
      };
      if (ds.type === "line" && spec.type === "bar") {
        lines.push(row);
        return;
      }
      total += raw;
      bars.push(row);
    });
    // A column's stack reads top-down, so its tooltip does too.
    if (spec.stacked && !spec.horizontal) bars.reverse();
    return {
      title: (spec.labels || chart.data.labels)[index],
      rows: lines.concat(bars),
      total: (spec.stacked || spec.percent) && bars.length > 1 ? fmt(total) : null,
    };
  }

  function chartTooltip(entry) {
    return function (context) {
      var model = context.tooltip;
      if (!model || model.opacity === 0 || !model.dataPoints || !model.dataPoints.length) {
        hideTip(entry);
        return;
      }
      var content = (entry.tipContent || seriesTip)(entry, context.chart, model.dataPoints);
      if (content) showTip(entry, content, model.caretX, model.caretY);
      else hideTip(entry);
    };
  }

  /* ── Chart.js config ── */

  function animation(entry) {
    var level = motionLevel(entry.card);
    if (level === "off") return false;
    if (level === "subtle") return { duration: 350, easing: "easeOutCubic" };
    return {
      duration: 900,
      easing: "easeOutQuart",
      // The first draw ripples in, one category after another.
      delay: function (ctx) {
        if (entry.drawn || ctx.type !== "data" || ctx.mode !== "default") return 0;
        return ctx.dataIndex * 45 + ctx.datasetIndex * 90;
      },
      onComplete: function () {
        entry.drawn = true;
      },
    };
  }

  function baseOptions(entry) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: animation(entry),
      layout: { padding: { top: 6, right: 6, bottom: 0, left: 0 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: { enabled: false, external: chartTooltip(entry) },
      },
    };
  }

  function tickStyle(theme) {
    return { color: theme.axis, font: { size: 11.5, family: theme.font } };
  }

  /** A linear value axis: hairline grid, a firmer line at zero. */
  function valueAxis(entry, fmt, stacked) {
    var theme = entry.theme;
    return {
      stacked: stacked,
      beginAtZero: entry.spec.min == null,
      min: entry.spec.min,
      max: entry.spec.max,
      grace: "6%",
      border: { display: false },
      grid: {
        drawTicks: false,
        lineWidth: 1,
        color: function (ctx) {
          return ctx.tick && ctx.tick.value === 0 ? theme.line : theme.grid;
        },
      },
      ticks: Object.assign(tickStyle(theme), {
        padding: 10,
        maxTicksLimit: 6,
        callback: function (v) {
          return fmt(v, true, false);
        },
      }),
    };
  }

  function axes(entry, stacked) {
    var theme = entry.theme;
    var spec = entry.spec;
    // Ticks are round numbers: no "25.0" for a chart with "decimals": 1.
    var value = valueAxis(entry, formatter(Object.assign({}, spec, { decimals: null })), stacked);
    var category = {
      stacked: stacked,
      border: { display: true, color: theme.line },
      grid: { display: false },
      ticks: Object.assign(tickStyle(theme), { padding: 8, maxRotation: 0, autoSkipPadding: 14 }),
    };
    if (spec.horizontal) {
      category.border.display = false;
      category.ticks.color = theme.text2;
      category.ticks.font = { size: 12, family: theme.font };
      // Long names wrap onto a second line instead of being cut off, and
      // every bar keeps its name.
      category.ticks.autoSkip = false;
      category.ticks.callback = function (v) {
        return wrapLabel(this.getLabelForValue(v), 16);
      };
      return { x: value, y: category };
    }
    // Two short lines where there's room; on a narrow chart the names tilt
    // instead, and a tilted name reads better on one line.
    category.ticks.callback = function (v) {
      var label = this.getLabelForValue(v);
      return this.chart.width / Math.max(1, this.chart.data.labels.length) >= 64 ? wrapLabel(label, 12) : label;
    };
    return { x: category, y: value };
  }

  function chrome(theme) {
    return { color: alpha(theme.text2, 0.8), text: theme.text2, surface: theme.surface, border: theme.line, font: theme.font };
  }

  function targetOptions(entry) {
    var t = entry.spec.target;
    if (!t || t.value == null) return null;
    return Object.assign(chrome(entry.theme), {
      value: t.value,
      label: (t.label ? t.label + " " : "") + entry.fmt(t.value, true, false),
    });
  }

  function lineDataset(entry, s, i, single) {
    var spec = entry.spec;
    var theme = entry.theme;
    var stacked = spec.type === "line" && !!spec.stacked;
    var color = colorFor(s.color || (single && !s.dashed ? "accent" : s.dashed ? "muted" : null), i, theme);
    var area = stacked || (s.area != null ? s.area : spec.area != null ? spec.area : single && !s.dashed && spec.type === "line");
    var data = (s.data || []).map(num);
    var last = -1;
    data.forEach(function (v, j) {
      if (v != null) last = j;
    });
    return {
      type: "line",
      label: s.name,
      data: data,
      vizColor: color,
      vizShape: s.dashed ? "dash" : "line",
      order: 0,
      stack: stacked ? "areas" : "line-" + i,
      borderColor: color,
      borderWidth: 2,
      borderDash: s.dashed ? [5, 5] : [],
      borderCapStyle: "round",
      borderJoinStyle: "round",
      tension: spec.smooth === false ? 0 : 0.35,
      cubicInterpolationMode: "monotone",
      spanGaps: true,
      fill: stacked ? (i === 0 ? "origin" : "-1") : area ? "origin" : false,
      // Stacked layers are flat washes; a lone area fades to the baseline.
      backgroundColor: stacked
        ? alpha(color, 0.22)
        : function (ctx) {
            var box = ctx.chart.chartArea;
            if (!box) return alpha(color, 0.1);
            var g = ctx.chart.ctx.createLinearGradient(0, box.top, 0, box.bottom);
            g.addColorStop(0, alpha(color, 0.24));
            g.addColorStop(1, alpha(color, 0));
            return g;
          },
      // Only the latest point is marked; the rest show on hover.
      pointRadius: function (ctx) {
        return ctx.dataIndex === last && !s.dashed ? 4.5 : 0;
      },
      pointHoverRadius: 5.5,
      pointHitRadius: 14,
      pointBackgroundColor: color,
      pointBorderColor: theme.surface,
      pointBorderWidth: 2,
      pointHoverBorderWidth: 2,
    };
  }

  function buildBar(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var series = seriesOf(spec);
    var labels = spec.labels || [];
    var percent = !!spec.percent;
    var stacked = !!spec.stacked || percent;
    var horizontal = !!spec.horizontal;
    var barSeries = series.filter(function (s) {
      return s.type !== "line";
    });
    var single = barSeries.length === 1;
    var diverging = !!spec.diverging && single;
    var change = changeColors(spec, theme);
    var totals = labels.map(function (label, j) {
      return sum(barSeries.map(function (s) {
        return Math.abs(num((s.data || [])[j]) || 0);
      }));
    });
    var showValues = spec.values != null ? !!spec.values : labels.length <= 8 && (single || stacked) && !percent;
    var datasets = series.map(function (s, i) {
      if (s.type === "line") return lineDataset(entry, s, i, false);
      var color = colorFor(s.color || (single && !diverging ? "accent" : null), i, theme);
      var raw = (s.data || []).map(num);
      var fills = diverging
        ? raw.map(function (v) {
            return v < 0 ? change.down : change.up;
          })
        : color;
      return {
        label: s.name,
        data: percent
          ? raw.map(function (v, j) {
              return v == null ? null : totals[j] ? (v / totals[j]) * 100 : 0;
            })
          : raw,
        vizRaw: raw,
        vizColor: color,
        vizShape: "rect",
        order: 1,
        backgroundColor: fills,
        hoverBackgroundColor: Array.isArray(fills)
          ? fills.map(function (c) {
              return mix(c, theme.text, 0.14);
            })
          : mix(color, theme.text, 0.14),
        borderColor: theme.surface,
        hoverBorderColor: theme.surface,
        // A 2px gap between stacked segments, in the card's own colour.
        borderWidth: stacked ? (horizontal ? { right: 2 } : { top: 2 }) : 0,
        // Rounded at the data end only, and only on a stack's last segment.
        borderRadius: function (ctx) {
          if (!stacked) return 5;
          var chart = ctx.chart;
          for (var d = chart.data.datasets.length - 1; d >= 0; d--) {
            var ds = chart.data.datasets[d];
            if (ds.type !== "line" && chart.isDatasetVisible(d) && num(ds.data[ctx.dataIndex])) {
              return d === ctx.datasetIndex ? 5 : 0;
            }
          }
          return 0;
        },
        borderSkipped: "start",
        maxBarThickness: horizontal ? 20 : 28,
        categoryPercentage: single || stacked ? 0.72 : 0.78,
        barPercentage: single || stacked ? 0.9 : 0.86,
      };
    });
    var options = baseOptions(entry);
    options.indexAxis = horizontal ? "y" : "x";
    options.interaction.axis = horizontal ? "y" : "x";
    options.scales = axes(entry, stacked);
    var valueKey = horizontal ? "x" : "y";
    if (percent) {
      options.scales[valueKey].max = 100;
      options.scales[valueKey].grace = 0;
      options.scales[valueKey].ticks.callback = function (v) {
        return v + "%";
      };
    }
    if (showValues) {
      if (horizontal) {
        options.layout.padding.right = 60;
        if (diverging) options.layout.padding.left = 52;
      } else {
        options.layout.padding.top = 22;
        if (diverging) options.layout.padding.bottom = 18;
      }
      // Every bar carries its value, so the value axis has nothing to add.
      if (horizontal && !stacked && !diverging) {
        options.scales.x.display = false;
        options.layout.padding.bottom = 4;
      }
    }
    options.plugins.vizHover = { color: alpha(theme.text, 0.05) };
    options.plugins.vizTarget = targetOptions(entry);
    options.plugins.vizValues = {
      show: showValues,
      stacked: stacked,
      signed: diverging,
      color: theme.text2,
      font: theme.font,
      format: entry.fmt,
    };
    if (diverging) {
      entry.legendItems = function () {
        var good = spec.good === "down" ? "Decrease" : "Increase";
        var bad = spec.good === "down" ? "Increase" : "Decrease";
        return [
          { name: good, color: spec.good === "down" ? change.down : change.up, shape: "rect" },
          { name: bad, color: spec.good === "down" ? change.up : change.down, shape: "rect" },
        ];
      };
    }
    return { type: "bar", data: { labels: labels, datasets: datasets }, options: options };
  }

  function buildLine(entry) {
    var spec = entry.spec;
    var series = seriesOf(spec);
    var single = series.filter(function (s) {
      return !s.dashed;
    }).length === 1;
    var options = baseOptions(entry);
    options.scales = axes(entry, !!spec.stacked);
    options.scales.x.offset = false;
    options.layout.padding.right = 12;
    options.plugins.vizHover = { color: alpha(entry.theme.text2, 0.55), crosshair: true };
    options.plugins.vizTarget = targetOptions(entry);
    return {
      type: "line",
      data: {
        labels: spec.labels || [],
        datasets: series.map(function (s, i) {
          return lineDataset(entry, s, i, single);
        }),
      },
      options: options,
    };
  }

  function buildDonut(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var series = seriesOf(spec);
    var rings = series.length > 1;
    var colors = (spec.labels || []).map(function (label, i) {
      return colorFor(spec.colors && spec.colors[i], i, theme);
    });
    var options = baseOptions(entry);
    options.cutout = rings ? "50%" : "72%";
    options.interaction = { mode: "nearest", intersect: true };
    options.layout.padding = 8;
    options.plugins.vizCenter = {
      text: theme.text,
      muted: theme.text2,
      font: theme.font,
      content: function (chart) {
        var active = chart.getActiveElements();
        if (active.length) {
          var a = active[0];
          var ds = chart.data.datasets[a.datasetIndex];
          return { value: entry.fmt(num(ds.data[a.index]), true, false), label: rings ? ds.label : chart.data.labels[a.index] };
        }
        var outer = chart.data.datasets[0].data;
        var total = outer.reduce(function (t, v, i) {
          return chart.getDataVisibility(i) ? t + (num(v) || 0) : t;
        }, 0);
        return { value: entry.fmt(total, true, false), label: spec.centerLabel || (rings ? series[0].name : "Total") };
      },
    };
    entry.tipContent = function (entry, chart, points) {
      var index = points[0].dataIndex;
      return {
        title: chart.data.labels[index],
        rows: chart.data.datasets.map(function (ds) {
          var total = ds.data.reduce(function (t, v, i) {
            return chart.getDataVisibility(i) ? t + (num(v) || 0) : t;
          }, 0);
          var share = total ? Math.round((num(ds.data[index]) / total) * 1000) / 10 + "%" : "";
          return {
            color: ds.backgroundColor[index],
            shape: "rect",
            value: entry.fmt(num(ds.data[index])),
            name: rings ? ds.label + " · " + share : share + " of total",
          };
        }),
      };
    };
    entry.caption = rings
      ? "Rings, outside in: " + series.map(function (s) {
          return s.name;
        }).join(", ")
      : "";
    return {
      type: "doughnut",
      data: {
        labels: spec.labels || [],
        datasets: series.map(function (s, d) {
          // Inner rings are a step paler, so the outer one reads as "now".
          var fills = colors.map(function (c) {
            return d ? mix(c, theme.surface, Math.min(0.5, 0.3 * d)) : c;
          });
          return {
            label: s.name,
            data: (s.data || []).map(num),
            vizColor: fills[0],
            backgroundColor: fills,
            hoverBackgroundColor: fills.map(function (c) {
              return mix(c, theme.text, 0.12);
            }),
            borderWidth: rings ? 2 : 0,
            borderColor: theme.surface,
            hoverBorderColor: theme.surface,
            spacing: rings ? 0 : 2,
            borderRadius: 4,
            hoverOffset: rings ? 0 : 6,
          };
        }),
      },
      options: options,
    };
  }

  function buildGauge(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var max = spec.max != null ? Number(spec.max) : 100;
    var value = Math.max(0, Math.min(max, num(spec.value) || 0));
    var color = bandColor(spec, value, spec.color, theme);
    var options = baseOptions(entry);
    options.cutout = "80%";
    options.rotation = -125;
    options.circumference = 250;
    options.events = [];
    options.layout.padding = { top: 6, right: 6, bottom: 14, left: 6 };
    options.plugins.tooltip = { enabled: false };
    options.plugins.vizCenter = {
      gauge: true,
      text: theme.text,
      muted: theme.text2,
      font: theme.font,
      ends: [entry.fmt(spec.min || 0, true, false), entry.fmt(max, true, false)],
      content: function () {
        return { value: entry.fmt(value, false, false), label: spec.caption || "of " + entry.fmt(max, false, false) };
      },
    };
    return {
      type: "doughnut",
      data: {
        labels: [spec.label || spec.title || "Value", "Remaining"],
        datasets: [
          {
            data: [value, max - value],
            vizColor: color,
            // The track is a pale step of the fill's own hue.
            backgroundColor: [color, alpha(color, 0.14)],
            borderWidth: 0,
            borderRadius: 99,
          },
        ],
      },
      options: options,
    };
  }

  function buildRadar(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var datasets = seriesOf(spec).map(function (s, i) {
      var color = colorFor(s.color || (i === 0 ? "accent" : null), i, theme);
      return {
        label: s.name,
        data: (s.data || []).map(num),
        vizColor: color,
        vizShape: s.dashed ? "dash" : "line",
        borderColor: color,
        backgroundColor: alpha(color, s.color === "muted" ? 0.06 : 0.16),
        borderWidth: 2,
        borderDash: s.dashed ? [5, 5] : [],
        pointRadius: 3.5,
        pointHoverRadius: 5,
        pointHitRadius: 14,
        pointBackgroundColor: color,
        pointBorderColor: theme.surface,
        pointBorderWidth: 2,
      };
    });
    var options = baseOptions(entry);
    // The tooltip lists every series at the nearest spoke.
    options.interaction = { mode: "nearest", intersect: false, axis: "xy" };
    options.scales = {
      r: {
        min: spec.min != null ? spec.min : 0,
        max: spec.max != null ? spec.max : 100,
        ticks: { display: false, maxTicksLimit: 5 },
        grid: { color: theme.grid },
        angleLines: { color: theme.grid },
        pointLabels: { color: theme.text2, font: { size: 12, weight: "500", family: theme.font }, padding: 10 },
      },
    };
    return { type: "radar", data: { labels: spec.labels || [], datasets: datasets }, options: options };
  }

  function buildWaterfall(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var steps = waterfallSteps(spec);
    var change = changeColors(spec, theme);
    var fills = steps.map(function (s) {
      return s.kind === "total" ? theme.muted : change[s.kind];
    });
    var options = baseOptions(entry);
    options.scales = axes(entry, false);
    // Every step keeps its name; on a narrow card the names tilt to fit.
    options.scales.x.ticks.autoSkip = false;
    options.scales.x.ticks.maxRotation = 45;
    options.layout.padding.top = 22;
    // Changes are small next to the totals, so the axis starts just under
    // the lowest point the bars reach, and the card says where.
    if (spec.min == null) {
      var ends = [];
      steps.forEach(function (s) {
        if (s.kind === "total") ends.push(s.to);
        else ends.push(s.from, s.to);
      });
      var lo = Math.min.apply(null, ends);
      var hi = Math.max.apply(null, ends);
      var span = hi - lo || Math.abs(hi) || 1;
      var unit = Math.pow(10, Math.floor(Math.log10(span)));
      var floor = Math.floor((lo - span * 0.75) / unit) * unit;
      if (floor > 0) {
        options.scales.y.min = floor;
        options.scales.y.beginAtZero = false;
        entry.caption = "The axis starts at " + entry.fmt(floor, true, false) + ".";
      }
    }
    options.plugins.vizHover = { color: alpha(theme.text, 0.05) };
    options.plugins.vizTarget = targetOptions(entry);
    options.plugins.vizWaterfall = {
      steps: steps,
      connector: alpha(theme.text2, 0.6),
      color: theme.text2,
      font: theme.font,
      format: entry.fmt,
    };
    entry.tipContent = function (entry, chart, points) {
      var step = steps[points[0].dataIndex];
      var rows = [];
      if (step.kind === "total") rows.push({ color: fills[points[0].dataIndex], value: entry.fmt(step.to), name: "Total" });
      else {
        rows.push({ color: fills[points[0].dataIndex], value: signed(entry.fmt, step.change), name: step.kind === "up" ? "Increase" : "Decrease" });
        rows.push({ shape: "none", value: entry.fmt(step.to), name: "Running total" });
      }
      return { title: step.label, rows: rows };
    };
    entry.legendItems = function () {
      return [
        { name: "Increase", color: change.up, shape: "rect" },
        { name: "Decrease", color: change.down, shape: "rect" },
        { name: "Total", color: theme.muted, shape: "rect" },
      ];
    };
    return {
      type: "bar",
      data: {
        labels: steps.map(function (s) {
          return s.label;
        }),
        datasets: [
          {
            label: (seriesOf(spec)[0] || {}).name || spec.title,
            data: steps.map(function (s) {
              return [s.from, s.to];
            }),
            vizColor: theme.muted,
            vizShape: "rect",
            backgroundColor: fills,
            hoverBackgroundColor: fills.map(function (c) {
              return mix(c, theme.text, 0.14);
            }),
            borderWidth: 0,
            borderRadius: 4,
            borderSkipped: false,
            maxBarThickness: 32,
            categoryPercentage: 0.72,
            barPercentage: 0.9,
          },
        ],
      },
      options: options,
    };
  }

  function buildScatter(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var xs = spec.x || {};
    var ys = spec.y || {};
    var sz = spec.size || {};
    var fx = formatter(Object.assign({}, spec, xs));
    var fy = formatter(Object.assign({}, spec, ys));
    var fs = formatter(Object.assign({}, spec, sz));
    var series = seriesOf(spec);
    var biggest = 0;
    series.forEach(function (s) {
      (s.data || []).forEach(function (p) {
        if (p && num(p.size) > biggest) biggest = num(p.size);
      });
    });
    var bubble = biggest > 0;
    var datasets = series.map(function (s, i) {
      var color = colorFor(s.color || (series.length === 1 ? "accent" : null), i, theme);
      return {
        label: s.name,
        data: (s.data || []).map(function (p) {
          return {
            x: num(p.x),
            y: num(p.y),
            r: bubble ? 4 + Math.sqrt((num(p.size) || 0) / biggest) * 16 : 5,
            name: p.name,
            size: num(p.size),
          };
        }),
        vizColor: color,
        vizShape: "dot",
        backgroundColor: alpha(color, bubble ? 0.6 : 0.85),
        hoverBackgroundColor: color,
        // A ring in the card's colour keeps overlapping points apart.
        borderColor: theme.surface,
        hoverBorderColor: theme.surface,
        borderWidth: 2,
        hoverBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        hoverRadius: bubble ? 2 : 7,
        hitRadius: 10,
      };
    });
    var options = baseOptions(entry);
    options.interaction = { mode: "nearest", intersect: false, axis: "xy" };
    var tickX = formatter(Object.assign({}, spec, xs, { decimals: null }));
    var tickY = formatter(Object.assign({}, spec, ys, { decimals: null }));
    function title(label) {
      return { display: !!label, text: label || "", color: theme.text2, font: { size: 12, weight: "500", family: theme.font }, padding: { top: 8 } };
    }
    options.scales = {
      x: Object.assign(valueAxis(entry, tickX, false), { type: "linear", beginAtZero: xs.min == null, min: xs.min, max: xs.max, title: title(xs.label) }),
      y: Object.assign(valueAxis(entry, tickY, false), { type: "linear", beginAtZero: ys.min == null, min: ys.min, max: ys.max, title: title(ys.label) }),
    };
    options.scales.x.border = { display: true, color: theme.line };
    options.layout.padding.right = 14;
    options.plugins.vizRegion = spec.region
      ? { region: spec.region, fill: alpha(colorFor(spec.region.color || "high", 0, theme), 0.08), text: theme.text2, font: theme.font }
      : null;
    entry.tipContent = function (entry, chart, points) {
      var point = points[0];
      var ds = chart.data.datasets[point.datasetIndex];
      var raw = point.raw;
      var rows = [
        { color: ds.vizColor, shape: "dot", value: fy(raw.y), name: ys.label || "y" },
        { shape: "none", value: fx(raw.x), name: xs.label || "x" },
      ];
      if (bubble) rows.push({ shape: "none", value: fs(raw.size), name: sz.label || "Size" });
      return { title: raw.name || ds.label, rows: rows };
    };
    return { type: bubble ? "bubble" : "scatter", data: { datasets: datasets }, options: options };
  }

  var BUILDERS = {
    bar: buildBar,
    line: buildLine,
    donut: buildDonut,
    gauge: buildGauge,
    radar: buildRadar,
    waterfall: buildWaterfall,
    scatter: buildScatter,
  };

  /* ── HTML charts ──
     Built from the same theme reading as the canvas ones, and rebuilt when
     the theme changes. Each piece is created in its resting state; the first
     time, the plot gets .is-drawn a frame later so CSS can animate it in. */

  function hoverTip(entry, node, content) {
    node.addEventListener("pointermove", function (event) {
      var box = entry.plot.getBoundingClientRect();
      showTip(entry, content(), event.clientX - box.left, event.clientY - box.top);
    });
    node.addEventListener("pointerleave", function () {
      hideTip(entry);
    });
  }

  function renderHeatmap(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var rows = spec.rows || [];
    var cols = spec.labels || [];
    var data = Array.isArray(spec.data) ? spec.data : [];
    var color = colorFor(spec.color || "1", 0, theme);
    var flat = [];
    data.forEach(function (row) {
      (row || []).forEach(function (v) {
        if (num(v) != null) flat.push(num(v));
      });
    });
    var min = spec.min != null ? spec.min : Math.min.apply(null, flat.concat(0));
    var max = spec.max != null ? spec.max : Math.max.apply(null, flat.concat(1));
    var showValues = spec.values != null ? !!spec.values : rows.length * cols.length <= 96;
    function fill(v) {
      var t = max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 1;
      return mix(theme.surface, color, 0.08 + 0.92 * t);
    }
    var grid = el("div", "chart-heat");
    grid.style.gridTemplateColumns = "auto repeat(" + cols.length + ", minmax(0, 1fr))";
    rows.forEach(function (rowLabel, r) {
      grid.appendChild(text("div", "chart-heat__row", rowLabel));
      cols.forEach(function (colLabel, c) {
        var v = num((data[r] || [])[c]);
        var cell = el("div", "chart-heat__cell" + (v == null ? " is-empty" : ""));
        cell.style.setProperty("--i", r + c);
        if (v != null) {
          var bg = fill(v);
          cell.style.background = bg;
          cell.style.color = inkOn(bg);
          if (showValues) cell.textContent = entry.fmt(v, true, false);
          hoverTip(entry, cell, function () {
            return { title: rowLabel + " · " + colLabel, rows: [{ color: bg, value: entry.fmt(v), name: spec.valueLabel || "" }] };
          });
        }
        grid.appendChild(cell);
      });
    });
    grid.appendChild(el("div"));
    cols.forEach(function (colLabel) {
      grid.appendChild(text("div", "chart-heat__col", colLabel));
    });
    var scale = el("div", "chart-heat__scale");
    var bar = el("span", "chart-heat__ramp");
    bar.style.background = "linear-gradient(90deg, " + fill(min) + ", " + fill(max) + ")";
    scale.appendChild(text("span", null, entry.fmt(min, true)));
    scale.appendChild(bar);
    scale.appendChild(text("span", null, entry.fmt(max, true)));
    entry.plot.appendChild(grid);
    entry.plot.appendChild(scale);
  }

  function renderProgress(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var list = el("div", "chart-progress");
    itemsOf(spec).forEach(function (item, i) {
      var value = num(item.value) || 0;
      var max = item.max != null ? Number(item.max) : spec.max != null ? Number(spec.max) : 100;
      var target = item.target != null ? item.target : spec.target != null && typeof spec.target !== "object" ? spec.target : null;
      var color = bandColor(spec, value, item.color || spec.color, theme);
      var row = el("div", "chart-progress__item");
      row.style.setProperty("--i", i);
      var head = el("div", "chart-progress__head");
      head.appendChild(text("span", "chart-progress__name", item.label));
      var figure = text("span", "chart-progress__value", entry.fmt(value, true));
      if (spec.format !== "percent") figure.appendChild(text("span", "chart-progress__of", " of " + entry.fmt(max, true)));
      head.appendChild(figure);
      row.appendChild(head);
      var track = el("div", "chart-progress__track");
      track.style.background = alpha(color, 0.16);
      var bar = el("div", "chart-progress__fill");
      bar.style.background = color;
      bar.style.setProperty("--w", Math.max(0, Math.min(100, (value / max) * 100)) + "%");
      track.appendChild(bar);
      if (target != null) {
        var mark = el("span", "chart-progress__target");
        mark.style.left = Math.max(0, Math.min(100, (target / max) * 100)) + "%";
        track.appendChild(mark);
      }
      row.appendChild(track);
      if (item.note || target != null) {
        row.appendChild(text("span", "chart-progress__note", [target != null ? "Target " + entry.fmt(target, true) : "", item.note || ""].filter(Boolean).join(" · ")));
      }
      hoverTip(entry, row, function () {
        var rows = [{ color: color, value: entry.fmt(value) + " of " + entry.fmt(max), name: Math.round((value / max) * 100) + "%" }];
        if (target != null) rows.push({ shape: "none", value: entry.fmt(target), name: "Target" });
        return { title: item.label, rows: rows };
      });
      list.appendChild(row);
    });
    entry.plot.appendChild(list);
  }

  /** Squarified treemap: rows of tiles kept as close to square as they go. */
  function squarify(items, x, y, w, h) {
    var out = [];
    var total = sum(items.map(function (it) {
      return it.value;
    }));
    if (!total) return out;
    var rest = items.map(function (it) {
      return { item: it, area: (it.value / total) * w * h };
    });
    function worst(row, side) {
      var s = 0;
      var hi = 0;
      var lo = Infinity;
      row.forEach(function (r) {
        s += r.area;
        hi = Math.max(hi, r.area);
        lo = Math.min(lo, r.area);
      });
      return Math.max((side * side * hi) / (s * s), (s * s) / (side * side * lo));
    }
    while (rest.length) {
      var side = Math.min(w, h);
      var row = [rest[0]];
      var i = 1;
      while (i < rest.length && worst(row.concat(rest[i]), side) <= worst(row, side)) row.push(rest[i++]);
      rest = rest.slice(i);
      var area = sum(row.map(function (r) {
        return r.area;
      }));
      if (w >= h) {
        var cw = area / h;
        var cy = y;
        row.forEach(function (r) {
          out.push({ item: r.item, x: x, y: cy, w: cw, h: r.area / cw });
          cy += r.area / cw;
        });
        x += cw;
        w -= cw;
      } else {
        var ch = area / w;
        var cx = x;
        row.forEach(function (r) {
          out.push({ item: r.item, x: cx, y: y, w: r.area / ch, h: ch });
          cx += r.area / ch;
        });
        y += ch;
        h -= ch;
      }
    }
    return out;
  }

  function renderTreemap(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var items = itemsOf(spec)
      .map(function (it) {
        return { label: it.label, value: num(it.value) || 0, group: it.group, color: it.color };
      })
      .filter(function (it) {
        return it.value > 0;
      })
      .sort(function (a, b) {
        return b.value - a.value;
      });
    var total = sum(items.map(function (it) {
      return it.value;
    }));
    // Colour follows the group, in order of first appearance; no groups, one hue.
    var groups = [];
    itemsOf(spec).forEach(function (it) {
      if (it.group && groups.indexOf(it.group) < 0) groups.push(it.group);
    });
    function tileColor(it) {
      if (it.color) return colorFor(it.color, 0, theme);
      if (it.group) return colorFor(spec.groupColors && spec.groupColors[it.group], groups.indexOf(it.group), theme);
      return theme.accent;
    }
    var box = el("div", "chart-tree");
    entry.plot.appendChild(box);
    var width = entry.plot.clientWidth;
    var height = entry.plot.clientHeight;
    squarify(items, 0, 0, width, height).forEach(function (r, i) {
      var it = r.item;
      var bg = tileColor(it);
      var tile = el("div", "chart-tree__tile");
      tile.style.setProperty("--i", i);
      tile.style.left = r.x + 1 + "px";
      tile.style.top = r.y + 1 + "px";
      tile.style.width = Math.max(0, r.w - 2) + "px";
      tile.style.height = Math.max(0, r.h - 2) + "px";
      tile.style.background = bg;
      tile.style.color = bg === theme.accent ? theme.onAccent : inkOn(bg);
      // Only what fits: name and value, the name, or nothing (the tooltip has it).
      if (r.w >= 56 && r.h >= 26) tile.appendChild(text("span", "chart-tree__name", it.label));
      if (r.w >= 68 && r.h >= 44) tile.appendChild(text("span", "chart-tree__value", entry.fmt(it.value, true)));
      hoverTip(entry, tile, function () {
        return {
          title: it.label,
          rows: [{ color: bg, value: entry.fmt(it.value), name: Math.round((it.value / total) * 1000) / 10 + "% of total" + (it.group ? " · " + it.group : "") }],
        };
      });
      box.appendChild(tile);
    });
    entry.legendItems = groups.length
      ? function () {
          return groups.map(function (g, i) {
            return { name: g, color: colorFor(spec.groupColors && spec.groupColors[g], i, theme), shape: "rect" };
          });
        }
      : null;
    if (!entry.resize && "ResizeObserver" in window) {
      var last = width;
      entry.resize = new ResizeObserver(function () {
        if (Math.abs(entry.plot.clientWidth - last) < 2) return;
        last = entry.plot.clientWidth;
        renderHtml(entry);
      });
      entry.resize.observe(entry.plot);
    }
  }

  var RENDERERS = { heatmap: renderHeatmap, progress: renderProgress, treemap: renderTreemap };

  function renderHtml(entry) {
    if (!entry.card.isConnected) return;
    entry.theme = readTheme(entry.card);
    var first = !entry.plot.classList.contains("is-drawn");
    Array.prototype.slice.call(entry.plot.children).forEach(function (child) {
      if (child !== entry.tip) child.remove();
    });
    hideTip(entry);
    RENDERERS[entry.spec.type](entry);
    renderLegend(entry);
    if (first) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          entry.plot.classList.add("is-drawn");
        });
      });
    }
  }

  /* ── Card parts ── */

  function renderHeadline(entry) {
    var slot = entry.headline;
    var h = entry.spec.headline;
    slot.textContent = "";
    slot.hidden = !h;
    if (!h) return;
    var fmt = h.format ? formatter(h) : entry.fmt;
    var main = el("div", "chart-card__figure-main");
    // A gauge already shows its value, so its headline can be just the delta.
    var value = h.value != null ? text("span", "chart-card__figure-value", "") : null;
    if (value) main.appendChild(value);
    if (h.label) main.appendChild(text("span", "chart-card__figure-label", h.label));
    if (main.firstChild) slot.appendChild(main);
    if (h.delta != null) slot.appendChild(deltaNode(h, fmt));
    if (!value) return;
    if (entry.revealed) countUp(value, num(h.value), fmt, true);
    else value.textContent = fmt(num(h.value), true);
  }

  /** Legend entries: series that toggle, or fixed keys (entry.legendItems). */
  function chartLegendItems(entry) {
    var spec = entry.spec;
    var chart = entry.chart;
    if (!chart || spec.type === "gauge") return null;
    if (spec.type === "donut") {
      var data = chart.data.datasets[0].data;
      var total = sum(data);
      return (spec.labels || []).map(function (name, i) {
        return {
          name: name,
          color: chart.data.datasets[0].backgroundColor[i],
          shape: "rect",
          on: chart.getDataVisibility(i),
          value: entry.fmt(num(data[i]), true, false),
          share: total ? Math.round((num(data[i]) / total) * 100) + "%" : "",
          toggle: function () {
            chart.toggleDataVisibility(i);
          },
          highlight: function () {
            return chart.data.datasets.map(function (ds, d) {
              return { datasetIndex: d, index: i };
            });
          },
        };
      });
    }
    // One series needs no legend: the title already says what's plotted.
    if (chart.data.datasets.length < 2) return null;
    return chart.data.datasets.map(function (ds, i) {
      return {
        name: ds.label,
        color: ds.vizColor,
        shape: ds.vizShape || "rect",
        on: chart.isDatasetVisible(i),
        toggle: function () {
          chart.setDatasetVisibility(i, !chart.isDatasetVisible(i));
        },
        highlight: function () {
          return chart.getDatasetMeta(i).data.map(function (p, j) {
            return { datasetIndex: i, index: j };
          });
        },
      };
    });
  }

  function renderLegend(entry) {
    var legend = entry.legend;
    var chart = entry.chart;
    legend.textContent = "";
    var items = entry.legendItems ? entry.legendItems() : chartLegendItems(entry);
    legend.hidden = !items || !items.length;
    if (entry.captionEl) {
      entry.captionEl.textContent = entry.caption || "";
      entry.captionEl.hidden = !entry.caption;
    }
    if (legend.hidden) return;
    items.forEach(function (it) {
      var on = it.on !== false;
      var item = el(it.toggle ? "button" : "span", "chart-legend__item" + (on ? "" : " is-off") + (it.toggle ? "" : " is-static"));
      if (it.toggle) {
        item.type = "button";
        item.setAttribute("aria-pressed", on ? "true" : "false");
        item.title = (on ? "Hide " : "Show ") + it.name;
      }
      var key = el("span", "chart-legend__key chart-legend__key--" + it.shape);
      key.style.setProperty("--key", it.color);
      item.appendChild(key);
      item.appendChild(text("span", "chart-legend__name", it.name));
      if (it.value != null) {
        item.appendChild(text("span", "chart-legend__value", it.value));
        item.appendChild(text("span", "chart-legend__share", it.share));
      }
      if (it.toggle && chart) {
        item.addEventListener("click", function () {
          it.toggle();
          chart.update();
          renderLegend(entry);
        });
        // Pointing at a legend entry lights up its marks.
        item.addEventListener("pointerenter", function () {
          if (!on) return;
          chart.setActiveElements(it.highlight());
          chart.update("none");
        });
        item.addEventListener("pointerleave", function () {
          chart.setActiveElements([]);
          chart.update("none");
        });
      }
      legend.appendChild(item);
    });
  }

  /** The figures behind the chart, as rows of text. */
  function tableData(entry) {
    var spec = entry.spec;
    var fmt = entry.fmt;
    var max;
    switch (spec.type) {
      case "gauge":
        max = spec.max != null ? Number(spec.max) : 100;
        return { head: [spec.label || spec.title || "Measure", "Value"], rows: [[spec.label || spec.title || "", fmt(num(spec.value)) + " of " + fmt(max)]] };
      case "waterfall":
        return {
          head: [spec.categoryLabel || "", "Change", "Running total"],
          rows: waterfallSteps(spec).map(function (s) {
            return [s.label, s.kind === "total" ? "–" : signed(fmt, s.change), fmt(s.to)];
          }),
        };
      case "scatter":
        var xs = spec.x || {};
        var ys = spec.y || {};
        var sz = spec.size || {};
        var fx = formatter(Object.assign({}, spec, xs));
        var fy = formatter(Object.assign({}, spec, ys));
        var fs = formatter(Object.assign({}, spec, sz));
        var head = ["", xs.label || "x", ys.label || "y"];
        var withSize = seriesOf(spec).some(function (s) {
          return (s.data || []).some(function (p) {
            return p && p.size != null;
          });
        });
        if (withSize) head.push(sz.label || "Size");
        var rows = [];
        seriesOf(spec).forEach(function (s) {
          (s.data || []).forEach(function (p) {
            var row = [(p.name || "") + (seriesOf(spec).length > 1 ? " (" + s.name + ")" : ""), fx(num(p.x)), fy(num(p.y))];
            if (withSize) row.push(fs(num(p.size)));
            rows.push(row);
          });
        });
        return { head: head, rows: rows };
      case "heatmap":
        return {
          head: [spec.rowLabel || ""].concat(spec.labels || []),
          rows: (spec.rows || []).map(function (label, r) {
            return [label].concat((spec.labels || []).map(function (c, i) {
              return fmt(num(((spec.data || [])[r] || [])[i]));
            }));
          }),
        };
      case "progress":
        return {
          head: ["", "Value", "Target"],
          rows: itemsOf(spec).map(function (it) {
            var target = it.target != null ? it.target : typeof spec.target === "number" ? spec.target : null;
            var top = it.max != null ? it.max : spec.max != null ? spec.max : 100;
            return [it.label, fmt(num(it.value)) + (spec.format === "percent" ? "" : " of " + fmt(top)), target == null ? "–" : fmt(target)];
          }),
        };
      case "treemap":
        var items = itemsOf(spec);
        var total = sum(items.map(function (it) {
          return it.value;
        }));
        var grouped = items.some(function (it) {
          return it.group;
        });
        return {
          head: [""].concat(grouped ? ["Group"] : [], ["Value", "Share"]),
          rows: items.map(function (it) {
            return [it.label].concat(grouped ? [it.group || ""] : [], [fmt(num(it.value)), total ? Math.round((num(it.value) / total) * 1000) / 10 + "%" : "–"]);
          }),
        };
    }
    var series = seriesOf(spec);
    var stacked = (spec.stacked || spec.percent) && series.length > 1;
    return {
      head: [spec.categoryLabel || ""].concat(series.map(function (s) {
        return s.name || "";
      }), stacked ? ["Total"] : []),
      rows: (spec.labels || []).map(function (label, i) {
        var values = series.map(function (s) {
          return num((s.data || [])[i]);
        });
        return [label].concat(values.map(function (v) {
          return v == null ? "–" : fmt(v);
        }), stacked ? [fmt(sum(values))] : []);
      }),
    };
  }

  function renderTable(entry) {
    var data = tableData(entry);
    var table = el("table");
    var thead = el("thead");
    var head = el("tr");
    data.head.forEach(function (h) {
      head.appendChild(text("th", null, h));
    });
    thead.appendChild(head);
    var body = el("tbody");
    data.rows.forEach(function (row) {
      var tr = el("tr");
      row.forEach(function (cell) {
        tr.appendChild(text("td", null, cell));
      });
      body.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(body);
    entry.table.textContent = "";
    entry.table.appendChild(table);
  }

  function plotHeight(spec) {
    if (spec.height) return Number(spec.height);
    if (spec.type === "bar" && spec.horizontal) return Math.max(160, (spec.labels || []).length * 38 + 24);
    if (spec.type === "heatmap" || spec.type === "progress") return null;
    return { donut: 230, gauge: 200, radar: 300, scatter: 320, treemap: 300, waterfall: 290 }[spec.type] || 270;
  }

  function buildCard(entry) {
    var spec = entry.spec;
    var html = HTML_TYPES.indexOf(spec.type) >= 0;
    // Not <figure>: Material shrinks and centres those.
    var card = el("div", "chart-card chart-card--" + spec.type + (spec.wide ? " chart-card--wide" : ""), { role: "figure" });
    var head = el("div", "chart-card__head");
    var titles = el("div", "chart-card__titles");
    if (spec.title) {
      var title = text("span", "chart-card__title", spec.title);
      title.id = "chart-title-" + ++uid;
      card.setAttribute("aria-labelledby", title.id);
      titles.appendChild(title);
    }
    if (spec.subtitle) titles.appendChild(text("span", "chart-card__subtitle", spec.subtitle));
    head.appendChild(titles);
    entry.headline = el("div", "chart-card__figure");
    head.appendChild(entry.headline);
    var toggle = el("button", "chart-card__toggle", { type: "button", "aria-pressed": "false", title: "Show the figures as a table" });
    toggle.innerHTML = ICON_TABLE;
    toggle.addEventListener("click", function () {
      var on = !card.classList.contains("is-table");
      card.classList.toggle("is-table", on);
      toggle.setAttribute("aria-pressed", on ? "true" : "false");
      toggle.title = on ? "Show the chart" : "Show the figures as a table";
      toggle.innerHTML = on ? ICON_CHART : ICON_TABLE;
    });
    head.appendChild(toggle);
    card.appendChild(head);

    var body = el("div", "chart-card__body");
    entry.plot = el("div", "chart-card__plot" + (html ? " chart-card__plot--html" : ""));
    var height = plotHeight(spec);
    if (height) entry.plot.style.height = height + "px";
    var label = [spec.title, spec.subtitle].filter(Boolean).join(". ") + ". The table view lists the figures.";
    if (html) {
      entry.plot.setAttribute("role", "img");
      entry.plot.setAttribute("aria-label", label);
    } else {
      entry.canvas = el("canvas", null, { role: "img", "aria-label": label });
      entry.plot.appendChild(entry.canvas);
    }
    entry.tip = el("div", "chart-tip", { "aria-hidden": "true" });
    entry.plot.appendChild(entry.tip);
    entry.legend = el("div", "chart-legend");
    entry.legend.hidden = true;
    entry.captionEl = el("p", "chart-card__caption");
    entry.captionEl.hidden = true;
    body.appendChild(entry.plot);
    body.appendChild(entry.legend);
    body.appendChild(entry.captionEl);
    card.appendChild(body);
    entry.table = el("div", "chart-card__table");
    card.appendChild(entry.table);
    entry.note = text("p", "chart-card__note", spec.note || "");
    entry.note.hidden = !spec.note;
    card.appendChild(entry.note);
    entry.card = card;
    renderHeadline(entry);
    renderTable(entry);
    return card;
  }

  /* ── Stat tiles ── */

  function sparkline(values) {
    var points = values.map(num).filter(function (v) {
      return v != null;
    });
    if (points.length < 2) return null;
    var min = Math.min.apply(null, points);
    var max = Math.max.apply(null, points);
    var span = max - min || 1;
    var xy = points.map(function (v, i) {
      return [(i / (points.length - 1)) * 100, 4 + (1 - (v - min) / span) * 28];
    });
    var line = xy.map(function (p, i) {
      return (i ? "L" : "M") + p[0].toFixed(2) + " " + p[1].toFixed(2);
    }).join(" ");
    var id = "chart-spark-" + ++uid;
    var wrap = el("div", "chart-kpi__trend", { "aria-hidden": "true" });
    var tail = xy.slice(-2);
    wrap.innerHTML =
      '<svg viewBox="0 0 100 36" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0"/><stop offset="1"/></linearGradient></defs>' +
      '<path class="chart-kpi__area" fill="url(#' + id + ')" d="' + line + ' L100 36 L0 36 Z"/>' +
      '<path class="chart-kpi__line" d="' + line + '"/>' +
      '<path class="chart-kpi__now" d="M' + tail[0].join(" ") + " L" + tail[1].join(" ") + '"/>' +
      "</svg>";
    // An HTML dot, so the stretched SVG can't squash it into an oval.
    var dot = el("span", "chart-kpi__dot");
    dot.style.top = (tail[1][1] / 36) * 100 + "%";
    wrap.appendChild(dot);
    return wrap;
  }

  function renderKpis(entry) {
    var spec = entry.spec;
    var box = entry.card;
    box.textContent = "";
    (spec.tiles || []).forEach(function (tile) {
      var fmt = formatter({
        format: tile.format || spec.format,
        currency: tile.currency || spec.currency,
        unit: tile.unit != null ? tile.unit : spec.unit,
        decimals: tile.decimals != null ? tile.decimals : spec.decimals,
      });
      var node = el("div", "chart-kpi");
      node.appendChild(text("span", "chart-kpi__label", tile.label));
      var value = text("span", "chart-kpi__value", fmt(num(tile.value), true));
      node.appendChild(value);
      if (tile.delta != null) node.appendChild(deltaNode(tile, fmt));
      if (Array.isArray(tile.trend)) {
        var spark = sparkline(tile.trend);
        if (spark) node.appendChild(spark);
      }
      if (tile.note) node.appendChild(text("span", "chart-kpi__note", tile.note));
      box.appendChild(node);
      if (entry.revealed) countUp(value, num(tile.value), fmt, true);
    });
  }

  /* ── Lifecycle ── */

  function draw(entry, mode) {
    var Chart = window.Chart;
    if (!Chart || !entry.card.isConnected) return;
    entry.theme = readTheme(entry.card);
    entry.tipContent = null;
    entry.legendItems = null;
    entry.caption = "";
    var config = BUILDERS[entry.spec.type](entry);
    if (!entry.chart) {
      Chart.defaults.font.family = entry.theme.font;
      config.plugins = PLUGINS;
      entry.chart = new Chart(entry.canvas, config);
    } else {
      // Changing the dataset objects in place keeps hidden series hidden and
      // lets new figures animate from the old ones.
      var chart = entry.chart;
      chart.data.labels = config.data.labels;
      config.data.datasets.forEach(function (ds, i) {
        if (chart.data.datasets[i]) Object.assign(chart.data.datasets[i], ds);
        else chart.data.datasets.push(ds);
      });
      chart.data.datasets.length = config.data.datasets.length;
      chart.options = config.options;
      chart.update(mode);
    }
    renderLegend(entry);
  }

  function reveal(entry) {
    if (entry.revealed) return;
    entry.revealed = true;
    entry.card.classList.add("is-revealed");
    if (entry.spec.type === "kpi") {
      renderKpis(entry);
      return;
    }
    renderHeadline(entry);
    if (HTML_TYPES.indexOf(entry.spec.type) >= 0) {
      renderHtml(entry);
      return;
    }
    loadChartJs().then(
      function () {
        draw(entry);
      },
      function () {
        entry.card.classList.add("is-table");
        entry.note.hidden = false;
        entry.note.textContent = "The chart couldn't load, so here are its figures.";
      }
    );
  }

  /** Redraw in the current theme and figures, if it has been drawn. */
  function redraw(entry, mode) {
    if (entry.chart) draw(entry, mode);
    else if (entry.revealed && HTML_TYPES.indexOf(entry.spec.type) >= 0) renderHtml(entry);
  }

  /** New figures for one chart: kept for later if it hasn't been drawn. */
  function update(entry, patch) {
    Object.assign(entry.spec, patch);
    entry.fmt = formatter(entry.spec);
    if (entry.spec.type === "kpi") {
      if (entry.revealed) renderKpis(entry);
      return;
    }
    renderHeadline(entry);
    renderTable(entry);
    redraw(entry);
  }

  function fetchLive(entry) {
    entry.card.classList.add("is-loading");
    fetch(entry.spec.src, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error(response.status + " " + response.statusText);
        return response.json();
      })
      .then(function (data) {
        update(entry, data);
      })
      .catch(function (error) {
        console.warn("Chart \"" + (entry.spec.title || entry.spec.src) + "\": couldn't load " + entry.spec.src, error);
      })
      .then(function () {
        entry.card.classList.remove("is-loading");
      });
  }

  function errorCard(source, message) {
    var card = el("div", "chart-card chart-card--error");
    card.appendChild(text("strong", null, "This chart couldn't be drawn"));
    card.appendChild(text("span", null, message));
    card.appendChild(text("pre", null, source));
    return card;
  }

  function prepare(node) {
    var source = (node.querySelector("code") || node).textContent;
    var spec;
    try {
      spec = JSON.parse(source);
    } catch (e) {
      node.replaceWith(errorCard(source, "The chart's JSON doesn't parse: " + e.message));
      return;
    }
    if (!spec || TYPES.indexOf(spec.type) < 0) {
      node.replaceWith(errorCard(source, '"type" must be one of: ' + TYPES.join(", ") + "."));
      return;
    }
    var entry = { spec: spec, fmt: formatter(spec) };
    if (spec.type === "kpi") {
      entry.card = el("div", "chart-kpis");
      renderKpis(entry);
    } else buildCard(entry);
    node.replaceWith(entry.card);
    entries.push(entry);
    if (spec.src) fetchLive(entry);
    if (observer) observer.observe(entry.card);
    else reveal(entry);
  }

  function cleanup() {
    entries = entries.filter(function (entry) {
      if (entry.card.isConnected) return true;
      if (entry.chart) entry.chart.destroy();
      if (entry.resize) entry.resize.disconnect();
      if (observer) observer.unobserve(entry.card);
      return false;
    });
  }

  function mount() {
    cleanup();
    // The page writer's preview shows an unknown fence as a code block.
    document.querySelectorAll("pre.chart, div.language-chart").forEach(function (node) {
      if (node.closest(".language-markdown, .language-md, .chart-card")) return;
      prepare(node);
    });
  }

  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      function (seen) {
        seen.forEach(function (item) {
          if (!item.isIntersecting) return;
          observer.unobserve(item.target);
          entries.forEach(function (entry) {
            if (entry.card === item.target) reveal(entry);
          });
        });
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
  }

  // A new theme or motion level redraws every chart in its new colours.
  new MutationObserver(function () {
    entries.forEach(function (entry) {
      redraw(entry, "none");
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });

  window.docsCharts = {
    mount: mount,
    /** Replace a chart's figures, by the "id" in its JSON. Returns how many
     *  charts on the page have that id. */
    set: function (id, patch) {
      var found = entries.filter(function (entry) {
        return entry.spec.id === id && entry.card.isConnected;
      });
      found.forEach(function (entry) {
        update(entry, patch || {});
      });
      return found.length;
    },
    /** A copy of a chart's current JSON, by its "id". */
    get: function (id) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].spec.id === id) return JSON.parse(JSON.stringify(entries[i].spec));
      }
      return null;
    },
  };

  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(mount);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
