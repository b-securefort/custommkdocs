# Code blocks

``` python title="appearance.py" linenums="1" hl_lines="3"
THEMES = ["meadow", "meadow-dark", "dark", "midnight", "light", "sand"]

def apply(theme: str) -> None:
    """Syntax colours switch between a light and a dark set per theme."""
    print(f"Switched to {theme}")  # (1)!
```

1.  Code annotations, copy buttons and line highlights come from Material and pick up the accent colour.

## Command output

What the reader should see after running a command, set apart from the command itself: a dashed edge, an *Output* tag, and no copy button, because nobody needs to copy output.

=== "Preview"

    ``` bash
    az group list --query "[].{name:name, location:location}" -o table
    ```

    ``` { .text .output }
    Name                      Location
    ------------------------  ----------
    rg-payments-prod-weu-001  westeurope
    rg-network-hub-weu-001    westeurope
    ```

=== "Markdown"

    ```` markdown
    ``` bash
    az group list --query "[].{name:name, location:location}" -o table
    ```

    ``` { .text .output }
    Name                      Location
    ------------------------  ----------
    rg-payments-prod-weu-001  westeurope
    rg-network-hub-weu-001    westeurope
    ```
    ````

Put `{ .text .output }` after the opening fence, in place of the language. For JSON output, use `{ .json .output }` to keep the colours. A title replaces the *Output* tag: `{ .text .output title="Expected output" }`.

Show only the lines that tell the reader it worked, and cut the rest with a `...` line. IDs and timestamps will differ on every run, so say which parts can change.
