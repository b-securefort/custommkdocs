---
# Wide charts need the room: no table of contents on this page.
hide:
  - toc
---

# Security

=== "Azure"

    <div class="chart-context" markdown>

    - **Account** EXAMPLE-AZU-PRD-0001
    - **Subscription** `00000000-0000-0000-0000-000000000001`
    - **Provider** Azure
    - **Environment** Production
    - **Data as of** 2 Oct 2026, 12:17

    </div>

    ``` chart
    {
      "type": "kpi",
      "tiles": [
        {
          "label": "Secure score",
          "value": 30, "format": "percent",
          "delta": 3, "deltaUnit": " pts", "deltaLabel": "vs last week",
          "note": "10 of 33 points",
          "trend": [21, 21, 22, 24, 24, 25, 27, 27, 30]
        },
        {
          "label": "Unhealthy recommendations",
          "value": 50,
          "parts": [
            { "label": "High", "value": 50, "color": "high" },
            { "label": "Medium", "value": 0, "color": "medium" },
            { "label": "Low", "value": 0, "color": "low" }
          ]
        },
        {
          "label": "Defender for Cloud alerts",
          "value": 7,
          "parts": [
            { "label": "High", "value": 0, "color": "high" },
            { "label": "Medium", "value": 7, "color": "medium" },
            { "label": "Low", "value": 0, "color": "low" }
          ]
        },
        {
          "label": "Resources affected",
          "value": 21,
          "delta": -4, "deltaLabel": "vs last week", "good": "down",
          "trend": [29, 28, 28, 27, 26, 25, 25, 23, 21]
        }
      ]
    }
    ```

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "gauge",
      "title": "Secure score",
      "subtitle": "Microsoft Defender for Cloud",
      "value": 30, "max": 100, "format": "percent",
      "caption": "10 of 33 points",
      "bands": [
        { "to": 40, "color": "critical" },
        { "to": 70, "color": "medium" },
        { "color": "accent" }
      ],
      "headline": { "delta": 3, "deltaUnit": " pts", "deltaLabel": "vs last week" }
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "Where the recommendations are",
      "subtitle": "Unhealthy recommendations by resource type",
      "horizontal": true,
      "labels": ["Arc-enabled servers", "SQL Server on Arc", "Storage accounts", "Key vaults"],
      "series": [{ "name": "Recommendations", "data": [28, 12, 6, 4] }]
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Unhealthy recommendations",
      "subtitle": "One row per recommendation, with the resources it affects",
      "wide": true,
      "limit": 5,
      "items": [
        {
          "severity": "high",
          "title": "Windows servers should be configured to use secure communication protocols",
          "resourceType": "Arc-enabled servers",
          "status": "Active",
          "detail": "TLS 1.0 and 1.1 are still enabled. Set the minimum protocol to TLS 1.2 through the machine configuration policy.",
          "resources": ["arc-win-prd-01", "arc-win-prd-02", "arc-win-prd-03", "arc-win-prd-04", "arc-win-prd-05", "arc-win-prd-06", "arc-win-prd-07", "arc-win-prd-08", "arc-win-prd-09", "arc-win-prd-10", "arc-win-prd-11", "arc-win-prd-12", "arc-win-prd-13", "arc-win-prd-14"]
        },
        { "severity": "high", "title": "Machines should have vulnerability findings resolved", "resourceType": "Arc-enabled servers", "status": "Active", "resources": 9 },
        {
          "severity": "high",
          "title": "Minimal set of principals should be members of fixed high impact database roles in SQL databases",
          "resourceType": "SQL Server on Arc",
          "status": "Active",
          "detail": "Remove members of db_owner, db_securityadmin and db_accessadmin who don't need them.",
          "resources": 6
        },
        { "severity": "high", "title": "The database owner information in the database should match the database owner information in the master database", "resourceType": "SQL Server on Arc", "status": "Active", "resources": 6 },
        { "severity": "high", "title": "Storage accounts should restrict network access", "resourceType": "Storage accounts", "status": "Active", "resources": 6 },
        { "severity": "high", "title": "Guest Configuration extension should be installed on machines", "resourceType": "Arc-enabled servers", "status": "Active", "resources": 5 },
        { "severity": "high", "title": "Key vaults should have deletion protection enabled", "resourceType": "Key vaults", "status": "Active", "resources": 4 }
      ],
      "note": "Source: Microsoft Defender for Cloud. Example figures."
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Defender for Cloud alerts",
      "subtitle": "Active security alerts",
      "items": [
        { "severity": "medium", "title": "Suspicious PowerShell activity detected", "resourceType": "Arc-enabled servers", "status": "Active", "resources": 3 },
        { "severity": "medium", "title": "Access from a suspicious IP address", "resourceType": "Storage accounts", "status": "Active", "resources": 2 },
        { "severity": "medium", "title": "Failed logins from an unusual location", "resourceType": "SQL Server on Arc", "status": "Active", "resources": 2 }
      ]
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "Alerts over the last 14 days",
      "subtitle": "New alerts a day, by severity",
      "stacked": true,
      "labels": ["19 Sep", "20 Sep", "21 Sep", "22 Sep", "23 Sep", "24 Sep", "25 Sep", "26 Sep", "27 Sep", "28 Sep", "29 Sep", "30 Sep", "1 Oct", "2 Oct"],
      "series": [
        { "name": "High", "color": "high", "data": [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
        { "name": "Medium", "color": "medium", "data": [1, 0, 0, 2, 1, 0, 0, 1, 0, 0, 2, 1, 1, 2] },
        { "name": "Low", "color": "low", "data": [2, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1] }
      ],
      "note": "Needs alert history, which the current dashboard doesn't fetch."
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
          "label": "Security Hub findings",
          "value": 25,
          "parts": [
            { "label": "Critical", "value": 6, "color": "critical" },
            { "label": "High", "value": 19, "color": "high" },
            { "label": "Medium", "value": 0, "color": "medium" },
            { "label": "Low", "value": 0, "color": "low" }
          ]
        },
        {
          "label": "Inspector vulnerabilities",
          "value": 50,
          "parts": [
            { "label": "Critical", "value": 2, "color": "critical" },
            { "label": "High", "value": 48, "color": "high" },
            { "label": "Medium", "value": 0, "color": "medium" },
            { "label": "Low", "value": 0, "color": "low" }
          ]
        },
        {
          "label": "GuardDuty findings",
          "value": 3,
          "parts": [
            { "label": "High", "value": 2, "color": "high" },
            { "label": "Medium", "value": 1, "color": "medium" },
            { "label": "Low", "value": 0, "color": "low" }
          ]
        },
        {
          "label": "Trusted Advisor security checks",
          "value": 29,
          "parts": [
            { "label": "Error", "value": 10, "color": "high" },
            { "label": "Warning", "value": 19, "color": "medium" }
          ],
          "note": "Details on the Advisor dashboard"
        }
      ]
    }
    ```

    <div class="chart-grid" markdown>

    ``` chart
    {
      "type": "gauge",
      "title": "Security Hub score",
      "subtitle": "AWS Foundational Security Best Practices",
      "value": 71, "max": 100, "format": "percent",
      "caption": "176 of 248 controls passing",
      "bands": [
        { "to": 40, "color": "critical" },
        { "to": 70, "color": "medium" },
        { "color": "accent" }
      ],
      "note": "Needs Security Hub's control status, which the current dashboard doesn't fetch."
    }
    ```

    ``` chart
    {
      "type": "bar",
      "title": "Findings by source",
      "subtitle": "Open findings, by severity",
      "horizontal": true,
      "stacked": true,
      "labels": ["Inspector", "Security Hub", "GuardDuty"],
      "series": [
        { "name": "Critical", "color": "critical", "data": [2, 6, 0] },
        { "name": "High", "color": "high", "data": [48, 19, 2] },
        { "name": "Medium", "color": "medium", "data": [0, 0, 1] },
        { "name": "Low", "color": "low", "data": [0, 0, 0] }
      ]
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Security Hub findings",
      "subtitle": "Failed controls, with the resources they affect",
      "wide": true,
      "limit": 5,
      "items": [
        { "severity": "critical", "title": "[EC2.19] Security groups should not allow unrestricted access to high-risk ports", "resourceType": "Security groups", "status": "Failed", "resources": ["sg-web-prd", "sg-bastion", "sg-legacy-app"], "detail": "Remove 0.0.0.0/0 rules on ports such as 22, 3389 and 3306, or limit them to known address ranges." },
        { "severity": "critical", "title": "[RDS.2] RDS DB instances should prohibit public access", "resourceType": "RDS instances", "status": "Failed", "resources": 2 },
        { "severity": "critical", "title": "[IAM.6] Hardware MFA should be enabled for the root user", "resourceType": "Account", "status": "Failed", "resources": 1 },
        { "severity": "high", "title": "[EC2.8] EC2 instances should use IMDSv2", "resourceType": "EC2 instances", "status": "Failed", "resources": 7 },
        { "severity": "high", "title": "[KMS.4] AWS KMS key rotation should be enabled", "resourceType": "KMS keys", "status": "Failed", "resources": 5 },
        { "severity": "high", "title": "[S3.8] S3 general purpose buckets should block public access", "resourceType": "S3 buckets", "status": "Failed", "resources": 4 },
        { "severity": "high", "title": "[EC2.2] VPC default security groups should not allow inbound or outbound traffic", "resourceType": "Security groups", "status": "Failed", "resources": 2 },
        { "severity": "high", "title": "[CloudTrail.1] CloudTrail should have at least one multi-Region trail", "resourceType": "Account", "status": "Failed", "resources": 1 }
      ],
      "note": "Source: AWS Security Hub. Example figures."
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "Inspector vulnerabilities",
      "subtitle": "By CVE, with the instances and images affected",
      "limit": 4,
      "items": [
        { "severity": "critical", "title": "CVE-2024-6387: OpenSSH remote code execution (regreSSHion)", "resourceType": "EC2 instances", "resources": 2, "detail": "Update openssh-server to a fixed version." },
        { "severity": "high", "title": "CVE-2023-4911: glibc privilege escalation (Looney Tunables)", "resourceType": "EC2 instances", "resources": 14 },
        { "severity": "high", "title": "CVE-2024-2961: glibc iconv buffer overflow", "resourceType": "ECR images", "resources": 11 },
        { "severity": "high", "title": "CVE-2023-44487: HTTP/2 Rapid Reset", "resourceType": "ECR images", "resources": 9 },
        { "severity": "high", "title": "CVE-2024-1086: Linux kernel nf_tables use-after-free", "resourceType": "EC2 instances", "resources": 8 },
        { "severity": "high", "title": "CVE-2023-38545: curl SOCKS5 heap overflow", "resourceType": "ECR images", "resources": 6 }
      ]
    }
    ```

    ``` chart
    {
      "type": "findings",
      "title": "GuardDuty findings",
      "subtitle": "Threats detected",
      "items": [
        { "severity": "high", "title": "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS", "resourceType": "IAM roles", "status": "Active", "resources": 1, "detail": "Credentials from an EC2 instance role were used from outside AWS. Rotate the role's sessions and check the instance." },
        { "severity": "high", "title": "Backdoor:EC2/C&CActivity.B!DNS", "resourceType": "EC2 instances", "status": "Active", "resources": 1 },
        { "severity": "medium", "title": "Recon:EC2/PortProbeUnprotectedPort", "resourceType": "EC2 instances", "status": "Active", "resources": 1 }
      ]
    }
    ```

    </div>

??? note "What changed from the current dashboard"

    - **Four numbers first.** Score, recommendations, alerts and affected resources sit in one row, each with its change since last week where there's history.
    - **No single-colour donuts.** "50 recommendations, all High" was a full red ring; it's now a count with a High · Medium · Low breakdown, zeros included, so "nothing medium" is visible too.
    - **The secure score is a gauge**, coloured by how good it is, with the points underneath. The 10 passed, 23 failed and 33 total said the same thing three times.
    - **One row per recommendation.** The table listed every resource as its own row, so the same recommendation repeated. Rows are grouped with a resource count, sorted worst first, and open to show the resources.
    - **Resource types in words**: "Arc-enabled servers", not `microsoft.hybridcompute`.
    - **Severity filters** above each list, and the same severity colours on every dashboard.
    - **"Response 737ms" is gone.** Readers want to know how fresh the data is, which is in the strip at the top.
    - **Four AWS sources, one comparison.** GuardDuty, Security Hub, Inspector and Trusted Advisor each had a mostly red donut. Each is now a tile with its severity breakdown, and one chart compares the sources side by side.
    - **Security Hub gets a score**, like Azure's secure score, so both clouds open the same way.
    - **Vulnerabilities by CVE**, with the instances and images each affects, instead of one row per finding.
