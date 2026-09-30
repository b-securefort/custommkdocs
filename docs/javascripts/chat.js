/* Docs assistant: a chat button in the bottom-right corner of every page that
 * answers questions from the knowledge base.
 *
 * This is only the front end. Each question goes to Nexus (POST /api/chat on
 * extra.chat.api_url) with the skill named in extra.chat.skill_id, and Nexus
 * searches the knowledge base and writes the answer, streamed back as
 * server-sent events.
 *
 * Every question is sent on its own, as a new Nexus conversation: the
 * assistant doesn't see earlier questions. The chat is kept in this tab's
 * sessionStorage only so it follows the reader from page to page (answers
 * link to pages); it's gone when the tab closes. Download saves it as
 * Markdown or plain text.
 *
 * Sign-in (auth: entra) is Microsoft Entra ID through MSAL.js
 * (vendor/msal-browser.min.js, copied there by tools/msal/), loaded when the
 * chat is first opened; the popup comes back to chat-signin.html. auth: none
 * sends no token, for a local Nexus running with DEV_AUTH_BYPASS.
 *
 * overrides/main.html puts extra.chat in the page as #__chat-config. With
 * enabled: false it isn't there, and this does nothing. */
(function () {
  "use strict";

  var configNode = document.getElementById("__chat-config");
  if (!configNode) return;
  var site;
  try {
    site = JSON.parse(configNode.textContent);
  } catch (e) {
    return;
  }
  var config = site.chat || {};

  var SCRIPT = document.currentScript && document.currentScript.src;
  var BASE = SCRIPT ? SCRIPT.replace(/javascripts\/chat\.js(?:[?#].*)?$/, "") : "/";
  var MARKED_SRC = BASE + "javascripts/vendor/marked.min.js";
  var MSAL_SRC = BASE + "javascripts/vendor/msal-browser.min.js";
  var SIGNIN_URL = new URL(BASE + "chat-signin.html", location.href).href;

  // "" is a valid api_url: Nexus served from the same origin as the docs.
  var API = String(config.api_url || "").replace(/\/+$/, "");
  var SKILL = String(config.skill_id || "").trim();
  var AUTH = config.auth === "none" ? "none" : "entra";
  if (config.auth != null && config.auth !== "none" && config.auth !== "entra") {
    console.warn('extra.chat.auth: unknown value "' + config.auth + '", using "entra"');
  }
  var TITLE = config.title || "Ask the docs";
  var SUBTITLE = config.subtitle || "Answers from the knowledge base";
  var GREETING = config.greeting || "Hi! Ask me anything about these docs.";
  var SUGGESTIONS = Array.isArray(config.suggestions) ? config.suggestions.slice(0, 4) : [];
  // Nexus refuses a longer message.
  var MAX_LENGTH = 16000;

  // What the answer shows while Nexus runs a tool, by the tool's name.
  var TOOL_STATUS = [
    [/kb/, "Searching the knowledge base"],
    [/ms_docs/, "Reading Microsoft Learn"],
    [/^web_|github|stackoverflow/, "Searching the web"],
  ];

  function svg(path) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="' + path + '"/></svg>';
  }

  // Material Design Icons, as the theme ships them.
  var ICON = {
    chat: svg("M12 3C6.5 3 2 6.6 2 11c0 2.2 1.1 4.2 2.8 5.5 0 .6-.4 2.2-2.8 4.5 2.4-.1 4.6-1 6.5-2.5 1.1.3 2.3.5 3.5.5 5.5 0 10-3.6 10-8s-4.5-8-10-8m0 14c-4.4 0-8-2.7-8-6s3.6-6 8-6 8 2.7 8 6-3.6 6-8 6m.2-10.5c-.9 0-1.6.2-2.1.5-.6.4-.9 1-.8 1.7h2q0-.45.3-.6c.2-.1.4-.2.7-.2s.6.1.8.3.3.4.3.7-.1.5-.2.7c-.2.2-.4.4-.6.5-.5.3-.9.6-1.1.8-.4.3-.5.6-.5 1.1h2c0-.3.1-.5.1-.7.1-.2.3-.3.5-.5.5-.2.8-.5 1.1-.9s.4-.8.4-1.2c0-.7-.3-1.3-.8-1.7-.4-.3-1.2-.5-2.1-.5M11 13v2h2v-2z"),
    chevron: svg("M7.41 8.58 12 13.17l4.59-4.59L18 10l-6 6-6-6z"),
    close: svg("M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"),
    send: svg("M13 20h-2V8l-5.5 5.5-1.42-1.42L12 4.16l7.92 7.92-1.42 1.42L13 8z"),
    stop: svg("M18 18H6V6h12z"),
    download: svg("M5 20h14v-2H5m14-9h-4V3H9v6H5l7 7z"),
    clear: svg("m19.36 2.72 1.42 1.42-5.72 5.71c1.07 1.54 1.22 3.39.32 4.59L9.06 8.12c1.2-.9 3.05-.75 4.59.32zM5.93 17.57c-2.01-2.01-3.24-4.41-3.58-6.65l4.88-2.09 7.44 7.44-2.09 4.88c-2.24-.34-4.64-1.57-6.65-3.58"),
    copy: svg("M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12z"),
    check: svg("M21 7 9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59z"),
    login: svg("M11 7 9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8z"),
    alert: svg("M11 15h2v2h-2zm0-8h2v6h-2zm1-5C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 18a8 8 0 0 1-8-8 8 8 0 0 1 8-8 8 8 0 0 1 8 8 8 8 0 0 1-8 8"),
    book: svg("M12 21.5c-1.35-.85-3.8-1.5-5.5-1.5-1.65 0-3.35.3-4.75 1.05-.1.05-.15.05-.25.05-.25 0-.5-.25-.5-.5V6c.6-.45 1.25-.75 2-1 1.11-.35 2.33-.5 3.5-.5 1.95 0 4.05.4 5.5 1.5 1.45-1.1 3.55-1.5 5.5-1.5 1.17 0 2.39.15 3.5.5.75.25 1.4.55 2 1v14.6c0 .25-.25.5-.5.5-.1 0-.15 0-.25-.05-1.4-.75-3.1-1.05-4.75-1.05-1.7 0-4.15.65-5.5 1.5m-1-14c-1.36-.6-3.16-1-4.5-1-1.2 0-2.4.15-3.5.5v11.5c1.1-.35 2.3-.5 3.5-.5 1.34 0 3.14.4 4.5 1zM13 19c1.36-.6 3.16-1 4.5-1 1.2 0 2.4.15 3.5.5V7c-1.1-.35-2.3-.5-3.5-.5-1.34 0-3.14.4-4.5 1zm1-2.65c.96-.35 2.12-.52 3.5-.52 1.04 0 1.88.08 2.5.24v-1.5a13.9 13.9 0 0 0-6 .19zm0-2.66c.96-.35 2.12-.53 3.5-.53 1.04 0 1.88.08 2.5.24v-1.5c-.87-.16-1.71-.23-2.5-.23-1.28 0-2.45.15-3.5.45zM14 11c.96-.33 2.12-.5 3.5-.5.91 0 1.76.09 2.5.28V9.23c-.87-.15-1.71-.23-2.5-.23-1.32 0-2.5.15-3.5.46z"),
    sparkle: svg("m9 4 2.5 5.5L17 12l-5.5 2.5L9 20l-2.5-5.5L1 12l5.5-2.5zm0 4.83L8 11l-2.17 1L8 13l1 2.17L10 13l2.17-1L10 11zM19 9l-1.26-2.74L15 5l2.74-1.25L19 1l1.25 2.75L23 5l-2.75 1.26zm0 14-1.26-2.74L15 19l2.74-1.25L19 15l1.25 2.75L23 19l-2.75 1.26z"),
  };

  /* ── Helpers ── */

  function el(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var scripts = {};

  function loadScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise(function (resolve, reject) {
        var tag = el("script", null, { src: src, async: "" });
        tag.onload = resolve;
        tag.onerror = function () {
          delete scripts[src];
          reject(new Error("Couldn't load " + src));
        };
        document.head.appendChild(tag);
      });
    }
    return scripts[src];
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function clock(date) {
    return pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function day(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  /** An error whose message is fit to show the reader. */
  function ChatError(message, signIn) {
    this.message = message;
    this.signIn = !!signIn;
  }

  /* ── Answers: Markdown in, safe HTML out ── */

  // Nexus's evidence marks, "[t:1413]", point at tool cards the chat doesn't
  // show; Nexus drops them from its own exports the same way. A half-streamed
  // "[t:14" at the end waits for the rest.
  function stripMarks(text, streaming) {
    text = text.replace(/\s?\[t:\d+\]/g, "");
    return streaming ? text.replace(/\s?\[t:\d*$/, "") : text;
  }

  var md = null;

  function markdown() {
    if (!md && window.marked && window.marked.Marked) {
      // A private instance: the Write page configures the shared one.
      md = new window.marked.Marked({ gfm: true, breaks: false });
      md.use({
        renderer: {
          // Raw HTML in an answer is shown as text, never run.
          html: function (token) {
            return escapeHtml(token.text);
          },
          // An image is only a link: nothing loads that the reader didn't click.
          image: function (token) {
            return '<a href="' + escapeHtml(token.href) + '">' + escapeHtml(token.text || token.href) + "</a>";
          },
        },
      });
    }
    return md;
  }

  var TAGS = {
    A: 1, P: 1, BR: 1, HR: 1, STRONG: 1, EM: 1, DEL: 1, CODE: 1, PRE: 1, BLOCKQUOTE: 1,
    UL: 1, OL: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, INPUT: 1,
    TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TH: 1, TD: 1,
  };
  var ATTRS = { href: 1, title: 1, align: 1, start: 1, type: 1, checked: 1, disabled: 1, class: 1 };

  /** Keep only the elements and attributes Markdown makes, and only links
   *  that go to a web page or an email address. */
  function clean(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 3) return;
      if (child.nodeType !== 1 || !TAGS[child.tagName]) {
        child.replaceWith(document.createTextNode(child.textContent || ""));
        return;
      }
      Array.prototype.slice.call(child.attributes).forEach(function (attr) {
        var keep = ATTRS[attr.name];
        if (attr.name === "class") keep = child.tagName === "CODE" && /^language-[\w+-]+$/.test(attr.value);
        if (attr.name === "type") keep = child.tagName === "INPUT" && attr.value === "checkbox";
        if (!keep) child.removeAttribute(attr.name);
      });
      if (child.tagName === "INPUT" && child.getAttribute("type") !== "checkbox") {
        child.remove();
        return;
      }
      if (child.tagName === "A") link(child);
      clean(child);
    });
  }

  function link(a) {
    var href = a.getAttribute("href");
    var url = null;
    try {
      url = href ? new URL(href, location.href) : null;
    } catch (e) {
      url = null;
    }
    if (!url || !/^(https?|mailto):$/.test(url.protocol)) {
      a.removeAttribute("href");
      return;
    }
    // Pages on this site open in place (the chat comes along); anything else
    // in a new tab.
    if (url.origin !== location.origin) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
  }

  function renderAnswer(target, text, streaming) {
    text = stripMarks(text, streaming);
    var parser = markdown();
    if (!parser) {
      target.innerHTML = "";
      var plain = el("p", "chat-plain");
      plain.textContent = text;
      target.appendChild(plain);
      return;
    }
    var template = document.createElement("template");
    template.innerHTML = parser.parse(text);
    clean(template.content);
    target.replaceChildren(template.content);
  }

  /* ── Sign-in (auth: entra) ── */

  var auth = { app: null, account: null, ready: null };

  function authMissing() {
    return ["tenant_id", "client_id", "api_scope"].filter(function (key) {
      return !String(config[key] || "").trim();
    });
  }

  function scopes() {
    return [String(config.api_scope).trim()];
  }

  /** Load MSAL and find who's signed in: a previous sign-in in this tab, or
   *  the reader's Microsoft session if the browser lets a hidden frame use it. */
  function startAuth() {
    if (!auth.ready) {
      auth.ready = loadScript(MSAL_SRC)
        .then(function () {
          var app = new window.msal.PublicClientApplication({
            auth: {
              clientId: String(config.client_id).trim(),
              authority: "https://login.microsoftonline.com/" + String(config.tenant_id).trim(),
              redirectUri: SIGNIN_URL,
            },
            // Like Nexus: signed in for this tab only.
            cache: { cacheLocation: "sessionStorage" },
            // A browser that blocks the hidden frame shows the button sooner.
            system: { iframeBridgeTimeout: 6000 },
          });
          return app.initialize().then(function () {
            auth.app = app;
            var account = app.getActiveAccount() || app.getAllAccounts()[0];
            if (account) return setAccount(account);
            return app
              .ssoSilent({ scopes: scopes(), redirectUri: SIGNIN_URL })
              .then(function (result) {
                setAccount(result.account);
              })
              .catch(function () {
                // Not signed in, or third-party cookies blocked: the button it is.
              });
          });
        })
        .catch(function (error) {
          auth.ready = null;
          throw error;
        });
    }
    return auth.ready;
  }

  function setAccount(account) {
    auth.account = account || null;
    if (account) auth.app.setActiveAccount(account);
  }

  function signIn() {
    ui.signInButton.disabled = true;
    ui.signInError.hidden = true;
    // Straight from the click, so the browser lets the popup open.
    auth.app
      .loginPopup({ scopes: scopes(), redirectUri: SIGNIN_URL })
      .then(function (result) {
        setAccount(result.account);
        showSignIn(false);
        ui.input.focus();
      })
      .catch(function (error) {
        if (error && error.errorCode === "user_cancelled") return;
        var blocked = error && /popup_window_error|empty_window_error/.test(error.errorCode || "");
        ui.signInError.textContent = blocked
          ? "Your browser blocked the sign-in window. Allow pop-ups for this site and try again."
          : "Sign-in didn't work. Try again.";
        ui.signInError.hidden = false;
        console.error("Chat sign-in failed", error);
      })
      .then(function () {
        ui.signInButton.disabled = false;
      });
  }

  /** The Authorization header for the next question, or null without auth. */
  function bearer() {
    if (AUTH === "none") return Promise.resolve(null);
    return startAuth().then(function () {
      if (!auth.account) throw new ChatError("Sign in to ask a question.", true);
      return auth.app
        .acquireTokenSilent({ scopes: scopes(), account: auth.account })
        .then(function (result) {
          return "Bearer " + result.accessToken;
        })
        .catch(function (error) {
          if (error instanceof window.msal.InteractionRequiredAuthError) {
            setAccount(null);
            throw new ChatError("Your sign-in has expired. Sign in again to keep asking.", true);
          }
          throw error;
        });
    });
  }

  /* ── State ── */

  // { role: "user" | "assistant", text, time, state, status, note, node }
  // state: "streaming" | "done" | "stopped" | "error"
  var messages = [];
  var current = null; // { controller, answer, reason } while an answer streams
  var ui = {};

  /* ── Talking to Nexus ── */

  function httpError(response) {
    return response
      .json()
      .catch(function () {
        return null;
      })
      .then(function (body) {
        var detail = body && body.detail;
        if (Array.isArray(detail)) {
          detail = detail
            .map(function (d) {
              return d.msg || "";
            })
            .join("; ");
        }
        if (response.status === 401) {
          if (AUTH === "entra") setAccount(null);
          throw new ChatError("The assistant didn't accept your sign-in. Sign in again to keep asking.", AUTH === "entra");
        }
        if (response.status === 403) throw new ChatError("You don't have access to the assistant. Ask the docs team to give you access in Nexus.");
        if (response.status === 429) throw new ChatError("That's a lot of questions in a minute. Wait a moment and ask again.");
        console.error("Chat: Nexus answered " + response.status, detail || "");
        throw new ChatError(response.status < 500 && detail ? String(detail) : "The assistant ran into a problem. Try again in a moment.");
      });
  }

  /** Read Nexus's event stream, calling onEvent(type, data) for each event. */
  function readEvents(response, onEvent) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";

    function flush(final) {
      var blocks = buffer.split(/\r?\n\r?\n/);
      buffer = final ? "" : blocks.pop();
      blocks.forEach(function (block) {
        var type = "message";
        var data = [];
        block.split(/\r?\n/).forEach(function (line) {
          if (line.indexOf("event:") === 0) type = line.slice(6).trim();
          else if (line.indexOf("data:") === 0) data.push(line.slice(5).replace(/^ /, ""));
        });
        if (!data.length) return;
        var payload;
        try {
          payload = JSON.parse(data.join("\n"));
        } catch (e) {
          return;
        }
        onEvent(type, payload);
      });
    }

    function pump() {
      return reader.read().then(function (chunk) {
        if (chunk.done) {
          buffer += decoder.decode();
          flush(true);
          return;
        }
        buffer += decoder.decode(chunk.value, { stream: true });
        flush(false);
        return pump();
      });
    }

    return pump();
  }

  function toolStatus(name) {
    for (var i = 0; i < TOOL_STATUS.length; i++) {
      if (TOOL_STATUS[i][0].test(name || "")) return TOOL_STATUS[i][1];
    }
    return "Looking into it";
  }

  function onEvent(answer, type, data) {
    if (type === "token") {
      if (data.text) {
        answer.text += data.text;
        answer.status = null;
      } else if (data.tool_draft) {
        answer.status = "Looking into it";
      }
    } else if (type === "tool_call_start") {
      // Nexus has the model say what it's about to do before each tool
      // ("Searching the KB for…"); the answer is what it writes after the
      // last one. The status line says it better, so the narration goes.
      answer.text = "";
      answer.status = toolStatus(data.name);
    } else if (type === "tool_result") {
      answer.status = "Reading what it found";
    } else if (type === "iteration_limit") {
      answer.note = "The answer was cut short. A narrower question may get a fuller one.";
    } else if (type === "approval_required" || type === "question_required") {
      // Nexus wants someone to approve a step or answer a question: things
      // the docs chat can't do. End the turn rather than leave it waiting.
      current.reason = "unsupported";
      current.controller.abort();
    } else if (type === "error") {
      answer.error = "The assistant ran into a problem. Try again in a moment.";
      console.error("Chat: Nexus reported", data.message || data);
    } else {
      return;
    }
    paint(answer);
  }

  function ask(text) {
    text = text.trim();
    if (!text || current) return;
    if (text.length > MAX_LENGTH) text = text.slice(0, MAX_LENGTH);

    var question = add({ role: "user", text: text, time: new Date(), state: "done" });
    var answer = add({ role: "assistant", text: "", time: new Date(), state: "streaming", status: "Thinking" });
    var controller = new AbortController();
    current = { controller: controller, answer: answer, reason: null };
    busy(true);

    bearer()
      .then(function (authorization) {
        var headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
        if (authorization) headers.Authorization = authorization;
        return fetch(API + "/api/chat", {
          method: "POST",
          headers: headers,
          // No conversation_id: every question is a new conversation.
          body: JSON.stringify({ skill_id: SKILL, message: text }),
          signal: controller.signal,
        }).catch(function (error) {
          if (error && error.name === "AbortError") throw error;
          console.error("Chat: couldn't reach Nexus at " + (API || location.origin) + ". Is it running, and does its APP_CORS_ORIGINS include " + location.origin + "?", error);
          throw new ChatError("Couldn't reach the assistant. Check your connection and try again.");
        });
      })
      .then(function (response) {
        if (!response.ok) return httpError(response);
        return readEvents(response, function (type, data) {
          onEvent(answer, type, data);
        });
      })
      .then(function () {
        answer.state = answer.error && !answer.text ? "error" : "done";
        if (!answer.text && !answer.error) {
          answer.error = "No answer came back. Try asking in a different way.";
          answer.state = "error";
        }
      })
      .catch(function (error) {
        if (current && current.reason === "stopped") {
          answer.state = "stopped";
        } else if (current && current.reason === "unsupported") {
          answer.state = answer.text ? "done" : "error";
          answer.error = "This question needs a step the docs chat can't take. Try asking it in Nexus.";
        } else if (error instanceof ChatError && error.signIn && !answer.text) {
          // Nothing was asked yet: take the question back and ask for a sign-in.
          answer.withdrawn = true;
          remove(answer);
          remove(question);
          ui.input.value = text;
          showSignIn(true, error.message);
          return;
        } else {
          answer.state = "error";
          answer.error = error instanceof ChatError ? error.message : "Something went wrong. Try again.";
          if (!(error instanceof ChatError)) console.error("Chat:", error);
        }
      })
      .then(function () {
        current = null;
        busy(false);
        if (answer.withdrawn) {
          resize();
          return;
        }
        answer.status = null;
        if (answer.state === "streaming") answer.state = "done";
        paint(answer);
        announce(answer.state === "error" ? "The assistant couldn't answer." : "Answer ready.");
      });
  }

  function stop() {
    if (!current) return;
    current.reason = "stopped";
    current.controller.abort();
  }

  /* ── Keeping the chat while the reader changes page ── */

  var STORE_KEY = "docs.chat";

  function save() {
    try {
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          open: !ui.panel.hidden,
          messages: messages.map(function (m) {
            return { role: m.role, text: m.text, time: m.time.getTime(), state: m.state, note: m.note || null, error: m.error || null };
          }),
        }),
      );
    } catch (e) {
      // Private mode / blocked storage: the chat just won't follow the reader.
    }
  }

  function restore() {
    var saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(STORE_KEY));
    } catch (e) {
      saved = null;
    }
    if (!saved || !Array.isArray(saved.messages)) return;
    saved.messages.forEach(function (m) {
      var message = { role: m.role === "user" ? "user" : "assistant", text: String(m.text || ""), time: new Date(m.time), state: m.state, note: m.note, error: m.error };
      // The page changed while this was being written: the rest is lost.
      if (message.state === "streaming") {
        message.state = "stopped";
        message.note = "Interrupted when you left the page";
      }
      add(message);
    });
    if (saved.open) open(true);
  }

  /* ── Transcript ── */

  function transcript(format) {
    var saved = new Date();
    var lines = [];
    var heading = TITLE + " — chat transcript";
    var where = (site.site_name ? site.site_name + ", " : "") + location.origin + (new URL(BASE, location.href).pathname);
    if (format === "md") {
      lines.push("# " + heading, "", "Saved " + day(saved) + " " + clock(saved) + " from " + where, "");
    } else {
      lines.push(heading, "Saved " + day(saved) + " " + clock(saved) + " from " + where, "");
    }
    messages.forEach(function (m) {
      var who = m.role === "user" ? "You" : "Assistant";
      var text = m.role === "user" ? m.text : stripMarks(m.text, false).trim();
      var notes = [];
      if (m.state === "stopped") notes.push("Stopped before the answer was finished.");
      if (m.error) notes.push(m.error);
      if (m.note) notes.push(m.note);
      if (format === "md") {
        lines.push("---", "", "**" + who + "** · " + clock(m.time), "");
        if (text) lines.push(text, "");
        notes.forEach(function (n) {
          lines.push("_" + n + "_", "");
        });
      } else {
        lines.push("----", who + " (" + clock(m.time) + "):", "");
        if (text) lines.push(text, "");
        notes.forEach(function (n) {
          lines.push("[" + n + "]", "");
        });
      }
    });
    return lines.join("\n");
  }

  function download(format) {
    if (!messages.length) return;
    var type = format === "md" ? "text/markdown" : "text/plain";
    var blob = new Blob([transcript(format)], { type: type + ";charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var now = new Date();
    var a = el("a", null, { href: url, download: "chat-transcript-" + day(now) + "-" + pad(now.getHours()) + pad(now.getMinutes()) + "." + format });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function clearChat() {
    stop();
    messages.forEach(function (m) {
      m.node.remove();
    });
    messages = [];
    refresh();
    ui.input.focus();
  }

  /* ── Drawing ── */

  function add(message) {
    var node = el("div", "chat-message chat-message--" + message.role);
    if (message.role === "user") {
      var bubble = el("div", "chat-message__bubble");
      bubble.textContent = message.text;
      node.appendChild(bubble);
    } else {
      node.innerHTML =
        '<div class="chat-message__body md-typeset"></div>' +
        '<div class="chat-message__status" hidden><span class="chat-dots" aria-hidden="true"><span></span><span></span><span></span></span><span class="chat-message__status-text"></span></div>' +
        '<p class="chat-message__error" hidden>' + ICON.alert + "<span></span></p>" +
        '<div class="chat-message__footer" hidden>' +
        '<button type="button" class="chat-message__copy" title="Copy answer" aria-label="Copy answer">' + ICON.copy + "<span>Copy</span></button>" +
        '<span class="chat-message__note"></span>' +
        "</div>";
      node.querySelector(".chat-message__copy").addEventListener("click", function () {
        copy(message, this);
      });
    }
    message.node = node;
    messages.push(message);
    ui.messages.appendChild(node);
    refresh();
    paint(message);
    scrollDown(true);
    return message;
  }

  function remove(message) {
    var i = messages.indexOf(message);
    if (i >= 0) messages.splice(i, 1);
    message.node.remove();
    refresh();
  }

  var pending = [];
  var frame = 0;

  /** Redraw an answer, at most once a frame while it streams. */
  function paint(message) {
    if (message.role !== "assistant") return;
    if (pending.indexOf(message) < 0) pending.push(message);
    if (!frame) frame = requestAnimationFrame(flushPaint);
  }

  function flushPaint() {
    frame = 0;
    var stick = nearBottom();
    pending.splice(0).forEach(draw);
    scrollDown(stick);
  }

  function draw(m) {
    var node = m.node;
    var streaming = m.state === "streaming";
    node.classList.toggle("is-streaming", streaming);
    node.setAttribute("aria-busy", streaming ? "true" : "false");

    var body = node.querySelector(".chat-message__body");
    body.hidden = !m.text;
    if (m.text) renderAnswer(body, m.text, streaming);

    var status = node.querySelector(".chat-message__status");
    status.hidden = !(streaming && m.status);
    node.querySelector(".chat-message__status-text").textContent = m.status ? m.status + "…" : "";

    var error = node.querySelector(".chat-message__error");
    error.hidden = !m.error;
    error.querySelector("span").textContent = m.error || "";

    var footer = node.querySelector(".chat-message__footer");
    var note = m.note || (m.state === "stopped" ? "Stopped" : "");
    footer.hidden = streaming || (!m.text && !note);
    node.querySelector(".chat-message__copy").hidden = !m.text;
    node.querySelector(".chat-message__note").textContent = note;
  }

  function copy(message, button) {
    var text = stripMarks(message.text, false).trim();
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(function () {
      button.classList.add("is-done");
      button.querySelector("svg").outerHTML = ICON.check;
      button.querySelector("span").textContent = "Copied";
      setTimeout(function () {
        button.classList.remove("is-done");
        button.querySelector("svg").outerHTML = ICON.copy;
        button.querySelector("span").textContent = "Copy";
      }, 1600);
    });
  }

  function nearBottom() {
    var log = ui.log;
    return log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  }

  function scrollDown(force) {
    if (force) ui.log.scrollTop = ui.log.scrollHeight;
  }

  /** Show the welcome or the messages, and what the header buttons can do. */
  function refresh() {
    var empty = !messages.length;
    ui.welcome.hidden = !empty;
    ui.downloadButton.disabled = empty;
    ui.clearButton.disabled = empty;
  }

  function busy(on) {
    ui.panel.classList.toggle("is-busy", on);
    ui.send.innerHTML = on ? ICON.stop : ICON.send;
    ui.send.setAttribute("aria-label", on ? "Stop the answer" : "Send");
    ui.send.title = on ? "Stop" : "Send";
    updateSend();
  }

  function updateSend() {
    ui.send.disabled = !current && (!ui.input.value.trim() || !ui.composer.classList.contains("is-ready"));
  }

  function resize() {
    var input = ui.input;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
    updateSend();
  }

  function announce(text) {
    ui.live.textContent = "";
    setTimeout(function () {
      ui.live.textContent = text;
    }, 50);
  }

  function showSignIn(on, message) {
    var hadFocus = ui.panel.contains(document.activeElement);
    ui.signIn.hidden = !on;
    ui.log.hidden = on;
    ui.input.disabled = on;
    ui.composer.classList.toggle("is-ready", !on);
    if (on) {
      ui.signInText.textContent = message || "Sign in with your work account to ask questions.";
      ui.signInButton.hidden = false;
      ui.signInError.hidden = true;
      if (hadFocus) ui.signInButton.focus();
    }
    updateSend();
  }

  /** Something the site owner has to fix in mkdocs.yml: say so in the panel. */
  function showSetupError(text) {
    ui.signIn.hidden = false;
    ui.log.hidden = true;
    ui.input.disabled = true;
    ui.signInButton.hidden = true;
    ui.signInText.textContent = text;
    ui.composer.classList.remove("is-ready");
    updateSend();
  }

  /* ── Opening and closing ── */

  var started = false;

  /** quiet: reopened on a new page, so the page keeps the keyboard. */
  function open(quiet) {
    ui.panel.hidden = false;
    ui.launcher.setAttribute("aria-expanded", "true");
    ui.launcher.setAttribute("aria-label", "Close " + TITLE);
    document.documentElement.classList.add("chat-is-open");
    scrollDown(true);
    if (!started) start();
    if (quiet) return;
    if (ui.signIn.hidden) ui.input.focus();
    else ui.panel.focus();
  }

  function close() {
    ui.panel.hidden = true;
    closeMenu();
    ui.launcher.setAttribute("aria-expanded", "false");
    ui.launcher.setAttribute("aria-label", TITLE);
    document.documentElement.classList.remove("chat-is-open");
  }

  /** First open: fetch the Markdown renderer, check the setup, find the
   *  reader's sign-in. */
  function start() {
    started = true;
    loadScript(MARKED_SRC)
      .then(function () {
        messages.forEach(paint);
      })
      .catch(function () {
        // Answers show as plain text.
      });

    if (!SKILL) {
      showSetupError("The chat isn't set up yet: extra.chat.skill_id in mkdocs.yml names no Nexus skill.");
      return;
    }
    if (AUTH === "none") {
      showSignIn(false);
      return;
    }
    var missing = authMissing();
    if (missing.length) {
      showSetupError("The chat isn't set up yet: extra.chat in mkdocs.yml needs " + missing.join(", ") + " for sign-in (or auth: none).");
      return;
    }
    ui.panel.classList.add("is-checking");
    startAuth()
      .then(function () {
        showSignIn(!auth.account);
      })
      .catch(function (error) {
        console.error("Chat: couldn't start sign-in", error);
        showSignIn(true, "Sign-in couldn't start. Reload the page and try again.");
        ui.signInButton.hidden = true;
        started = false;
      })
      .then(function () {
        ui.panel.classList.remove("is-checking");
        if (ui.panel.contains(document.activeElement) && ui.signIn.hidden) ui.input.focus();
      });
  }

  function openMenu() {
    ui.menu.hidden = false;
    ui.downloadButton.setAttribute("aria-expanded", "true");
    ui.menu.querySelector("button").focus();
  }

  function closeMenu() {
    if (ui.menu.hidden) return;
    ui.menu.hidden = true;
    ui.downloadButton.setAttribute("aria-expanded", "false");
  }

  /* ── Building ── */

  function build() {
    var launcher = el("button", "chat-launcher", {
      type: "button",
      "aria-label": TITLE,
      "aria-expanded": "false",
      "aria-controls": "chat-panel",
    });
    launcher.innerHTML = '<span class="chat-launcher__icon chat-launcher__icon--open">' + ICON.chat + "</span>" + '<span class="chat-launcher__icon chat-launcher__icon--close">' + ICON.chevron + "</span>";

    var panel = el("section", "chat-panel", { id: "chat-panel", role: "dialog", "aria-label": TITLE, tabindex: "-1" });
    panel.hidden = true;
    panel.innerHTML =
      '<header class="chat-panel__header">' +
      '<span class="chat-panel__mark">' + ICON.book + "</span>" +
      '<div class="chat-panel__heading"><h2 class="chat-panel__title"></h2><p class="chat-panel__subtitle"></p></div>' +
      '<div class="chat-panel__actions">' +
      '<div class="chat-menu">' +
      '<button type="button" class="chat-icon-button" data-action="download" title="Download transcript" aria-label="Download transcript" aria-haspopup="menu" aria-expanded="false">' + ICON.download + "</button>" +
      '<div class="chat-menu__list" role="menu" hidden>' +
      '<p class="chat-menu__label">Download transcript</p>' +
      '<button type="button" role="menuitem" data-format="md">Markdown <span>.md</span></button>' +
      '<button type="button" role="menuitem" data-format="txt">Plain text <span>.txt</span></button>' +
      "</div></div>" +
      '<button type="button" class="chat-icon-button" data-action="clear" title="Clear chat" aria-label="Clear chat">' + ICON.clear + "</button>" +
      '<button type="button" class="chat-icon-button" data-action="close" title="Close" aria-label="Close">' + ICON.close + "</button>" +
      "</div></header>" +
      '<div class="chat-panel__log" role="log" aria-label="Conversation">' +
      '<div class="chat-welcome">' +
      '<span class="chat-welcome__icon">' + ICON.sparkle + "</span>" +
      '<p class="chat-welcome__greeting"></p>' +
      '<p class="chat-welcome__hint">Each question is answered on its own, so include the details it needs.</p>' +
      '<div class="chat-welcome__suggestions"></div>' +
      "</div>" +
      '<div class="chat-panel__messages"></div>' +
      "</div>" +
      '<div class="chat-signin" hidden>' +
      '<span class="chat-signin__icon">' + ICON.login + "</span>" +
      '<p class="chat-signin__text"></p>' +
      '<button type="button" class="chat-button">' + ICON.login + "<span>Sign in</span></button>" +
      '<p class="chat-signin__error" role="alert" hidden></p>' +
      "</div>" +
      '<form class="chat-composer">' +
      '<textarea class="chat-composer__input" rows="1" placeholder="Ask a question…" aria-label="Your question" maxlength="' + MAX_LENGTH + '"></textarea>' +
      '<button type="submit" class="chat-composer__send" aria-label="Send" title="Send">' + ICON.send + "</button>" +
      "</form>" +
      '<p class="chat-panel__note">Answers can be wrong: check the pages they link to. The chat is cleared when you close this tab, so download it to keep it.</p>' +
      '<span class="chat-live" aria-live="polite"></span>';

    panel.querySelector(".chat-panel__title").textContent = TITLE;
    panel.querySelector(".chat-panel__subtitle").textContent = SUBTITLE;
    panel.querySelector(".chat-welcome__greeting").textContent = GREETING;
    var chips = panel.querySelector(".chat-welcome__suggestions");
    SUGGESTIONS.forEach(function (text) {
      var chip = el("button", "chat-chip", { type: "button" });
      chip.textContent = String(text);
      chip.addEventListener("click", function () {
        if (ui.composer.classList.contains("is-ready")) ask(chip.textContent);
      });
      chips.appendChild(chip);
    });

    ui = {
      launcher: launcher,
      panel: panel,
      log: panel.querySelector(".chat-panel__log"),
      welcome: panel.querySelector(".chat-welcome"),
      messages: panel.querySelector(".chat-panel__messages"),
      signIn: panel.querySelector(".chat-signin"),
      signInText: panel.querySelector(".chat-signin__text"),
      signInButton: panel.querySelector(".chat-signin .chat-button"),
      signInError: panel.querySelector(".chat-signin__error"),
      composer: panel.querySelector(".chat-composer"),
      input: panel.querySelector(".chat-composer__input"),
      send: panel.querySelector(".chat-composer__send"),
      downloadButton: panel.querySelector('[data-action="download"]'),
      clearButton: panel.querySelector('[data-action="clear"]'),
      menu: panel.querySelector(".chat-menu__list"),
      live: panel.querySelector(".chat-live"),
    };

    launcher.addEventListener("click", function () {
      if (panel.hidden) open();
      else close();
    });
    panel.querySelector('[data-action="close"]').addEventListener("click", function () {
      close();
      launcher.focus();
    });
    ui.clearButton.addEventListener("click", clearChat);
    ui.downloadButton.addEventListener("click", function () {
      if (ui.menu.hidden) openMenu();
      else closeMenu();
    });
    ui.menu.addEventListener("click", function (event) {
      var item = event.target.closest("[data-format]");
      if (!item) return;
      download(item.getAttribute("data-format"));
      closeMenu();
      ui.downloadButton.focus();
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".chat-menu")) closeMenu();
    });
    ui.signInButton.addEventListener("click", signIn);

    ui.composer.addEventListener("submit", function (event) {
      event.preventDefault();
      if (current) {
        stop();
        return;
      }
      if (ui.send.disabled) return;
      var text = ui.input.value;
      ui.input.value = "";
      resize();
      ask(text);
    });
    ui.input.addEventListener("input", resize);
    ui.input.addEventListener("keydown", function (event) {
      // Enter sends; Shift+Enter is a new line.
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!current) ui.composer.requestSubmit();
      }
    });
    panel.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (!ui.menu.hidden) {
        closeMenu();
        ui.downloadButton.focus();
      } else {
        close();
        launcher.focus();
      }
      event.stopPropagation();
    });

    ui.composer.classList.add("is-ready");
    refresh();
    busy(false);
    document.body.appendChild(panel);
    document.body.appendChild(launcher);
    document.documentElement.classList.add("chat-is-on");

    restore();
    window.addEventListener("pagehide", save);
  }

  build();
})();
