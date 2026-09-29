# Your values

Cloud commands are full of values that each reader swaps in: their subscription, resource group, region. List those values in a *Your values* box and readers type theirs once. Every command on the page then shows their values, and the copy button copies them, so a pasted command works first time.

## Your values

=== "Preview"

    <div class="your-values" markdown>

    - `<subscription-id>` Subscription ID
    - `<resource-group>` Resource group name
    - `<location>` Region, such as `westeurope`

    </div>

    ``` bash
    az account set --subscription <subscription-id>
    az group create --name <resource-group> --location <location>
    ```

    Placeholders in inline code change too: `az group show -n <resource-group>`.

=== "Markdown"

    ```` markdown
    <div class="your-values" markdown>

    - `<subscription-id>` Subscription ID
    - `<resource-group>` Resource group name
    - `<location>` Region, such as `westeurope`

    </div>

    ``` bash
    az account set --subscription <subscription-id>
    az group create --name <resource-group> --location <location>
    ```
    ````

Each item in the list is a placeholder in inline code, then its label. Write the placeholder the same way in your code blocks: lowercase words joined by hyphens, inside angle brackets. Only the names listed in the box are filled in, so other text in angle brackets, like HTML or XML, is left alone.

## How it behaves

- **Placeholders stand out** before the reader fills them in, with a dashed underline. After they fill one in, their value stays tinted so they can see which parts of the command came from them.
- **Values carry across pages.** They're saved in the reader's browser under the placeholder's name, so a resource group typed on one page is already filled in on the next page that uses the same placeholder. **Clear** removes them.
- **Code in Markdown blocks is never filled in**, because it's page source, as in the Markdown tab above. To keep other code as written, such as a table that lists placeholder names, wrap it in `<div class="no-values" markdown>`.
- **Without JavaScript**, the box shows as a plain list of the placeholders and what they mean, which still helps.

## Use the same names everywhere

Values only carry across pages when the placeholder names match, so reuse these rather than inventing new ones:

<div class="no-values" markdown>

| Placeholder             | For                                   |
| ----------------------- | ------------------------------------- |
| `<subscription-id>`     | Azure subscription ID                 |
| `<tenant-id>`           | Microsoft Entra tenant ID             |
| `<resource-group>`      | Azure resource group name             |
| `<location>`            | Azure region, such as `westeurope`    |
| `<aws-account-id>`      | 12-digit AWS account ID               |
| `<region>`              | AWS Region, such as `eu-west-1`       |
| `<cluster-name>`        | AKS or EKS cluster name               |
| `<environment>`         | `dev`, `test` or `prod`               |

</div>

!!! security "Never for secrets"
    Values are stored unencrypted in the reader's browser. Don't make placeholders for passwords, keys, connection strings or tokens. Tell the reader where to get the secret instead, for example from Key Vault or Secrets Manager.
