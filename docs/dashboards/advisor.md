---
# Wide charts need the room: no table of contents on this page.
hide:
  - toc
---

# Advisor

=== "Azure"

    <div class="chart-context" markdown>

    - **Account** EXAMPLE-AZU-PRD-0001
    - **Subscription** `00000000-0000-0000-0000-000000000001`
    - **Provider** Azure
    - **Environment** Production
    - **Data as of** 2 Oct 2026, 12:18

    </div>

    ``` chart
    {
      "type": "kpi",
      "tiles": [
        {
          "label": "Open recommendations",
          "value": 9,
          "parts": [
            { "label": "High", "value": 2, "color": "high" },
            { "label": "Medium", "value": 5, "color": "medium" },
            { "label": "Low", "value": 2, "color": "low" }
          ]
        },
        {
          "label": "High impact",
          "value": 2,
          "delta": -1, "deltaLabel": "vs last month", "good": "down",
          "note": "Both in Security"
        },
        {
          "label": "Categories with nothing to do",
          "value": 2,
          "note": "Cost and Performance, of 5"
        }
      ]
    }
    ```

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "bar",
      "title": "Recommendations by category",
      "subtitle": "Open recommendations, by impact",
      "wide": true,
      "horizontal": true,
      "stacked": true,
      "labels": ["Security", "Reliability", "Operational excellence", "Cost", "Performance"],
      "series": [
        { "name": "High impact", "color": "high", "data": [2, 0, 0, 0, 0] },
        { "name": "Medium impact", "color": "medium", "data": [3, 1, 1, 0, 0] },
        { "name": "Low impact", "color": "low", "data": [2, 0, 0, 0, 0] }
      ],
      "note": "Source: Azure Advisor. Example figures."
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Recommendations",
      "subtitle": "Worst first, with the category each belongs to",
      "wide": true,
      "countBy": "rows",
      "items": [
        { "severity": "high", "tag": "Security", "title": "Storage account public access should be disallowed", "resourceType": "Storage accounts", "resources": 2, "detail": "Set allowBlobPublicAccess to false on each account, after checking nothing reads the blobs anonymously." },
        { "severity": "high", "tag": "Security", "title": "Microsoft Defender for SQL should be enabled for SQL servers on machines", "resourceType": "SQL Server on Arc", "resources": 1 },
        { "severity": "medium", "tag": "Security", "title": "Resource logs in Key Vault should be enabled", "resourceType": "Key vaults", "resources": 2 },
        { "severity": "medium", "tag": "Security", "title": "Azure Key Vault should use private link", "resourceType": "Key vaults", "resources": 2 },
        { "severity": "medium", "tag": "Security", "title": "Storage accounts should use private link", "resourceType": "Storage accounts", "resources": 1 },
        { "severity": "medium", "tag": "Reliability", "title": "Enable soft delete for blobs", "resourceType": "Storage accounts", "resources": 1, "detail": "Keeps deleted blobs for a set number of days, so they can be restored." },
        { "severity": "medium", "tag": "Operational excellence", "title": "Move to Azure Monitor Agent from the Log Analytics agent", "resourceType": "Arc-enabled servers", "resources": 4 },
        { "severity": "low", "tag": "Security", "title": "Subnets should be associated with a network security group", "resourceType": "Virtual networks", "resources": 1 },
        { "severity": "low", "tag": "Security", "title": "Diagnostic logs in Event Hubs should be enabled", "resourceType": "Event Hubs", "resources": 1 }
      ]
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Cost",
      "subtitle": "Recommendations to reduce spend",
      "items": [],
      "empty": "No cost recommendations"
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Performance",
      "subtitle": "Recommendations to speed things up",
      "items": [],
      "empty": "No performance recommendations"
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
    - **Data as of** 2 Oct 2026, 13:24

    </div>

    ``` chart
    {
      "type": "kpi",
      "tiles": [
        {
          "label": "Checks flagged",
          "value": 15,
          "parts": [
            { "label": "Error", "value": 3, "color": "high" },
            { "label": "Warning", "value": 12, "color": "medium" }
          ]
        },
        {
          "label": "Resources flagged",
          "value": 147,
          "delta": -9, "deltaLabel": "vs last month", "good": "down",
          "note": "128 of them in Fault tolerance"
        },
        {
          "label": "Estimated monthly savings",
          "value": 112.80, "format": "currency", "decimals": 2,
          "note": "From 3 cost optimization checks"
        },
        {
          "label": "Categories with nothing to do",
          "value": 1,
          "note": "Service limits, of 5"
        }
      ]
    }
    ```

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "bar",
      "title": "Checks flagged by category",
      "subtitle": "Trusted Advisor checks, by status",
      "horizontal": true,
      "stacked": true,
      "labels": ["Fault tolerance", "Cost optimization", "Performance", "Operational excellence", "Service limits"],
      "series": [
        { "name": "Error", "color": "high", "data": [2, 0, 1, 0, 0] },
        { "name": "Warning", "color": "medium", "data": [6, 3, 1, 2, 0] }
      ]
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "Resources flagged by category",
      "subtitle": "One check can flag many resources",
      "horizontal": true,
      "labels": ["Fault tolerance", "Cost optimization", "Performance", "Operational excellence", "Service limits"],
      "series": [{ "name": "Resources", "data": [128, 7, 7, 5, 0] }]
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Checks flagged",
      "subtitle": "Errors first, then by the resources each flags",
      "wide": true,
      "countBy": "rows",
      "severities": ["high", "medium"],
      "severityNames": { "high": "Error", "medium": "Warning" },
      "items": [
        { "severity": "error", "tag": "Fault tolerance", "title": "Amazon RDS Multi-AZ", "resourceType": "RDS instances", "resources": 3, "detail": "Single-AZ databases go down with their Availability Zone. Turn on Multi-AZ for production." },
        { "severity": "error", "tag": "Fault tolerance", "title": "Amazon RDS Backups", "resourceType": "RDS instances", "resources": 2 },
        { "severity": "error", "tag": "Performance", "title": "High Utilization Amazon EC2 Instances", "resourceType": "EC2 instances", "resources": 4 },
        { "severity": "warning", "tag": "Fault tolerance", "title": "Amazon EBS Snapshots", "resourceType": "EBS volumes", "resources": 52, "detail": "No snapshot in the last 7 days. Add the volumes to an AWS Backup plan." },
        { "severity": "warning", "tag": "Fault tolerance", "title": "Amazon S3 Bucket Versioning", "resourceType": "S3 buckets", "resources": 41 },
        { "severity": "warning", "tag": "Fault tolerance", "title": "AWS Lambda Functions without Multi-AZ Redundancy", "resourceType": "Lambda functions", "resources": 15 },
        { "severity": "warning", "tag": "Fault tolerance", "title": "Auto Scaling Group Health Check", "resourceType": "Auto Scaling groups", "resources": 12 },
        { "severity": "warning", "tag": "Cost optimization", "title": "Underutilized Amazon EBS Volumes", "resourceType": "EBS volumes", "resources": 3 },
        { "severity": "warning", "tag": "Operational excellence", "title": "Amazon S3 Server Access Logs Enabled", "resourceType": "S3 buckets", "resources": 3 },
        { "severity": "warning", "tag": "Performance", "title": "Amazon EBS Provisioned IOPS (SSD) Volume Attachment Configuration", "resourceType": "EBS volumes", "resources": 3 },
        { "severity": "warning", "tag": "Fault tolerance", "title": "Load Balancer Optimization", "resourceType": "Load balancers", "resources": 2 },
        { "severity": "warning", "tag": "Cost optimization", "title": "Low Utilization Amazon EC2 Instances", "resourceType": "EC2 instances", "resources": 2 },
        { "severity": "warning", "tag": "Cost optimization", "title": "Unassociated Elastic IP Addresses", "resourceType": "Elastic IPs", "resources": 2 },
        { "severity": "warning", "tag": "Operational excellence", "title": "AWS Lambda Functions Using Deprecated Runtimes", "resourceType": "Lambda functions", "resources": 2 },
        { "severity": "warning", "tag": "Fault tolerance", "title": "Amazon EC2 Availability Zone Balance", "resourceType": "EC2 instances", "resources": 1 }
      ],
      "note": "Source: AWS Trusted Advisor. Security checks are on the Security dashboard. Example figures."
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Service limits",
      "subtitle": "Quotas close to their limit",
      "items": [],
      "empty": "No service limits close to their quota"
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Savings from Trusted Advisor",
      "subtitle": "Estimated monthly savings per check",
      "format": "currency",
      "decimals": 2,
      "valueLabel": "a month",
      "items": [
        { "tag": "EC2", "title": "Low Utilization Amazon EC2 Instances", "value": 61.20, "detail": "2 instances under 10% CPU for 14 days. Downsize them, or stop them out of hours." },
        { "tag": "EBS", "title": "Underutilized Amazon EBS Volumes", "value": 42.30, "detail": "3 volumes with almost no reads or writes. Snapshot and delete them, or move gp2 to gp3." },
        { "tag": "EC2", "title": "Unassociated Elastic IP Addresses", "value": 9.30, "detail": "2 addresses attached to nothing. Release them." }
      ]
    }
    ```

    </div>

??? note "What changed from the current dashboard"

    - **One chart for all five categories**, instead of a donut each. Categories line up on one axis, so you can compare them, and a category with nothing to do shows a 0 instead of an empty box.
    - **No single-colour donuts.** High Availability and Operational Excellence each had one recommendation, drawn as a full orange ring.
    - **Impact uses the same reds as severity on the Security dashboard**, darker for worse. The current colours (red, orange, blue) differ from page to page.
    - **One list of recommendations**, worst first, each tagged with its category and the resources it affects, and filterable by impact.
    - **"Nothing to do" is a result.** Cost and Performance show a green check and say so, where the current dashboard shows "0 recommendations" over blank space.
    - **Checks and resources, both.** Fault tolerance flags 8 checks but 128 resources; Performance flags 2 checks and 7 resources. Each measure has its own chart, so one doesn't hide the other.
    - **Trusted Advisor keeps its words**: Error and Warning, in the same colours High and Medium use everywhere else.
    - **Estimated savings** from the cost optimization checks are a tile and a list, with what to do about each.
    - **Service limits with nothing close to a quota** say so, instead of "0 checks flagged" over blank space.
