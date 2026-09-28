# Add your own theme

1. In `themes.css`, copy a theme block and change the values. If it's a dark theme, add its selector to the dark-mode group so it gets dark shadows and syntax colours.
2. In `appearance.js`, add an entry to `THEMES` with a label, a description and the two swatch colours.
3. In `overrides/main.html`, add the id to the pre-paint list.

!!! tip "Contrast"
    Text on a solid button uses `--on-accent`. If your accent is light (like `#86bc25`), set `--on-accent: #000000` instead of darkening the brand colour. Meadow Dark does exactly this.
