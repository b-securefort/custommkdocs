---
# Wide charts need the room: no table of contents on this page.
hide:
  - toc
---

# Dashboards

The Security, Advisor, Cost and Sustainability dashboards, redrawn with the site's [chart components](../components/charts.md). Each page has an **Azure** and an **AWS** tab with the same layout, so a reader switching clouds finds everything in the same place; pick one and every dashboard opens on it. Each page ends with a note on what changed from the current dashboard and why. The figures are examples.

<div class="grid cards" markdown>

-   :material-shield-check-outline:{ .lg .middle } __[Security](security.md)__

    ---

    Secure score, recommendations grouped with the resources they affect, and Defender for Cloud alerts.

-   :material-lightbulb-on-outline:{ .lg .middle } __[Advisor](advisor.md)__

    ---

    Every category on one chart, one list of recommendations worst first, and a clear "nothing to do".

-   :material-currency-usd:{ .lg .middle } __[Cost](cost.md)__

    ---

    Spend with its trend and forecast, daily spend, the services behind it, and what changed.

-   :material-leaf:{ .lg .middle } __[Sustainability](sustainability.md)__

    ---

    Emissions with their change and an honest trend line, by service and by resource.

</div>

## What changes on every dashboard

| The current dashboards | The new ones |
| ---------------------- | ------------ |
| A donut that's all one colour: "50 recommendations, all High" | The count, with a High · Medium · Low breakdown under it, zeros included |
| A donut with 21 slices and a legend to match | Bars sorted by size, the smallest folded into one "other" bar |
| A number on its own | The number, its change since last time, and a small trend line |
| One table row per resource, so recommendations repeat | One row per recommendation, with the resources it affects inside |
| `microsoft.hybridcompute` | Arc-enabled servers |
| Severity colours that differ from page to page | One severity scale, the same everywhere, and always with its name |
| 31.3686 kg; 0.008708 kg per kWh | 31.4 kg; 8.7 g per kWh |
| A trend axis from 24 to 40, with a curve that overshoots | An axis from zero, straight lines, and an average to compare with |
| "0 recommendations" over an empty box | A green check: "No performance recommendations" |
| "Response 737ms" | When the data is from, at the top of the page |
| Kilograms on Azure, metric tonnes on AWS (0.09 MTCO2e) | Kilograms on both, so the same footprint reads the same |
| One donut per AWS security source, almost all red | A tile per source with its severities, and one chart comparing them |
| "8 checks flagged" with "128 resources" in small print | Checks and resources each charted, so neither hides the other |
| "Other" as 85% of a donut | A bar, with a note on what AWS reports separately |
| Regions as slivers of a donut | Emissions outside your main Region flagged as worth a look |

Every chart also has a table view, follows the theme you pick, including dark ones, and works on a phone.

## Building one

A dashboard page is ordinary Markdown:

1. A **context strip** says which account the figures are for, and when they're from:

    ``` markdown
    <div class="chart-context" markdown>

    - **Account** EXAMPLE-AZU-PRD-0001
    - **Provider** Azure
    - **Data as of** 2 Oct 2026, 12:17

    </div>
    ```

2. A row of **stat tiles** (`kpi`), with a breakdown or a trend under each number.
3. **Charts** in a `chart-grid`: see [Chart types](../components/chart-types.md) for each kind and its Markdown.
4. A **findings** list for recommendations and alerts.

To fill them from your APIs rather than the page, give each chart an `id` and pass the figures in with `window.docsCharts.set`, as described in [Live figures](../components/charts.md#live-figures).
