# UI paths

A click path through a console, such as the Azure portal or the AWS Management Console, written as one line with chevrons between the parts.

## UI paths

=== "Preview"

    In the portal, go to **Home > Resource groups > Create**{ .ui-path }.

    Open **Services > IAM > Roles > Create role**{ .ui-path } in the AWS console.

=== "Markdown"

    ``` markdown
    In the portal, go to **Home > Resource groups > Create**{ .ui-path }.

    Open **Services > IAM > Roles > Create role**{ .ui-path } in the AWS console.
    ```

Write the path in bold, with ` > ` (a space on each side) between the parts, and add `{ .ui-path }` straight after the closing asterisks. The build swaps each `>` for a chevron. If the class is missing, it still reads as bold text with `>` between the parts, the way the rest of the site writes names of things to click.

## Writing good paths

- **Copy each label exactly** as it appears on screen, including capitals: **Access control (IAM)**, not "IAM settings".
- **Start where the reader already is.** Begin from a place everyone can find, such as **Home** or the search box. If the reader is already on the resource, start from there: **Settings > Networking**{ .ui-path }.
- **Keep it short.** Five parts at most. For a longer route, split it into [steps](steps.md).
- **Only things the reader clicks.** Values they type or choose go in the sentence, in code: "set **Region** to `West Europe`".
- **Consoles change their menus often.** Next to an important path, add a [screenshot](screenshots.md) or the equivalent CLI command in a [content tab](content-tabs.md), so readers have a second route.
