#!/usr/bin/env node
/**
 * Builds docs/YourTour-User-Guide.pdf from docs/user-guide/{cover,guide}.html
 * with the locally installed Chrome or Edge (headless, DevTools protocol).
 * Bookmarks and merging are added by scripts/finish-user-guide.py (pypdf).
 *
 *   node scripts/build-user-guide.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "docs", "user-guide");
// node scripts/build-user-guide.mjs [guide|beginner]
const kind = process.argv[2] === "beginner" ? "beginner" : "guide";
const label = kind === "beginner" ? "Beginner's guide" : "User guide";
const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const exe = browsers.find((b) => existsSync(b));
if (!exe) throw new Error("Chrome or Edge is required to build the PDF.");

const port = 9800 + Math.floor(Math.random() * 100);
const child = spawn(exe, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "guide-"))}`, "--no-first-run", "--allow-file-access-from-files", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 50; i++) {
  try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; } catch { await sleep(200); }
}

async function printPdf(file, out, options) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)[msg.error ? "reject" : "resolve"](msg.error ? new Error(msg.error.message) : msg.result);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: pathToFileURL(path.join(dir, file)).href });
  // Wait for fonts and every image.
  for (let i = 0; i < 100; i++) {
    const r = await send("Runtime.evaluate", { expression: "document.readyState === 'complete' && [...document.images].every(i => i.complete) && document.fonts.status === 'loaded'", returnByValue: true });
    if (r.result.value) break;
    await sleep(200);
  }
  await sleep(500);
  const { data } = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, ...options });
  writeFileSync(out, Buffer.from(data, "base64"));
  ws.close();
  console.log("printed", path.basename(out));
}

const footer = `<div style="width:100%;font-family:Segoe UI,Arial,sans-serif;font-size:7.5px;color:#56616a;padding:0 17mm;display:flex;justify-content:space-between">
  <span><b style="color:#0d3b44">YourTour</b> · ${label}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

await printPdf(kind === "beginner" ? "beginner-cover.html" : "cover.html", path.join(dir, "_cover.pdf"), { displayHeaderFooter: false });
await printPdf(kind === "beginner" ? "beginner.html" : "guide.html", path.join(dir, "_body.pdf"), { displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: footer });
child.kill();
