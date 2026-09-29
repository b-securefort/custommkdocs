# Glossary tooltips

Cloud docs are full of abbreviations: AKS, VNet, NSG, SCP, IAM. Every abbreviation in the site glossary shows its meaning when you point at it, on every page, without anyone adding anything to the page.

## Glossary tooltips

=== "Preview"

    Deploy the AKS cluster into the spoke VNet, and let the NSG on its subnet allow only traffic from the ALB. On AWS, an SCP stops any account from turning off CloudTrail.

=== "Markdown"

    ``` markdown
    Deploy the AKS cluster into the spoke VNet, and let the NSG on its subnet
    allow only traffic from the ALB. On AWS, an SCP stops any account from
    turning off CloudTrail.
    ```

Nothing in the text is marked up: the terms come from `includes/abbreviations.md`, which is added to the end of every page when the site is built.

## Add a term

Open `includes/abbreviations.md` in the project's root folder, outside `docs/`, and add a line in alphabetical order:

``` markdown title="includes/abbreviations.md"
*[AKS]: Azure Kubernetes Service
*[NSG]: Network security group (Azure): allow and deny rules for a subnet or network interface
```

- The match is **case-sensitive and whole-word**: `*[VNet]` matches "VNet" but not "vnet" or "VNets".
- Terms are **never matched inside code**, so `az aks create` stays as it is.
- **Say which platform** when a term means something specific on one of them, as in "(Azure)" or "(AWS)".
- **One meaning per term.** If an abbreviation means different things on Azure and AWS (ASG is an application security group on one and an Auto Scaling group on the other), leave it out and write the words in full.

The page reloads with the new term when you save, if `mkdocs serve` is running.
