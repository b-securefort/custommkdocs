// Chart.js ships a ready-built UMD file, so there is nothing to bundle: copy
// it next to the site's other vendored scripts.
//   chart.umd.min.js   window.Chart, loaded by javascripts/charts.js on pages
//                      with a chart
var fs = require("fs");
var path = require("path");

var from = path.join(__dirname, "node_modules", "chart.js", "dist", "chart.umd.min.js");
var to = path.join(__dirname, "..", "..", "docs", "javascripts", "vendor", "chart.umd.min.js");

fs.copyFileSync(from, to);
console.log("docs/javascripts/vendor/chart.umd.min.js");
