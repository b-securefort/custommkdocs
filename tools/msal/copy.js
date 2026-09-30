// MSAL ships ready-built browser files, so there is nothing to bundle: copy
// the two the chat uses next to the site's other vendored scripts.
//   msal-browser.min.js           window.msal, loaded when the chat opens
//   msal-redirect-bridge.min.js   window.msalRedirectBridge, for chat-signin.html
var fs = require("fs");
var path = require("path");

var from = path.join(__dirname, "node_modules", "@azure", "msal-browser", "lib");
var to = path.join(__dirname, "..", "..", "docs", "javascripts", "vendor");

[
  ["msal-browser.min.js", "msal-browser.min.js"],
  [path.join("redirect-bridge", "msal-redirect-bridge.min.js"), "msal-redirect-bridge.min.js"],
].forEach(function (pair) {
  fs.copyFileSync(path.join(from, pair[0]), path.join(to, pair[1]));
  console.log("docs/javascripts/vendor/" + pair[1]);
});
