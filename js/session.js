const SESSION_KEY = "bdo_elixir_session";
const SESSION_VERSION = 1;

const DEFAULTS = {
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

function clampCount(value, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return n;
}

export function loadSession(craftingData = null) {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (parsed?.version !== SESSION_VERSION) return { ...DEFAULTS };

    const next = { ...DEFAULTS, ...parsed };

    if (!["elixirs", "harmony", "party"].includes(next.mode)) {
      next.mode = DEFAULTS.mode;
    }
    if (next.draughtGrade !== "blue") next.draughtGrade = "green";

    if (craftingData) {
      if (!craftingData.elixirs?.[next.elixirName]) {
        next.elixirName = DEFAULTS.elixirName;
      }
      if (!craftingData.partyHarmonies?.variants?.[next.partyVariant]) {
        next.partyVariant = DEFAULTS.partyVariant;
      }
    }

    next.elixirCrafts = clampCount(next.elixirCrafts, DEFAULTS.elixirCrafts);
    next.harmonyCrafts = clampCount(next.harmonyCrafts, DEFAULTS.harmonyCrafts);
    next.partyCount = clampCount(next.partyCount, DEFAULTS.partyCount);
    next.useLionForBear = Boolean(next.useLionForBear);
    next.ignoreClearReagent = Boolean(next.ignoreClearReagent);

    if (!["cost", "name", "qty"].includes(next.sortBy)) {
      next.sortBy = DEFAULTS.sortBy;
    }

    return next;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSession(state) {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        version: SESSION_VERSION,
        mode: state.mode,
        elixirName: state.elixirName,
        elixirCrafts: state.elixirCrafts,
        harmonyCrafts: state.harmonyCrafts,
        draughtGrade: state.draughtGrade,
        partyVariant: state.partyVariant,
        partyCount: state.partyCount,
        useLionForBear: state.useLionForBear,
        ignoreClearReagent: state.ignoreClearReagent,
        sortBy: state.sortBy,
      })
    );
  } catch {
    /* private mode or quota */
  }
}

let saveTimer;

export function persistSession(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSession(state), 200);
}
