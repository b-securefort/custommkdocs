---
# Wide charts need the room: no table of contents on this page.
hide:
  - toc
---

# Sustainability

=== "Azure"

    <div class="chart-context" markdown>

    - **Account** EXAMPLE-AZU-PRD-0001
    - **Subscription** `00000000-0000-0000-0000-000000000001`
    - **Provider** Azure
    - **Latest month** August 2026
    - **Data as of** 2 Oct 2026, 12:19

    </div>

    ``` chart
    {
      "type": "kpi",
      "tiles": [
        {
          "label": "Emissions in August",
          "value": 31.4, "unit": "kg CO₂e", "decimals": 1,
          "delta": -9.1, "deltaUnit": "%", "deltaLabel": "vs July", "good": "down",
          "trend": [35.1, 38.9, 39.4, 38.6, 39.6, 30.2, 32.3, 30.1, 28.6, 25.2, 27.0, 34.5, 31.4]
        },
        {
          "label": "Last 12 months",
          "value": 395.8, "unit": "kg CO₂e", "decimals": 1,
          "delta": -14.6, "deltaUnit": "%", "deltaLabel": "vs the 12 before", "good": "down"
        },
        {
          "label": "Carbon intensity",
          "value": 8.7, "unit": "g CO₂e/kWh", "decimals": 1,
          "note": "Electricity used in the regions you run in"
        },
        {
          "label": "Largest source",
          "value": 50.4, "format": "percent", "decimals": 0,
          "note": "Log Analytics workspaces"
        }
      ]
    }
    ```

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "line",
      "title": "Emissions over time",
      "subtitle": "kg CO₂e a month, against the 12-month average",
      "wide": true,
      "unit": "kg CO₂e",
      "decimals": 1,
      "smooth": false,
      "labels": ["Aug 2025", "Sep", "Oct", "Nov", "Dec", "Jan 2026", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
      "series": [{ "name": "Emissions", "data": [35.1, 38.9, 39.4, 38.6, 39.6, 30.2, 32.3, 30.1, 28.6, 25.2, 27.0, 34.5, 31.4] }],
      "target": { "value": 33.0, "label": "12-month average" },
      "headline": { "value": 31.4, "label": "in August", "delta": -9.1, "deltaUnit": "%", "deltaLabel": "vs July", "good": "down" },
      "note": "Source: Emissions Impact Dashboard. Example figures."
    }
    ```

    ``` chart
    {
      "type": "donut",
      "title": "By service",
      "subtitle": "August, kg CO₂e",
      "decimals": 1,
      "labels": ["Log Analytics workspaces", "Storage accounts", "SQL databases", "Arc-enabled servers", "Virtual machines", "Everything else"],
      "series": [{ "name": "August", "data": [15.8, 9.6, 1.9, 1.7, 1.4, 1.0] }],
      "colors": ["1", "2", "3", "4", "5", "muted"],
      "centerLabel": "kg CO₂e"
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "Top 5 resources",
      "subtitle": "August, kg CO₂e",
      "horizontal": true,
      "decimals": 1,
      "labels": ["law-uks-prd-011", "stuksprd011", "sql-uks-prd-011", "arc-uks-prd-001", "vm-uks-prd-001"],
      "series": [{ "name": "August", "data": [15.9, 10.0, 1.7, 1.1, 1.1] }]
    }
    ```

    </div>

=== "AWS"

    <div class="chart-context" markdown>

    - **Account** example-aws-prd-001
    - **Account ID** `000000000001`
    - **Provider** AWS
    - **Latest month** August 2026
    - **Data refreshed** 23 hours ago

    </div>

    ``` chart
    {
      "type": "kpi",
      "tiles": [
        {
          "label": "Emissions in August",
          "value": 84.9, "unit": "kg CO₂e", "decimals": 1,
          "delta": 18.6, "deltaUnit": "%", "deltaLabel": "vs July", "good": "down",
          "trend": [86.0, 88.7, 89.1, 88.3, 92.4, 90.1, 79.2, 83.5, 79.0, 81.2, 77.4, 71.6, 84.9]
        },
        {
          "label": "By scope, August",
          "value": 84.9, "unit": "kg CO₂e", "decimals": 1,
          "parts": [
            { "label": "Scope 1", "value": 0.3, "color": "1" },
            { "label": "Scope 2", "value": 49.4, "color": "2" },
            { "label": "Scope 3", "value": 35.2, "color": "3" }
          ]
        },
        {
          "label": "Last 12 months",
          "value": 1005.4, "unit": "kg CO₂e", "decimals": 0,
          "note": "About 1 tonne"
        },
        {
          "label": "Outside eu-west-2",
          "value": 16, "format": "percent", "decimals": 0,
          "note": "13.6 kg in 9 other Regions"
        }
      ]
    }
    ```

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "line",
      "title": "Emissions over time",
      "subtitle": "kg CO₂e a month, by scope",
      "wide": true,
      "stacked": true,
      "unit": "kg CO₂e",
      "decimals": 1,
      "smooth": false,
      "labels": ["Aug 2025", "Sep", "Oct", "Nov", "Dec", "Jan 2026", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
      "series": [
        { "name": "Scope 1", "color": "1", "data": [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3] },
        { "name": "Scope 2", "color": "2", "data": [49.9, 51.4, 51.7, 51.2, 53.6, 52.3, 45.9, 48.4, 45.8, 47.1, 44.9, 41.5, 49.4] },
        { "name": "Scope 3", "color": "3", "data": [35.8, 37.0, 37.1, 36.8, 38.5, 37.5, 33.0, 34.8, 32.9, 33.8, 32.2, 29.8, 35.2] }
      ],
      "headline": { "value": 84.9, "label": "in August", "delta": 18.6, "deltaUnit": "%", "deltaLabel": "vs July", "good": "down" },
      "note": "Source: AWS Customer Carbon Footprint Tool, market-based. Example figures."
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "By service",
      "subtitle": "August, kg CO₂e",
      "horizontal": true,
      "decimals": 1,
      "labels": ["Amazon EC2", "Amazon S3", "Everything else"],
      "series": [{ "name": "August", "data": [10.2, 2.5, 72.2] }],
      "note": "AWS's carbon tool names EC2 and S3 only; every other service is in \"Everything else\"."
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "By Region",
      "subtitle": "August, kg CO₂e",
      "horizontal": true,
      "decimals": 1,
      "labels": ["eu-west-2 (London)", "ap-southeast-4 (Melbourne)", "af-south-1 (Cape Town)", "il-central-1 (Tel Aviv)", "eu-west-1 (Ireland)", "eu-south-1 (Milan)", "4 other Regions"],
      "series": [{ "name": "August", "data": [71.3, 4.1, 3.0, 2.1, 1.8, 1.3, 1.3] }]
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Worth a look",
      "subtitle": "What the figures suggest",
      "wide": true,
      "items": [
        { "tag": "Regions", "title": "Emissions in 9 Regions besides eu-west-2", "detail": "13.6 kg in August came from Regions such as ap-southeast-4, af-south-1 and il-central-1. If nothing should run there, look for forgotten resources: they cost money and widen your attack surface too.", "value": 13.6 },
        { "tag": "Trend", "title": "Up 18.6% on July", "detail": "July was the lowest month of the year; August is back to the spring level. Check whether the rise matches new workloads.", "value": 13.3 }
      ],
      "unit": "kg CO₂e",
      "decimals": 1
    }
    ```

    </div>

??? note "What changed from the current dashboard"

    - **Sensible precision and units.** 31.3686 kg is 31.4 kg; 0.008708 kg per kWh is 8.7 g per kWh.
    - **The change sits on the number it's about.** "Month-over-month 9.1%" and "Last month total 34.52" were separate tiles; the August tile now carries its change and a 13-month trend line.
    - **An honest trend line.** The current chart's axis runs from 24 to 40, so a drop of a quarter looks like a fall to nothing, and its curve overshoots between months. The axis now starts at zero, points join with straight lines, and the 12-month average gives a reference.
    - **Long resource names on bars.** The top five resources are bars with their names beside them, in place of a donut with a small legend.
    - **Services keep the donut**, with values and shares in the legend beside it, because there are only five parts and "Everything else".
    - **Kilograms on both clouds.** The AWS dashboard reports metric tonnes (0.09 MTCO2e, with Scope 1 at 0.0003) and the Azure one kilograms, so the same footprint looked a thousand times bigger on one than the other. Both are in kg CO₂e here.
    - **Scopes as stacked areas**, so the top edge is the total, instead of a total line drawn above the three scope lines on the same axis.
    - **"Other" is explained, not charted.** AWS's carbon tool names only EC2 and S3, so "Other" was 85% of the services donut. A bar with a note says the same, honestly.
    - **Regions as a lead.** Emissions in Regions like af-south-1 and il-central-1, when you run in eu-west-2, may mean forgotten resources. That gets a tile and a note, not a sliver of a donut.
