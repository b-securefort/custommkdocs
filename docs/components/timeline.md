# Timeline

Scroll slowly through these: the spine fills as you go and each node lights up when it's reached.

## Coloured tags

=== "Preview"

    <div class="timeline" markdown>

    v1.0 { .orange }
    :   First public release with **Markdown pages**, search and a single light theme.

    v2.0 { .blue }
    :   Added **dark mode** and a redesigned navigation sidebar.

    v3.0 { .green }
    :   Introduced **six colour themes**, button styles and motion settings.

    Next { .accent }
    :   Versioned docs and a public component gallery.

    </div>

=== "Markdown"

    ``` markdown
    <div class="timeline" markdown>

    v1.0 { .orange }
    :   First public release with **Markdown pages**, search and a single light theme.

    v2.0 { .blue }
    :   Added **dark mode** and a redesigned navigation sidebar.

    v3.0 { .green }
    :   Introduced **six colour themes**, button styles and motion settings.

    Next { .accent }
    :   Versioned docs and a public component gallery.

    </div>
    ```

The date goes on its own line, and the entry follows on a line starting with `:` plus three spaces. Tag colours: `.accent` (the default, follows the theme), `.alt`, `.orange`, `.blue`, `.green`, `.teal`, `.violet`, `.pink`, `.red` and `.grey`.

## Cards with automatic colours

=== "Preview"

    <div class="timeline timeline--cards timeline--rainbow" markdown>

    Q1 2024
    :   **Discovery.** Interviewed twelve teams and mapped their deployment pipelines.

    Q3 2024
    :   **Pilot.** Two teams moved to the shared platform, with deploys going from days to minutes.

    Q1 2025
    :   **Rollout.** Every product team onboarded, with self-service environments.

        Entries can hold several paragraphs, lists or code.

    Q4 2025
    :   **Scale.** Multi-region, with automated cost reporting.

    </div>

=== "Markdown"

    ``` markdown
    <div class="timeline timeline--cards timeline--rainbow" markdown>

    Q1 2024
    :   **Discovery.** Interviewed twelve teams and mapped their deployment pipelines.

    Q3 2024
    :   **Pilot.** Two teams moved to the shared platform, with deploys going from days to minutes.

    </div>
    ```

`timeline--cards` puts each entry in a card, and `timeline--rainbow` cycles orange, blue, green and violet tags. A colour class on a single tag still overrides the rainbow.
