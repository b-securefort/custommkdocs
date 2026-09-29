# How it works

Four attributes on `<html>` drive the whole look:

| Attribute           | Values                                                   | Set by |
| ------------------- | -------------------------------------------------------- | ------ |
| `data-theme`        | `meadow` `meadow-dark` `dark` `midnight` `light` `sand`  | header palette, Appearance page |
| `data-button-style` | `rounded` `pill` `sharp` `tactile`                       | Appearance page |
| `data-motion`       | `full` `subtle` `off`                                    | Appearance page |
| `data-nav`          | `collapsed` `expanded`                                   | Appearance page |

A small script in `overrides/main.html` sets them **before the first paint** from `localStorage`, so reloads never flash the wrong theme.

The theme can also be **Auto**, which isn't a palette of its own: `data-theme` gets Meadow or Meadow Dark to match the device's light or dark mode, and switches while the page is open if that setting changes.

## Defaults

What a reader gets before choosing anything is set in one place, `extra.appearance` in `mkdocs.yml`:

```yaml
extra:
  appearance:
    theme: auto              # auto, or any data-theme value above
    auto_light: meadow       # what Auto shows when the device is in light mode
    auto_dark: meadow-dark   # ...and in dark mode
    button_style: tactile
    motion: full             # "off" instead when the device asks for reduced motion
    nav: collapsed
```

"Reset to defaults" on the Appearance page goes back to these too. `mkdocsstaging.yml` can override any one of them. A misspelled value falls back to the built-in choice and logs a warning in the browser console.

Each theme is a block of tokens (`--base-50` … `--base-950`, `--accent`, `--on-accent` and so on). `themes.css` then routes every Material variable through those tokens, so search, navigation, code, admonitions and the footer all follow the theme without any per-component overrides.
