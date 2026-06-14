# BDO Elixir Calculator

A browser-based calculator for **Black Desert Online** elixir and harmony crafting. Plan materials, compare buy vs craft costs, and estimate silver spend using **EU Central Market** prices.

No build step — static HTML, CSS, and JavaScript (ES modules).

## Features

- **Three craft modes** — single elixirs, Harmony Draughts, and party monster-type harmonies (Human, Edania, Demihuman, Kamasylvia)
- **Live EU market prices** from [Arsha.io](https://api.arsha.io), with bundled cache and fallback for GitHub Pages
- **Intermediate expansion** — roll oils, reagents, and purified water up into raw materials, with precraft recipes in the sidebar
- **Material substitutions** — optional toggles for valid in-game swaps (Lion/Bear blood, Weeds/Wild Grass, and more)
- **Buy vs Craft** — compare buying finished items on the CM against estimated craft cost
- **Session restore** — mode, counts, and preferences saved in `localStorage`

Item icons from [BDO Codex](https://bdocodex.com).

## Getting started

The app loads JSON and fetches prices over the network, so it must be served over HTTP — opening `index.html` directly from disk will not work.

```bash
git clone https://github.com/YOUR_USER/BDO_Elixir.git
cd BDO_Elixir
npx --yes serve .
```

Open the URL shown (usually `http://localhost:3000`).

Or with Python:

```bash
python -m http.server 8080
```

## Usage

1. Pick a mode in the sidebar: **Elixirs**, **Harmony**, or **Monster-Type Harmony**.
2. Enter your **craft count** (see [Input counts](#input-counts) below).
3. Review materials, precraft steps, and the shopping list.
4. Use **Refresh** to force-update market prices (15-minute cache by default).
5. Use **Buy vs Craft** to compare CM purchase cost against craft cost.

### Input counts

| Mode | You enter | What you get |
| --- | --- | --- |
| Elixirs | Alchemy crafts | ~1–4 greens per craft (avg ~2.5); rare blue procs (~20%) |
| Harmony | Harmony crafts | 10 Harmony Draughts per craft |
| Party | Party draught count | 1 party draught per craft |

### Craft modes

**Elixirs** — Full material breakdown for one elixir type. Shopping list includes raw inputs (or intermediates if expansion is off).

**Harmony Draughts** — Plans catalyst cost for harmony crafting. Assumes you already have the required elixirs; breakdown shows what each harmony needs.

**Party harmonies** — Each craft uses 1 Harmony Draught, 3 hunt elixirs, 3 Elixir of Will, and 1 Spellbound Catalyst. Hunt/will elixirs appear in the breakdown but are not added to shopping cost (same as harmony mode).

### Shopping preferences

| Option | Default | Effect |
| --- | --- | --- |
| Use Lion Blood instead of Bear Blood | On | Prices Lion Blood on CM |
| Ignore Clear Liquid Reagent cost | On | Treats reagent as free (Mysterious Catalyst exchange) |
| Craft intermediates myself | On | Expands oils/reagents/water into leaf materials |
| Use Weeds instead of Wild Grass | Off | Prices Weeds instead of Wild Grass |
| More material substitutes | Off | Sun-dried Salt, alternate bloods, Everlasting Herb for Red Tree Lump |

Precraft steps list additional valid substitutes (e.g. other blood groups) even when no pricing toggle exists.

### Buy vs Craft

| Mode | Buy | Craft |
| --- | --- | --- |
| Elixirs | Expected greens × CM price | Raw material cost |
| Harmony | Harmony Draughts × CM price | Catalyst only (elixirs assumed ready) |
| Party | Party draught × CM price | Catalyst only (elixirs assumed ready) |

### Blue elixirs

Harmony mode can target **green** or **blue** draughts. Blues are upgraded via Simple Alchemy: **3× green + 1× Blue Reagent** (50k from Material Merchant). Blue elixirs have different names from their green versions (e.g. Elixir of Fury → Elixir of Endless Fury).

## Pricing

- **Central Market** — saps, bloods, oils, reagents, gatherables (Wild Grass, Weeds, powders, etc.)
- **NPC vendors** — mushrooms (Calpheon Mushroom Vendor), select herbs, Sugar, Salt, HP potions
- **Fixed merchants** — Spellbound Catalyst (Old Moon Merchant, 1M), Blue Reagent (Material Merchant, 50k)

If prices fail to load (API rate limits, Imperva on Pages), click **Refresh**. A bundled `data/price-cache.json` provides fallback values for deployment.

To refresh the cache locally when the API is reachable:

```bash
node scripts/update-price-cache.mjs
```

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment**
3. Source: **Deploy from a branch**, branch `main`, folder **/ (root)**

The site works as a static site; no build command required.

## Project structure

```
index.html              App shell
css/styles.css          Layout and theme
js/
  app.js                UI wiring and price refresh
  calculator.js         Craft math and material aggregation
  expand.js             Intermediate recipe expansion
  prices.js             EU price fetch, cache, vendor overrides
  render.js             DOM rendering
  session.js            localStorage persistence
  icons.js              BDO Codex icon URLs
data/
  crafting.json         Elixir recipes, draught groups, party harmonies
  intermediates.json    Oil, reagent, and water sub-recipes
  marketIds.json        Item ID reference
  price-cache.json      Bundled EU price fallback
scripts/
  update-price-cache.mjs  Regenerate price-cache.json
```

## Data sources

- Recipes and item IDs: [BDO Codex](https://bdocodex.com/us/)
- Market prices: [Arsha.io](https://api.arsha.io) (primary), [Black Desert Market API](https://api.blackdesertmarket.com) (fallback)
- Icons: BDO Codex CDN

## Disclaimer

Unofficial fan tool. Not affiliated with Pearl Abyss. Market data comes from third-party APIs and may be stale or incomplete — verify prices in-game before large purchases.
