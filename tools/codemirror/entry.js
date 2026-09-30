// The parts of CodeMirror 6 the Write page (docs/javascripts/writer.js) uses,
// built into one file it loads as window.CM: npm install && npm run build.
// Only the languages writers put in code blocks are included, so the page
// doesn't fetch anything else while someone types.

export { EditorState, EditorSelection, StateField, StateEffect, Compartment, RangeSetBuilder, Prec } from "@codemirror/state";
export {
  EditorView, keymap, Decoration, ViewPlugin, WidgetType, placeholder, drawSelection, dropCursor,
  highlightActiveLine, highlightActiveLineGutter, lineNumbers, rectangularSelection, crosshairCursor,
  highlightSpecialChars, MatchDecorator, showTooltip, hoverTooltip,
} from "@codemirror/view";
export { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from "@codemirror/commands";
export { syntaxHighlighting, HighlightStyle, indentUnit, bracketMatching, foldGutter, foldKeymap, indentOnInput, StreamLanguage, LanguageDescription, syntaxTree } from "@codemirror/language";
export {
  autocompletion, completionKeymap, snippet, snippetCompletion, startCompletion, closeBrackets, closeBracketsKeymap,
  acceptCompletion, nextSnippetField, prevSnippetField, clearSnippet, hasNextSnippetField,
} from "@codemirror/autocomplete";
export { linter, lintGutter, lintKeymap, forceLinting, setDiagnostics } from "@codemirror/lint";
export { searchKeymap, highlightSelectionMatches, search, openSearchPanel } from "@codemirror/search";
export { markdown, markdownLanguage, markdownKeymap } from "@codemirror/lang-markdown";
export { tags } from "@lezer/highlight";

import { LanguageDescription, LanguageSupport, StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { yaml } from "@codemirror/lang-yaml";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { sql } from "@codemirror/lang-sql";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import { csharp } from "@codemirror/legacy-modes/mode/clike";
import { go } from "@codemirror/legacy-modes/mode/go";
import { diff } from "@codemirror/legacy-modes/mode/diff";

// Markdown's code blocks want a LanguageSupport, as the modern packages give.
function legacy(mode) {
  return function () {
    return new LanguageSupport(StreamLanguage.define(mode));
  };
}

function modern(make) {
  return function () {
    return make();
  };
}

// Names as they appear after ``` in the site's pages. Terraform/HCL and
// Bicep have no CodeMirror mode; their blocks are left uncoloured.
var LANGS = [
  ["bash", ["sh", "shell", "zsh", "console"], legacy(shell)],
  ["powershell", ["ps1", "pwsh", "ps"], legacy(powerShell)],
  ["json", ["jsonc", "json5"], modern(json)],
  ["yaml", ["yml"], modern(yaml)],
  ["python", ["py"], modern(python)],
  ["javascript", ["js", "node"], modern(javascript)],
  ["typescript", ["ts"], function () { return javascript({ typescript: true }); }],
  ["xml", ["svg", "drawio"], modern(xml)],
  ["html", ["htm"], modern(html)],
  ["css", [], modern(css)],
  ["sql", ["tsql", "psql"], modern(sql)],
  ["dockerfile", ["docker"], legacy(dockerFile)],
  ["ini", ["properties", "conf", "cfg"], legacy(properties)],
  ["toml", [], legacy(toml)],
  ["csharp", ["cs", "c#"], legacy(csharp)],
  ["go", ["golang"], legacy(go)],
  ["diff", ["patch"], legacy(diff)],
];

export var codeLanguages = LANGS.map(function (entry) {
  var make = entry[2];
  return LanguageDescription.of({
    name: entry[0],
    alias: entry[1],
    load: function () {
      return Promise.resolve(make());
    },
  });
});
