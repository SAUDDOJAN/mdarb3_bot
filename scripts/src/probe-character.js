/**
 * One-shot diagnostic probe for the shugo.gg / NCsoft character/info API.
 * Usage:  node --input-type=module scripts/src/probe-character.js "<shugo_url>"
 *
 * Dumps the FULL raw JSON, then walks every key recursively and reports
 * any that look like stats, equipment, arcana, runes, or titles.
 */

const PROXY_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:               "application/json, text/plain, */*",
  "Accept-Language":    "en-US,en;q=0.9",
  Referer:              "https://shugo.gg/",
  Origin:               "https://shugo.gg",
  "Sec-Fetch-Dest":     "empty",
  "Sec-Fetch-Mode":     "cors",
  "Sec-Fetch-Site":     "same-origin",
};

function parseShugUrl(raw) {
  const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  return {
    id:     decodeURIComponent(url.searchParams.get("id") ?? ""),
    server: url.searchParams.get("server") ?? "",
    region: (url.searchParams.get("region") ?? "TW").toUpperCase(),
    name:   url.searchParams.get("name") ?? "",
  };
}

/** Collect every leaf path + value in the object tree. */
function collectPaths(obj, path = "", out = []) {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object") {
    out.push({ path, value: obj });
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => collectPaths(v, `${path}[${i}]`, out));
  } else {
    for (const [k, v] of Object.entries(obj)) {
      collectPaths(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

const INTEREST = /stat|might|dex|intel|const|prec|will|equip|gear|item|weapon|armor|armo|access|arcana|rune|title|slot|enchant|reinforc|level|power|combat|class|race|server/i;

const shugoUrl = process.argv[2];
if (!shugoUrl) {
  console.error("Usage: node --input-type=module scripts/src/probe-character.js \"<shugo_url>\"");
  process.exit(1);
}

const { id, server, region } = parseShugUrl(shugoUrl);
const encodedId  = encodeURIComponent(id);
const innerUrl   = `https://tw.ncsoft.com/aion2/api/character/info?lang=en&characterId=${encodedId}&serverId=${server}`;
const proxyUrl   = `https://shugo.gg/api/proxy?url=${encodeURIComponent(innerUrl)}`;

console.log(`\n🔍 Probing: ${proxyUrl}\n`);

const res  = await fetch(proxyUrl, { headers: PROXY_HEADERS, signal: AbortSignal.timeout(20_000) });
const json = await res.json();
const raw  = json.profile ?? json;

console.log("═".repeat(70));
console.log("FULL JSON (first 6000 chars):");
console.log("═".repeat(70));
console.log(JSON.stringify(raw, null, 2).substring(0, 6000));

console.log("\n" + "═".repeat(70));
console.log("TOP-LEVEL KEYS:");
console.log("═".repeat(70));
console.log(Object.keys(raw).join(", "));

console.log("\n" + "═".repeat(70));
console.log("INTERESTING PATHS (matching stat/equip/arcana/rune/title/etc.):");
console.log("═".repeat(70));
const paths = collectPaths(raw);
const interesting = paths.filter(({ path }) => INTEREST.test(path));
for (const { path, value } of interesting.slice(0, 200)) {
  const display = typeof value === "string" ? `"${value}"` : value;
  console.log(`  ${path.padEnd(55)} = ${display}`);
}

console.log(`\nTotal paths: ${paths.length} | Interesting: ${interesting.length}`);
