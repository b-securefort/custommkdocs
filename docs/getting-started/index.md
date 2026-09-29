# Getting started

## Run it

``` powershell
.venv\Scripts\activate
pip install -r requirements.txt     # already installed in .venv
mkdocs serve                        # live preview at http://127.0.0.1:8000
mkdocs build                        # static site in ./site
mkdocs build -f mkdocsstaging.yml   # staging site in ./site-staging
```

## Project layout

``` text
mkdocs.yml                         # Material theme, features, extensions, validation (prod)
mkdocsstaging.yml                  # staging: inherits mkdocs.yml, sets extra.environment
hooks/
  page_visibility.py               # `unlisted` / `draft` front matter, per environment
  front_matter.py                  # resolves and checks front matter links, images, icons
overrides/
  main.html                        # fonts, pre-paint appearance script, banner
  home.html                        # home page layout, filled from docs/index.md front matter
  partials/logo.html               # the logo, green or blue to suit the theme
docs/
  .nav.yml                         # top tabs, in order; every folder can have one
  index.md                         # Home: all content is in its front matter
  getting-started/                 # a folder of pages is a tab; its pages fill the sidebar
  components/
  appearance.md                    # Appearance
  writing-guide/                   # staging only (draft: prod): how the team adds content
  images/  files/                  # team uploads (no pages, so no tab)
  stylesheets/
    themes.css                     # the six palettes + mapping onto Material
    components.css                 # chrome, buttons, cards, home page, motion
  javascripts/
    appearance.js                  # header switcher, Appearance page, effects
```

## Navigation

Top-level folders in `docs/` become the tabs under the header, and the pages inside a folder fill the left sidebar for that tab. The right sidebar lists the headings of the current page.

- Order comes from the `.nav.yml` in each folder. Anything not listed there is added after, alphabetically.
- A `title:` with a list of pages in `.nav.yml` makes a group in the sidebar. See `docs/components/.nav.yml`.
- A folder's `index.md` is the page you land on when you click its tab or section.
- `hide: [navigation]` in a page's front matter removes the left sidebar, as on Home and Appearance.
