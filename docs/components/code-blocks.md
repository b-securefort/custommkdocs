# Code blocks

``` python title="appearance.py" linenums="1" hl_lines="3"
THEMES = ["meadow", "meadow-dark", "dark", "midnight", "light", "sand"]

def apply(theme: str) -> None:
    """Syntax colours switch between a light and a dark set per theme."""
    print(f"Switched to {theme}")  # (1)!
```

1.  Code annotations, copy buttons and line highlights come from Material and pick up the accent colour.
