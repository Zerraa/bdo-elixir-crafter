# BDO Elixir Calculator

A browser-based calculator for **Black Desert Online** elixir and harmony crafting. Plan materials, compare buy vs craft costs, and estimate silver spend using **EU Central Market** prices.

No build step — static HTML, CSS, and JavaScript (ES modules).

## Features

- **Three craft modes** — single elixirs, Harmony Draughts, and party monster-type harmonies (Human, Edania, Demihuman, Kamasylvia)
- **Live EU market prices** from [Arsha.io](https://api.arsha.io), with bundled cache and fallback for GitHub Pages
- **Expandable material breakdown** — craftable intermediates (oils, reagents, bloods) expand inline to show sub-recipes and valid alternatives
- **Material substitutions** — optional toggles for valid in-game swaps (Lion/Bear blood, Weeds/Wild Grass, and more)
- **Buy vs Craft** — compare buying finished items on the CM against estimated craft cost
- **Session restore** — mode, counts, and preferences saved in `localStorage`

Item icons from [BDO Codex](https://bdocodex.com).

## Usage

1. Pick a mode in the sidebar: **Elixirs**, **Harmony**, or **Monster-Type Harmony**.
2. Enter your **craft count** (see [Input counts](#input-counts) below).
3. Review the **Materials Needed** breakdown (expand craftable rows for sub-recipes) and the **Shopping list**.
4. Use **Refresh EU Prices** to force-update market prices (15-minute browser cache by default).
5. Use **Buy vs Craft** to compare CM purchase cost against craft cost.

### Input counts

| Mode | You enter | What you get |
| --- | --- | --- |
| Elixirs | Alchemy crafts | ~1–4 greens per craft (avg ~2.5); rare blue procs (~20%) |
| Harmony | Harmony crafts | 10 Harmony Draughts per craft |
| Party | Party draught count | 1 party draught per craft |

### Craft modes

**Elixirs** — Full material breakdown for one elixir type. Shopping list includes expanded raw inputs.

**Harmony Draughts** — Breakdown lists each draught group and elixir quantities needed. Shopping assumes elixirs are already crafted and lists **catalyst only** (Spellbound Catalyst from Old Moon Merchant).

**Party harmonies** — Each craft uses 1 Harmony Draught, 3 hunt elixirs, 3 Elixir of Will, and 1 Spellbound Catalyst. Hunt/will elixirs appear in the breakdown but are not added to shopping cost (same as harmony mode).

### Options

Open **Options** in the sidebar to adjust pricing assumptions:

| Option | Default | Effect |
| --- | --- | --- |
| Lion Blood for Bear Blood | On | Prices Lion Blood on CM |
| Free Clear Liquid Reagent | On | Treats reagent as free (Mysterious Catalyst exchange) |
| Weeds for Wild Grass | Off | Prices Weeds instead of Wild Grass |
| More substitutes | Off | Sun-dried Salt, alternate bloods, Everlasting Herb for Red Tree Lump |

The breakdown tree also shows additional valid substitutes (e.g. Yak Blood, Rhino Blood) as hints on the relevant rows.

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

If live prices fail to load (API rate limits, Imperva on Pages), the app falls back to bundled `data/price-cache.json`. Click **Refresh EU Prices** to retry live APIs.

### Refreshing the price cache

**Locally** (when the Black Desert Market API is reachable):

```bash
node scripts/update-price-cache.mjs
```

**Automatically** — a GitHub Actions workflow (`.github/workflows/update-price-cache.yml`) runs weekly and on manual dispatch. It fetches EU prices via [Black Desert Market API](https://api.blackdesertmarket.com), updates `data/price-cache.json`, and commits the result so GitHub Pages deployments stay reasonably fresh when client-side APIs are blocked.

To run it manually: **Actions → Update price cache → Run workflow**.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment**
3. Source: **Deploy from a branch**, branch `main`, folder **/ (root)**

The site works as a static site; no build command required. Enable the weekly price-cache workflow so fallback prices update after deploy.

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
.github/workflows/
  update-price-cache.yml  Weekly automated cache refresh
```

## Data sources

- Recipes and item IDs: [BDO Codex](https://bdocodex.com/us/)
- Market prices: [Arsha.io](https://api.arsha.io) (primary), [Black Desert Market API](https://api.blackdesertmarket.com) (fallback and cache script)
- Icons: BDO Codex CDN

## Disclaimer

Unofficial fan tool. Not affiliated with Pearl Abyss. Market data comes from third-party APIs and may be stale or incomplete — verify prices in-game before large purchases.
