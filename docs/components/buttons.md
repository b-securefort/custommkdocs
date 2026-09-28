# Buttons

Buttons are ordinary Markdown links with classes added through `attr_list`. Hover them, press them, and tab to them with the keyboard.

## Variants

=== "Preview"

    <div class="button-row" markdown>
    [Primary](#variants){ .md-button .md-button--primary }
    [Secondary](#variants){ .md-button }
    [Soft](#variants){ .md-button .md-button--soft }
    [Outline](#variants){ .md-button .md-button--outline }
    [Ghost](#variants){ .md-button .md-button--ghost }
    [Gradient](#variants){ .md-button .md-button--gradient }
    [Glow](#variants){ .md-button .md-button--glow }
    [Danger](#variants){ .md-button .md-button--danger }
    </div>

=== "Markdown"

    ``` markdown
    [Primary](#){ .md-button .md-button--primary }
    [Secondary](#){ .md-button }
    [Soft](#){ .md-button .md-button--soft }
    [Outline](#){ .md-button .md-button--outline }
    [Ghost](#){ .md-button .md-button--ghost }
    [Gradient](#){ .md-button .md-button--gradient }
    [Glow](#){ .md-button .md-button--glow }
    [Danger](#){ .md-button .md-button--danger }
    ```

## Sizes, icons and states

=== "Preview"

    <div class="button-row" markdown>
    [Small](#sizes-icons-and-states){ .md-button .md-button--primary .md-button--sm }
    [Default](#sizes-icons-and-states){ .md-button .md-button--primary }
    [Large](#sizes-icons-and-states){ .md-button .md-button--primary .md-button--lg }
    [:material-rocket-launch-outline: Deploy](#sizes-icons-and-states){ .md-button .md-button--soft }
    [Continue :material-arrow-right:](#sizes-icons-and-states){ .md-button }
    [:material-cog-outline:](#sizes-icons-and-states){ .md-button .md-button--icon title="Settings" aria-label="Settings" }
    [Saving](#sizes-icons-and-states){ .md-button .md-button--primary .md-button--loading aria-busy="true" }
    [Disabled](#sizes-icons-and-states){ .md-button .md-button--disabled aria-disabled="true" }
    </div>

=== "Markdown"

    ``` markdown
    [Small](#){ .md-button .md-button--primary .md-button--sm }
    [Large](#){ .md-button .md-button--primary .md-button--lg }
    [:material-rocket-launch-outline: Deploy](#){ .md-button .md-button--soft }
    [Continue :material-arrow-right:](#){ .md-button }
    [:material-cog-outline:](#){ .md-button .md-button--icon aria-label="Settings" }
    [Saving](#){ .md-button .md-button--primary .md-button--loading aria-busy="true" }
    [Disabled](#){ .md-button .md-button--disabled aria-disabled="true" }
    ```

A trailing icon nudges forward on hover. With motion set to *Full*, every press sends a ripple out from the pointer.

## Rows and groups

=== "Preview"

    <div class="button-group button-group--toggle" markdown>
    [Day](#){ .md-button .md-button--sm }
    [Week](#){ .md-button .md-button--sm aria-pressed="true" }
    [Month](#){ .md-button .md-button--sm }
    </div>

=== "Markdown"

    ``` markdown
    <div class="button-row" markdown>   <!-- spaced row that wraps -->
    [One](#){ .md-button } [Two](#){ .md-button }
    </div>

    <div class="button-group" markdown> <!-- joined buttons, each a normal link -->
    [Edit](edit.md){ .md-button .md-button--sm }
    [Share](share.md){ .md-button .md-button--sm }
    </div>

    <!-- segmented control: click selects one; aria-pressed marks the initial choice -->
    <div class="button-group button-group--toggle" markdown>
    [Day](#){ .md-button .md-button--sm }
    [Week](#){ .md-button .md-button--sm aria-pressed="true" }
    [Month](#){ .md-button .md-button--sm }
    </div>
    ```

In a `button-group--toggle`, clicking a segment selects it instead of following the link. It is keyboard-operable and announces its pressed state to screen readers.

## Button styles

The shape and feel of every button comes from the **Buttons** setting on the [Appearance](../themes.md) page. The four styles are shown below.

<div class="grid" markdown>
<div class="card" markdown>
**Rounded**

<div class="button-row" data-button-style="rounded" markdown>
[Primary](#button-styles){ .md-button .md-button--primary } [Secondary](#button-styles){ .md-button }
</div>
</div>
<div class="card" markdown>
**Pill**

<div class="button-row" data-button-style="pill" markdown>
[Primary](#button-styles){ .md-button .md-button--primary } [Secondary](#button-styles){ .md-button }
</div>
</div>
<div class="card" markdown>
**Sharp**

<div class="button-row" data-button-style="sharp" markdown>
[Primary](#button-styles){ .md-button .md-button--primary } [Secondary](#button-styles){ .md-button }
</div>
</div>
<div class="card" markdown>
**Tactile**

<div class="button-row" data-button-style="tactile" markdown>
[Primary](#button-styles){ .md-button .md-button--primary } [Secondary](#button-styles){ .md-button }
</div>
</div>
</div>
