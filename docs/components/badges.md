# Badges

<span class="badge">Default</span>
<span class="badge badge--accent">Accent</span>
<span class="badge badge--success">Stable</span>
<span class="badge badge--warning">Beta</span>
<span class="badge badge--danger">Deprecated</span>
<span class="badge badge--accent badge--live">Live</span>

``` markdown
<span class="badge">Default</span>
<span class="badge badge--accent">Accent</span>              <!-- follows the theme -->
<span class="badge badge--success">Stable</span>
<span class="badge badge--warning">Beta</span>
<span class="badge badge--danger">Deprecated</span>
<span class="badge badge--accent badge--live">Live</span>   <!-- pulsing dot -->

**New**{ .badge .badge--accent }                           <!-- attr_list shorthand -->

## Upload API <span class="badge badge--warning">Beta</span> { data-toc-label="Upload API" }
```

Badges work inline in text, table cells and headings. In a heading, `data-toc-label` keeps the badge text out of the table of contents.
