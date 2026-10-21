// A small static-file server for the Next.js export. No application backend.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "out",
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".zip": "application/zip",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || "127.0.0.1";
try {
  await stat(path.join(root, "index.html"));
} catch {
  throw new Error("Production files are missing. Run pnpm build first.");
}
createServer(async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url || "/", "http://localhost").pathname,
    );
    const resolved = path.resolve(root, "." + pathname);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const candidate = pathname.endsWith("/")
      ? path.join(resolved, "index.html")
      : resolved;
    const bytes = await readFile(candidate);
    res.writeHead(200, {
      "Content-Type":
        types[path.extname(candidate)] || "application/octet-stream",
      "Content-Length": bytes.length,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":
        candidate.endsWith("index.json") ||
        candidate.endsWith(".html") ||
        candidate.endsWith(".webmanifest")
          ? "no-cache"
          : "public, max-age=3600",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, host, () =>
  console.log(`Price Action: http://${host}:${port}`),
);
