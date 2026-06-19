import { calcElixirsOnly, calcFullChain, calcPartyHarmony } from "./calculator.js";
import {
  loadPrices,
  bootstrapStaticPrices,
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
  renderCompare,
  renderAppLoading,
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
  fromStaticFallback: false,
  usedBdmFallback: false,
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
  craftIntermediates: true,
  useWeedsForWildGrass: false,
  useSunDriedSalt: false,
  useDeerForPig: false,
  useRhinoForWolf: false,
  useScorpionForFox: false,
  useEverlastingHerbForRedTreeLump: false,
  sortBy: "cost",
};

let compareOpen = false;
let refreshInFlight = false;
let pendingPriceRefresh = false;
let pendingPriceForce = false;

function getPrefs() {
  return {
    useLionForBear: state.useLionForBear,
    ignoreClearReagent: state.ignoreClearReagent,
    craftIntermediates: state.craftIntermediates,
    useWeedsForWildGrass: state.useWeedsForWildGrass,
    useSunDriedSalt: state.useSunDriedSalt,
    useDeerForPig: state.useDeerForPig,
    useRhinoForWolf: state.useRhinoForWolf,
    useScorpionForFox: state.useScorpionForFox,
    useEverlastingHerbForRedTreeLump: state.useEverlastingHerbForRedTreeLump,
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

  const craftIntermediates = document.getElementById("craft-intermediates");
  if (craftIntermediates) craftIntermediates.checked = state.craftIntermediates;

  const weedsForWildGrass = document.getElementById("weeds-for-wild-grass");
  if (weedsForWildGrass) weedsForWildGrass.checked = state.useWeedsForWildGrass;

  const sunDriedForSalt = document.getElementById("sun-dried-for-salt");
  if (sunDriedForSalt) sunDriedForSalt.checked = state.useSunDriedSalt;

  const deerForPig = document.getElementById("deer-for-pig");
  if (deerForPig) deerForPig.checked = state.useDeerForPig;

  const rhinoForWolf = document.getElementById("rhino-for-wolf");
  if (rhinoForWolf) rhinoForWolf.checked = state.useRhinoForWolf;

  const scorpionForFox = document.getElementById("scorpion-for-fox");
  if (scorpionForFox) scorpionForFox.checked = state.useScorpionForFox;

  const everlastingForRedTree = document.getElementById("everlasting-for-red-tree");
  if (everlastingForRedTree) {
    everlastingForRedTree.checked = state.useEverlastingHerbForRedTreeLump;
  }

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

function mergeBootstrapPrices(staticBundle) {
  if (!staticBundle?.prices) return;
  for (const [id, entry] of Object.entries(staticBundle.prices)) {
    if (entry?.basePrice != null) {
      prices[String(id)] = entry;
    }
  }
  if (staticBundle.updatedAt) {
    priceMeta.updatedAt = staticBundle.updatedAt;
  }
  priceMeta.fromStaticFallback = true;
}

async function loadCraftingData() {
  const [craftRes, intRes, staticBundle] = await Promise.all([
    fetch("./data/crafting.json"),
    fetch("./data/intermediates.json"),
    bootstrapStaticPrices(),
  ]);

  if (!craftRes.ok || !intRes.ok) {
    throw new Error("Failed to load recipe data");
  }

  craftingData = await craftRes.json();
  craftingData.intermediates = await intRes.json();
  mergeBootstrapPrices(staticBundle);

  Object.assign(state, loadSession(craftingData));

  const select = document.getElementById("elixir-select");
  populateElixirSelect(craftingData, select);
}

function getCalcResult() {
  if (!craftingData) return null;

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
    fromStaticFallback: result.fromStaticFallback ?? priceMeta.fromStaticFallback,
    usedBdmFallback: result.usedBdmFallback ?? false,
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
  if (!craftingData) return;

  if (refreshInFlight) {
    pendingPriceRefresh = true;
    pendingPriceForce = pendingPriceForce || force;
    return;
  }

  const calc = getCalcResult();
  if (!calc) return;

  const ids = compareOpen
    ? collectAllComparePriceIds(calc)
    : collectMarketIds(calc);

  setRefreshing(true);

  try {
    const result = await loadPrices(ids, { force });
    applyPriceResult(result, ids.length);
  } finally {
    setRefreshing(false);
    renderAll();

    if (pendingPriceRefresh) {
      const nextForce = pendingPriceForce;
      pendingPriceRefresh = false;
      pendingPriceForce = false;
      await refreshPrices(nextForce);
    }
  }
}

async function syncCompare() {
  if (!craftingData || refreshInFlight) return;

  const calc = getCalcResult();
  if (!calc) return;

  const allIds = collectAllComparePriceIds(calc);
  const missing = allIds.filter(
    (id) =>
      prices[String(id)]?.basePrice == null && prices[id]?.basePrice == null
  );

  setRefreshing(true);

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
  if (!craftingData) return;

  const calc = getCalcResult();
  if (!calc) return;

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
  renderBreakdown(calc, craftingData, prefs, iconOverrides);
  renderShoppingList(calc, prices, state.sortBy, { ...prefs, iconOverrides });
  updateElixirSelectIcon(craftingData, state.elixirName, iconOverrides);
  renderMarketStatus(priceMeta, costInfo.hasMissing, {
    loading: refreshInFlight,
  });
}

function updateMaterialsAndPrices() {
  renderAll();
  refreshPrices();
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
      updateMaterialsAndPrices();
    });
  });
}

function bindElixirInputs() {
  const select = document.getElementById("elixir-select");
  const crafts = document.getElementById("elixir-crafts");

  select.addEventListener("change", () => {
    if (!craftingData) return;
    state.elixirName = select.value;
    persistSession(state);
    updateMaterialsAndPrices();
  });

  crafts.addEventListener("input", () => {
    if (!craftingData) return;
    state.elixirCrafts = parseInt(crafts.value, 10) || 0;
    persistSession(state);
    renderAll();
  });

  document.querySelectorAll("[data-elixir-preset]").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!craftingData) return;
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
    if (!craftingData) return;
    state.harmonyCrafts = parseInt(crafts.value, 10) || 0;
    persistSession(state);
    renderAll();
  });

  green.addEventListener("change", () => {
    if (!craftingData || !green.checked) return;
    state.draughtGrade = "green";
    persistSession(state);
    updateMaterialsAndPrices();
  });

  blue.addEventListener("change", () => {
    if (!craftingData || !blue.checked) return;
    state.draughtGrade = "blue";
    persistSession(state);
    updateMaterialsAndPrices();
  });

  document.querySelectorAll("[data-harmony-preset]").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!craftingData) return;
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
      if (!craftingData || !radio.checked) return;
      state.partyVariant = radio.value;
      persistSession(state);
      updateMaterialsAndPrices();
    });
  });
}

function bindPartyInputs() {
  const crafts = document.getElementById("party-crafts");
  if (!crafts) return;

  crafts.addEventListener("input", () => {
    if (!craftingData) return;
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
    if (!craftingData) return;
    state.useLionForBear = lionForBear.checked;
    persistSession(state);
    updateMaterialsAndPrices();
  });

  const ignoreClear = document.getElementById("ignore-clear-reagent");
  if (ignoreClear) {
    ignoreClear.addEventListener("change", () => {
      if (!craftingData) return;
      state.ignoreClearReagent = ignoreClear.checked;
      persistSession(state);
      updateMaterialsAndPrices();
    });
  }

  const craftIntermediates = document.getElementById("craft-intermediates");
  if (craftIntermediates) {
    craftIntermediates.addEventListener("change", () => {
      if (!craftingData) return;
      state.craftIntermediates = craftIntermediates.checked;
      persistSession(state);
      updateMaterialsAndPrices();
    });
  }

  const weedsForWildGrass = document.getElementById("weeds-for-wild-grass");
  if (weedsForWildGrass) {
    weedsForWildGrass.addEventListener("change", () => {
      if (!craftingData) return;
      state.useWeedsForWildGrass = weedsForWildGrass.checked;
      persistSession(state);
      updateMaterialsAndPrices();
    });
  }

  const prefBindings = [
    ["sun-dried-for-salt", "useSunDriedSalt"],
    ["deer-for-pig", "useDeerForPig"],
    ["rhino-for-wolf", "useRhinoForWolf"],
    ["scorpion-for-fox", "useScorpionForFox"],
    ["everlasting-for-red-tree", "useEverlastingHerbForRedTreeLump"],
  ];
  for (const [id, key] of prefBindings) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("change", () => {
      if (!craftingData) return;
      state[key] = el.checked;
      persistSession(state);
      updateMaterialsAndPrices();
    });
  }
}

function bindAll() {
  bindModeTabs();
  bindElixirInputs();
  bindHarmonyInputs();
  bindPartyInputs();
  bindPrefs();
  bindSort();
  bindRefresh();
  bindCompare();
}

async function init() {
  renderAppLoading(true);
  bindAll();

  try {
    await loadCraftingData();
    applyStateToUI();
    renderAppLoading(false);
    renderAll();
    refreshPrices();
  } catch (err) {
    console.error(err);
    document.getElementById("market-status").textContent =
      "Failed to load — run via a local server (see README)";
  }
}

init();
