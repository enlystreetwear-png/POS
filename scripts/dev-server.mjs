import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const port = Number(process.env.PORT || 4173);
const clients = new Set();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const liveReloadSnippet = `
<script>
(() => {
  const source = new EventSource("/__live-reload");
  source.onmessage = (event) => {
    if (event.data === "reload") window.location.reload();
  };
})();
</script>`;

function safePath(urlPath) {
  const cleanPath = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const resolvedPath = resolve(root, cleanPath === "/" ? "index.html" : cleanPath.slice(1));
  return resolvedPath.startsWith(root) ? resolvedPath : join(root, "index.html");
}

function sendHeaders(response, status, contentType) {
  response.writeHead(status, {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Content-Type": contentType,
    Expires: "0",
    Pragma: "no-cache"
  });
}

function serveHtml(response, filePath) {
  let html = createReadStream(filePath, { encoding: "utf8" });
  let body = "";
  html.on("data", (chunk) => {
    body += chunk;
  });
  html.on("end", () => {
    sendHeaders(response, 200, mimeTypes[".html"]);
    response.end(body.replace("</body>", `${liveReloadSnippet}</body>`));
  });
}

function serveFile(request, response) {
  if (request.url === "/__live-reload") {
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream"
    });
    response.write("event: open\ndata: connected\n\n");
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  const filePath = safePath(request.url || "/");
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    sendHeaders(response, 404, "text/plain; charset=utf-8");
    response.end("Not found");
    return;
  }

  const extension = extname(filePath);
  if (extension === ".html") {
    serveHtml(response, filePath);
    return;
  }

  sendHeaders(response, 200, mimeTypes[extension] || "application/octet-stream");
  createReadStream(filePath).pipe(response);
}

function notifyReload() {
  for (const client of clients) {
    client.write("data: reload\n\n");
  }
}

for (const path of ["index.html", "service-worker.js", "src", "public"]) {
  watch(join(root, path), { recursive: true }, (eventType, fileName) => {
    if (!fileName || String(fileName).includes("firebase-config.js")) return;
    console.log(`Reloading preview: ${path}/${fileName}`);
    notifyReload();
  });
}

createServer(serveFile).listen(port, () => {
  console.log(`Live preview running at http://localhost:${port}/`);
});
