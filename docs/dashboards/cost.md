---
# Wide charts need the room: no table of contents on this page.
hide:
  - toc
---

# Cost

=== "Azure"

    <div class="chart-context" markdown>

    - **Account** EXAMPLE-AZU-PRD-0001
    - **Subscription** `00000000-0000-0000-0000-000000000001`
    - **Provider** Azure
    - **Environment** Production
    - **Currency** USD
    - **Period** 3 Sep – 2 Oct 2026
    - **Data as of** 2 Oct 2026, 12:18

    </div>

    ``` chart
    {
      "type": "kpi",
      "format": "currency",
      "tiles": [
        {
          "label": "Spend, last 30 days",
          "value": 3580.40, "decimals": 0,
          "delta": 4.2, "deltaUnit": "%", "deltaLabel": "vs previous 30 days", "good": "down",
          "trend": [126.76, 123.6, 100.25, 89.67, 130.64, 127.53, 121.9, 130.12, 121.53, 96.28, 89.63, 122.5, 128.6, 135.96, 123.11, 124.93, 99.82, 105.67, 131.39, 128.1, 138.69, 121.7, 136.54, 93.64, 90.99, 123.0, 126.48, 135.76, 124.15, 131.46]
        },
        {
          "label": "Daily average",
          "value": 119.35, "decimals": 2,
          "note": "Weekdays $127, weekends $95"
        },
        {
          "label": "Forecast for October",
          "value": 3710, "decimals": 0,
          "note": "At the current daily rate"
        },
        {
          "label": "Services with charges",
          "value": 21,
          "note": "The top 6 are 88% of spend",
          "format": "number"
        }
      ]
    }
    ```

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "bar",
      "title": "Daily spend",
      "subtitle": "Last 30 days, with the 7-day average",
      "wide": true,
      "format": "currency",
      "decimals": 0,
      "labels": ["3 Sep", "4 Sep", "5 Sep", "6 Sep", "7 Sep", "8 Sep", "9 Sep", "10 Sep", "11 Sep", "12 Sep", "13 Sep", "14 Sep", "15 Sep", "16 Sep", "17 Sep", "18 Sep", "19 Sep", "20 Sep", "21 Sep", "22 Sep", "23 Sep", "24 Sep", "25 Sep", "26 Sep", "27 Sep", "28 Sep", "29 Sep", "30 Sep", "1 Oct", "2 Oct"],
      "series": [
        { "name": "Spend", "data": [126.76, 123.6, 100.25, 89.67, 130.64, 127.53, 121.9, 130.12, 121.53, 96.28, 89.63, 122.5, 128.6, 135.96, 123.11, 124.93, 99.82, 105.67, 131.39, 128.1, 138.69, 121.7, 136.54, 93.64, 90.99, 123.0, 126.48, 135.76, 124.15, 131.46] },
        { "name": "7-day average", "type": "line", "color": "2", "data": [126.76, 125.18, 116.87, 110.07, 114.18, 116.41, 117.19, 117.67, 117.38, 116.81, 116.8, 115.64, 115.79, 117.8, 116.8, 117.29, 117.79, 120.08, 121.35, 121.28, 121.67, 121.47, 123.13, 122.25, 120.15, 118.95, 118.72, 118.3, 118.65, 117.93] }
      ],
      "headline": { "value": 3580.40, "label": "in 30 days", "delta": 4.2, "deltaUnit": "%", "deltaLabel": "vs previous 30 days", "good": "down" },
      "note": "Source: Azure Cost Management. Example figures."
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "Spend by service",
      "subtitle": "Last 30 days: the top 7, and the other 14 together",
      "horizontal": true,
      "format": "currency",
      "labels": ["Log Analytics", "Storage", "Defender for Cloud", "Azure Monitor", "SQL Database", "Azure DevOps", "Virtual Machines", "14 other services"],
      "series": [{ "name": "Spend", "data": [1018.20, 793.50, 636.00, 288.40, 236.10, 178.00, 95.80, 334.40] }]
    }
    ```

    ``` chart
    {
      "type": "waterfall",
      "title": "What changed",
      "subtitle": "Previous 30 days to the last 30, by service",
      "format": "currency",
      "good": "down",
      "labels": ["Previous 30 days", "Log Analytics", "Storage", "Azure Monitor", "Other services", "SQL Database"],
      "data": [3436.00, 96.20, 41.30, 18.70, 10.60, -22.40],
      "end": "Last 30 days"
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Savings opportunities",
      "subtitle": "Where to look first, by the spend involved",
      "wide": true,
      "format": "currency",
      "decimals": 2,
      "valueLabel": "spend in period",
      "items": [
        { "tag": "Monitoring", "title": "Azure Monitor and Log Analytics are 36% of spend", "value": 1306.60, "detail": "Review log retention (90 days by default), lower the verbosity of diagnostic settings, and consider a commitment tier if ingestion stays over 100 GB a day." },
        { "tag": "Storage", "title": "Storage is 22% of spend", "value": 793.50, "detail": "Add lifecycle management rules to move rarely read blobs to Cool or Archive, and delete unattached managed disks." },
        { "tag": "Sprawl", "title": "14 services each cost under 2% of spend", "value": 334.40, "detail": "Check each is still needed, or whether some can be combined." },
        { "tag": "Databases", "title": "SQL Database charges", "value": 236.10, "detail": "For databases used now and then, consider the serverless tier; apply Azure Hybrid Benefit for SQL licences, or reserved capacity for steady use." },
        { "tag": "Networking", "title": "Bandwidth charges", "value": 0.29, "detail": "Small for now. Azure CDN for static content and service endpoints for private traffic keep it that way." }
      ]
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Azure Advisor cost recommendations",
      "subtitle": "Savings Advisor has worked out for you",
      "wide": true,
      "items": [],
      "empty": "No cost recommendations"
    }
    ```

    </div>

=== "AWS"

    <div class="chart-context" markdown>

    - **Account** example-aws-prd-001
    - **Account ID** `000000000001`
    - **Provider** AWS
    - **Environment** Production
    - **Region** eu-west-2
    - **Currency** USD
    - **Period** 3 Sep – 2 Oct 2026
    - **Data as of** 2 Oct 2026, 13:24

    </div>

    ``` chart
    {
      "type": "kpi",
      "format": "currency",
      "tiles": [
        {
          "label": "Spend, last 30 days",
          "value": 1352.80, "decimals": 0,
          "delta": 5.0, "deltaUnit": "%", "deltaLabel": "vs previous 30 days", "good": "down",
          "trend": [46.63, 47.38, 43.94, 40.73, 47.02, 47.57, 44.76, 47.05, 47.87, 43.02, 38.13, 45.59, 44.1, 49.13, 48.32, 43.76, 44.34, 44.22, 48.04, 47.77, 44.57, 43.57, 47.16, 37.89, 38.8, 45.16, 43.68, 46.71, 46.55, 49.34]
        },
        {
          "label": "Daily average",
          "value": 45.09, "decimals": 2,
          "note": "Weekdays $46, weekends $40"
        },
        {
          "label": "Forecast for October",
          "value": 1398, "decimals": 0,
          "note": "At the current daily rate"
        },
        {
          "label": "Services with charges",
          "value": 38,
          "format": "number",
          "note": "The top 7 are 86% of spend"
        }
      ]
    }
    ```

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "bar",
      "title": "Daily spend",
      "subtitle": "Last 30 days, with the 7-day average",
      "wide": true,
      "format": "currency",
      "decimals": 0,
      "labels": ["3 Sep", "4 Sep", "5 Sep", "6 Sep", "7 Sep", "8 Sep", "9 Sep", "10 Sep", "11 Sep", "12 Sep", "13 Sep", "14 Sep", "15 Sep", "16 Sep", "17 Sep", "18 Sep", "19 Sep", "20 Sep", "21 Sep", "22 Sep", "23 Sep", "24 Sep", "25 Sep", "26 Sep", "27 Sep", "28 Sep", "29 Sep", "30 Sep", "1 Oct", "2 Oct"],
      "series": [
        { "name": "Spend", "data": [46.63, 47.38, 43.94, 40.73, 47.02, 47.57, 44.76, 47.05, 47.87, 43.02, 38.13, 45.59, 44.1, 49.13, 48.32, 43.76, 44.34, 44.22, 48.04, 47.77, 44.57, 43.57, 47.16, 37.89, 38.8, 45.16, 43.68, 46.71, 46.55, 49.34] },
        { "name": "7-day average", "type": "line", "color": "2", "data": [46.63, 47.01, 45.98, 44.67, 45.14, 45.54, 45.43, 45.49, 45.56, 45.43, 45.06, 44.86, 44.36, 44.98, 45.17, 44.58, 44.77, 45.64, 45.99, 46.51, 45.86, 45.18, 45.67, 44.75, 43.97, 43.56, 42.98, 43.28, 43.71, 44.02] }
      ],
      "headline": { "value": 1352.80, "label": "in 30 days", "delta": 5.0, "deltaUnit": "%", "deltaLabel": "vs previous 30 days", "good": "down" },
      "note": "Source: AWS Cost Explorer. Example figures."
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "Spend by service",
      "subtitle": "Last 30 days: the top 7, and the other 31 together",
      "horizontal": true,
      "format": "currency",
      "labels": ["EC2-Other", "Amazon EC2", "Amazon VPC", "AWS KMS", "Amazon GuardDuty", "Amazon Route 53", "AWS Config", "31 other services"],
      "series": [{ "name": "Spend", "data": [402.10, 318.40, 142.60, 96.30, 88.20, 61.50, 52.40, 191.30] }]
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "What's in EC2-Other",
      "subtitle": "The largest line, split by usage type",
      "horizontal": true,
      "format": "currency",
      "labels": ["EBS volumes", "NAT gateway", "EBS snapshots", "Data transfer", "Elastic IPs"],
      "series": [{ "name": "Spend", "data": [168.20, 121.40, 64.30, 38.90, 9.30] }],
      "note": "Cost Explorer, EC2-Other grouped by usage type."
    }
    ```

    ``` chart
    {
      "type": "waterfall",
      "title": "What changed",
      "subtitle": "Previous 30 days to the last 30, by service",
      "wide": true,
      "format": "currency",
      "good": "down",
      "labels": ["Previous 30 days", "EC2-Other", "Amazon EC2", "Amazon GuardDuty", "AWS KMS", "Other services"],
      "data": [1288.40, 38.60, 21.20, 9.80, -2.10, -3.10],
      "end": "Last 30 days"
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Savings opportunities",
      "subtitle": "Where to look first, by the spend involved",
      "wide": true,
      "format": "currency",
      "decimals": 2,
      "valueLabel": "spend in period",
      "items": [
        { "tag": "Storage", "title": "EBS volumes and snapshots are 17% of spend", "value": 232.50, "detail": "Move gp2 volumes to gp3 (about 20% cheaper for the same performance), delete unattached volumes, and set retention on snapshots with Data Lifecycle Manager." },
        { "tag": "Networking", "title": "NAT gateway charges", "value": 121.40, "detail": "Traffic to S3 and DynamoDB through the NAT gateway is charged per GB. Gateway endpoints for them are free." },
        { "tag": "Security", "title": "AWS KMS customer managed keys", "value": 96.30, "detail": "Each key costs $1 a month. Schedule unused keys for deletion, and use S3 Bucket Keys to cut request charges." },
        { "tag": "Sprawl", "title": "31 services each cost under 2% of spend", "value": 191.30, "detail": "Check each is still needed." }
      ]
    }
    ```

    </div>

??? note "What changed from the current dashboard"

    - **Total spend says how it's moving.** The large blue card showed one number; the tile adds the change against the previous 30 days and the daily trend, next to the daily average and a forecast.
    - **Daily spend is a chart.** The daily average comes from daily figures, so they're shown, with a 7-day average to smooth the weekends.
    - **Bars instead of a 21-slice donut.** Services are sorted by spend, and the 14 smallest are folded into one bar, so every name is readable.
    - **What changed** shows which services made the total go up or down.
    - **Savings opportunities say what their amount is.** It's the spend involved, not a saving, so it's labelled "spend in period" rather than shown in red like a saving.
    - **The account details are one strip**, with the reporting period. In the current panel, the values look one row off from their labels (Provider reads "production", Primary Region "USD"), which is worth checking.
    - **EC2-Other is split up.** It's the largest line on most AWS bills, and a catch-all for EBS, NAT gateways, snapshots and data transfer, so the chart beside it breaks it down by usage type.
    - **The account panel lines up on AWS.** Its values sit next to the right labels, which supports the Azure panel being one row off.
