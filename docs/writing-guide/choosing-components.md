# Choosing components

Every component on this site pulls the eye, and most of them move: cards, callouts and timeline entries fade in as the reader scrolls. A page reads best when most of it is plain text and each component appears only where it does a job the text can't. Choose a component for what the reader is trying to do, not for how it looks.

## Start from what the reader needs

| The reader wants to…                       | Use                                                   | Rather than |
| ------------------------------------------ | ----------------------------------------------------- | ----------- |
| Follow steps in order                      | [Steps](../components/steps.md), or a numbered list for a short sequence | A timeline or cards, which don't read as steps |
| Pick their own version: OS, language, tool | [Content tabs](../components/content-tabs.md)                       | A heading for each version |
| Not miss something that could hurt them    | A `warning` or `danger` [admonition](../components/admonitions.md)  | Bold text in a paragraph |
| Skip detail they may not need              | A collapsible `???` admonition                        | A long page they scroll past |
| Compare options on the same points         | A [table](../components/tables.md)                                  | A paragraph for each option |
| Choose where to go next                    | [Cards](../components/cards.md)                                     | A bulleted list of links |
| Take the one action the page is about      | A primary [button](../components/buttons.md)                        | A link at the end of a sentence |
| See what changed over time                 | A [timeline](../components/timeline.md)                             | A numbered list |
| Know whether something is ready to use     | A [badge](../components/badges.md)                                  | "(beta)" in brackets |
| See how parts connect or a decision flows  | A [diagram](../components/diagrams.md)                              | A paragraph describing the arrows |
| Copy something into a terminal or file     | A [code block](../components/code-blocks.md)                        | Inline `code` |
| Run a command with their own names and IDs | Placeholders and a [Your values](../components/your-values.md) box   | "Replace MY_RG with your resource group" |
| Find something in a console                | A [UI path](../components/ui-paths.md)                              | "Go to Resource groups, then click Create" |
| Know they have the access a task needs     | A `permissions` [callout](../components/admonitions.md#cloud-callouts) before the steps | Finding out at step 6 |
| Know a step costs money                    | A `cost` [callout](../components/admonitions.md#cloud-callouts)     | A note at the end |
| Know whether a page applies to them, and is current | [Page details](../components/page-details.md) in the front matter | "Last updated" in the text |
| See how cloud services fit together        | An [architecture diagram](../components/architecture-diagrams.md)   | A screenshot of a slide |
| Check they're in the right place           | A [screenshot](../components/screenshots.md)                        | A screenshot instead of the instructions |
| Check a command worked                     | A [command output](../components/code-blocks.md#command-output) block | Output pasted into the command's block |
| Fix an error they've hit                   | A [troubleshooting](../components/troubleshooting.md) entry         | A FAQ written as prose |
| Build or decode a resource name            | A [name anatomy](../components/name-anatomy.md)                     | A paragraph listing the parts |
| See figures: findings, scores, spend, emissions | A [chart](../components/charts.md), or a `kpi` tile for a single number | A screenshot of a portal dashboard |

When nothing in the table fits, write a paragraph. It's always an option, and usually the best one.

## Buttons

A button says "this is what to do next". Keep them for real next steps: getting started, downloading, opening a tool. A link inside a sentence stays a plain link.

### Which variant

| Variant                      | Use it for                                                                 | Example |
| ---------------------------- | -------------------------------------------------------------------------- | ------- |
| Primary                      | The main action in a section. One per screen.                              | Get started |
| Secondary (no variant class) | An alternative next to a primary                                           | Learn more |
| Outline                      | A second choice that matters almost as much as the primary                 | View source |
| Soft                         | Actions inside content, such as in cards, or a row of equal choices where none leads | Download PDF |
| Ghost                        | The least important action                                                 | Skip this step |
| Gradient or Glow             | The home page and launch pages, once per page. Pick one of the two, not both. | Try the beta |
| Danger                       | A step that deletes something or can't be undone. Put a `danger` admonition next to it saying what happens. | Delete workspace |

Pair one strong button with one quiet one. Two strong buttons side by side compete, and the reader can't tell which to press.

<div class="grid grid--2" markdown>
<div class="card" markdown>
:material-check: **Do:** one lead, one quieter

<div class="button-row" markdown>
[Get started](#which-variant){ .md-button .md-button--primary } [Learn more](#which-variant){ .md-button .md-button--ghost }
</div>
</div>
<div class="card" markdown>
:material-close: **Avoid:** everything shouting

<div class="button-row" markdown>
[Get started](#which-variant){ .md-button .md-button--primary } [Try the beta](#which-variant){ .md-button .md-button--gradient } [Join](#which-variant){ .md-button .md-button--glow }
</div>
</div>
</div>

### Size, icons and states

- **Size.** Use the default almost everywhere. `.md-button--sm` suits tables, crowded cards and button groups. Keep `.md-button--lg` for a single button standing on its own, like the last thing on a landing page. `.md-button--block` stretches a button across its container, which works at the bottom of a card.
- **Icons.** A trailing arrow (`:material-arrow-right:`) means "go on to the next thing", and nudges forward on hover. A leading icon names the action, such as download or deploy. Icon-only buttons are for symbols everyone knows, like a cog for settings, and always need an `aria-label`.
- **Loading and disabled** are for showing what a control looks like in the product. A disabled button can't be clicked, so don't use one to mean "coming soon". Write that in the text, or add a badge.

### Rows, groups and toggles

| Layout                  | Use it for |
| ----------------------- | ---------- |
| `button-row`            | Two or three separate actions, spaced apart |
| `button-group`          | A set of closely related actions joined together, such as Edit and Share, or the v1, v2 and v3 downloads |
| `button-group--toggle`  | Showing a segmented control from a product's interface. Clicking only changes which segment looks pressed; no content changes. To let readers switch content, use [content tabs](#content-tabs). |

### Button style is the reader's choice

Rounded, Pill, Sharp and Tactile are chosen by each reader on the [Appearance](../appearance.md) page. Don't set `data-button-style` on a page, except to preview the styles as the [buttons page](../components/buttons.md#button-styles) does.

## Badges

Badge colours carry meaning, so use the same word in the same colour on every page.

| Badge                                                      | Meaning                    | Words to use |
| ---------------------------------------------------------- | -------------------------- | ------------ |
| <span class="badge">Default</span>                         | A neutral fact             | Version numbers, plan names, Optional |
| <span class="badge badge--accent">Accent</span>            | Something new              | New, Updated |
| <span class="badge badge--success">Success</span>          | Safe to rely on            | Stable, Supported |
| <span class="badge badge--warning">Warning</span>          | Usable, but may change     | Beta, Preview, Experimental |
| <span class="badge badge--danger">Danger</span>            | Going away, or breaking    | Deprecated, Removed, Breaking |
| <span class="badge badge--accent badge--live">Live</span>  | Happening right now        | Live, In progress. One per page at most: its dot pulses. |

- Put a badge after a heading (with `data-toc-label`, as the [badges page](../components/badges.md) shows), in a status column of a table, or straight after the name it describes.
- One or two words, and one badge per heading.
- Badges aren't for emphasis. Use **bold** for that.

## Cards

Cards are doors, not rooms. Each one points somewhere and says in a sentence or two what's there. Use them for section landing pages like [Components](../components/index.md), for "where next" at the end of a page, and for an overview of features that each have their own page.

- Three or four cards to a grid, six at most. For two cards, or cards with more text, add `grid--2`: `<div class="grid cards grid--2" markdown>`.
- Keep them parallel: every card has an icon, a linked title and about the same amount of text. One long card makes the others look empty.
- A single card is only a box. Write a paragraph instead.
- Don't put steps in cards. The grid wraps differently on each screen size, so the order gets lost. Use [steps](#steps).
- To set content side by side that isn't a link, such as two options or a do and a don't, use a plain `grid` of `card` blocks, as in the [button example](#which-variant) above.

## Steps

Steps are the numbered procedure a page is about: set something up, publish a page, rotate a key. They look like the timeline, but underneath they're a numbered list, so they number themselves and screen readers announce "list, 5 items".

- **Steps or a plain numbered list?** Use steps for the main procedure, where each step has a sentence or more and often a code block. Use a plain numbered list for short sequences, like three clicks in a menu, and for sub-steps inside a step.
- **One procedure per block.** If the page has two procedures, give each its own heading and its own steps block.
- **Start each step with the action in bold**, such as **Install the tools.**, so readers can skim down the spine.
- **Indent everything inside a step** by four spaces: code, tabs and callouts. Anything that isn't indented ends the list, and numbering starts again at 1.

## Timeline

A timeline is for things tied to dates: release history, a roadmap, the phases of a migration. Three to eight entries reads well. For a full changelog, put a timeline at the top as the summary and a heading for each release below it.

- **Not for how-to steps.** Use [steps](#steps) instead: they look much the same, number themselves, and the spine doesn't fill as you scroll, which on a how-to page would look like steps already done.
- **Plain or cards.** Use plain entries for one line each, and `timeline--cards` when entries have several sentences, a list or code.
- **Colours.** Either give the tag colours a meaning and keep to it, or use `timeline--rainbow` when the colours only separate entries. Don't mix the two: readers look for a meaning that isn't there.

=== "Preview"

    <div class="timeline" markdown>

    v2.0 { .green }
    :   **Released.** Dark mode and the new sidebar.

    v2.1 { .accent }
    :   **In progress.** Offline search.

    v3.0 { .grey }
    :   **Planned.** Versioned docs.

    </div>

=== "Markdown"

    ``` markdown
    <div class="timeline" markdown>

    v2.0 { .green }
    :   **Released.** Dark mode and the new sidebar.

    v2.1 { .accent }
    :   **In progress.** Offline search.

    v3.0 { .grey }
    :   **Planned.** Versioned docs.

    </div>
    ```

Here green means released, grey means planned, and the accent marks the one the team is on now.

## Admonitions

| Type       | Use it for |
| ---------- | ---------- |
| `note`     | Background worth knowing, though the page works without it |
| `info`     | Where or when something applies: "Only on staging", "Needs admin rights" |
| `tip`      | A faster or better way |
| `success`  | What the reader should see when a step has worked |
| `warning`  | Something that will cost time or catch the reader out |
| `danger`   | Data loss, security, or anything that can't be undone |
| `example`  | A worked example |
| `question` | A common question, usually collapsed |

- **Give it a title that makes the point**, such as `!!! warning "Back up the database first"`, not just "Warning". Many readers only read the title.
- **Instructions go in the text.** A callout holds what sits beside them, and readers used to other docs skip boxes.
- **Space them out.** Never two in a row, and no more than two or three on one screen. When everything is a callout, nothing stands out.
- **Collapse what's optional.** `???` starts closed, for troubleshooting, full log output or background reading. `???+` starts open, for something most readers want but some will skip.

## Content tabs

Content tabs hold one piece of content in versions where each reader needs only one: operating system, language, package manager, or Preview and Markdown as on this page.

- **Use the same labels everywhere.** Tabs with the same label switch together, so a reader who picks "macOS / Linux" once sees it everywhere. "macOS / Linux" on one page and "Mac" on another breaks that.
- **Short labels, five tabs at most.**
- **If a reader needs to read every tab, it isn't a tab set.** Use headings.
- **Keep what applies to everyone outside the tabs**, before or after them.

## Tables

Tables compare things on the same points, or list settings and options for looking up.

- Put the thing being looked up in the first column.
- Keep cells short. If a cell needs a paragraph, use headings or a definition list instead.
- A status column of badges scans faster than words.
- Four or five columns at most. Wider tables scroll sideways on phones.

## Code blocks

- Anything the reader types or copies goes in a code block, so they get a copy button. Names of files, settings and values inside a sentence go in inline `code`.
- Always name the language after the opening fence, so the code is coloured.
- Add `title="mkdocs.yml"` when the reader needs to know which file the code goes in.
- Use `hl_lines` to point at the line that matters in a longer block.
- Use annotations (`# (1)!`) to explain a line without breaking the block apart.
- Add `linenums` only when the text refers to line numbers.
- Keyboard shortcuts go in `++ctrl+k++`, which draws the keys, not in code.

## Diagrams

A Mermaid diagram earns its place when relationships are easier to see than to read: a flow, a decision, a sequence of calls, how services connect.

- About ten boxes at most. Past that, split it into two or leave out detail.
- Introduce it with a sentence, and make sure the text still makes sense to someone who can't see the diagram.
- To show what a screen looks like, use a screenshot. To show how something works, use a diagram.

## Text formatting

| Format                          | Use it for |
| ------------------------------- | ---------- |
| `**bold**`                      | Names of buttons and menus the reader clicks, and a key term where it's first explained. Never whole sentences. |
| `*italic*`                      | Option values, like motion *Off* |
| `==highlight==`                 | The one phrase on a page the reader mustn't miss. Rarely. |
| `^^insert^^` and `~~delete~~`   | Showing what changed between two versions of some text |
| `++ctrl+c++`                    | Keyboard shortcuts |
| `- [ ] item`                    | Checklists, such as prerequisites. Readers can't tick the boxes. |
| `[^1]`                          | Footnotes: sources, and asides that would break up a sentence |
| A term, then `:   meaning`      | A glossary (a definition list) |

## Cloud docs

The components for Azure and AWS pages, and when each one earns its place.

- **Page details on every how-to and reference page.** Set `applies_to`, `owner` and `last_reviewed` in the front matter. Leave them off landing pages.
- **A permissions callout before the first step**, naming the role and the scope: "Contributor on the resource group". Add a `cost` callout next to it when the steps create anything billable.
- **One Your values box per page, before the first command**, listing only the placeholders that page uses. Use the [standard names](../components/your-values.md#use-the-same-names-everywhere) so values carry across pages, and never make a placeholder for a secret.
- **Portal, CLI, IaC as content tabs.** Keep the tab labels identical everywhere so a reader's pick sticks: *Portal*, *Azure CLI*, *PowerShell*, *Bicep*, *Terraform* for Azure; *Console*, *AWS CLI*, *CloudFormation*, *Terraform* for AWS. In the Portal tab, write each step with a UI path.
- **Screenshots confirm, they don't instruct.** Every step is in the text; a screenshot shows the reader they're in the right place. Hide IDs and names before saving one.
- **Show the output that proves it worked**, in an output block straight after the command, and say which parts will differ.
- **Glossary, not definitions in every page.** Add an abbreviation to `includes/abbreviations.md` once, rather than spelling it out on each page.
- **A `security` callout is for security guidance**, like network exposure or secrets. `danger` stays for data loss and things that can't be undone.
- **`preview` callouts pair with a Preview badge** in the heading, and pages about preview features set `review_every: 3`.

## Page recipes

Most pages are one of these shapes. Pick yours and fill it in.

=== "How-to"

    1. A sentence saying what the reader will have at the end.
    2. Prerequisites as a task list, or an `info` callout if there's only one.
    3. The procedure as [steps](../components/steps.md), with a code block for each command and content tabs where the steps differ by system.
    4. A `success` callout saying what they should see now.
    5. Troubleshooting in collapsed `???` callouts.
    6. One primary button, or a few cards, for what to do next.

=== "Cloud how-to"

    1. Front matter with `applies_to`, `owner` and `last_reviewed`.
    2. A sentence saying what the reader will have at the end.
    3. A `permissions` callout naming the role and scope, and a `cost` callout if anything billable is created.
    4. A Your values box with the placeholders the page uses.
    5. The procedure as [steps](../components/steps.md), with Portal / CLI / IaC content tabs where the methods differ, a UI path for each portal step, and a code block for each command.
    6. An output block, or a `success` callout, showing what they should see now.
    7. An architecture diagram, if the page builds more than two or three resources.
    8. Troubleshooting entries at the end, collapsed.

=== "Section landing"

    1. Two sentences on what the section covers.
    2. A grid of cards, one for each page or group.
    3. Optionally, a quick-reference code block for what people come back for.

=== "Reference"

    1. A sentence on what's listed.
    2. Tables, with a badge column for status.
    3. A short code example for each group.
    4. A heading for each setting or command that people look up on its own, so they can link to it.

=== "Release notes"

    1. A timeline summarising the releases, with tag colours that mean something.
    2. A heading for each release below it, with a badge in the heading.
    3. A `danger` callout for each breaking change.

=== "Launch page"

    1. A badge such as <span class="badge badge--accent">New</span> in the heading.
    2. One gradient or glow button: this and the home page are the only places for them.
    3. Cards for the highlights, each linking to its page.

## Before you publish

- [ ] Read the page skipping every box, badge and button. It still makes sense.
- [ ] No more than one primary button on screen at a time.
- [ ] No two callouts back to back.
- [ ] Badge words and colours match the [badges table](#badges).
- [ ] Tab labels match the ones used on other pages.
- [ ] Cloud pages have `applies_to`, `owner` and a `last_reviewed` date from a real run-through.
- [ ] No subscription IDs, account IDs, tenant names or email addresses in screenshots or examples.
- [ ] Every placeholder in the code is listed in the page's Your values box.
- [ ] Every image has alt text saying what it shows, and every attached file is linked from the page.
- [ ] Checked in one light theme, one dark theme, and with motion set to *Off*, from the [Appearance](../appearance.md) page.
