import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ICONS_DIR = path.join(ROOT, "icons");
const CRAFTING_PATH = path.join(ROOT, "data/crafting.json");
const INDEX_PATH = path.join(ROOT, "index.html");

/** Item icons to mirror locally (marketId → codex png path). */
const ICON_SOURCES = {
  5301: "https://bdocodex.com/items/new_icon/03_etc/07_productmaterial/00005301.png",
};

async function fetchIcon(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 BDO_Elixir/icon-fetch",
      Referer: "https://bdocodex.com/",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) {
    throw new Error(`Not an image (${type})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

function useLocalIcon(id) {
  const rel = `./icons/${id}.png`;
  const crafting = JSON.parse(fs.readFileSync(CRAFTING_PATH, "utf8"));
  crafting.iconOverrides = crafting.iconOverrides || {};
  crafting.iconOverrides[String(id)] = rel;
  for (const entry of Object.values(crafting.freeReagents || {})) {
    if (String(entry.marketId) === String(id)) {
      entry.iconUrl = rel;
    }
  }
  fs.writeFileSync(CRAFTING_PATH, `${JSON.stringify(crafting, null, 2)}\n`);

  let html = fs.readFileSync(INDEX_PATH, "utf8");
  html = html.replace(
    /<link rel="icon" href="[^"]+" type="image\/png">/,
    `<link rel="icon" href="${rel}" type="image/png">`
  );
  fs.writeFileSync(INDEX_PATH, html);
}

async function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  for (const [id, url] of Object.entries(ICON_SOURCES)) {
    const outPath = path.join(ICONS_DIR, `${id}.png`);
    try {
      const data = await fetchIcon(url);
      const rel = `./icons/${id}.png`;
      fs.writeFileSync(outPath, data);
      useLocalIcon(id);
      console.log(`Wrote ${outPath} (${data.length} bytes) and pointed overrides to ${rel}`);
    } catch (err) {
      console.error(`Failed #${id}: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

main();
