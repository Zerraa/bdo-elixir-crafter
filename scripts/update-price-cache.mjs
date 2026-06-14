import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REGION = "eu";
const BDM_BASE = "https://api.blackdesertmarket.com/item";
const DELAY_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectMarketIds(crafting, marketIds) {
  const ids = new Set();
  const add = (id) => {
    if (id != null) ids.add(Number(id));
  };

  for (const entry of Object.values(marketIds.materials || {})) add(entry);
  for (const entry of Object.values(marketIds.elixirsGreen || {})) add(entry);
  for (const entry of Object.values(marketIds.elixirsBlue || {})) add(entry);
  for (const entry of Object.values(marketIds.draughts || {})) add(entry);
  for (const entry of Object.values(marketIds.partyHarmonies || {})) add(entry);
  for (const entry of Object.values(marketIds.partyElixirs || {})) add(entry);
  add(marketIds.harmony?.marketId);
  add(marketIds.catalyst?.marketId);

  for (const recipe of Object.values(crafting.elixirs || {})) {
    for (const mat of recipe.materials || []) add(mat.marketId);
    add(recipe.codexId);
    add(recipe.blueMarketId);
  }

  for (const draught of crafting.draughts || []) add(draught.marketId);
  add(crafting.harmony?.marketId);
  add(crafting.catalyst?.marketId);

  for (const variant of Object.values(crafting.partyHarmonies?.variants || {})) {
    add(variant.marketId);
    for (const mat of variant.materials || []) add(mat.marketId);
  }

  return [...ids].sort((a, b) => a - b);
}

async function fetchBdmPrice(id) {
  const url = `${BDM_BASE}/${id}?region=${REGION}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const item = data?.data?.[0];
  if (!item || item.basePrice == null) return null;
  return { id: item.id, name: item.name, basePrice: item.basePrice };
}

async function main() {
  const crafting = JSON.parse(
    fs.readFileSync(path.join(ROOT, "data/crafting.json"), "utf8")
  );
  const marketIds = JSON.parse(
    fs.readFileSync(path.join(ROOT, "data/marketIds.json"), "utf8")
  );
  const ids = collectMarketIds(crafting, marketIds);

  const prices = {};
  let ok = 0;
  let fail = 0;

  for (const id of ids) {
    try {
      const entry = await fetchBdmPrice(id);
      if (entry) {
        prices[String(id)] = entry;
        ok++;
        process.stdout.write(`\r${ok + fail}/${ids.length} · ${entry.name}`);
      } else {
        fail++;
        process.stdout.write(`\r${ok + fail}/${ids.length} · #${id} failed`);
      }
    } catch {
      fail++;
    }
    await sleep(DELAY_MS);
  }

  const out = {
    region: REGION,
    source: "api.blackdesertmarket.com",
    updatedAt: new Date().toISOString(),
    prices,
  };

  const outPath = path.join(ROOT, "data/price-cache.json");
  fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`\nWrote ${ok} prices (${fail} failed) → data/price-cache.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
