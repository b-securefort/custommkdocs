---
# Wide charts need the room: no table of contents on this page.
hide:
  - toc
---

# Chart types

Every kind of [chart](charts.md), with the Markdown that draws it. Copy one and change the figures. The options every chart shares, the colours, and how to bring in live figures are on the [Charts](charts.md#writing-a-chart) page.

The figures here are examples, not real data.

## Stat tiles

The few numbers a page leads with. Each tile has a value, and optionally a change against an earlier period, and under it either a trend or a breakdown.

### With a trend

`trend` is a list of past values, drawn as a small line that ends at the latest.

=== "Preview"

    ``` chart
    {
      "type": "kpi",
      "tiles": [
        { "label": "Open recommendations", "value": 183,
          "delta": -18, "deltaLabel": "vs August", "good": "down",
          "trend": [231, 226, 219, 214, 220, 208, 204, 199, 201, 196, 201, 183] },
        { "label": "Monthly spend", "value": 38240, "format": "currency",
          "delta": -6, "deltaUnit": "%", "deltaLabel": "vs August", "good": "down",
          "trend": [31200, 32800, 34100, 35900, 37400, 39800, 41200, 40700, 38240] },
        { "label": "Regulatory compliance", "value": 78, "format": "percent",
          "delta": 2, "deltaUnit": " pts", "deltaLabel": "vs August",
          "trend": [69, 70, 72, 71, 73, 74, 75, 76, 78] }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "kpi",
      "tiles": [
        { "label": "Open recommendations", "value": 183,
          "delta": -18, "deltaLabel": "vs August", "good": "down",
          "trend": [231, 226, 219, 214, 220, 208, 204, 199, 201, 196, 201, 183] },
        { "label": "Monthly spend", "value": 38240, "format": "currency",
          "delta": -6, "deltaUnit": "%", "deltaLabel": "vs August", "good": "down",
          "trend": [31200, 32800, 34100, 35900, 37400, 39800, 41200, 40700, 38240] },
        { "label": "Regulatory compliance", "value": 78, "format": "percent",
          "delta": 2, "deltaUnit": " pts", "deltaLabel": "vs August",
          "trend": [69, 70, 72, 71, 73, 74, 75, 76, 78] }
      ]
    }
    ```
    ````

`good` says which way is better: `up` (the default), `down`, or `neither` for a change that's just a change. `deltaUnit` gives the change its own unit, such as `%` or ` pts`; without one, the change takes the tile's `format`.

### With a breakdown

`parts` splits the number into its pieces, as one bar with each piece's count under it. Zeros stay in the list, so "0 medium" reads as clearly as "50 high". A tile can also have a `note`.

=== "Preview"

    ``` chart
    {
      "type": "kpi",
      "tiles": [
        { "label": "Unhealthy recommendations", "value": 50,
          "parts": [
            { "label": "High", "value": 50, "color": "high" },
            { "label": "Medium", "value": 0, "color": "medium" },
            { "label": "Low", "value": 0, "color": "low" }
          ] },
        { "label": "Open recommendations", "value": 9,
          "parts": [
            { "label": "High", "value": 2, "color": "high" },
            { "label": "Medium", "value": 5, "color": "medium" },
            { "label": "Low", "value": 2, "color": "low" }
          ] },
        { "label": "Secure score", "value": 30, "format": "percent",
          "note": "10 of 33 points" }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "kpi",
      "tiles": [
        { "label": "Unhealthy recommendations", "value": 50,
          "parts": [
            { "label": "High", "value": 50, "color": "high" },
            { "label": "Medium", "value": 0, "color": "medium" },
            { "label": "Low", "value": 0, "color": "low" }
          ] },
        { "label": "Open recommendations", "value": 9,
          "parts": [
            { "label": "High", "value": 2, "color": "high" },
            { "label": "Medium", "value": 5, "color": "medium" },
            { "label": "Low", "value": 2, "color": "low" }
          ] },
        { "label": "Secure score", "value": 30, "format": "percent",
          "note": "10 of 33 points" }
      ]
    }
    ```
    ````

## Bar charts

Compare amounts across categories. Sort the bars largest first unless the order means something, like months. `horizontal: true` makes room for long names.

### Grouped

Several series side by side in each category.

=== "Preview"

    ``` chart
    {
      "type": "bar",
      "title": "Open recommendations by cloud",
      "subtitle": "Advisor and Trusted Advisor, by category",
      "labels": ["Security", "Cost", "Reliability", "Operational excellence", "Performance"],
      "series": [
        { "name": "Azure", "color": "1", "data": [58, 42, 33, 34, 16] },
        { "name": "AWS", "color": "2", "data": [23, 17, 17, 12, 9] }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "bar",
      "title": "Open recommendations by cloud",
      "subtitle": "Advisor and Trusted Advisor, by category",
      "labels": ["Security", "Cost", "Reliability", "Operational excellence", "Performance"],
      "series": [
        { "name": "Azure", "color": "1", "data": [58, 42, 33, 34, 16] },
        { "name": "AWS", "color": "2", "data": [23, 17, 17, 12, 9] }
      ]
    }
    ```
    ````

### Stacked

Parts of each category's total. The total shows at the end of each bar while there are eight bars or fewer.

=== "Preview"

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
      ]
    }
    ```

=== "Markdown"

    ```` markdown
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
      ]
    }
    ```
    ````

### 100% stacked

Every bar is a whole, so categories of different sizes compare by share. The tooltip and the table keep the counts.

=== "Preview"

    ``` chart
    {
      "type": "bar",
      "title": "Compliance controls by standard",
      "subtitle": "Share of assessed controls",
      "horizontal": true,
      "percent": true,
      "labels": ["ISO 27001:2022", "CIS Azure 2.0", "NIST SP 800-53", "CIS AWS 3.0", "PCI DSS 4.0"],
      "series": [
        { "name": "Passed", "color": "1", "data": [84, 77, 312, 41, 166] },
        { "name": "Failed", "color": "high", "data": [8, 17, 115, 13, 78] },
        { "name": "Not applicable", "color": "muted", "data": [1, 3, 21, 2, 12] }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "bar",
      "title": "Compliance controls by standard",
      "subtitle": "Share of assessed controls",
      "horizontal": true,
      "percent": true,
      "labels": ["ISO 27001:2022", "CIS Azure 2.0", "NIST SP 800-53", "CIS AWS 3.0", "PCI DSS 4.0"],
      "series": [
        { "name": "Passed", "color": "1", "data": [84, 77, 312, 41, 166] },
        { "name": "Failed", "color": "high", "data": [8, 17, 115, 13, 78] },
        { "name": "Not applicable", "color": "muted", "data": [1, 3, 21, 2, 12] }
      ]
    }
    ```
    ````

### Diverging

Changes up and down from zero: blue where a change goes the good way, red where it doesn't. `good` says which way that is.

=== "Preview"

    ``` chart
    {
      "type": "bar",
      "title": "Change in open findings",
      "subtitle": "September against August, by area",
      "horizontal": true,
      "diverging": true,
      "good": "down",
      "labels": ["Identity", "Data", "Containers", "Key Vault", "Compute", "Network"],
      "series": [{ "name": "Change", "data": [-12, -8, -4, -2, 3, 5] }]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "bar",
      "title": "Change in open findings",
      "subtitle": "September against August, by area",
      "horizontal": true,
      "diverging": true,
      "good": "down",
      "labels": ["Identity", "Data", "Containers", "Key Vault", "Compute", "Network"],
      "series": [{ "name": "Change", "data": [-12, -8, -4, -2, 3, 5] }]
    }
    ```
    ````

### With a line

A series with `"type": "line"` is drawn as a line over the bars, on the same axis: an average, a forecast, or last year. Never a second axis: two measures of different sizes belong in two charts.

=== "Preview"

    ``` chart
    {
      "type": "bar",
      "title": "Monthly spend",
      "subtitle": "With the three-month average",
      "format": "currency",
      "labels": ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
      "series": [
        { "name": "Spend", "data": [35900, 37400, 39800, 41200, 40700, 38240] },
        { "name": "Three-month average", "type": "line", "color": "2",
          "data": [34600, 35800, 37700, 39470, 40570, 40050] }
      ],
      "values": false
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "bar",
      "title": "Monthly spend",
      "subtitle": "With the three-month average",
      "format": "currency",
      "labels": ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
      "series": [
        { "name": "Spend", "data": [35900, 37400, 39800, 41200, 40700, 38240] },
        { "name": "Three-month average", "type": "line", "color": "2",
          "data": [34600, 35800, 37700, 39470, 40570, 40050] }
      ],
      "values": false
    }
    ```
    ````

## Line charts

Change over time.

### Several lines

One line per series, with a crosshair that lists every series at the point you hover over. Past four lines they get hard to follow; consider one chart per series instead.

=== "Preview"

    ``` chart
    {
      "type": "line",
      "title": "Advisor score by category",
      "subtitle": "Out of 100, last 12 months",
      "min": 40,
      "max": 100,
      "labels": ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
      "series": [
        { "name": "Cost", "color": "1", "data": [58, 60, 61, 63, 62, 64, 66, 67, 68, 69, 70, 71] },
        { "name": "Security", "color": "2", "data": [48, 49, 51, 50, 53, 55, 56, 58, 59, 61, 62, 64] },
        { "name": "Reliability", "color": "3", "data": [75, 76, 76, 77, 78, 78, 79, 80, 80, 81, 81, 82] },
        { "name": "Performance", "color": "4", "data": [86, 86, 87, 88, 88, 89, 89, 90, 90, 90, 91, 91] }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "line",
      "title": "Advisor score by category",
      "subtitle": "Out of 100, last 12 months",
      "min": 40,
      "max": 100,
      "labels": ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"],
      "series": [
        { "name": "Cost", "color": "1", "data": [58, 60, 61, 63, 62, 64, 66, 67, 68, 69, 70, 71] },
        { "name": "Security", "color": "2", "data": [48, 49, 51, 50, 53, 55, 56, 58, 59, 61, 62, 64] },
        { "name": "Reliability", "color": "3", "data": [75, 76, 76, 77, 78, 78, 79, 80, 80, 81, 81, 82] },
        { "name": "Performance", "color": "4", "data": [86, 86, 87, 88, 88, 89, 89, 90, 90, 90, 91, 91] }
      ]
    }
    ```
    ````

### Stacked areas

Each layer sits on the one below, so the top edge is the total.

=== "Preview"

    ``` chart
    {
      "type": "line",
      "title": "Monthly spend by cloud",
      "subtitle": "Last six months",
      "stacked": true,
      "format": "currency",
      "labels": ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
      "series": [
        { "name": "Azure", "color": "1", "data": [22100, 23000, 24600, 25300, 25000, 23400] },
        { "name": "AWS", "color": "2", "data": [13800, 14400, 15200, 15900, 15700, 14840] }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "line",
      "title": "Monthly spend by cloud",
      "subtitle": "Last six months",
      "stacked": true,
      "format": "currency",
      "labels": ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
      "series": [
        { "name": "Azure", "color": "1", "data": [22100, 23000, 24600, 25300, 25000, 23400] },
        { "name": "AWS", "color": "2", "data": [13800, 14400, 15200, 15900, 15700, 14840] }
      ]
    }
    ```
    ````

### A forecast and a target

A single series gets a shaded area. `"dashed": true` marks a series as a forecast, and `target` draws a budget or goal across the chart.

=== "Preview"

    ``` chart
    {
      "type": "line",
      "title": "Monthly spend",
      "subtitle": "Actual and forecast against budget",
      "format": "currency",
      "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      "series": [
        { "name": "Actual", "data": [31200, 32800, 34100, 35900, 37400, 39800, 41200, 40700, 38240, null, null, null] },
        { "name": "Forecast", "dashed": true, "data": [null, null, null, null, null, null, null, null, 38240, 39100, 40300, 41600] }
      ],
      "target": { "value": 42000, "label": "Budget" }
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "line",
      "title": "Monthly spend",
      "subtitle": "Actual and forecast against budget",
      "format": "currency",
      "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      "series": [
        { "name": "Actual", "data": [31200, 32800, 34100, 35900, 37400, 39800, 41200, 40700, 38240, null, null, null] },
        { "name": "Forecast", "dashed": true, "data": [null, null, null, null, null, null, null, null, 38240, 39100, 40300, 41600] }
      ],
      "target": { "value": 42000, "label": "Budget" }
    }
    ```
    ````

## Donuts

Shares of one total. Keep to five parts or fewer, and fold the rest into one "Everything else" in `muted` grey. Hover over a part to see its value in the middle.

### One ring

=== "Preview"

    ``` chart
    {
      "type": "donut",
      "title": "Estimated monthly savings",
      "subtitle": "From the cost optimization checks",
      "format": "currency",
      "labels": ["Low-utilization EC2", "Savings Plans", "Idle RDS instances", "Underutilized EBS", "Everything else"],
      "series": [{ "name": "Monthly savings", "data": [4820, 3780, 2160, 1340, 610] }],
      "colors": ["1", "2", "3", "4", "muted"],
      "centerLabel": "a month"
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "donut",
      "title": "Estimated monthly savings",
      "subtitle": "From the cost optimization checks",
      "format": "currency",
      "labels": ["Low-utilization EC2", "Savings Plans", "Idle RDS instances", "Underutilized EBS", "Everything else"],
      "series": [{ "name": "Monthly savings", "data": [4820, 3780, 2160, 1340, 610] }],
      "colors": ["1", "2", "3", "4", "muted"],
      "centerLabel": "a month"
    }
    ```
    ````

### Several rings

One ring per series, outside in: the first series is the outer ring, and inner rings are a shade paler. Use it to compare the same parts across two periods.

=== "Preview"

    ``` chart
    {
      "type": "donut",
      "title": "Spend by service",
      "subtitle": "September against August",
      "format": "currency",
      "labels": ["Virtual machines", "SQL Database", "Storage", "Kubernetes", "Everything else"],
      "series": [
        { "name": "September", "data": [12480, 6920, 4310, 3870, 10660] },
        { "name": "August", "data": [14620, 6400, 4180, 3250, 12250] }
      ],
      "colors": ["1", "2", "3", "4", "muted"]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "donut",
      "title": "Spend by service",
      "subtitle": "September against August",
      "format": "currency",
      "labels": ["Virtual machines", "SQL Database", "Storage", "Kubernetes", "Everything else"],
      "series": [
        { "name": "September", "data": [12480, 6920, 4310, 3870, 10660] },
        { "name": "August", "data": [14620, 6400, 4180, 3250, 12250] }
      ],
      "colors": ["1", "2", "3", "4", "muted"]
    }
    ```
    ````

## Gauge

One score against its maximum. `bands` colour it by how good the score is: the first band the value is at or under decides.

=== "Preview"

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
      ]
    }
    ```

=== "Markdown"

    ```` markdown
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
      ]
    }
    ```
    ````

## Radar

Scores across the same five or six areas, such as the Well-Architected pillars. Two series at most: now and before.

=== "Preview"

    ``` chart
    {
      "type": "radar",
      "title": "Well-Architected review",
      "subtitle": "Score out of 100 per pillar",
      "labels": ["Cost", "Security", "Reliability", "Operational excellence", "Performance", "Sustainability"],
      "series": [
        { "name": "This review", "data": [71, 64, 82, 88, 91, 58] },
        { "name": "Last review", "color": "muted", "dashed": true, "data": [62, 55, 79, 84, 90, 47] }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "radar",
      "title": "Well-Architected review",
      "subtitle": "Score out of 100 per pillar",
      "labels": ["Cost", "Security", "Reliability", "Operational excellence", "Performance", "Sustainability"],
      "series": [
        { "name": "This review", "data": [71, 64, 82, 88, 91, 58] },
        { "name": "Last review", "color": "muted", "dashed": true, "data": [62, 55, 79, 84, 90, 47] }
      ]
    }
    ```
    ````

## Waterfall

How one total became another. The first value is the starting total and the rest are changes; `end` names the total they add up to. Indexes listed in `totals` are drawn as subtotals.

=== "Preview"

    ``` chart
    {
      "type": "waterfall",
      "title": "What changed in spend",
      "subtitle": "August to September",
      "format": "currency",
      "good": "down",
      "labels": ["August", "Virtual machines", "Reserved instances", "SQL Database", "Kubernetes", "Storage", "Networking"],
      "data": [40700, -2140, -1850, 960, 620, 410, -460],
      "end": "September"
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "waterfall",
      "title": "What changed in spend",
      "subtitle": "August to September",
      "format": "currency",
      "good": "down",
      "labels": ["August", "Virtual machines", "Reserved instances", "SQL Database", "Kubernetes", "Storage", "Networking"],
      "data": [40700, -2140, -1850, 960, 620, 410, -460],
      "end": "September"
    }
    ```
    ````

## Scatter and bubbles

Two measures for each item, such as how busy a machine is against what it costs. Give points a `size` and it becomes a bubble chart. `region` shades the part of the chart that needs action. Use three series at most.

=== "Preview"

    ``` chart
    {
      "type": "scatter",
      "title": "Rightsizing",
      "subtitle": "Machines and databases, last 30 days",
      "x": { "label": "Average CPU", "format": "percent", "max": 100 },
      "y": { "label": "Monthly cost", "format": "currency" },
      "size": { "label": "vCPUs" },
      "region": { "x": [0, 20], "y": [500, null], "label": "Rightsizing candidates" },
      "series": [
        { "name": "Virtual machines", "color": "1", "data": [
          { "name": "vm-sql-prod-01", "x": 62, "y": 1840, "size": 16 },
          { "name": "vm-app-prod-01", "x": 8, "y": 1260, "size": 16 },
          { "name": "vm-app-prod-02", "x": 11, "y": 980, "size": 8 },
          { "name": "vm-batch-01", "x": 4, "y": 1520, "size": 32 },
          { "name": "vm-web-prod-01", "x": 45, "y": 410, "size": 4 },
          { "name": "vm-web-prod-02", "x": 38, "y": 390, "size": 4 },
          { "name": "vm-ci-runner", "x": 71, "y": 620, "size": 8 },
          { "name": "vm-reporting", "x": 14, "y": 720, "size": 8 },
          { "name": "vm-cache-01", "x": 55, "y": 880, "size": 8 }
        ] },
        { "name": "Databases", "color": "2", "data": [
          { "name": "sql-orders", "x": 18, "y": 1120, "size": 8 },
          { "name": "sql-catalog", "x": 66, "y": 760, "size": 4 },
          { "name": "rds-billing", "x": 9, "y": 940, "size": 8 },
          { "name": "rds-auth", "x": 42, "y": 310, "size": 2 }
        ] }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "scatter",
      "title": "Rightsizing",
      "subtitle": "Machines and databases, last 30 days",
      "x": { "label": "Average CPU", "format": "percent", "max": 100 },
      "y": { "label": "Monthly cost", "format": "currency" },
      "size": { "label": "vCPUs" },
      "region": { "x": [0, 20], "y": [500, null], "label": "Rightsizing candidates" },
      "series": [
        { "name": "Virtual machines", "color": "1", "data": [
          { "name": "vm-sql-prod-01", "x": 62, "y": 1840, "size": 16 },
          { "name": "vm-app-prod-01", "x": 8, "y": 1260, "size": 16 },
          { "name": "vm-app-prod-02", "x": 11, "y": 980, "size": 8 },
          { "name": "vm-batch-01", "x": 4, "y": 1520, "size": 32 },
          { "name": "vm-web-prod-01", "x": 45, "y": 410, "size": 4 },
          { "name": "vm-web-prod-02", "x": 38, "y": 390, "size": 4 },
          { "name": "vm-ci-runner", "x": 71, "y": 620, "size": 8 },
          { "name": "vm-reporting", "x": 14, "y": 720, "size": 8 },
          { "name": "vm-cache-01", "x": 55, "y": 880, "size": 8 }
        ] },
        { "name": "Databases", "color": "2", "data": [
          { "name": "sql-orders", "x": 18, "y": 1120, "size": 8 },
          { "name": "sql-catalog", "x": 66, "y": 760, "size": 4 },
          { "name": "rds-billing", "x": 9, "y": 940, "size": 8 },
          { "name": "rds-auth", "x": 42, "y": 310, "size": 2 }
        ] }
      ]
    }
    ```
    ````

`x`, `y` and `size` each take a `label`, `format`, `unit` and `decimals`; `x` and `y` also take `min` and `max`. Each point's `name` shows in its tooltip.

## Heatmap

A grid of values, darker where higher: findings by subscription and area, or spend by weekday and hour. `labels` are the columns, `rows` the rows, and `data` has one list per row.

=== "Preview"

    ``` chart
    {
      "type": "heatmap",
      "title": "Open findings by subscription",
      "subtitle": "By security area",
      "valueLabel": "open findings",
      "labels": ["Identity", "Network", "Data", "Compute", "Containers", "Key Vault"],
      "rows": ["Production", "Shared services", "Development", "Test", "Sandbox"],
      "data": [
        [4, 9, 6, 12, 7, 2],
        [7, 14, 3, 5, 2, 4],
        [2, 6, 8, 15, 11, 1],
        [1, 4, 5, 9, 6, 0],
        [0, 3, 2, 18, 4, 1]
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "heatmap",
      "title": "Open findings by subscription",
      "subtitle": "By security area",
      "valueLabel": "open findings",
      "labels": ["Identity", "Network", "Data", "Compute", "Containers", "Key Vault"],
      "rows": ["Production", "Shared services", "Development", "Test", "Sandbox"],
      "data": [
        [4, 9, 6, 12, 7, 2],
        [7, 14, 3, 5, 2, 4],
        [2, 6, 8, 15, 11, 1],
        [1, 4, 5, 9, 6, 0],
        [0, 3, 2, 18, 4, 1]
      ]
    }
    ```
    ````

The cells are blue unless you set `color`. A heatmap uses one hue, so a darker cell always means a higher value. `null` leaves a cell empty, and `"values": false` hides the numbers.

## Progress

Meters against their targets: compliance per standard, or budget used per team. Each item has a `label` and a `value`, and optionally its own `max`, `target` and `note`.

=== "Preview"

    ``` chart
    {
      "type": "progress",
      "title": "Regulatory compliance",
      "subtitle": "Share of controls passing",
      "format": "percent",
      "bands": [{ "to": 70, "color": "high" }, { "color": "accent" }],
      "items": [
        { "label": "ISO 27001:2022", "value": 91, "target": 90 },
        { "label": "CIS Microsoft Azure Foundations 2.0", "value": 82, "target": 90 },
        { "label": "CIS AWS Foundations 3.0", "value": 76, "target": 90 },
        { "label": "NIST SP 800-53 Rev. 5", "value": 73, "target": 80 },
        { "label": "PCI DSS 4.0", "value": 68, "target": 85, "note": "Audit in November" }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "progress",
      "title": "Regulatory compliance",
      "subtitle": "Share of controls passing",
      "format": "percent",
      "bands": [{ "to": 70, "color": "high" }, { "color": "accent" }],
      "items": [
        { "label": "ISO 27001:2022", "value": 91, "target": 90 },
        { "label": "CIS Microsoft Azure Foundations 2.0", "value": 82, "target": 90 },
        { "label": "CIS AWS Foundations 3.0", "value": 76, "target": 90 },
        { "label": "NIST SP 800-53 Rev. 5", "value": 73, "target": 80 },
        { "label": "PCI DSS 4.0", "value": 68, "target": 85, "note": "Audit in November" }
      ]
    }
    ```
    ````

## Treemap

Shares of a total as rectangles, for when there are too many parts for a donut. Give items a `group` to colour them by it.

=== "Preview"

    ``` chart
    {
      "type": "treemap",
      "title": "Spend by resource group",
      "subtitle": "September, by environment",
      "format": "currency",
      "items": [
        { "label": "rg-payments-prod", "value": 9240, "group": "Production" },
        { "label": "rg-data-prod", "value": 7810, "group": "Production" },
        { "label": "rg-web-prod", "value": 4920, "group": "Production" },
        { "label": "rg-payments-dev", "value": 3150, "group": "Non-production" },
        { "label": "rg-data-dev", "value": 2840, "group": "Non-production" },
        { "label": "rg-sandbox", "value": 1980, "group": "Non-production" },
        { "label": "rg-test", "value": 1710, "group": "Non-production" },
        { "label": "rg-shared-network", "value": 3700, "group": "Shared services" },
        { "label": "rg-monitoring", "value": 1630, "group": "Shared services" },
        { "label": "rg-identity", "value": 1260, "group": "Shared services" }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "treemap",
      "title": "Spend by resource group",
      "subtitle": "September, by environment",
      "format": "currency",
      "items": [
        { "label": "rg-payments-prod", "value": 9240, "group": "Production" },
        { "label": "rg-data-prod", "value": 7810, "group": "Production" },
        { "label": "rg-web-prod", "value": 4920, "group": "Production" },
        { "label": "rg-payments-dev", "value": 3150, "group": "Non-production" },
        { "label": "rg-data-dev", "value": 2840, "group": "Non-production" },
        { "label": "rg-sandbox", "value": 1980, "group": "Non-production" },
        { "label": "rg-test", "value": 1710, "group": "Non-production" },
        { "label": "rg-shared-network", "value": 3700, "group": "Shared services" },
        { "label": "rg-monitoring", "value": 1630, "group": "Shared services" },
        { "label": "rg-identity", "value": 1260, "group": "Shared services" }
      ]
    }
    ```
    ````

Groups take the chart palette in the order they first appear. To fix a group's colour, use `groupColors`, such as `{ "Production": "1" }`.

## Findings

Recommendations, alerts or opportunities as a list, worst first. Rows with the same `title` and `severity` become one, with their resources added up, so you can pass the API's rows as they come: one per resource. A bar and filters at the top show each severity's count, zeros included. Rows with a `detail`, a list of `resources` or a `link` open to show them.

=== "Preview"

    ``` chart
    {
      "type": "findings",
      "title": "Unhealthy recommendations",
      "subtitle": "Microsoft Defender for Cloud",
      "limit": 4,
      "items": [
        { "severity": "high", "title": "Windows servers should be configured to use secure communication protocols",
          "resourceType": "Arc-enabled servers", "status": "Active",
          "detail": "TLS 1.0 and 1.1 are still enabled. Set the minimum protocol to TLS 1.2.",
          "resources": ["arc-win-prd-01", "arc-win-prd-02", "arc-win-prd-03"] },
        { "severity": "high", "title": "Machines should have vulnerability findings resolved",
          "resourceType": "Arc-enabled servers", "status": "Active", "resources": 9 },
        { "severity": "medium", "title": "Resource logs in Key Vault should be enabled",
          "resourceType": "Key vaults", "status": "Active", "resources": 2 },
        { "severity": "medium", "title": "Azure Key Vault should use private link",
          "resourceType": "Key vaults", "status": "Active", "resources": 2 },
        { "severity": "low", "title": "Subnets should be associated with a network security group",
          "resourceType": "Virtual networks", "status": "Active", "resources": 1 }
      ]
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "findings",
      "title": "Unhealthy recommendations",
      "subtitle": "Microsoft Defender for Cloud",
      "limit": 4,
      "items": [
        { "severity": "high", "title": "Windows servers should be configured to use secure communication protocols",
          "resourceType": "Arc-enabled servers", "status": "Active",
          "detail": "TLS 1.0 and 1.1 are still enabled. Set the minimum protocol to TLS 1.2.",
          "resources": ["arc-win-prd-01", "arc-win-prd-02", "arc-win-prd-03"] },
        { "severity": "high", "title": "Machines should have vulnerability findings resolved",
          "resourceType": "Arc-enabled servers", "status": "Active", "resources": 9 },
        { "severity": "medium", "title": "Resource logs in Key Vault should be enabled",
          "resourceType": "Key vaults", "status": "Active", "resources": 2 },
        { "severity": "medium", "title": "Azure Key Vault should use private link",
          "resourceType": "Key vaults", "status": "Active", "resources": 2 },
        { "severity": "low", "title": "Subnets should be associated with a network security group",
          "resourceType": "Virtual networks", "status": "Active", "resources": 1 }
      ]
    }
    ```
    ````

Each item takes a `severity` (`critical`, `high`, `medium`, `low` or `informational`), a `title`, and optionally `detail`, `resourceType`, `resources` (a count, or a list of names), `status`, `tag` and `link`. Without severities, as for savings opportunities, give items a `tag` and a `value` instead, and the chart's `valueLabel` says what the value is: see the [Cost dashboard](../dashboards/cost.md). `limit` is how many rows show before "Show all" (6 by default). The counts at the top add up resources; `"countBy": "rows"` counts one per recommendation instead.

## When there's nothing to show

A chart with no figures shows a green check and its `empty` message instead of an empty plot. No recommendations is a result worth showing.

=== "Preview"

    ``` chart
    {
      "type": "findings",
      "title": "Cost recommendations",
      "subtitle": "Azure Advisor",
      "items": [],
      "empty": "No cost recommendations"
    }
    ```

=== "Markdown"

    ```` markdown
    ``` chart
    {
      "type": "findings",
      "title": "Cost recommendations",
      "subtitle": "Azure Advisor",
      "items": [],
      "empty": "No cost recommendations"
    }
    ```
    ````

This works for every type: a bar or line chart whose values are all zero or missing, or a list with no items. When figures arrive through [live figures](charts.md#live-figures), the chart replaces the message.
