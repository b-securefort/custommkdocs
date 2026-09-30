# Chat

Every page has a chat button in the bottom-right corner. Readers ask a question and get an answer from the knowledge base, with links to the pages it came from.

The site only draws the chat. The answers come from **Nexus**: each question goes to its chat API with one Nexus skill, and that skill searches the knowledge base and writes the answer, streamed back as it's written.

## What readers get

- **One question at a time.** Each question is sent on its own, so the assistant doesn't see earlier ones. The welcome text tells readers to include the details a question needs.
- **Kept for the tab only.** The chat follows the reader from page to page, so they can open the pages an answer links to. It's kept in the browser tab's session storage, and is gone when the tab is closed.
- **Download the transcript** as Markdown or plain text, from the button in the chat's header.
- **Stop** an answer part-way, **copy** an answer, or **clear** the chat and start again.

Nexus stores each question as a conversation for the person who asked, as it does for questions asked in Nexus itself.

## Set it up

Everything is in `extra.chat` in `mkdocs.yml`:

```yaml
extra:
  chat:
    enabled: true
    api_url: https://nexus.example.com   # Nexus's backend, without /api
    skill_id: shared:default             # the skill that answers
    auth: entra                          # or none, for a local Nexus
    tenant_id: <tenant id>
    client_id: <app registration id>
    api_scope: api://<nexus-api>/user_impersonation
    title: Ask the docs
    suggestions:
      - How do I create a resource group?
```

In Nexus:

1. Add the docs site's address to `APP_CORS_ORIGINS`, or the browser won't let the page read Nexus's answers.
2. Give readers access to the skill. A shared skill is checked against their Entra roles, the same as in Nexus.

For sign-in (`auth: entra`), use the same tenant, app registration and API scope as the Nexus frontend. Add `https://<docs site>/chat-signin.html` to that app registration as a **Single-page application** redirect URI. The first time readers open the chat, they're signed in quietly if they already have a Microsoft session in the browser. Otherwise they click **Sign in** and pick their account in a popup.

`enabled: false` removes the button from every page.

## Try it locally

Nexus and `mkdocs serve` both use port 8000, so give the docs another port:

``` powershell
# Nexus: backend/.env has DEV_AUTH_BYPASS=true and
# APP_CORS_ORIGINS=...,http://localhost:8001
uvicorn app.main:app --reload --port 8000 --app-dir .

# The docs, with auth: none and api_url: http://localhost:8000
mkdocs serve -a localhost:8001
```

## How it's built

| File | What it does |
| ---- | ------------ |
| `javascripts/chat.js` | The button and panel. Sends `POST /api/chat` with the skill and the question, reads the streamed events, and draws the answer as Markdown. |
| `stylesheets/chat.css` | Its look, from the theme tokens. It follows the colour theme, button style and motion setting. |
| `overrides/main.html` | Puts `extra.chat` in the page for `chat.js`. |
| `chat-signin.html` | Where the sign-in popup comes back to. |
| `javascripts/vendor/msal-*.min.js` | Microsoft's sign-in library, loaded only when the chat is first opened. `tools/msal/` copies it there: `npm install && npm run build`. Keep its version the same as the Nexus frontend's. |

Answers are drawn from Markdown with raw HTML shown as text, and only links to web pages and email addresses are kept. Links to this site open in the same tab, and the chat comes with them. Other links open in a new tab. If Nexus asks to approve a step or answer a question, the chat ends that answer and suggests asking in Nexus, because it can't show those prompts.
