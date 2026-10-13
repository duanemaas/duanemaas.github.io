// Local survey app: serves the survey page and relays answers to FileMaker Server.
// The FileMaker credentials stay on this machine; the browser only talks to this server.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createResponse, getSurveyFields, listResponses, logout, settings } from "./filemaker.js";

const port = Number(process.env.PORT) || 3000;
const here = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(here, "public");
const siteStyles = join(here, "..", "styles.css");
const maxBodyBytes = 64 * 1024;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBodyBytes) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
  });
}

async function serveStatic(res, pathname) {
  const file = pathname === "/styles.css"
    ? siteStyles
    : join(publicDir, normalize(pathname === "/" ? "/index.html" : pathname));
  if (file !== siteStyles && !file.startsWith(publicDir)) return sendJson(res, 404, { error: "Not found" });
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": contentTypes[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

const routes = {
  "GET /api/status": async () => ({ connected: true, ...settings, fields: (await getSurveyFields()).length }),
  "GET /api/fields": () => getSurveyFields(),
  "GET /api/responses": () => listResponses(),
  "POST /api/responses": async (req) => ({ recordId: await createResponse(await readJson(req)) }),
};

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const route = routes[`${req.method} ${pathname}`];
  if (!route) return serveStatic(res, pathname);
  try {
    sendJson(res, req.method === "POST" ? 201 : 200, await route(req));
  } catch (err) {
    console.error(`${req.method} ${pathname}:`, err.message, err.code ? `(FileMaker error ${err.code})` : "");
    sendJson(res, err.status && err.status < 500 ? err.status : 502, { error: err.message, code: err.code ?? null });
  }
});

// Bind to localhost only so the survey and its FileMaker session are not exposed on the network.
server.listen(port, "127.0.0.1", () => {
  console.log(`Survey app running at http://localhost:${port}`);
  console.log(`FileMaker: ${settings.host} / ${settings.database} / layout ${settings.layout}`);
});

async function shutdown() {
  await logout();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
