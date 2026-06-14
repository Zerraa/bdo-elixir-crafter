import { calcElixirsOnly, calcFullChain, calcPartyHarmony } from "./calculator.js";
import {
  loadPrices,
  collectMarketIds,
  collectCompareMarketIds,
  collectFullCraftMarketIds,
  computeTotalCost,
} from "./prices.js";
import { buildIconOverrides } from "./icons.js";
import { loadSession, persistSession } from "./session.js";
import {
  renderStats,
  renderBreakdown,
  renderShoppingList,
  renderMarketStatus,
  renderAlchemySetup,
  renderCompare,
  populateElixirSelect,
  populatePartyVariants,
  setPanelVisibility,
  updateElixirSelectIcon,
} from "./render.js";

let craftingData = null;
let prices = {};
let priceMeta = {
  updatedAt: null,
  fromCache: false,
  fetched: 0,
  failed: 0,
  total: 0,
  apiUnavailable: false,
  impervaBlocked: false,
};

const state = {
  mode: "elixirs",
  elixirName: "Elixir of Fury",
  elixirCrafts: 500,
  harmonyCrafts: 10,
  draughtGrade: "green",
  partyVariant: "human",
  partyCount: 10,
  useLionForBear: true,
  ignoreClearReagent: true,
  sortBy: "cost",
};

let compareOpen = false;
let refreshInFlight = false;

function getPrefs() {
  return {
    useLionForBear: state.useLionForBear,
    ignoreClearReagent: state.ignoreClearReagent,
  };
}

function collectAllComparePriceIds(calc) {
  const ids = new Set(collectMarketIds(calc));
  for (const id of collectCompareMarketIds(calc, craftingData)) {
    ids.add(id);
  }
  for (const id of collectFullCraftMarketIds(calc)) {
    ids.add(id);
  }
  return [...ids];
}

function applyStateToUI() {
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
  });

  const elixirSelect = document.getElementById("elixir-select");
  if (elixirSelect) elixirSelect.value = state.elixirName;

  const elixirCrafts = document.getElementById("elixir-crafts");
  if (elixirCrafts) elixirCrafts.value = state.elixirCrafts;

  const harmonyCrafts = document.getElementById("harmony-crafts");
  if (harmonyCrafts) harmonyCrafts.value = state.harmonyCrafts;

  const partyCrafts = document.getElementById("party-crafts");
  if (partyCrafts) partyCrafts.value = state.partyCount;

  const green = document.getElementById("draught-green");
  const blue = document.getElementById("draught-blue");
  if (green) green.checked = state.draughtGrade === "green";
  if (blue) blue.checked = state.draughtGrade === "blue";

  const lionForBear = document.getElementById("lion-for-bear");
  if (lionForBear) lionForBear.checked = state.useLionForBear;

  const ignoreClear = document.getElementById("ignore-clear-reagent");
  if (ignoreClear) ignoreClear.checked = state.ignoreClearReagent;

  const sortSelect = document.getElementById("sort-select");
  if (sortSelect) sortSelect.value = state.sortBy;

  if (craftingData) {
    populatePartyVariants(
      craftingData,
      state.partyVariant,
      buildIconOverrides(craftingData)
    );
  }

  setPanelVisibility(state.mode);
}

async function loadCraftingData() {
  const res = await fetch("./data/crafting.json");
  craftingData = await res.json();

  Object.assign(state, loadSession(craftingData));

  const select = document.getElementById("elixir-select");
  populateElixirSelect(craftingData, select);
}

function getCalcResult() {
  const prefs = getPrefs();

  if (state.mode === "elixirs") {
    return calcElixirsOnly(
      state.elixirName,
      state.elixirCrafts,
      craftingData,
      prefs
    );
  }

  if (state.mode === "party") {
    return calcPartyHarmony(
      state.partyCount,
      state.partyVariant,
      craftingData,
      prefs
    );
  }

  return calcFullChain(
    state.harmonyCrafts,
    state.draughtGrade,
    craftingData,
    prefs
  );
}

function applyPriceResult(result, idCount = 0) {
  prices = { ...prices, ...result.prices };
  priceMeta = {
    updatedAt: result.updatedAt ?? priceMeta.updatedAt,
    fromCache: result.fromCache,
    fetched: result.fetched ?? 0,
    failed: result.failed ?? 0,
    total: result.total ?? idCount,
    apiUnavailable: result.apiUnavailable ?? false,
    impervaBlocked: result.impervaBlocked ?? false,
  };
}

function setRefreshing(loading) {
  refreshInFlight = loading;
  const btn = document.getElementById("refresh-btn");
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Refreshing…" : "Refresh";
}

async function refreshPrices(force = false) {
  if (refreshInFlight) return;

  const calc = getCalcResult();
  const ids = compareOpen
    ? collectAllComparePriceIds(calc)
    : collectMarketIds(calc);

  setRefreshing(true);
  renderAll();

  try {
    const result = await loadPrices(ids, { force });
    applyPriceResult(result, ids.length);
  } finally {
    setRefreshing(false);
    renderAll();
  }
}

async function syncCompare() {
  if (refreshInFlight) return;

  const calc = getCalcResult();
  const allIds = collectAllComparePriceIds(calc);
  const missing = allIds.filter(
    (id) =>
      prices[String(id)]?.basePrice == null && prices[id]?.basePrice == null
  );

  setRefreshing(true);
  renderAll();

  try {
    if (missing.length) {
      const result = await loadPrices(missing);
      applyPriceResult(result, allIds.length);
    } else {
      priceMeta = {
        ...priceMeta,
        total: allIds.length,
        fetched: allIds.length,
        failed: 0,
      };
    }
  } finally {
    setRefreshing(false);
    renderAll();
  }
}

function closeCompare() {
  compareOpen = false;
  const btn = document.getElementById("compare-btn");
  const dialog = document.getElementById("compare-dialog");
  if (btn) btn.classList.remove("active");
  if (dialog?.open) dialog.close();
}

async function openCompareModal() {
  compareOpen = true;
  const btn = document.getElementById("compare-btn");
  const dialog = document.getElementById("compare-dialog");
  if (btn) btn.classList.add("active");
  if (dialog && !dialog.open) dialog.showModal();
  await syncCompare();
}

function renderAll() {
  const calc = getCalcResult();
  const prefs = getPrefs();
  const iconOverrides = buildIconOverrides(craftingData);
  const gradeMode = calc.mode === "harmony" ? calc.gradeMode : "green";
  const costInfo = computeTotalCost(calc, prices, gradeMode, prefs);

  renderStats(calc, costInfo);
  if (compareOpen) {
    renderCompare(calc, prices, craftingData, {
      ...priceMeta,
      loading: refreshInFlight,
    }, prefs);
  }
  renderBreakdown(calc, craftingData, iconOverrides);
  renderAlchemySetup(calc, craftingData, prefs, iconOverrides);
  renderShoppingList(calc, prices, state.sortBy, { ...prefs, iconOverrides });
  updateElixirSelectIcon(craftingData, state.elixirName, iconOverrides);
  renderMarketStatus(priceMeta, costInfo.hasMissing, {
    loading: refreshInFlight,
  });
}

function bindModeTabs() {
  document.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      document
        .querySelectorAll("[data-mode]")
        .forEach((b) => b.classList.toggle("active", b === btn));
      setPanelVisibility(state.mode);
      persistSession(state);
      refreshPrices();
    });
  });
}

function bindElixirInputs() {
  const select = document.getElementById("elixir-select");
  const crafts = document.getElementById("elixir-crafts");

  select.addEventListener("change", () => {
    state.elixirName = select.value;
    persistSession(state);
    refreshPrices();
  });

  crafts.addEventListener("input", () => {
    state.elixirCrafts = parseInt(crafts.value, 10) || 0;
    persistSession(state);
    renderAll();
  });

  document.querySelectorAll("[data-elixir-preset]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const val = parseInt(chip.dataset.elixirPreset, 10);
      crafts.value = val;
      state.elixirCrafts = val;
      persistSession(state);
      renderAll();
    });
  });
}

function bindHarmonyInputs() {
  const crafts = document.getElementById("harmony-crafts");
  const green = document.getElementById("draught-green");
  const blue = document.getElementById("draught-blue");

  crafts.addEventListener("input", () => {
    state.harmonyCrafts = parseInt(crafts.value, 10) || 0;
    persistSession(state);
    renderAll();
  });

  green.addEventListener("change", () => {
    if (green.checked) {
      state.draughtGrade = "green";
      persistSession(state);
      refreshPrices();
    }
  });

  blue.addEventListener("change", () => {
    if (blue.checked) {
      state.draughtGrade = "blue";
      persistSession(state);
      refreshPrices();
    }
  });

  document.querySelectorAll("[data-harmony-preset]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const val = parseInt(chip.dataset.harmonyPreset, 10);
      crafts.value = val;
      state.harmonyCrafts = val;
      persistSession(state);
      renderAll();
    });
  });
}

function bindPartyVariantRadios() {
  document.querySelectorAll("[data-party-variant]").forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        state.partyVariant = radio.value;
        persistSession(state);
        refreshPrices();
      }
    });
  });
}

function bindPartyInputs() {
  const crafts = document.getElementById("party-crafts");
  if (!crafts) return;

  crafts.addEventListener("input", () => {
    state.partyCount = parseInt(crafts.value, 10) || 0;
    persistSession(state);
    renderAll();
  });

  bindPartyVariantRadios();
}

function bindSort() {
  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sortBy = e.target.value;
    persistSession(state);
    renderAll();
  });
}

function bindRefresh() {
  document.getElementById("refresh-btn").addEventListener("click", () => {
    refreshPrices(true);
  });
}

function bindCompare() {
  const btn = document.getElementById("compare-btn");
  const dialog = document.getElementById("compare-dialog");
  const closeBtn = document.getElementById("compare-close");
  if (!btn || !dialog) return;

  btn.addEventListener("click", async () => {
    if (compareOpen) {
      closeCompare();
    } else {
      await openCompareModal();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeCompare());
  }

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeCompare();
  });

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeCompare();
  });
}

function bindPrefs() {
  const lionForBear = document.getElementById("lion-for-bear");
  lionForBear.addEventListener("change", () => {
    state.useLionForBear = lionForBear.checked;
    persistSession(state);
    refreshPrices();
  });

  const ignoreClear = document.getElementById("ignore-clear-reagent");
  if (ignoreClear) {
    ignoreClear.addEventListener("change", () => {
      state.ignoreClearReagent = ignoreClear.checked;
      persistSession(state);
      refreshPrices();
    });
  }
}

async function init() {
  await loadCraftingData();
  applyStateToUI();

  bindModeTabs();
  bindElixirInputs();
  bindHarmonyInputs();
  bindPartyInputs();
  bindPrefs();
  bindSort();
  bindRefresh();
  bindCompare();

  await refreshPrices();
}

init().catch((err) => {
  console.error(err);
  document.getElementById("market-status").textContent =
    "Failed to load — run via a local server (see README)";
});
