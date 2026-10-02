/* Charts: a ``` chart fence holding JSON becomes a themed chart card.
 *
 *   ``` chart
 *   { "type": "bar", "title": "Spend by service", "format": "currency",
 *     "labels": ["Virtual machines", "Storage"],
 *     "series": [{ "name": "September", "data": [12480, 4310] }] }
 *   ```
 *
 * Types: kpi (stat tiles), bar, line, donut, gauge and radar; the options
 * are listed on docs/components/charts.md. Chart.js (vendor/chart.umd.min.js,
 * copied there by tools/chartjs/) loads only on pages with a chart, and each
 * chart is drawn when it first scrolls into view.
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
  var TYPES = ["kpi", "bar", "line", "donut", "gauge", "radar"];
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
    theme.muted = read("--viz-muted");
    theme.text = read("--base-100");
    theme.text2 = read("--base-400");
    theme.axis = read("--base-500");
    theme.line = read("--base-700");
    theme.surface = read("--base-900");
    theme.good = read("--success");
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

  /** "+4 pts", "−$2.1K": signed, in the delta's own unit when it has one. */
  function deltaText(item, fmt) {
    var d = Number(item.delta);
    var sign = d > 0 ? "+" : d < 0 ? "−" : "";
    var body = item.deltaUnit != null
      ? formatter({ decimals: item.deltaDecimals }) (Math.abs(d), false, false) + item.deltaUnit
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

  /* ── Chart.js plugins ──
     Inline plugins, given to each chart; their options live under
     options.plugins.<id> so a re-theme replaces them with the rest. */

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
        ctx.beginPath();
        var box = horizontal
          ? [area.left - 4, at - size / 2, area.right - area.left + 8, size]
          : [at - size / 2, area.top - 4, size, area.bottom - area.top + 4];
        if (ctx.roundRect) ctx.roundRect(box[0], box[1], box[2], box[3], 8);
        else ctx.rect(box[0], box[1], box[2], box[3]);
        ctx.fill();
      }
      ctx.restore();
    },
  };

  /** A budget or goal: a dashed rule across the plot, labelled at its end. */
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
      var label = opts.label;
      var w = ctx.measureText(label).width + 12;
      // At the start of the rule: series tend to end near a budget, not start there.
      var x = horizontal ? at - w / 2 : area.left + 6;
      var y = horizontal ? area.top - 2 : at - 22;
      ctx.fillStyle = opts.surface;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, 18, 9);
      else ctx.rect(x, y, w, 18);
      ctx.fill();
      ctx.strokeStyle = opts.border;
      ctx.stroke();
      ctx.fillStyle = opts.text;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(label, x + w / 2, y + 9.5);
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
      var visible = chart.data.datasets
        .map(function (ds, i) {
          return i;
        })
        .filter(function (i) {
          return chart.isDatasetVisible(i);
        });
      if (!visible.length) return;
      ctx.save();
      ctx.font = "600 11px " + opts.font;
      ctx.fillStyle = opts.color;
      ctx.textAlign = horizontal ? "left" : "center";
      ctx.textBaseline = horizontal ? "middle" : "bottom";
      chart.data.labels.forEach(function (label, index) {
        var total = 0;
        var tip = null;
        visible.forEach(function (d) {
          var value = num(chart.data.datasets[d].data[index]);
          if (value == null) return;
          total += value;
          if (opts.stacked || visible.length === 1) tip = chart.getDatasetMeta(d).data[index];
        });
        if (!tip || (opts.stacked && !total)) return;
        var shown = opts.format(opts.stacked ? total : num(chart.data.datasets[visible[0]].data[index]));
        var pos = tip.getProps(["x", "y"], false);
        if (horizontal) ctx.fillText(shown, pos.x + 8, pos.y);
        else ctx.fillText(shown, pos.x, pos.y - 6);
      });
      ctx.restore();
    },
  };

  /** The figure in a donut's hole or under a gauge's arc. */
  var centerPlugin = {
    id: "vizCenter",
    afterDatasetsDraw: function (chart, args, opts) {
      if (!opts || !opts.content) return;
      var arc = chart.getDatasetMeta(0).data[0];
      if (!arc) return;
      var shown = opts.content(chart);
      var props = arc.getProps(["x", "y", "innerRadius", "outerRadius"], true);
      var ctx = chart.ctx;
      var size = Math.max(16, Math.min(34, props.innerRadius * 0.4));
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
      ctx.fillText(shown.label, props.x, y + 8);
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

  /* ── Tooltip ── */

  function tipRow(color, shape, value, name) {
    var row = el("div", "chart-tip__row");
    var key = el("span", "chart-tip__key chart-tip__key--" + shape);
    key.style.setProperty("--key", color);
    row.appendChild(key);
    row.appendChild(text("strong", "chart-tip__value", value));
    row.appendChild(text("span", "chart-tip__name", name));
    return row;
  }

  function tooltip(entry) {
    return function (context) {
      var tip = entry.tip;
      var model = context.tooltip;
      if (!model || model.opacity === 0 || !model.dataPoints || !model.dataPoints.length) {
        tip.classList.remove("is-visible");
        return;
      }
      var chart = context.chart;
      var spec = entry.spec;
      var fmt = entry.fmt;
      var index = model.dataPoints[0].dataIndex;
      tip.textContent = "";
      tip.appendChild(text("div", "chart-tip__title", (spec.labels || chart.data.labels)[index]));
      if (spec.type === "donut") {
        var data = chart.data.datasets[0].data;
        var total = data.reduce(function (sum, v, i) {
          return chart.getDataVisibility(i) ? sum + (num(v) || 0) : sum;
        }, 0);
        var share = total ? Math.round((num(data[index]) / total) * 1000) / 10 + "% of total" : "";
        tip.appendChild(tipRow(chart.data.datasets[0].backgroundColor[index], "rect", fmt(num(data[index])), share));
      } else {
        var stacked = !!spec.stacked;
        var shape = spec.type === "bar" ? "rect" : "line";
        var rows = [];
        var sum = 0;
        chart.data.datasets.forEach(function (ds, d) {
          var value = num(ds.data[index]);
          if (!chart.isDatasetVisible(d) || value == null) return;
          sum += value;
          rows.push(tipRow(ds.vizColor, ds.borderDash && ds.borderDash.length ? "dash" : shape, fmt(value), ds.label));
        });
        // A column's stack reads top-down, so its tooltip does too.
        if (stacked && spec.type === "bar" && !spec.horizontal) rows.reverse();
        rows.forEach(function (row) {
          tip.appendChild(row);
        });
        if (stacked && rows.length > 1) {
          var foot = tipRow("transparent", "none", fmt(sum), "Total");
          foot.classList.add("chart-tip__row--total");
          tip.appendChild(foot);
        }
      }
      tip.classList.add("is-visible");
      var box = entry.plot;
      var w = tip.offsetWidth;
      var h = tip.offsetHeight;
      var x = model.caretX + 16;
      if (x + w > box.clientWidth) x = model.caretX - 16 - w;
      x = Math.max(0, Math.min(x, box.clientWidth - w));
      var y = Math.max(0, Math.min(model.caretY - h / 2, box.clientHeight - h));
      tip.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
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
    var theme = entry.theme;
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: animation(entry),
      layout: { padding: { top: 6, right: 6, bottom: 0, left: 0 } },
      interaction: { mode: "index", intersect: false },
      font: { family: theme.font },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: { enabled: false, external: tooltip(entry) },
      },
    };
  }

  function axes(entry, stacked) {
    var theme = entry.theme;
    var spec = entry.spec;
    // Ticks are round numbers: no "25.0" for a chart with "decimals": 1.
    var tickFmt = formatter(Object.assign({}, spec, { decimals: null }));
    var tick = { color: theme.axis, font: { size: 11.5, family: theme.font } };
    var value = {
      stacked: stacked,
      beginAtZero: spec.min == null,
      min: spec.min,
      max: spec.max,
      grace: "6%",
      border: { display: false },
      grid: { color: theme.grid, drawTicks: false, lineWidth: 1 },
      ticks: Object.assign({}, tick, {
        padding: 10,
        maxTicksLimit: 6,
        callback: function (v) {
          return tickFmt(v, true, false);
        },
      }),
    };
    var category = {
      stacked: stacked,
      border: { display: true, color: theme.line },
      grid: { display: false },
      ticks: Object.assign({}, tick, { padding: 8, maxRotation: 0, autoSkipPadding: 14 }),
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
    return { x: category, y: value };
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

  function targetOptions(entry) {
    var t = entry.spec.target;
    if (!t || t.value == null) return null;
    var theme = entry.theme;
    return {
      value: t.value,
      label: (t.label ? t.label + " " : "") + entry.fmt(t.value, true, false),
      color: alpha(theme.text2, 0.8),
      text: theme.text2,
      surface: theme.surface,
      border: theme.line,
      font: theme.font,
    };
  }

  function buildBar(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var series = seriesOf(spec);
    var labels = spec.labels || [];
    var stacked = !!spec.stacked;
    var horizontal = !!spec.horizontal;
    var single = series.length === 1;
    var showValues = spec.values != null ? !!spec.values : labels.length <= 8 && (single || stacked);
    var datasets = series.map(function (s, i) {
      var color = colorFor(s.color || (single ? "accent" : null), i, theme);
      var gap = stacked ? (horizontal ? { right: 2 } : { top: 2 }) : 0;
      return {
        label: s.name,
        data: (s.data || []).map(num),
        vizColor: color,
        backgroundColor: color,
        hoverBackgroundColor: mix(color, theme.text, 0.14),
        borderColor: theme.surface,
        hoverBorderColor: theme.surface,
        borderWidth: gap,
        // Rounded at the data end only, and only on a stack's last segment.
        borderRadius: function (ctx) {
          if (!stacked) return 5;
          var chart = ctx.chart;
          for (var d = chart.data.datasets.length - 1; d >= 0; d--) {
            if (chart.isDatasetVisible(d) && num(chart.data.datasets[d].data[ctx.dataIndex])) {
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
    if (showValues) {
      if (horizontal) options.layout.padding.right = 60;
      else options.layout.padding.top = 22;
      // Every bar carries its value, so the value axis has nothing to add.
      if (horizontal && !stacked) {
        options.scales.x.display = false;
        options.layout.padding.bottom = 4;
      }
    }
    options.plugins.vizHover = { color: alpha(theme.text, 0.05) };
    options.plugins.vizTarget = targetOptions(entry);
    options.plugins.vizValues = {
      show: showValues,
      stacked: stacked,
      color: theme.text2,
      font: theme.font,
      format: function (v) {
        return entry.fmt(v, true, false);
      },
    };
    return { type: "bar", data: { labels: labels, datasets: datasets }, options: options };
  }

  function buildLine(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var series = seriesOf(spec);
    var single = series.filter(function (s) {
      return !s.dashed;
    }).length === 1;
    var datasets = series.map(function (s, i) {
      var color = colorFor(s.color || (single && !s.dashed ? "accent" : s.dashed ? "muted" : null), i, theme);
      var area = s.area != null ? s.area : spec.area != null ? spec.area : single && !s.dashed;
      var data = (s.data || []).map(num);
      var last = -1;
      data.forEach(function (v, j) {
        if (v != null) last = j;
      });
      return {
        label: s.name,
        data: data,
        vizColor: color,
        borderColor: color,
        borderWidth: 2,
        borderDash: s.dashed ? [5, 5] : [],
        borderCapStyle: "round",
        borderJoinStyle: "round",
        tension: spec.smooth === false ? 0 : 0.35,
        cubicInterpolationMode: "monotone",
        spanGaps: true,
        fill: area ? "origin" : false,
        // A wash that fades to nothing at the baseline.
        backgroundColor: function (ctx) {
          var area = ctx.chart.chartArea;
          if (!area) return alpha(color, 0.1);
          var g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
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
    });
    var options = baseOptions(entry);
    options.scales = axes(entry, false);
    options.scales.x.offset = false;
    options.layout.padding.right = 12;
    options.plugins.vizHover = { color: alpha(theme.text2, 0.55), crosshair: true };
    options.plugins.vizTarget = targetOptions(entry);
    return { type: "line", data: { labels: spec.labels || [], datasets: datasets }, options: options };
  }

  function buildDonut(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var s = seriesOf(spec)[0] || { data: [] };
    var colors = (spec.labels || []).map(function (label, i) {
      return colorFor(spec.colors && spec.colors[i], i, theme);
    });
    var options = baseOptions(entry);
    options.cutout = "72%";
    options.interaction = { mode: "nearest", intersect: true };
    options.layout.padding = 8;
    options.plugins.vizCenter = {
      text: theme.text,
      muted: theme.text2,
      font: theme.font,
      content: function (chart) {
        var data = chart.data.datasets[0].data;
        var active = chart.getActiveElements();
        if (active.length) {
          var i = active[0].index;
          return { value: entry.fmt(num(data[i]), true, false), label: chart.data.labels[i] };
        }
        var total = data.reduce(function (sum, v, i) {
          return chart.getDataVisibility(i) ? sum + (num(v) || 0) : sum;
        }, 0);
        return { value: entry.fmt(total, true, false), label: spec.centerLabel || "Total" };
      },
    };
    return {
      type: "doughnut",
      data: {
        labels: spec.labels || [],
        datasets: [
          {
            label: s.name,
            data: (s.data || []).map(num),
            vizColor: colors[0],
            backgroundColor: colors,
            hoverBackgroundColor: colors.map(function (c) {
              return mix(c, theme.text, 0.12);
            }),
            borderWidth: 0,
            spacing: 2,
            borderRadius: 4,
            hoverOffset: 6,
          },
        ],
      },
      options: options,
    };
  }

  function gaugeColor(entry) {
    var spec = entry.spec;
    var value = num(spec.value) || 0;
    var bands = Array.isArray(spec.bands) ? spec.bands : [];
    for (var i = 0; i < bands.length; i++) {
      if (bands[i].to == null || value <= bands[i].to) return colorFor(bands[i].color, 0, entry.theme);
    }
    return colorFor(spec.color || "accent", 0, entry.theme);
  }

  function buildGauge(entry) {
    var spec = entry.spec;
    var theme = entry.theme;
    var max = spec.max != null ? Number(spec.max) : 100;
    var value = Math.max(0, Math.min(max, num(spec.value) || 0));
    var color = gaugeColor(entry);
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

  var BUILDERS = { bar: buildBar, line: buildLine, donut: buildDonut, gauge: buildGauge, radar: buildRadar };

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

  function renderLegend(entry) {
    var legend = entry.legend;
    var spec = entry.spec;
    var chart = entry.chart;
    legend.textContent = "";
    if (!chart) return;
    var donut = spec.type === "donut";
    var items = donut ? spec.labels || [] : chart.data.datasets.map(function (ds) {
      return ds.label;
    });
    // One series needs no legend: the title already says what's plotted.
    var show = donut || (items.length > 1 && spec.type !== "gauge");
    legend.hidden = !show;
    if (!show) return;
    var data = donut ? chart.data.datasets[0].data : null;
    var total = donut ? data.reduce(function (sum, v) {
      return sum + (num(v) || 0);
    }, 0) : 0;
    items.forEach(function (name, i) {
      var on = donut ? chart.getDataVisibility(i) : chart.isDatasetVisible(i);
      var color = donut ? chart.data.datasets[0].backgroundColor[i] : chart.data.datasets[i].vizColor;
      var dashed = !donut && chart.data.datasets[i].borderDash && chart.data.datasets[i].borderDash.length;
      var shape = donut || spec.type === "bar" ? "rect" : dashed ? "dash" : "line";
      var item = el("button", "chart-legend__item" + (on ? "" : " is-off"), { type: "button", "aria-pressed": on ? "true" : "false" });
      var key = el("span", "chart-legend__key chart-legend__key--" + shape);
      key.style.setProperty("--key", color);
      item.appendChild(key);
      item.appendChild(text("span", "chart-legend__name", name));
      if (donut) {
        item.appendChild(text("span", "chart-legend__value", entry.fmt(num(data[i]), true, false)));
        item.appendChild(text("span", "chart-legend__share", total ? Math.round((num(data[i]) / total) * 100) + "%" : ""));
      }
      item.title = (on ? "Hide " : "Show ") + name;
      item.addEventListener("click", function () {
        if (donut) chart.toggleDataVisibility(i);
        else chart.setDatasetVisibility(i, !chart.isDatasetVisible(i));
        chart.update();
        renderLegend(entry);
      });
      // Pointing at a legend entry lights up its marks.
      item.addEventListener("pointerenter", function () {
        if (!on) return;
        var active = donut ? [{ datasetIndex: 0, index: i }] : chart.getDatasetMeta(i).data.map(function (p, j) {
          return { datasetIndex: i, index: j };
        });
        chart.setActiveElements(active);
        chart.update("none");
      });
      item.addEventListener("pointerleave", function () {
        chart.setActiveElements([]);
        chart.update("none");
      });
      legend.appendChild(item);
    });
  }

  function renderTable(entry) {
    var spec = entry.spec;
    var fmt = entry.fmt;
    var wrap = entry.table;
    wrap.textContent = "";
    var table = el("table");
    var head = el("tr");
    var body = el("tbody");
    function cell(tag, value) {
      return text(tag, null, value);
    }
    if (spec.type === "gauge") {
      head.appendChild(cell("th", spec.label || spec.title || "Measure"));
      head.appendChild(cell("th", "Value"));
      var row = el("tr");
      row.appendChild(cell("td", spec.label || spec.title || ""));
      row.appendChild(cell("td", fmt(num(spec.value)) + " of " + fmt(spec.max != null ? Number(spec.max) : 100)));
      body.appendChild(row);
    } else {
      var series = seriesOf(spec);
      head.appendChild(cell("th", spec.categoryLabel || ""));
      series.forEach(function (s) {
        head.appendChild(cell("th", s.name || ""));
      });
      if (spec.stacked && series.length > 1) head.appendChild(cell("th", "Total"));
      (spec.labels || []).forEach(function (label, i) {
        var tr = el("tr");
        tr.appendChild(cell("td", label));
        var sum = 0;
        series.forEach(function (s) {
          var value = num((s.data || [])[i]);
          sum += value || 0;
          tr.appendChild(cell("td", value == null ? "–" : fmt(value)));
        });
        if (spec.stacked && series.length > 1) tr.appendChild(cell("td", fmt(sum)));
        body.appendChild(tr);
      });
    }
    var thead = el("thead");
    thead.appendChild(head);
    table.appendChild(thead);
    table.appendChild(body);
    wrap.appendChild(table);
  }

  function plotHeight(spec) {
    if (spec.height) return Number(spec.height);
    if (spec.type === "bar" && spec.horizontal) return Math.max(160, (spec.labels || []).length * 38 + 24);
    return { donut: 230, gauge: 200, radar: 300 }[spec.type] || 270;
  }

  function buildCard(entry) {
    var spec = entry.spec;
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
    entry.plot = el("div", "chart-card__plot");
    entry.plot.style.height = plotHeight(spec) + "px";
    entry.canvas = el("canvas", null, {
      role: "img",
      "aria-label": [spec.title, spec.subtitle].filter(Boolean).join(". ") + ". The table view lists the figures.",
    });
    entry.plot.appendChild(entry.canvas);
    entry.tip = el("div", "chart-tip", { "aria-hidden": "true" });
    entry.plot.appendChild(entry.tip);
    entry.legend = el("div", "chart-legend");
    entry.legend.hidden = true;
    body.appendChild(entry.plot);
    body.appendChild(entry.legend);
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
    entry.theme.font = getComputedStyle(entry.card).fontFamily;
    var config = BUILDERS[entry.spec.type](entry);
    if (!entry.chart) {
      Chart.defaults.font.family = entry.theme.font;
      config.plugins = [hoverPlugin, targetPlugin, valuesPlugin, centerPlugin];
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
    if (entry.chart) draw(entry);
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
      if (entry.chart) draw(entry, "none");
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
