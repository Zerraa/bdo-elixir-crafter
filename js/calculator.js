import { expandIntermediates, getPrecraftSteps } from "./expand.js";

export function getYields(data, greenExpectedOverride) {
  const y = data.yields?.elixirAlchemy ?? {};
  return {
    greenMin: y.greenMin ?? 1,
    greenMax: y.greenMax ?? 4,
    greenExpected: greenExpectedOverride ?? y.greenExpected ?? 2.5,
    blueMin: y.blueMin ?? 1,
    blueMax: y.blueMax ?? 2,
    blueExpectedPerCraft: y.blueExpectedPerCraft ?? 0.2,
  };
}

export function calcExpectedGreenOutput(crafts, yields) {
  const c = Math.max(0, crafts);
  return {
    min: c * yields.greenMin,
    max: c * yields.greenMax,
    expected: Math.round(c * yields.greenExpected),
  };
}

export function calcExpectedBlueOutput(crafts, yields) {
  const c = Math.max(0, crafts);
  const rate = yields.blueExpectedPerCraft ?? 0.2;
  return {
    expected: Math.round(c * rate),
    procPct: Math.round(rate * 100),
  };
}

export function aggregateMaterialsFromCrafts(craftCounts, elixirsData) {
  const materials = new Map();

  for (const [elixirName, crafts] of Object.entries(craftCounts)) {
    if (!crafts || crafts <= 0) continue;
    const recipe = elixirsData[elixirName];
    if (!recipe) continue;

    for (const mat of recipe.materials) {
      const key = mat.marketId;
      const existing = materials.get(key) || {
        name: mat.name,
        marketId: mat.marketId,
        qty: 0,
      };
      existing.qty += mat.qty * crafts;
      materials.set(key, existing);
    }
  }

  return [...materials.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function shouldApplySubstitution(sub, prefs = {}) {
  if (!sub?.replaceWith) return false;
  if (!sub.pref) return true;
  return Boolean(prefs[sub.pref]);
}

export function applySubstitutions(materials, data, prefs = {}) {
  if (!data?.substitutions) return materials;

  const byId = new Map();

  for (const mat of materials) {
    const sub = data.substitutions[mat.name];
    const target =
      sub && shouldApplySubstitution(sub, prefs) ? sub.replaceWith : mat;
    const key = target.marketId;
    const existing = byId.get(key) || {
      name: target.name,
      marketId: target.marketId,
      qty: 0,
    };
    existing.qty += mat.qty;
    if (sub && shouldApplySubstitution(sub, prefs)) {
      existing.substitutedFrom = mat.name;
    }
    byId.set(key, existing);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function applyVendorPrices(materials, data) {
  const vendor = data.vendorPrices || {};
  return materials.map((mat) => {
    const vp = vendor[String(mat.marketId)];
    if (!vp) return mat;
    return {
      ...mat,
      vendorPrice: vp.price,
      priceSource: vp.source,
    };
  });
}

function recipeWithSubstitutions(materials, data, prefs) {
  if (!materials || !data?.substitutions) return materials || [];
  return materials.map((m) => {
    const sub = data.substitutions[m.name];
    if (!shouldApplySubstitution(sub, prefs)) return m;
    return {
      ...m,
      name: sub.replaceWith.name,
      marketId: sub.replaceWith.marketId,
    };
  });
}

export function applyPricePrefs(materials, data, prefs = {}) {
  if (!prefs.ignoreClearReagent || !data?.freeReagents) return materials;
  const free = data.freeReagents["Clear Liquid Reagent"];
  if (!free?.marketId) return materials;
  return materials
    .filter((mat) => mat.marketId !== free.marketId)
    .map((mat) => mat);
}

function finalizeElixirMaterials(rawMaterials, data, prefs) {
  let materials = rawMaterials;
  if (prefs.craftIntermediates !== false) {
    materials = expandIntermediates(materials, data, prefs);
  }
  materials = applySubstitutions(materials, data, prefs);
  materials = applyVendorPrices(materials, data);
  materials = applyPricePrefs(materials, data, prefs);
  return materials;
}

export function calcElixirsOnly(elixirName, crafts, data, prefs = {}) {
  const recipe = data.elixirs[elixirName];
  if (!recipe) throw new Error(`Unknown elixir: ${elixirName}`);

  const craftCount = Math.max(0, Math.floor(crafts) || 0);
  const yields = getYields(data);

  const rawMaterials = aggregateMaterialsFromCrafts(
    { [elixirName]: craftCount },
    data.elixirs
  );
  const recipeForGuide = recipeWithSubstitutions(recipe.materials, data, prefs);

  return {
    mode: "elixirs",
    elixirName,
    crafts: craftCount,
    recipePerCraft: recipe.materials,
    materials: finalizeElixirMaterials(rawMaterials, data, prefs),
    precraftSteps: getPrecraftSteps(recipeForGuide, data, prefs),
    elixirMarketItems: [],
    expectedOutput: {
      greens: calcExpectedGreenOutput(craftCount, yields),
      blues: calcExpectedBlueOutput(craftCount, yields),
    },
    catalyst: 0,
    harmonies: 0,
    draughts: 0,
  };
}

function draughtForElixir(elixirName, data) {
  return data.draughts.find((d) => d.elixirs.includes(elixirName));
}

function elixirNeedsForHarmony(elixirName, draughtsPerType, gradeMode, data) {
  const draught = draughtForElixir(elixirName, data);
  const batch = draught?.batch ?? { elixirsPerType: 30, output: 10 };
  const batches = draughtsPerType / batch.output;
  const greens = batches * batch.elixirsPerType;
  const blues = batches * (batch.elixirsPerType / 3);

  if (gradeMode === "green") {
    return {
      greensNeeded: greens,
      bluesNeeded: blues,
      elixirsNeeded: greens,
      alchemyCrafts: greens,
      reagentsNeeded: 0,
    };
  }

  const upgrade = data.blueUpgrade ?? {
    greensPerBlue: 3,
    reagentPerBlue: 1,
  };
  const greenCrafts = blues * upgrade.greensPerBlue;
  return {
    greensNeeded: greenCrafts,
    bluesNeeded: blues,
    elixirsNeeded: blues,
    alchemyCrafts: greenCrafts,
    reagentsNeeded: blues * upgrade.reagentPerBlue,
  };
}

function blueUpgradeRecipePerCraft(elixirName, data) {
  const recipe = data.elixirs[elixirName];
  const reagent = data.blueUpgrade?.reagent ?? {
    name: "Blue Reagent",
    marketId: 4916,
    vendorPrice: 50000,
    priceSource: "Material Merchant",
  };
  const greensPerBlue = data.blueUpgrade?.greensPerBlue ?? 3;
  const reagentPerBlue = data.blueUpgrade?.reagentPerBlue ?? 1;
  return [
    { name: elixirName, qty: greensPerBlue, marketId: recipe.codexId },
    { ...reagent, qty: reagentPerBlue },
  ];
}

export function calcFullChain(harmonyCrafts, gradeMode, data, prefs = {}) {
  const crafts = Math.max(0, Math.floor(harmonyCrafts) || 0);
  const amountEach = data.harmony?.amountEach ?? 10;
  const harmonyOutput = data.harmony?.output ?? 10;
  const harmonies = crafts * harmonyOutput;
  const draughtsPerType = harmonies * (amountEach / harmonyOutput);
  const draughtTypes = data.draughts.length;

  const elixirCounts = {};
  const alchemyCraftsPerElixir = {};
  for (const name of Object.keys(data.elixirs)) {
    const needs = elixirNeedsForHarmony(
      name,
      draughtsPerType,
      gradeMode,
      data
    );
    elixirCounts[name] = needs.elixirsNeeded;
    alchemyCraftsPerElixir[name] = needs.alchemyCrafts;
  }

  const batch = data.draughts[0]?.batch ?? { catalyst: 10, output: 10 };
  const batchesPerType = draughtsPerType / batch.output;
  const catalyst = draughtTypes * batchesPerType * batch.catalyst;

  const breakdown = data.draughts.map((draught) => ({
    name: draught.name,
    draughts: draughtsPerType,
    elixirs: draught.elixirs.map((name) => {
      const recipe = data.elixirs[name];
      const displayName =
        gradeMode === "blue" ? recipe.blueName : name;
      const needs = elixirNeedsForHarmony(
        name,
        draughtsPerType,
        gradeMode,
        data
      );
      return {
        greenName: name,
        name: displayName,
        count: needs.elixirsNeeded,
        grade: gradeMode,
        elixirsNeeded: needs.elixirsNeeded,
        alchemyCrafts: needs.alchemyCrafts,
        greensNeeded: needs.greensNeeded,
        reagentsNeeded: needs.reagentsNeeded,
        recipePerCraft:
          gradeMode === "blue"
            ? blueUpgradeRecipePerCraft(name, data)
            : recipe.materials,
        precraftSteps:
          gradeMode === "blue"
            ? []
            : getPrecraftSteps(
                recipeWithSubstitutions(recipe.materials, data, prefs),
                data,
                prefs
              ),
      };
    }),
  }));

  const totalAlchemyCrafts = Object.values(alchemyCraftsPerElixir).reduce(
    (a, b) => a + b,
    0
  );

  const result = {
    mode: "harmony",
    gradeMode,
    harmonyCrafts: crafts,
    harmonies,
    draughtsPerType,
    draughtTypes,
    draughts: draughtsPerType,
    catalyst,
    elixirCounts,
    alchemyCraftsPerElixir,
    totalAlchemyCrafts,
    breakdown,
    materials: [],
    elixirMarketItems: [],
    catalystItem: harmonies > 0 ? { ...data.catalyst, qty: catalyst } : null,
    blueReagentItem: null,
  };

  if (gradeMode === "green") {
    result.materials = finalizeElixirMaterials(
      aggregateMaterialsFromCrafts(alchemyCraftsPerElixir, data.elixirs),
      data,
      prefs
    );
  } else {
    const totalReagents = Object.keys(data.elixirs).reduce((sum, name) => {
      const needs = elixirNeedsForHarmony(
        name,
        draughtsPerType,
        "blue",
        data
      );
      return sum + needs.reagentsNeeded;
    }, 0);

    const greenCraftsPerElixir = {};
    for (const name of Object.keys(data.elixirs)) {
      greenCraftsPerElixir[name] = alchemyCraftsPerElixir[name];
    }

    result.materials = finalizeElixirMaterials(
      aggregateMaterialsFromCrafts(greenCraftsPerElixir, data.elixirs),
      data,
      prefs
    );
    result.blueReagentItem =
      harmonies > 0 && totalReagents > 0
        ? { ...data.blueUpgrade.reagent, qty: totalReagents }
        : null;
    result.note =
      "Blue Elixir Craft: upgrade Green Elixirs via Simple Alchemy (3 green + 1 Blue Reagent per blue).";
  }

  return result;
}

export function calcPartyHarmony(partyCount, variant, data, prefs = {}) {
  const count = Math.max(0, Math.floor(partyCount) || 0);
  const config = data.partyHarmonies?.variants?.[variant];
  if (!config) throw new Error(`Unknown party variant: ${variant}`);

  const per = data.partyHarmonies?.perCraft ?? {
    harmony: 1,
    hunt: 3,
    will: 3,
    catalyst: 1,
  };
  const willElixir = data.partyHarmonies?.willElixir ?? "Elixir of Will";
  const huntElixir = config.huntElixir;
  const huntRecipe = data.elixirs[huntElixir];
  const willRecipe = data.elixirs[willElixir];
  if (!huntRecipe || !willRecipe) {
    throw new Error(`Missing party elixir recipe: ${huntElixir} or ${willElixir}`);
  }

  return {
    mode: "party",
    variant,
    variantLabel:
      config.label ??
      variant.charAt(0).toUpperCase() + variant.slice(1),
    partyCount: count,
    partyName: config.name,
    partyMarketId: config.marketId,
    harmoniesRequired: count * (per.harmony ?? 1),
    huntElixir,
    willElixir,
    huntCrafts: count * per.hunt,
    willCrafts: count * per.will,
    materials: [],
    catalystItem:
      count > 0 ? { ...data.catalyst, qty: count * per.catalyst } : null,
    partyRecipePerCraft: [
      {
        name: data.harmony?.name ?? "Harmony Draught",
        qty: per.harmony ?? 1,
        marketId: data.harmony?.marketId,
      },
      {
        name: huntElixir,
        qty: per.hunt,
        marketId: huntRecipe.codexId,
      },
      {
        name: willElixir,
        qty: per.will,
        marketId: willRecipe.codexId,
      },
      { ...data.catalyst, qty: per.catalyst },
    ],
  };
}

export function getElixirOptions(data) {
  return data.draughts.map((draught) => ({
    draught: draught.name,
    elixirs: draught.elixirs,
  }));
}
