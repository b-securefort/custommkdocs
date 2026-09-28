# Steps

A numbered list drawn like the timeline, for the main procedure on a page. It numbers itself, and screen readers announce it as a list.

## Steps

=== "Preview"

    <div class="steps" markdown>

    1.  **Create a virtual environment.** Run this once, in the project folder:

        ``` bash
        python -m venv .venv
        ```

    2.  **Install the tools.**

        ``` bash
        pip install -r requirements.txt
        ```

    3.  **Start the preview** with `mkdocs serve`, then open <http://127.0.0.1:8000>. The page reloads each time you save.

    </div>

=== "Markdown"

    ```` markdown
    <div class="steps" markdown>

    1.  **Create a virtual environment.** Run this once, in the project folder:

        ``` bash
        python -m venv .venv
        ```

    2.  **Install the tools.**

        ``` bash
        pip install -r requirements.txt
        ```

    3.  **Start the preview** with `mkdocs serve`, then open <http://127.0.0.1:8000>. The page reloads each time you save.

    </div>
    ````

Write an ordinary numbered list inside the `<div>`, with an empty line after the opening tag and before the closing one. Code blocks, lists and tabs go inside a step when they're indented by four spaces. Anything that isn't indented ends the list, and the next step starts again from 1.

Unlike the timeline, the spine doesn't fill as you scroll: on a how-to page, a filled node would look like a step the reader had already done.
