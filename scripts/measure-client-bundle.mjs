import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

// Run after npm run build. This measures emitted scripts referenced by the
// prerendered home page, excluding legacy-browser nomodule polyfills.
// Gzip sizes are reproducible estimates, not measured network transfer times.
const html = readFileSync(".next/server/app/index.html", "utf8");
const urls = [...new Set([...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)]
  .filter(match => !/\bnomodule\b/i.test(match[0]))
  .map(match => match[1])
  .filter(url => url.startsWith("/_next/static/") && url.endsWith(".js")))];
const chunks = urls.map(url => {
  const content = readFileSync(".next/" + url.slice("/_next/".length));
  return { file: url.split("/").pop(), bytes: content.byteLength, gzipBytes: gzipSync(content).byteLength };
});
console.log(JSON.stringify({
  initialJavaScriptBytes: chunks.reduce((total, chunk) => total + chunk.bytes, 0),
  initialJavaScriptGzipBytes: chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0),
  chunks,
}, null, 2));
