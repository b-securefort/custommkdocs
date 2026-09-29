---
applies_to: [azure, aws]
owner: Platform team
last_reviewed: 2026-09-29
---

# Page details

A strip under the title that says which platforms a page covers, who owns it, and when someone last checked that it still works. Cloud consoles and CLIs change every few weeks, so readers need to know how far to trust a page. This page has one: it's the line under the heading above.

## Front matter

=== "Front matter"

    ``` yaml
    ---
    applies_to: [azure, aws]
    owner: Platform team
    last_reviewed: 2026-09-29
    ---
    ```

=== "Overdue"

    <div class="page-info" data-reviewed="2025-01-15" data-review-months="6"><span class="page-info__item page-info__platforms"><span class="page-info__key">Applies to</span><span class="platform platform--azure"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M13.05 4.24 6.56 18.05 2 18l5.09-8.76zm.7 1.09L22 19.76H6.74l9.3-1.66-4.87-5.79z"/></svg>Azure</span></span><span class="page-info__item"><span class="page-info__key">Owner</span>Network team</span><span class="page-info__item page-info__review"><span class="page-info__key">Reviewed</span><time datetime="2025-01-15">15 Jan 2025</time></span></div>

    When the review date is further back than the review period, the strip says so. The check runs in the reader's browser, so a page goes overdue even if the site isn't rebuilt.

Put the keys at the very top of the page's file, between the `---` lines. Every key is optional, and any one of them is enough to show the strip.

| Key             | What to write |
| --------------- | ------------- |
| `applies_to`    | The platforms the page covers: `azure`, `aws` or `gcp`, as a list in square brackets. Leave it out for pages that apply everywhere. |
| `owner`         | The team to ask about the page, who also keeps it up to date. A team, not a person, so it survives people moving on. |
| `last_reviewed` | The date you last followed the page end to end and it worked, written `YYYY-MM-DD`. |
| `review_every`  | How many months until the page is due for review again. Without it, the page uses `review_months` in `mkdocs.yml` (6). |

## When to update the date

Change `last_reviewed` only when you've checked the whole page against the real console or CLI: run the commands, follow the click paths, compare the screenshots. Fixing a typo isn't a review.

For pages about fast-moving services, such as anything in preview, set `review_every: 3`. For stable reference pages, like naming standards, `review_every: 12` is fine.

A typo in a platform name, or a date the build can't read, fails `mkdocs build --strict`, so a mistake doesn't publish quietly.
