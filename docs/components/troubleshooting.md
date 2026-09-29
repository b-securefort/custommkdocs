# Troubleshooting

Collapsed entries, each with the error as the reader sees it, then its cause and fix. A troubleshooting section, or a whole page of these, scans quickly: readers look down the titles for their error and open only that one.

## Troubleshooting

=== "Preview"

    ??? troubleshoot "`AuthorizationFailed` when creating the resource group"

        Cause
        :   Your account doesn't have a role that allows creating resource groups in this subscription.

        Fix
        :   Ask a subscription owner to give you **Contributor** on the subscription, or to create the resource group and give you **Contributor** on it. Then sign in again:

            ``` bash
            az login
            ```

    ??? troubleshoot "Pods stay in `ImagePullBackOff`"

        Symptom
        :   `kubectl get pods` shows the pods restarting, and `kubectl describe pod` reports `401 Unauthorized` from the registry.

        Cause
        :   The cluster isn't allowed to pull from the container registry.

        Fix
        :   Attach the registry to the cluster:

            ``` bash
            az aks update -n <cluster-name> -g <resource-group> --attach-acr <registry-name>
            ```

=== "Markdown"

    ```` markdown
    ??? troubleshoot "`AuthorizationFailed` when creating the resource group"

        Cause
        :   Your account doesn't have a role that allows creating resource
            groups in this subscription.

        Fix
        :   Ask a subscription owner to give you **Contributor** on the
            subscription, or to create the resource group and give you
            **Contributor** on it. Then sign in again:

            ``` bash
            az login
            ```
    ````

Each entry is a collapsed `troubleshoot` callout holding a definition list: a label on its own line, then the text on the next line, starting with a colon and three spaces. Everything in the entry is indented by four spaces, and anything inside a label's text, like a code block, by eight.

## Writing entries

- **Title it with what the reader sees**: the error code or message, in inline code, and when it happens. Readers search for the exact error text, so write it exactly.
- **Cause, then Fix.** Add **Symptom** first when the title is too short to recognise the problem, as in the second example.
- **One cause per entry.** If an error has two common causes, write two entries with the same error and different "when" parts in the title.
- **Make the fix something to do**, with the command or [UI path](ui-paths.md), not an explanation of the problem.
- **Collapsed by default** (`???`). Start one open with `???+` only when almost everyone hits it.

Put them under a **Troubleshooting** heading at the end of a how-to page. Once there are more than about eight, move them to a page of their own, grouped under headings such as *Sign-in* and *Networking*.
