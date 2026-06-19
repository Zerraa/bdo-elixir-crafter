const CODEX_BASE = "https://bdocodex.com/items/new_icon";

/** Optional bundled icons (run `node scripts/fetch-item-icons.mjs` to populate). */
const LOCAL_ICON_FALLBACKS = {
  5301: "./icons/5301.png",
};

const CONSUMABLE_POTION_IDS = new Set([517, 518]);

function codexIconFile(marketId) {
  const n = Number(marketId);
  const width = n >= 100000 ? 9 : 8;
  return String(marketId).padStart(width, "0");
}

function potionIconUrl(marketId) {
  return `${CODEX_BASE}/03_etc/08_potion/${codexIconFile(marketId)}.webp`;
}

function productMaterialIconUrl(marketId, ext = "webp") {
  return `${CODEX_BASE}/03_etc/07_productmaterial/${codexIconFile(marketId)}.${ext}`;
}

function materialIconCandidates(marketId) {
  const file = codexIconFile(marketId);
  const folders = ["07_productmaterial", "08_potion"];
  const exts = ["webp", "png"];
  const urls = [];
  for (const folder of folders) {
    for (const ext of exts) {
      urls.push(`${CODEX_BASE}/03_etc/${folder}/${file}.${ext}`);
    }
  }
  return urls;
}

function isConsumablePotion(marketId) {
  return CONSUMABLE_POTION_IDS.has(Number(marketId));
}

export function buildIconOverrides(data) {
  const overrides = {};

  for (const [id, url] of Object.entries(data?.iconOverrides || {})) {
    if (url) overrides[String(id)] = url;
  }

  for (const id of data?.potionMarketIds || []) {
    overrides[String(id)] = potionIconUrl(id);
  }
  for (const id of CONSUMABLE_POTION_IDS) {
    overrides[String(id)] = potionIconUrl(id);
  }

  if (data?.catalyst?.marketId) {
    overrides[String(data.catalyst.marketId)] = productMaterialIconUrl(
      data.catalyst.marketId
    );
  }

  if (data?.harmony?.marketId) {
    overrides[String(data.harmony.marketId)] = potionIconUrl(data.harmony.marketId);
  }

  for (const draught of data?.draughts || []) {
    if (draught.marketId) {
      overrides[String(draught.marketId)] = potionIconUrl(draught.marketId);
    }
  }

  for (const elixir of Object.values(data?.elixirs || {})) {
    if (elixir.codexId) {
      const iconId = elixir.iconId ?? elixir.codexId;
      overrides[String(elixir.codexId)] = potionIconUrl(iconId);
    }
    if (elixir.blueMarketId) {
      const blueIconId = elixir.blueIconId ?? elixir.blueMarketId;
      overrides[String(elixir.blueMarketId)] = potionIconUrl(blueIconId);
    }
  }

  for (const variant of Object.values(data?.partyHarmonies?.variants || {})) {
    if (variant.marketId) {
      overrides[String(variant.marketId)] = potionIconUrl(variant.marketId);
    }
  }

  for (const entry of Object.values(data?.freeReagents || {})) {
    if (entry?.marketId && entry.iconUrl) {
      overrides[String(entry.marketId)] = entry.iconUrl;
    }
  }

  return overrides;
}

export function itemIconUrlCandidates(marketId, overrides = {}) {
  if (marketId == null) return [];
  const key = String(marketId);
  let candidates;
  if (overrides[key]) {
    const primary = overrides[key];
    const rest = materialIconCandidates(marketId).filter((url) => url !== primary);
    candidates = [primary, ...rest];
  } else if (isConsumablePotion(marketId)) {
    const file = codexIconFile(marketId);
    candidates = [
      `${CODEX_BASE}/03_etc/08_potion/${file}.webp`,
      `${CODEX_BASE}/03_etc/08_potion/${file}.png`,
      `${CODEX_BASE}/03_etc/07_productmaterial/${file}.webp`,
      `${CODEX_BASE}/03_etc/07_productmaterial/${file}.png`,
    ];
  } else {
    candidates = materialIconCandidates(marketId);
  }

  const local = LOCAL_ICON_FALLBACKS[key];
  if (local && !candidates.includes(local)) {
    candidates.push(local);
  }
  return candidates;
}

export function itemIconUrl(marketId, overrides = {}) {
  const candidates = itemIconUrlCandidates(marketId, overrides);
  return candidates[0] ?? null;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function itemIconImg(marketId, name, overrides, { size = 24, className = "item-icon" } = {}) {
  const candidates = itemIconUrlCandidates(marketId, overrides);
  if (!candidates.length) return "";

  const [first, ...fallbacks] = candidates;
  const fallbackAttr =
    fallbacks.length > 0
      ? ` data-fallbacks="${escapeAttr(fallbacks.join("|"))}" data-i="0" onerror="var s=this.dataset.fallbacks.split('|');var i=+this.dataset.i+1;if(i<s.length){this.dataset.i=i;this.src=s[i]}else{this.onerror=null}"`
      : "";

  return `<img src="${escapeAttr(first)}" alt="" width="${size}" height="${size}" class="${className}" loading="lazy" decoding="async" referrerpolicy="strict-origin-when-cross-origin" title="${escapeAttr(name || "")}"${fallbackAttr}>`;
}

export function materialCell(marketId, name, overrides, { link = true, showIcon = true } = {}) {
  const icon = showIcon ? itemIconImg(marketId, name, overrides) : "";
  const label = link && marketId
    ? `<a href="https://bdocodex.com/us/item/${marketId}/" target="_blank" rel="noopener">${name}</a>`
    : name;
  if (!showIcon) return label;
  return `<span class="material-cell">${icon}<span class="material-cell-name">${label}</span></span>`;
}
