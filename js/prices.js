const CACHE_KEY = "bdo_elixir_prices";
const CACHE_TTL_MS = 15 * 60 * 1000;
const API_BASE = "https://api.arsha.io/v1/eu/price";
const CONCURRENCY = 3;
const FETCH_DELAY_MS = 120;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const POST_BATCH_SIZE = 25;
const IMPERVA_CODE = 103;
const CLEAR_REAGENT_ID = 5301;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatSilver(value) {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function readCache() {
  try {
    for (const storage of [sessionStorage, localStorage]) {
      const raw = storage.getItem(CACHE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp > CACHE_TTL_MS) continue;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(prices) {
  const payload = JSON.stringify({ timestamp: Date.now(), prices });
  sessionStorage.setItem(CACHE_KEY, payload);
  try {
    localStorage.setItem(CACHE_KEY, payload);
  } catch {
    /* quota or private mode */
  }
}

function isImpervaError(data) {
  return (
    data?.code === IMPERVA_CODE || /imperva/i.test(String(data?.message || ""))
  );
}

function apiError(message, data) {
  const err = new Error(message);
  err.imperva = isImpervaError(data);
  err.code = data?.code;
  return err;
}

async function fetchPostBatch(ids) {
  const body = ids.map((id) => ({ id, sid: 0, lang: "en" }));
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok || data?.status >= 400 || data?.code != null) {
    throw apiError(data?.message || `HTTP ${res.status}`, data ?? {});
  }
  if (Array.isArray(data)) {
    const prices = {};
    for (const item of data) {
      if (item?.id == null) continue;
      prices[String(item.id)] = {
        id: item.id,
        name: item.name,
        basePrice: item.basePrice ?? null,
      };
    }
    return prices;
  }
  return {};
}

async function fetchOne(id) {
  const url = `${API_BASE}?id=${id}&sid=0&lang=en`;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok || data?.status >= 400 || data?.code != null) {
        throw apiError(data?.message || `HTTP ${res.status}`, data ?? {});
      }
      return { id, name: data.name, basePrice: data.basePrice ?? null };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = err.imperva ? 800 * (attempt + 1) : 400 * (attempt + 1);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

async function fetchBatch(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const prices = {};
  let fetched = 0;
  let failed = 0;
  let impervaBlocked = false;
  const pending = new Set(unique);

  for (let i = 0; i < unique.length; i += POST_BATCH_SIZE) {
    const chunk = unique.slice(i, i + POST_BATCH_SIZE);
    try {
      const batch = await fetchPostBatch(chunk);
      for (const id of chunk) {
        const entry = batch[String(id)] ?? batch[id];
        if (entry?.basePrice != null) {
          prices[String(id)] = entry;
          pending.delete(id);
          fetched++;
        }
      }
    } catch (err) {
      if (err.imperva) impervaBlocked = true;
    }
    if (i + POST_BATCH_SIZE < unique.length) await sleep(FETCH_DELAY_MS);
  }

  const queue = [...pending];

  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try {
        const result = await fetchOne(id);
        if (result?.basePrice != null) {
          prices[String(id)] = result;
          fetched++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        if (err.imperva) impervaBlocked = true;
      }
      if (queue.length) await sleep(FETCH_DELAY_MS);
    }
  }

  if (queue.length) {
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, queue.length) },
      () => worker()
    );
    await Promise.all(workers);
  }

  return {
    prices,
    fetched,
    failed,
    total: unique.length,
    impervaBlocked,
    apiUnavailable: false,
  };
}

function countCovered(ids, priceMap) {
  return ids.filter((id) => priceMap[String(id)]?.basePrice != null).length;
}

export function getUnitPrice(item, prices, prefs = {}) {
  if (item?.vendorPrice != null) return item.vendorPrice;
  if (
    prefs?.ignoreClearReagent &&
    item?.marketId === CLEAR_REAGENT_ID
  ) {
    return 0;
  }
  const key = item?.marketId;
  if (key == null) return null;
  return prices[String(key)]?.basePrice ?? prices[key]?.basePrice ?? null;
}

export function collectMarketIds(calcResult) {
  const ids = new Set();

  if (calcResult.mode === "harmony" || calcResult.mode === "party") {
    if (
      calcResult.catalystItem?.marketId &&
      calcResult.catalystItem.vendorPrice == null
    ) {
      ids.add(calcResult.catalystItem.marketId);
    }
    return [...ids];
  }

  for (const mat of calcResult.materials || []) {
    if (mat.marketId && mat.vendorPrice == null) ids.add(mat.marketId);
  }

  if (
    calcResult.catalystItem?.marketId &&
    calcResult.catalystItem.vendorPrice == null
  ) {
    ids.add(calcResult.catalystItem.marketId);
  }

  return [...ids];
}

export async function loadPrices(ids, { force = false } = {}) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) {
    const cached = readCache();
    return {
      prices: cached?.prices ?? {},
      updatedAt: cached?.timestamp ?? null,
      fromCache: true,
      fetched: 0,
      failed: 0,
      total: 0,
    };
  }

  if (!force) {
    const cached = readCache();
    if (cached) {
      const hasAll = unique.every(
        (id) =>
          cached.prices[String(id)]?.basePrice != null ||
          cached.prices[id]?.basePrice != null
      );
      if (hasAll) {
        return {
          prices: cached.prices,
          updatedAt: cached.timestamp,
          fromCache: true,
          fetched: unique.length,
          failed: 0,
          total: unique.length,
        };
      }
    }
  }

  const cached = readCache();
  const merged = {};
  for (const [id, entry] of Object.entries(cached?.prices || {})) {
    if (entry?.basePrice != null) merged[String(id)] = entry;
  }

  const batch = await fetchBatch(unique);
  for (const [id, entry] of Object.entries(batch.prices)) {
    if (entry?.basePrice != null) merged[String(id)] = entry;
  }
  writeCache(merged);

  const covered = countCovered(unique, merged);
  const liveFetch = batch.fetched;
  const fromLive = liveFetch > 0;

  return {
    prices: merged,
    updatedAt: fromLive ? Date.now() : cached?.timestamp ?? Date.now(),
    fromCache: !fromLive && covered > 0,
    fetched: fromLive ? liveFetch : covered,
    failed: fromLive ? batch.failed : Math.max(0, unique.length - covered),
    total: unique.length,
    apiUnavailable: covered === 0 && unique.length > 0,
    impervaBlocked: batch.impervaBlocked,
  };
}

export function computeTotalCost(calcResult, prices, gradeMode, prefs = {}) {
  let total = 0;
  let hasMissing = false;

  if (calcResult.mode === "harmony" || calcResult.mode === "party") {
    if (calcResult.catalystItem) {
      const cPrice = getUnitPrice(calcResult.catalystItem, prices, prefs);
      if (cPrice == null) hasMissing = true;
      else total += cPrice * calcResult.catalystItem.qty;
    }
    return { total, hasMissing };
  }

  for (const mat of calcResult.materials || []) {
    const price = getUnitPrice(mat, prices, prefs);
    if (price == null) hasMissing = true;
    else total += price * mat.qty;
  }

  if (calcResult.catalystItem) {
    const cPrice = getUnitPrice(calcResult.catalystItem, prices, prefs);
    if (cPrice == null) hasMissing = true;
    else total += cPrice * calcResult.catalystItem.qty;
  }

  return { total, hasMissing };
}

export function lineTotal(item, prices, prefs = {}) {
  const price = getUnitPrice(item, prices, prefs);
  if (price == null) return null;
  return price * item.qty;
}

export function collectFullCraftMarketIds(calcResult) {
  if (calcResult.mode === "harmony" || calcResult.mode === "party") {
    return [];
  }
  const ids = new Set();
  for (const mat of calcResult.materials || []) {
    if (mat.marketId && mat.vendorPrice == null) ids.add(mat.marketId);
  }
  return [...ids];
}

export function collectCompareMarketIds(calcResult, craftingData) {
  const ids = new Set();

  if (calcResult.mode === "elixirs") {
    const recipe = craftingData.elixirs[calcResult.elixirName];
    if (recipe?.codexId) ids.add(recipe.codexId);
  } else if (calcResult.mode === "harmony") {
    if (craftingData.harmony?.marketId) {
      ids.add(craftingData.harmony.marketId);
    }
  } else if (calcResult.mode === "party") {
    if (calcResult.partyMarketId) ids.add(calcResult.partyMarketId);
  }

  return [...ids];
}

export function computeBuyCost(calcResult, prices, craftingData) {
  if (calcResult.mode === "elixirs") {
    const recipe = craftingData.elixirs[calcResult.elixirName];
    const qty = calcResult.expectedOutput?.greens?.expected ?? 0;
    const unitPrice =
      prices[String(recipe?.codexId)]?.basePrice ??
      prices[recipe?.codexId]?.basePrice ??
      null;
    const total =
      unitPrice != null && qty > 0 ? unitPrice * qty : unitPrice == null ? null : 0;
    return {
      total,
      hasMissing: unitPrice == null && qty > 0,
      qty,
      unitPrice,
      itemName: calcResult.elixirName,
      unitLabel: "green elixirs",
      detail: "Central Market",
    };
  }

  if (calcResult.mode === "harmony") {
    const qty = calcResult.harmonies;
    const marketId = craftingData.harmony?.marketId;
    const itemName = craftingData.harmony?.name ?? "Harmony Draught";
    const unitPrice =
      prices[String(marketId)]?.basePrice ?? prices[marketId]?.basePrice ?? null;
    const total =
      unitPrice != null && qty > 0 ? unitPrice * qty : unitPrice == null ? null : 0;
    return {
      total,
      hasMissing: unitPrice == null && qty > 0,
      qty,
      unitPrice,
      itemName,
      unitLabel: "harmonies",
      detail: "Central Market",
    };
  }

  if (calcResult.mode === "party") {
    const qty = calcResult.partyCount;
    const marketId = calcResult.partyMarketId;
    const itemName = calcResult.partyName ?? "Party Harmony Draught";
    const unitPrice =
      prices[String(marketId)]?.basePrice ?? prices[marketId]?.basePrice ?? null;
    const total =
      unitPrice != null && qty > 0 ? unitPrice * qty : unitPrice == null ? null : 0;
    return {
      total,
      hasMissing: unitPrice == null && qty > 0,
      qty,
      unitPrice,
      itemName,
      unitLabel: "party draughts",
      detail: "Central Market",
    };
  }

  return { total: 0, hasMissing: false, qty: 0, itemName: "", unitLabel: "" };
}

export function computeFullCraftCost(calcResult, prices, prefs = {}) {
  if (calcResult.mode === "elixirs") {
    const cost = computeTotalCost(calcResult, prices, "green", prefs);
    return {
      ...cost,
      detail: "Raw materials",
      qty: calcResult.crafts,
      itemName: `${calcResult.elixirName} crafts`,
    };
  }

  if (calcResult.mode === "party") {
    const cost = computeTotalCost(calcResult, prices, "green", prefs);
    return {
      ...cost,
      detail: "Catalyst only (elixirs assumed ready)",
      qty: calcResult.partyCount,
      itemName: "party draughts",
    };
  }

  const cost = computeTotalCost(calcResult, prices, "green", prefs);
  return {
    ...cost,
    detail: "Catalyst (elixirs assumed ready)",
    qty: calcResult.harmonies,
    itemName: "harmonies",
  };
}

export function computeCompare(calcResult, prices, craftingData, prefs = {}) {
  const buy = computeBuyCost(calcResult, prices, craftingData);
  const craft = computeFullCraftCost(calcResult, prices, prefs);

  let cheaper = null;
  let savings = null;
  let craftPartial = false;

  if (buy.total != null && craft.total != null && !buy.hasMissing) {
    savings = buy.total - craft.total;
    craftPartial = craft.hasMissing;
    if (savings > 0) cheaper = "craft";
    else if (savings < 0) cheaper = "buy";
    else cheaper = "tie";
  }

  return { buy, craft, savings, cheaper, craftPartial };
}
