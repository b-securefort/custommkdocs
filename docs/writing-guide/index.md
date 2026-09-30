---
title: Writing guide
---

# Writing guide

How to add and edit pages on this site. Copy the examples and change the text.

!!! tip "Rather not write Markdown by hand?"
    The [page writer](../write.md) is a Markdown editor in your browser with the site's components to hand: drag one in from the sidebar or type `/`, fill it in as Markdown or in its form, and see the page as it will look beside it. It suggests links, icons and placeholders as you type and underlines what the checks find. Then download the page with its images and files as one bundle, which a pipeline turns into a pull request. See [Publish from the page writer](#publish-from-the-page-writer).

    To change a page that's already here, select the pencil at the top of it: the page opens in the writer. Coming from the Azure DevOps wiki? Paste a page in, from the wiki or from Word, and its headings, lists, tables, links and screenshots come across, with the wiki's `[[_TOC_]]`, `::: mermaid` and `> [!NOTE]` turned into this site's syntax. **Ctrl+/** on the writer lists its shortcuts and what's different from the wiki.

## Add a page

The site has two menus:

- **Tabs** across the top, one for each folder of pages directly inside `docs/` (like `getting-started/` and `components/`). Folders without pages, such as `images/` and `files/`, don't get a tab.
- **The left sidebar**, which lists the pages in the folder of the tab you're on.

So a new page usually goes **inside one of those folders**. A file placed directly in `docs/` gets a tab of its own.

1. Create a `.md` file in the right folder. Use lowercase words joined by hyphens: `billing-faq.md`. The folder and filename become the address, so `docs/components/billing-faq.md` is published at `/components/billing-faq/`.
2. Start the file with a title:

    ``` markdown
    # Billing FAQ
    ```

3. That's it. The page appears at the bottom of that tab's sidebar automatically. To put it somewhere else, see [the menu](#the-menu).

## The menu

Each folder has a `.nav.yml` file that sets the order of its sidebar. `docs/.nav.yml` does the same for the tabs across the top.

``` yaml
title: Billing          # the name on the tab
nav:
  - index.md            # the page you land on when you click the tab
  - Invoices:           # a group in the sidebar
      - invoices.md
      - refunds.md
  - faq.md
append_unmatched: true  # keep adding any other pages automatically
```

Pages you don't list still appear, after the listed ones in alphabetical order. That's why a new page shows up without touching `.nav.yml`, and also why **deleting a line from `.nav.yml` doesn't take a page out of the menu**.

### Add to the menu

- **Choose a page's place:** add its filename to the `nav:` list of the `.nav.yml` in the same folder, where you want it. Line each `-` up with the one above it.
- **Group pages:** write a group name ending in `:`, then list the pages under it, indented by four more spaces, like `Invoices:` above. Groups fold open and closed in the sidebar; readers who want them all open can pick *Expanded* under Sidebar on the [Appearance](../appearance.md) page.
- **Rename an entry:** the menu shows the page's `# Title`. To show something shorter, write `- Billing questions: faq.md` instead of `- faq.md`. The page itself keeps its title.
- **Link to another site:** add `- Status page: https://status.example.com`. It appears in the menu like a page.
- **Add a tab:** create a folder in `docs/` with an `index.md` and a `.nav.yml` like the one above, then add the folder's name to `docs/.nav.yml` where the tab should appear. `title:` sets the name on the tab.

If a page ends up at the bottom instead of where you listed it, check the spelling of the filename in `.nav.yml`. A misspelt name is skipped without an error, and the page falls back to the end of the list.

### Remove from the menu

What to do depends on whether the page should still exist:

| You want                                          | Do this |
| ------------------------------------------------- | ------- |
| Keep the page, but out of the menu                | Add `unlisted: true` to its settings, as in [Hide a page](#hide-a-page). Links to it keep working. |
| Keep it on staging only while you work on it      | Add `draft: prod` (see [below](#only-on-staging-or-only-on-production)). |
| Get rid of the page                               | Delete the `.md` file, remove its line from `.nav.yml`, then fix any links to it. |
| Remove a group, but keep its pages                | Delete the group's name and move its pages up a level (take out four spaces). |
| Remove a whole tab                                | Delete the folder, remove its name from `docs/.nav.yml`, then fix any links to its pages. |

To find the links to a deleted page, run `mkdocs build --strict`. It stops and names every page that still points to the missing file.

## Hide a page

Put one of these settings between `---` lines at the very top of the page:

=== "Unlisted"

    ``` markdown
    ---
    unlisted: true
    ---

    # Internal escalation steps
    ```

    The page is published and links to it work, but it is left out of the menu, site search and search engines.

    Unlisted pages are **not private**. Anyone who has or guesses the address can read them, so never use this for confidential information.

=== "Draft"

    ``` markdown
    ---
    draft: true
    ---

    # New pricing (not announced yet)
    ```

    The page only shows in your local preview (`mkdocs serve`) and is never published. Remove the line when it's ready to go live.

### Only on staging or only on production

We publish two copies of the site: **prod**, which readers use, and **staging**, where we review changes first. Instead of `true`, write the environment where the setting should apply:

| Front matter            | Production        | Staging           |
| ----------------------- | ----------------- | ----------------- |
| `draft: prod`           | not published     | published, in menu |
| `unlisted: prod`        | unlisted          | in menu           |
| `unlisted: staging`     | in menu           | unlisted          |
| `draft: true`           | not published     | not published     |

`draft: prod` is the usual way to review a new page on staging before it goes live. Spell the names exactly `prod` and `staging`; anything else stops the build, so a typo can't publish a page by accident.

A hidden page can stay in `.nav.yml`. It keeps its place in the menu wherever it's visible.

## Formatting

| You type                   | You get                    |
| -------------------------- | -------------------------- |
| `**bold**`                 | **bold**                   |
| `*italic*`                 | *italic*                   |
| `==highlight==`            | ==highlight==              |
| `` `code` ``               | `code`                     |
| `++ctrl+c++`               | ++ctrl+c++                 |
| `## Section` on its own line | a section heading (`###` for a smaller one) |
| `- item` on each line      | a bulleted list            |
| `1. step` on each line     | a numbered list            |

Leave an empty line between paragraphs, lists and headings. Most formatting problems come from a missing blank line.

## Links

Written from a page in `docs/components/`:

``` markdown
[Badges](badges.md)                                    <!-- a page in the same folder -->
[Button styles](buttons.md#button-styles)              <!-- a section on another page -->
[How it works](../getting-started/how-it-works.md)     <!-- a page in another folder -->
[Getting started](../getting-started/index.md)         <!-- a folder's main page -->
[Status page](https://status.example.com)              <!-- another website -->
```

- Link to the **`.md` file**, not the web address of the page. The site turns it into the right address, and the build tells you if the file doesn't exist.
- A section's link name is its heading in lowercase with spaces turned into hyphens: `## Reset your password` becomes `#reset-your-password`. You can also click the `¶` next to any heading on the site and copy the address.
- `../` means "go up one folder".

## Images

1. Save the image in a folder of the page's own inside `docs/images/`, named after the page's folder and file: for `docs/billing/invoices.md`, that's `docs/images/billing/invoices/`. Use a lowercase name without spaces, such as `invoice-screen.png`. With a folder per page, two pages can't overwrite each other's `step1.png`.
2. Insert it where you want it, with a short description of what it shows in the square brackets:

    ``` markdown
    ![The invoice screen with the Export button highlighted](../images/billing/invoices/invoice-screen.png)
    ```

    The `../` climbs out of the page's folder to reach `images/`. A page directly in `docs/` leaves it out; a page two folders deep needs `../../`.

3. To limit its width, add `{ width="400" }` straight after the closing bracket.

Older pages keep their images directly in `docs/images/`. They work as they are; there's no need to move them.

Readers can click any image to see it full size. For screenshots of a console, add a frame and a caption as shown on the [screenshots](../components/screenshots.md) page. Architecture diagrams are `.drawio` files, inserted the same way: see [architecture diagrams](../components/architecture-diagrams.md).

## Downloadable files

Put PDFs, spreadsheets and other files in the page's own folder inside `docs/files/`, named the same way as for images, and link to them like a page:

``` markdown
[Download the onboarding checklist (PDF)](../files/billing/invoices/onboarding-checklist.pdf)
```

Say what the file is and what type it is in the link text. The page writer takes PDF, Word, Excel, PowerPoint, Visio, CSV, JSON, YAML, XML, text, zip, draw.io, Bicep and Terraform files, up to 10 MB each (images up to 5 MB). Keep bigger files where they already live, such as SharePoint, and link to them there.

## Callouts

``` markdown
!!! tip "Optional title"
    Indent the text inside by four spaces.
```

!!! tip "Optional title"
    Indent the text inside by four spaces.

Available types: `note`, `tip`, `info`, `success`, `warning`, `danger`, `example`, `question`. Start with `???` instead of `!!!` to make the callout collapsible.

## Buttons and badges

``` markdown
[Get started](../getting-started/index.md){ .md-button .md-button--primary }
[Learn more](../components/index.md){ .md-button }

<span class="badge badge--success">Stable</span>
<span class="badge badge--warning">Beta</span>
```

[Get started](../getting-started/index.md){ .md-button .md-button--primary }
[Learn more](../components/index.md){ .md-button }

<span class="badge badge--success">Stable</span>
<span class="badge badge--warning">Beta</span>

The [Components](../components/index.md) tab shows every style, with the Markdown for each, and [Choosing components](choosing-components.md) says when to use which.

## Content tabs

``` markdown
=== "Windows"

    Steps for Windows, indented by four spaces.

=== "macOS"

    Steps for macOS.
```

## Tables

``` markdown
| Plan     | Price | Users     |
| -------- | ----- | --------- |
| Starter  | Free  | 1         |
| Team     | $20   | Up to 10  |
```

The columns don't need to line up; only the `|` characters and the `---` line matter.

## Edit the home page

The home page is laid out by the site; you only change the text. Everything it shows is in the settings at the top of `docs/index.md`, between the `---` lines:

| Setting      | What it is                                                              |
| ------------ | ----------------------------------------------------------------------- |
| `hero`       | The big banner: `title`, the word(s) in it to colour (`highlight`), a small label above it (`eyebrow`), a sentence (`text`), `buttons`, and on the right either `logo: true` (the site logo among drifting clouds) or an `image`, with an optional label under it (`caption`) |
| `features`   | The grid of cards: a `title`, a sentence under it (`text`), then `items`, each with an `icon`, `title`, `text` and optional `link` |
| `highlights` | Rows that alternate picture and text: `title`, then `items`, each with a `title`, `text`, an `image` (a screenshot works best) or an `icon`, and an optional `link` with `link_text` |
| `cta`        | The closing band: `title`, `text` and `buttons` |

A button looks like this. `style` is optional: `primary`, `soft`, `outline`, `ghost`, `gradient` or `glow`.

``` yaml
buttons:
  - text: Get started
    link: getting-started/index.md
    style: primary
```

Rules that trip people up:

- **Indentation matters.** Use spaces, never tabs, and line each new item's `-` up with the one above it.
- **Links and images work like they do in Markdown**: point at the `.md` file or the image in `docs/`. From the home page no `../` is needed, so write `images/search.png`, not `../images/search.png`.
- **Icons** are written as `material/rocket-launch-outline`. Find one on the [icon search](https://squidfunk.github.io/mkdocs-material/reference/icons-emojis/#search), which shows `:material-rocket-launch-outline:`, then change the first `-` to `/` and drop the colons.
- **Long text** can start with `>-` and continue on the next lines, indented. Put text in quotes if it contains `: ` or starts with a symbol.
- **To remove a section or a field**, delete it; the page leaves it out.

Anything you write below the settings appears as ordinary Markdown between the highlights and the closing band.

A wrong link, image or icon name stops the build with a message naming it.

## Publish from the page writer

The [page writer](../write.md) packs a page into a **bundle**: one `.zip` holding the page, the images and files it uses, and a `manifest.json` that says where each one goes in the repository. It's made in your browser; nothing is uploaded while you write.

1. On the page writer, select **Download bundle (.zip)**.
2. Upload the bundle to the bundles folder in S3. **Add to site** shows the folder, a link to it in the S3 console and an `aws s3 cp` command to copy.
3. Run the **ingest-bundle** pipeline in Azure DevOps, and paste the bundle's key from **Add to site** into **bundleKey**.
4. The pipeline checks the bundle, puts each file in its place, builds the site with `--strict`, and opens a pull request. Once the pull request is approved and merged, the page goes live.

If the run fails, its log says why. The usual reasons:

- **A new page whose file name is taken.** To change that page, open it on the page writer (**Open**, or the pencil at the top of the page itself): it opens as *A change to an existing page*. Otherwise give the new page another file name.
- **A broken link or image.** The build names the page and the link. The page writer underlines most of these as you type, and lists them under **Checks** in its sidebar.
- **Too big.** A bundle can be up to 25 MB. The page writer saves screenshots over 5 MB smaller as you add them.

Each page you write or open on the page writer is a draft of its own, kept in your browser until you delete it: **Drafts and versions**, in its sidebar, switches between them, and keeps earlier versions of each to compare with or go back to. To carry on with a page on another computer, open its bundle on the page writer there: the page, its images and its files all come back. **Add to site** also has a *Do it by hand* tab, for adding the files to the repository yourself with git.

## Check your changes

Run `mkdocs serve` and open <http://127.0.0.1:8000> to see the site update as you save. `mkdocs build --strict` stops with a message if any link or image points to a file that doesn't exist, so run it before publishing.
