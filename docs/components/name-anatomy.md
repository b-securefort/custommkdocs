# Name anatomy

A resource name broken into its parts, each in its own colour and matched to what it means. Made for naming standards. Point at a part, or at its meaning in the list, to highlight both.

## Name anatomy

=== "Preview"

    <div class="anatomy" markdown>

    `rg-payments-prod-weu-001`

    rg
    :   **Type.** The resource type's short name: `rg` for a resource group, `vnet` for a virtual network, `kv` for a key vault.

    payments
    :   **Workload.** The application or service. Up to 12 lowercase letters.

    prod
    :   **Environment.** `dev`, `test` or `prod`.

    weu
    :   **Region.** Three letters: `weu` for West Europe, `neu` for North Europe.

    001
    :   **Instance.** Three digits, starting at `001`.

    </div>

=== "Markdown"

    ``` markdown
    <div class="anatomy" markdown>

    `rg-payments-prod-weu-001`

    rg
    :   **Type.** The resource type's short name: `rg` for a resource group,
        `vnet` for a virtual network, `kv` for a key vault.

    payments
    :   **Workload.** The application or service. Up to 12 lowercase letters.

    prod
    :   **Environment.** `dev`, `test` or `prod`.

    weu
    :   **Region.** Three letters: `weu` for West Europe, `neu` for North Europe.

    001
    :   **Instance.** Three digits, starting at `001`.

    </div>
    ```

Inside the `<div>`, write an example name in inline code, then a definition list with one term for each part of the name. The build splits the name at `-`, `_`, `.`, `/` and `:`, and matches each part to the term with the same text. The bold words at the start of each meaning become the label under that part of the name.

A term that doesn't appear in the name fails `mkdocs build --strict`, which catches typos.

## A pattern instead of an example

To show the pattern rather than one name, use placeholders in angle brackets, in inline code in the terms too:

<div class="anatomy" markdown>

`<account>-<workload>-<env>-<region>-logs`

`<account>`
:   **Account.** The AWS account alias, such as `acme`.

`<workload>`
:   **Workload.** The application or service.

`<env>`
:   **Environment.** `dev`, `test` or `prod`.

`<region>`
:   **Region.** The Region code without hyphens, such as `euw1` for `eu-west-1`.

logs
:   **Purpose.** What the bucket holds.

</div>

## Tips

- **Show a real example first** and the pattern after it, if you need both. Most readers understand an example faster.
- Up to six parts get their own colour. Past six, the colours repeat.
- For a table of every resource type's short name, use a [table](tables.md) below the anatomy.
