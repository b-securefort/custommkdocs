# How it works

Three attributes on `<html>` drive the whole look:

| Attribute           | Values                                                   | Set by |
| ------------------- | -------------------------------------------------------- | ------ |
| `data-theme`        | `meadow` `meadow-dark` `dark` `midnight` `light` `sand`  | header palette, Appearance page |
| `data-button-style` | `rounded` `pill` `sharp` `tactile`                       | Appearance page |
| `data-motion`       | `full` `subtle` `off`                                    | Appearance page |

A small script in `overrides/main.html` sets them **before the first paint** from `localStorage`, so reloads never flash the wrong theme. With no saved choice, the theme follows the system light/dark setting (Meadow or Meadow Dark), and motion starts at *Off* when the OS asks for reduced motion.

Each theme is a block of tokens (`--base-50` … `--base-950`, `--accent`, `--on-accent` and so on). `themes.css` then routes every Material variable through those tokens, so search, navigation, code, admonitions and the footer all follow the theme without any per-component overrides.
