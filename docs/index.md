---
title: Home
template: home.html
hide:
  - navigation
  - toc

# The home page is built from the settings below; see the "Edit the home page"
# section of the writing guide. Every section is optional: delete one and it
# disappears from the page.

hero:
  logo: true                        # the logo among drifting clouds, on the right
  eyebrow: Six themes · four button styles
  title: Docs that feel alive
  highlight: alive
  text: >-
    A Material for MkDocs site with the Nexus colour system, a theme switcher,
    tactile buttons and motion that respects your settings.
  buttons:
    - text: Get started
      link: getting-started/index.md
      style: primary
    - text: Browse components
      link: components/index.md
  # image: images/home-hero.png     # replaces the logo on the right

features:
  title: Everything you would expect
  text: Write in Markdown, and the site takes care of the rest.
  items:
    - icon: material/palette-swatch-outline
      title: Six colour themes
      text: Meadow, Meadow Dark, Dark, Midnight, Light and Sand, the same palettes as Nexus.
      link: themes.md
    - icon: material/gesture-tap-button
      title: Buttons with character
      text: Primary, soft, outline, ghost, gradient, glow and danger, in four shapes.
      link: components/buttons.md
    - icon: material/motion-outline
      title: Motion, tuned
      text: Theme wipes, ripples and reveal on scroll. Choose Full, Subtle or Off.
      link: themes.md
    - icon: material/contrast-circle
      title: Accessible by default
      text: WCAG-checked contrast, visible focus rings and reduced-motion support.
      link: getting-started/how-it-works.md
    - icon: material/language-markdown-outline
      title: It's just Markdown
      text: Every page is a Markdown file, and the menu builds itself from the folders.
      link: getting-started/index.md#navigation
    - icon: material/devices
      title: Works on every device
      text: Tabs, sidebars and search adapt from phones to wide screens.

highlights:
  title: More than just a static site
  items:
    - icon: material/magnify
      title: Built-in search
      text: >-
        Results appear as you type, with suggestions and highlighted matches,
        and nothing to set up or host.
    - icon: material/code-braces-box
      title: Code that explains itself
      text: >-
        Copy buttons, line highlights and annotations that open right next to
        the line they describe.
      link: components/code-blocks.md
      link_text: See code blocks
    - icon: material/timeline-text-outline
      title: Timelines and roadmaps
      text: >-
        Releases and plans on a spine that fills as you scroll, with coloured
        tags or cards.
      link: components/timeline.md
      link_text: See the timeline

cta:
  title: Ready to write?
  text: Start with the basics, or browse every component with its Markdown.
  buttons:
    - text: Get started
      link: getting-started/index.md
      style: primary
    - text: Pick a theme
      link: themes.md
      icon: material/palette-outline
      style: ghost
---

## Quick start

``` powershell
.venv\Scripts\activate
mkdocs serve
```

Then open <http://127.0.0.1:8000>. Every page, component and theme updates live as you edit.
