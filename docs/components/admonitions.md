# Admonitions

!!! note "Note"
    Neutral card with colour only on the leading edge, so a page full of callouts doesn't turn into a rainbow.

!!! tip "Tip"
    Admonitions below the fold fade in as you reach them.

!!! warning "Warning"
    Semantic colours stay put across themes, so a warning always looks like a warning.

??? example "Collapsible example"
    Details blocks use the same styling and gain a soft shadow when open.

## Cloud callouts

Four extra types for platform documentation. Each has its own icon and colour, so readers learn to spot them.

=== "Preview"

    !!! permissions "You need Contributor on the resource group"
        Or **Owner** on the subscription. To check, open **Access control (IAM) > Check access**{ .ui-path }.

    !!! cost "This creates billable resources"
        About 180 EUR a month at the sizes below. Delete the resource group when you're done testing.

    !!! security "Keep the storage account private"
        Public network access stays **Disabled**. Reach it through the private endpoint.

    !!! preview "In public preview"
        No SLA, and the settings may change before general availability. Don't use it in production.

=== "Markdown"

    ``` markdown
    !!! permissions "You need Contributor on the resource group"
        Or **Owner** on the subscription. To check, open
        **Access control (IAM) > Check access**{ .ui-path }.

    !!! cost "This creates billable resources"
        About 180 EUR a month at the sizes below. Delete the resource
        group when you're done testing.

    !!! security "Keep the storage account private"
        Public network access stays **Disabled**. Reach it through the
        private endpoint.

    !!! preview "In public preview"
        No SLA, and the settings may change before general
        availability. Don't use it in production.
    ```

| Type          | Use it for |
| ------------- | ---------- |
| `permissions` | The roles or policies the reader needs, before a procedure starts. Name the role and the scope: "Contributor on the resource group". |
| `cost`        | Anything that creates billable resources, with a rough monthly figure if you have one |
| `security`    | Security guidance: network exposure, secrets, identity. Keep `danger` for data loss and things that can't be undone. |
| `preview`     | A feature that isn't generally available yet. Pair it with a <span class="badge badge--warning">Preview</span> badge in the heading. |

There's a fifth type, `troubleshoot`, for [troubleshooting entries](troubleshooting.md).
