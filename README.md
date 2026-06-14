# BDO Elixir Calculator

A standalone calculator for Black Desert Online elixir crafting. Plan materials and silver cost for:

- **Elixirs** — set how many **alchemy crafts** to do for one elixir
- **Harmony Draughts** — set how many **harmony crafts** to do (10 Harmony Draughts per craft)
- **Party Harmonies** — craft Human, Edania, Demihuman, or Kamasylvia party draughts (harmonies assumed ready)

Live EU Central Market prices are fetched from [api.arsha.io](https://api.arsha.io). Item icons load from [BDO Codex](https://bdocodex.com).

## Quick start

This app uses ES modules and fetches JSON/API data, so it must be served over HTTP (opening `index.html` directly from disk will not work).

```bash
cd BDO_Elixir
npx --yes serve .
```

Then open `http://localhost:3000` (or the port shown).

Alternatively:

```bash
python -m http.server 8080
```

## Usage

1. Choose **Elixirs**, **Harmony**, or **Party** in the sidebar.
2. Enter **craft counts** (not final item totals).
3. Review **Materials to gather** (elixirs), **Breakdown** (harmony/party), and the **Shopping list**.
4. Click **Refresh** to force-update market prices (cached 15 minutes by default).
5. Click **Buy vs Craft** to compare buying finished items on the Central Market vs the est. craft cost shown in the stats bar.

Your last mode, craft counts, elixir selection, party variant, and shopping preferences are saved in the browser (`localStorage`) and restored when you reopen the page.

### Buy vs Craft

| Mode | Buy side | Craft side |
|------|----------|------------|
| **Elixirs** | Expected green elixirs × CM price | Raw material cost (same as Est. cost) |
| **Harmony** | Harmony Draughts × CM price | Catalyst only (same as Est. cost — assumes elixirs ready) |
| **Party** | Party draught × CM price | Catalyst only (same as Est. cost — assumes elixirs ready) |

### Shopping preferences

- **Use Lion Blood instead of Bear Blood** — prices Lion Blood on the market instead of Bear Blood (valid in-game substitute).
- **Ignore Clear Liquid Reagent cost** — treats Clear Liquid Reagent as free via Mysterious Catalyst exchange (marketId 5301). Default off.

### Blue elixir upgrade (harmony)

When **Use Blue Elixirs** is selected, blues are upgraded via Simple Alchemy: **3× green elixir + 1× Blue Reagent** (50,000 silver from Material Merchant). The breakdown shows this recipe — not the green raw-material alchemy table.

### Shopping lists by mode

| Mode | Shopping list |
|------|----------------|
| **Elixirs** | Raw materials for your craft count — mushrooms/herbs at NPC vendor prices, everything else on EU market |
| **Harmony Draughts** | Spellbound Catalyst only — assumes you already crafted elixirs (1.00M silver each from Old Moon Merchant) |
| **Party Harmonies** | Spellbound Catalyst only — assumes harmonies and hunt/will elixirs already crafted |

Per-craft alchemy slot amounts live in the sidebar (elixirs mode). Gather totals are in the left panel; prices and grand total are on the right.

**Vendor-priced materials:** Mushrooms (Mushroom Vendor, Calpheon) and herbs (Herb Vendor) use fixed NPC buy prices from BDO Codex. Spellbound Catalyst uses Old Moon Merchant. Saps, bloods, reagents, and oils use live EU Central Market prices.

If market prices show as missing, click **Refresh** — the API can rate-limit parallel requests.

### Party Harmonies

Each party craft consumes **1 Harmony Draught**, **3 hunt elixirs**, **3 Elixir of Will**, and **1 Spellbound Catalyst** → **1 party draught**.

| Variant | Output |
|---------|--------|
| Human | [Party] Harmony Draught - Human |
| Edania | [Party] Harmony Draught - Edania |
| Demihuman | [Party] Harmony Draught - Demihuman |
| Kamasylvia | [Party] Harmony Draught - Kamasylvia (Griffon's Elixir) |

Harmonies and hunt/will elixirs are shown in the breakdown but excluded from shopping cost (same pattern as harmony mode excluding elixirs).

### Input semantics

| Mode | Input | Output |
|------|-------|--------|
| Harmony Draughts | Harmony **crafts** | Harmonies = crafts × 10 |
| Elixirs | Alchemy **crafts** | Greens 1–4/craft (~2.5 avg) + rare blue procs (~20%) |
| Party | Party draught **count** | 1 draught per craft |

### Alchemy yields

Each elixir alchemy craft uses **one set of recipe materials** but yields:

- **Green:** 1–4 per craft (elixirs mode shows min–max and average for your craft count)
- **Blue:** rare proc (~20% of crafts, 1–2 when it occurs) — shown alongside greens, not as a separate grade choice

Example at default rates: **1,500 crafts** → ~**3,750** greens and ~**300** blues.

Harmony Draughts plans alchemy crafts pessimistically in the breakdown: **one craft per green elixir needed** (assumes 1 green per craft). Shopping cost is **catalyst only**, priced at **1,000,000 silver** per catalyst from the **Old Moon Merchant** (not on Central Market).

Blue elixirs have **different names** from greens (e.g. Elixir of Fury → Elixir of Endless Fury). The harmony breakdown uses blue names when **Blue only** draughts are selected.

### Craft math (per harmony produced)

| Item | Amount |
|------|--------|
| Each of 20 elixirs | 3 green or 1 blue |
| Each draught type | 1 draught |
| Spellbound Catalyst | 5 |

Harmony Simple Alchemy: **10 crafts** → **100** Harmony Draughts → **100 of each** draught type → **300 green** or **100 blue** per elixir.

Draught craft accepts **green only** or **blue only** elixirs (1 blue = 3 green substitution).

## GitHub Pages

Push the repo and enable Pages with source **Deploy from branch** → `main` → `/ (root)`.

## Data sources

- Recipes and item IDs: [BDO Codex](https://bdocodex.com/us/)
- Market prices: [Arsha.io](https://api.arsha.io) (unofficial EU market wrapper)
- Item icons: BDO Codex CDN (`bdocodex.com/items/new_icon/...`)

Prices may be missing for items not listed on the Central Market (e.g. some gatherables). Material quantities are always per craft.

## Project layout

```
index.html          Calculator UI
css/styles.css      Dark theme layout
  js/
  app.js            Input wiring + session restore
  session.js        localStorage save/load
  calculator.js     Crafting math
  prices.js         EU price fetch + cache
  render.js         DOM rendering
  icons.js          BDO Codex icon URLs
data/
  crafting.json     Draught groups + elixir recipes + party harmonies
  marketIds.json    Item ID reference
```

## Disclaimer

Unofficial fan tool. Not affiliated with Pearl Abyss. Market data is cached third-party API output — verify prices in-game before large purchases.
