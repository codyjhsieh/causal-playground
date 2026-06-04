// Zero-dependency dev server with live reload. Serves the project statically and
// auto-refreshes every connected browser when any file changes — no build step,
// no npm packages (works on the installed Node 16). Run:  node dev-server.mjs
//
// It watches the project tree with fs.watch and pushes a "reload" over a
// Server-Sent Events stream; a tiny client snippet (injected into index.html)
// listens and calls location.reload(). Full-page reload — the router cleans up
// each module on navigation, so a refresh restores a clean state.

import http from "http";
import { readFile } from "fs/promises";
import { watch } from "fs";
import { extname, join, normalize } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? +process.env.PORT : 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// The snippet injected into index.html that subscribes to reload events.
const LIVE_RELOAD = `
<script>
(function () {
  var es = new EventSource("/__livereload");
  es.onmessage = function (e) { if (e.data === "reload") location.reload(); };
  es.onerror = function () { /* server restart — try to reconnect */ };
})();
</script>`;

const clients = new Set();

const server = http.createServer(async (req, res) => {
  // SSE stream for reload notifications
  if (req.url === "/__livereload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  // Resolve path, prevent directory traversal
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = normalize(join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }

  try {
    let body = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    if (ext === ".html") {
      body = Buffer.from(body.toString().replace("</body>", LIVE_RELOAD + "\n</body>"));
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found: " + urlPath);
  }
});

// Watch the tree and broadcast a debounced reload on any change.
let timer = null;
function broadcast() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    for (const res of clients) res.write("data: reload\n\n");
  }, 80);
}
try {
  watch(ROOT, { recursive: true }, (_evt, file) => {
    if (!file) return;
    if (/(^|\/)(\.git|node_modules)\//.test(file)) return;
    if (/\.(js|mjs|css|html|json|svg)$/.test(file)) broadcast();
  });
} catch (e) {
  console.warn("recursive watch unavailable on this platform:", e.message);
}

server.listen(PORT, () => {
  console.log(`Causal Playground dev server → http://localhost:${PORT}  (live reload on)`);
});
