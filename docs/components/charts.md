---
# Wide charts need the room: no table of contents on this page.
hide:
  - toc
---

# Charts

Charts for Advisor findings, security posture, cost and sustainability. Each one is a few lines of JSON in the page, drawn in the active theme's colours and redrawn when you switch theme. Point at a chart for its figures, click a legend entry to hide a series, and use the :material-table: button for the figures as a table.

The figures on this page are examples, not real data.

``` chart
{
  "type": "kpi",
  "tiles": [
    {
      "label": "Advisor score",
      "value": 78, "format": "percent",
      "delta": 4, "deltaUnit": " pts", "deltaLabel": "vs August", "good": "up",
      "trend": [66, 67, 69, 68, 70, 71, 72, 73, 74, 74, 76, 78]
    },
    {
      "label": "Potential monthly savings",
      "value": 21190, "format": "currency",
      "delta": -2140, "deltaLabel": "vs August", "good": "down",
      "trend": [29400, 28800, 27900, 27100, 26600, 25800, 25100, 24300, 23900, 23500, 23330, 21190]
    },
    {
      "label": "Secure score",
      "value": 72, "format": "percent",
      "delta": 3, "deltaUnit": " pts", "deltaLabel": "vs August", "good": "up",
      "trend": [58, 59, 61, 60, 62, 64, 65, 66, 68, 68, 69, 72]
    },
    {
      "label": "Carbon emissions",
      "value": 18.6, "unit": "tCO₂e", "decimals": 1,
      "delta": -2.1, "deltaUnit": "%", "deltaLabel": "vs August", "good": "down",
      "trend": [21.4, 21.0, 20.8, 20.5, 20.9, 20.2, 19.8, 19.4, 20.1, 19.6, 19.0, 18.6]
    }
  ]
}
```

## Advisor findings

=== "Azure Advisor"

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "bar",
      "title": "Recommendations by category",
      "subtitle": "Open recommendations, by impact",
      "horizontal": true,
      "stacked": true,
      "labels": ["Security", "Cost", "Operational excellence", "Reliability", "Performance"],
      "series": [
        { "name": "High impact", "color": "high", "data": [18, 12, 3, 7, 2] },
        { "name": "Medium impact", "color": "medium", "data": [26, 21, 12, 15, 8] },
        { "name": "Low impact", "color": "low", "data": [14, 9, 19, 11, 6] }
      ],
      "headline": { "value": 183, "label": "open", "delta": -18, "deltaLabel": "vs August", "good": "down" },
      "note": "Source: Azure Advisor. Example figures."
    }
    ```

    ``` chart
    {
      "type": "radar",
      "title": "Advisor score by category",
      "subtitle": "Out of 100, September against June",
      "labels": ["Cost", "Security", "Reliability", "Operational excellence", "Performance"],
      "series": [
        { "name": "September", "data": [71, 64, 82, 88, 91] },
        { "name": "June", "color": "muted", "dashed": true, "data": [62, 55, 79, 84, 90] }
      ],
      "note": "Source: Azure Advisor score. Example figures."
    }
    ```

    </div>

=== "AWS Trusted Advisor"

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "bar",
      "title": "Trusted Advisor checks",
      "subtitle": "Result of every check, by category",
      "horizontal": true,
      "stacked": true,
      "labels": ["Security", "Cost optimization", "Fault tolerance", "Operational excellence", "Performance", "Service limits"],
      "series": [
        { "name": "Action recommended", "color": "high", "data": [9, 6, 5, 3, 2, 1] },
        { "name": "Investigation recommended", "color": "low", "data": [14, 11, 12, 9, 7, 4] },
        { "name": "No problems detected", "color": "muted", "data": [47, 38, 33, 26, 21, 52] }
      ],
      "headline": { "value": 26, "label": "need action", "delta": -5, "deltaLabel": "vs August", "good": "down" },
      "note": "Source: AWS Trusted Advisor. Example figures."
    }
    ```

    ``` chart
    {
      "type": "donut",
      "title": "Estimated monthly savings",
      "subtitle": "From the cost optimization checks",
      "format": "currency",
      "labels": ["Low-utilization EC2 instances", "Savings Plans", "Idle RDS instances", "Underutilized EBS volumes", "Other checks"],
      "series": [{ "name": "Monthly savings", "data": [4820, 3780, 2160, 1340, 610] }],
      "colors": ["1", "2", "3", "4", "muted"],
      "centerLabel": "a month",
      "note": "Source: AWS Trusted Advisor. Example figures."
    }
    ```

    </div>

## Security

<div class="chart-grid" markdown>

``` chart
{
  "type": "gauge",
  "title": "Secure score",
  "subtitle": "Microsoft Defender for Cloud",
  "value": 72, "max": 100, "format": "percent",
  "caption": "31 of 43 controls healthy",
  "bands": [
    { "to": 40, "color": "critical" },
    { "to": 70, "color": "medium" },
    { "color": "accent" }
  ],
  "headline": { "delta": 3, "deltaUnit": " pts", "deltaLabel": "vs August", "good": "up" }
}
```

``` chart
{
  "type": "bar",
  "title": "Top failing controls",
  "subtitle": "Unhealthy resources per security control",
  "horizontal": true,
  "labels": ["Enable MFA", "Apply system updates", "Restrict network access", "Encrypt data in transit", "Enable endpoint protection", "Manage access and permissions"],
  "series": [{ "name": "Unhealthy resources", "data": [34, 28, 22, 17, 12, 9] }]
}
```

``` chart
{
  "type": "bar",
  "title": "Active findings by severity",
  "subtitle": "Defender for Cloud and Security Hub, weekly",
  "wide": true,
  "stacked": true,
  "labels": ["Jul 13", "Jul 20", "Jul 27", "Aug 3", "Aug 10", "Aug 17", "Aug 24", "Aug 31", "Sep 7", "Sep 14", "Sep 21", "Sep 28"],
  "series": [
    { "name": "Critical", "color": "critical", "data": [6, 5, 7, 5, 4, 4, 3, 3, 2, 3, 2, 1] },
    { "name": "High", "color": "high", "data": [24, 22, 25, 21, 20, 18, 19, 16, 15, 14, 12, 11] },
    { "name": "Medium", "color": "medium", "data": [48, 46, 50, 47, 45, 44, 42, 41, 39, 37, 36, 34] },
    { "name": "Low", "color": "low", "data": [61, 63, 60, 62, 59, 58, 57, 58, 55, 54, 52, 50] }
  ],
  "headline": { "value": 96, "label": "open this week", "delta": -43, "deltaLabel": "since July", "good": "down" },
  "note": "Example figures."
}
```

</div>

## Cost

<div class="chart-grid" markdown>

``` chart
{
  "type": "line",
  "title": "Monthly spend",
  "subtitle": "Actual and forecast against budget, 2026",
  "wide": true,
  "format": "currency",
  "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  "series": [
    { "name": "Actual", "data": [31200, 32800, 34100, 35900, 37400, 39800, 41200, 40700, 38240, null, null, null] },
    { "name": "Forecast", "dashed": true, "data": [null, null, null, null, null, null, null, null, 38240, 39100, 40300, 41600] }
  ],
  "target": { "value": 42000, "label": "Budget" },
  "headline": { "value": 38240, "label": "September", "delta": -6, "deltaUnit": "%", "deltaLabel": "vs August", "good": "down" },
  "note": "Source: Azure Cost Management and AWS Cost Explorer. Example figures."
}
```

``` chart
{
  "type": "bar",
  "title": "Spend by service",
  "subtitle": "September",
  "horizontal": true,
  "format": "currency",
  "labels": ["Virtual machines", "SQL Database", "Storage", "Kubernetes Service", "App Service", "Networking", "Everything else"],
  "series": [{ "name": "September", "data": [12480, 6920, 4310, 3870, 2940, 2260, 5460] }]
}
```

``` chart
{
  "type": "bar",
  "title": "Spend by environment",
  "subtitle": "Last six months",
  "stacked": true,
  "format": "currency",
  "labels": ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
  "series": [
    { "name": "Production", "data": [24100, 24600, 26700, 27500, 27200, 25640] },
    { "name": "Non-production", "data": [8200, 9000, 9400, 9800, 9600, 8900] },
    { "name": "Shared services", "data": [3600, 3800, 3700, 3900, 3900, 3700] }
  ]
}
```

</div>

## Sustainability

<div class="chart-grid" markdown>

``` chart
{
  "type": "bar",
  "title": "Carbon emissions by scope",
  "subtitle": "Tonnes of CO₂ equivalent, market-based",
  "wide": true,
  "stacked": true,
  "unit": "tCO₂e",
  "decimals": 1,
  "labels": ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
  "series": [
    { "name": "Scope 1", "data": [0.9, 0.8, 0.9, 0.9, 0.8, 0.8] },
    { "name": "Scope 2", "data": [8.4, 8.2, 8.3, 8.0, 7.8, 7.4] },
    { "name": "Scope 3", "data": [10.5, 10.4, 10.9, 10.7, 10.4, 10.4] }
  ],
  "headline": { "value": 18.6, "label": "in September", "delta": -2.1, "deltaUnit": "%", "deltaLabel": "vs August", "good": "down" },
  "note": "Source: Emissions Impact Dashboard and Customer Carbon Footprint Tool. Example figures."
}
```

``` chart
{
  "type": "donut",
  "title": "Emissions by service",
  "subtitle": "September, tCO₂e",
  "decimals": 1,
  "labels": ["Compute", "Storage", "Databases", "Networking", "Everything else"],
  "series": [{ "name": "September", "data": [8.4, 4.1, 2.9, 2.3, 0.9] }],
  "colors": ["1", "2", "3", "4", "muted"],
  "centerLabel": "tCO₂e"
}
```

``` chart
{
  "type": "bar",
  "title": "Emissions by region",
  "subtitle": "September, tCO₂e",
  "horizontal": true,
  "decimals": 1,
  "labels": ["West Europe", "North Europe", "East US", "UK South"],
  "series": [{ "name": "September", "data": [7.2, 4.9, 3.8, 2.7] }]
}
```

</div>

## Writing a chart

A chart is a code block whose language is `chart`, holding JSON. Give it a `type`, a `title`, the `labels` along one axis and one or more `series` of numbers, one per label.

=== "Preview"

    ``` chart
    {
      "type": "bar",
      "title": "Open recommendations",
      "subtitle": "By category",
      "labels": ["Security", "Cost", "Reliability", "Performance"],
      "series": [{ "name": "Open", "data": [58, 42, 33, 16] }]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "bar",
      "title": "Open recommendations",
      "subtitle": "By category",
      "labels": ["Security", "Cost", "Reliability", "Performance"],
      "series": [{ "name": "Open", "data": [58, 42, 33, 16] }]
    }
    ```
    ````

To put charts side by side, wrap them in `<div class="chart-grid" markdown>` … `</div>`, with a blank line after the opening tag and before the closing one. They share each row two or three to a row, depending on the width; `"wide": true` gives a chart a row of its own.

### Types

| `type`  | Use it for | Notes |
| ------- | ---------- | ----- |
| `kpi`   | The few numbers a page leads with | `tiles`, each with `label`, `value`, and optionally `delta` and a `trend` of past values |
| `bar`   | Comparing amounts: by category, service, region or month | `horizontal` for long names; `stacked` for parts of a whole |
| `line`  | Change over time | One series gets a shaded area; `"dashed": true` on a series for a forecast |
| `donut` | Shares of one total, five parts or fewer | Fold the smallest parts into one "Everything else" |
| `gauge` | One score against its maximum | `value`, `max`, and `bands` to colour it by how good it is |
| `radar` | Scores across the same five or six areas | Two series at most: now and before |

A single number is a `kpi` tile, not a chart with one bar.

### Options

| Option | What it does |
| ------ | ------------ |
| `title`, `subtitle` | The card's heading. Put the unit and period in the subtitle. |
| `labels` | The categories, in the order they're drawn. Sort bars largest first, unless the order means something, like months. |
| `series` | `[{ "name": "…", "data": [...] }]`. `null` leaves a gap. A series can also set `color` and `dashed`. |
| `format` | `number` (the default), `currency` or `percent` |
| `currency` | For `currency`: `USD` (the default), `EUR`, `GBP` and so on |
| `unit`, `decimals` | A unit after each value, such as `tCO₂e`, and how many decimal places to show |
| `headline` | A figure at the top right of the card: `value`, `label`, and optionally `delta`, `deltaUnit`, `deltaLabel` and `good` |
| `target` | A dashed line at a value, such as a budget: `{ "value": 42000, "label": "Budget" }` |
| `values` | `false` hides the values at the ends of the bars; `true` shows them on charts with more than eight bars |
| `min`, `max` | Fix the value axis, or a radar's scale |
| `height` | The plot's height in pixels |
| `note` | A line under the chart: the source, and when the figures are from |
| `id`, `src` | For [live figures](#live-figures) |

A delta is green when it moves the good way and red when it doesn't: set `"good": "down"` for costs, findings and emissions, where less is better.

### Colours

Leave colours out and a chart picks them: the theme's accent for a single series, and the chart palette in order for several. To keep a series the same colour on every chart, such as Security always orange, set its `color`:

| `color` | Gives |
| ------- | ----- |
| `"1"` to `"8"` | The chart palette: <span class="chart-swatches"><i style="--c: var(--viz-1)"></i><i style="--c: var(--viz-2)"></i><i style="--c: var(--viz-3)"></i><i style="--c: var(--viz-4)"></i><i style="--c: var(--viz-5)"></i><i style="--c: var(--viz-6)"></i><i style="--c: var(--viz-7)"></i><i style="--c: var(--viz-8)"></i></span> blue, orange, aqua, yellow, pink, green, violet and red. Use them in this order: neighbours are the pairs checked to stay distinct for colour-blind readers. |
| `low`, `medium`, `high`, `critical` | Severity and impact: <span class="chart-swatches"><i style="--c: var(--viz-sev-low)"></i><i style="--c: var(--viz-sev-medium)"></i><i style="--c: var(--viz-sev-high)"></i><i style="--c: var(--viz-sev-critical)"></i></span> one red, stronger as it gets worse |
| `muted` | Grey, for what's there for context: "no problems", last quarter, everything else |
| `accent` | The theme's accent |

For more than eight series, fold the smallest into one "Everything else" series rather than adding colours.

### Live figures

The figures in a chart's JSON are what readers see until newer ones arrive, so a page always shows something. There are two ways to bring them in:

- **`"src"`**: the address of a JSON file or API that returns the fields to replace, such as `{ "labels": [...], "series": [...] }` or `{ "tiles": [...] }`. The chart fetches it when the page opens, with the reader's sign-in cookies.
- **`"id"`** and a script: give the chart an `id`, then pass new figures to it from your own code. The chart animates from the old figures to the new ones.

``` js
// The fields here replace the same fields in the chart's JSON.
window.docsCharts.set("advisor-by-category", {
  labels: ["Security", "Cost", "Reliability"],
  series: [{ name: "Open", data: [61, 40, 35] }],
});
```

`window.docsCharts.get("<id>")` returns a chart's current JSON.
