# Architecture diagrams

Architecture diagrams drawn in draw.io, with the official Azure and AWS icons, shown on the page in draw.io's own viewer. Readers can zoom, open a diagram full screen, and switch between its pages.

## Architecture diagrams

=== "Preview"

    ![A web app on Azure: users reach Front Door, then an Application Gateway in the virtual network, then App Service, which uses SQL Database and Key Vault](../images/diagrams/web-app.drawio)

=== "Markdown"

    ``` markdown
    ![A web app on Azure: users reach Front Door, then an Application Gateway
    in the virtual network, then App Service, which uses SQL Database and
    Key Vault](../images/diagrams/web-app.drawio)
    ```

Insert a diagram like an image, pointing at the `.drawio` file. This file has two pages, Azure and AWS. Readers can switch between them with the arrows in the toolbar, which appears when you point at the diagram.

## One page of a diagram

To show only one page of a multi-page file, add its name with `page`:

=== "Preview"

    ![A web app on AWS: users reach CloudFront, then an Application Load Balancer in the VPC, then ECS on Fargate, which uses RDS and Secrets Manager](../images/diagrams/web-app.drawio){ page="AWS" }

=== "Markdown"

    ``` markdown
    ![A web app on AWS: ...](../images/diagrams/web-app.drawio){ page="AWS" }
    ```

Keeping the Azure and AWS versions of a design as two pages of one file keeps them side by side when someone changes one of them.

## Draw and edit diagrams

1. Save diagrams in `docs/images/diagrams/`, with a lowercase name ending in `.drawio`.
2. Edit them in the [draw.io desktop app](https://www.drawio.com/), or in VS Code with the **Draw.io Integration** extension, which opens `.drawio` files as diagrams.
3. For the official icons, open **More Shapes** in draw.io and turn on the **Azure** and **AWS** libraries.

## Good diagrams

- **Show one idea.** Traffic flow, or network layout, or identity: not all three. About ten boxes at most, as with [Mermaid diagrams](diagrams.md).
- **Label with real names** from the naming standard (`rg-payments-prod-weu-001`), and put address ranges on networks.
- **Solid arrows for traffic, dashed for access** (identities, secrets), and say which in a sentence under the diagram.
- **The alt text says what the diagram shows**, in a sentence, and the page text covers the same ground for readers who can't see it.
- **Mermaid or draw.io?** Use [Mermaid](diagrams.md) for flows, decisions and sequences, where the text is the diagram. Use draw.io when the service icons and the layout carry the meaning.

Diagrams always sit on a white canvas, in dark themes too, because the Azure and AWS icons are drawn for white.

!!! info "The viewer loads from diagrams.net"
    Pages with a diagram load draw.io's viewer from `viewer.diagrams.net`. Readers without internet access see an empty frame. For an offline site, host a copy of the viewer and point `viewer_js` under the `drawio` plugin in `mkdocs.yml` at it.
