import { shouldApplySubstitution } from "./calculator.js";
import {
  formatSilver,
  lineTotal,
  computeTotalCost,
  getUnitPrice,
  computeCompare,
} from "./prices.js";
import { itemIconImg, materialCell } from "./icons.js";

function codexLink(marketId, name) {
  if (!marketId) return name;
  return `<a href="https://bdocodex.com/us/item/${marketId}/" target="_blank" rel="noopener">${name}</a>`;
}

function formatTime(ts) {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function formatExpectedOutput(out) {
  if (!out?.greens) return "—";
  const greens = out.greens;
  const blues = out.blues;
  const greenLine = `${greens.expected.toLocaleString()} green (${greens.min.toLocaleString()}–${greens.max.toLocaleString()})`;
  const blueLine = blues
    ? `~${blues.expected.toLocaleString()} blue (~${blues.procPct}% proc)`
    : "";
  return { greenLine, blueLine };
}

function renderAlchemySlots(materials, iconOverrides, { compact = false } = {}) {
  const rows = (materials || [])
    .map((m) => {
      const icon = itemIconImg(m.marketId, m.name, iconOverrides, {
        size: compact ? 20 : 24,
      });
      const hint = m.priceSource
        ? `<div class="muted sub-hint">${m.priceSource}</div>`
        : "";
      return `
      <div class="alchemy-slot-row${compact ? " alchemy-slot-row--compact" : ""}">
        <span class="slot-qty">${m.qty}</span>
        <span class="slot-icon">${icon}</span>
        <span class="slot-name">${codexLink(m.marketId, m.name)}${hint}</span>
      </div>`;
    })
    .join("");
  return `<div class="alchemy-slots">${rows}</div>`;
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

function renderPrecraftSteps(steps, iconOverrides, { compact = false } = {}) {
  if (!steps?.length) return "";

  return steps
    .map((step) => {
      const title = codexLink(step.marketId, step.name);
      const meta = step.method ? `<span class="muted"> · ${step.method}</span>` : "";
      const altNote =
        step.alternatives?.length > 0
          ? `<p class="muted sub-hint">Alt: ${step.alternatives.map((a) => a.or?.name).filter(Boolean).join(" or ")}</p>`
          : "";

      if (step.materials?.length) {
        return `
        <details class="precraft-step"${compact ? " open" : ""}>
          <summary>${title}${meta}</summary>
          ${altNote}
          ${step.note ? `<p class="muted sub-hint">${step.note}</p>` : ""}
          ${renderAlchemySlots(step.materials, iconOverrides, { compact: true })}
        </details>`;
      }

      return `
        <details class="precraft-step"${compact ? " open" : ""}>
          <summary>${title}</summary>
          <p class="muted sub-hint">${step.note || "Obtain from Central Market or gathering."}</p>
        </details>`;
    })
    .join("");
}

export function renderAlchemySetup(calcResult, data, prefs, iconOverrides = {}) {
  const el = document.getElementById("alchemy-setup");
  if (!el || calcResult.mode !== "elixirs") {
    if (el) el.innerHTML = "";
    return;
  }

  const recipe = recipeWithSubstitutions(
    calcResult.recipePerCraft,
    data,
    prefs
  );
  const precraft = renderPrecraftSteps(calcResult.precraftSteps, iconOverrides);
  const precraftBlock = precraft
    ? `<p class="section-label">Precraft steps</p>${precraft}`
    : "";

  el.innerHTML = `
    <p class="section-label">Alchemy table</p>
    ${renderAlchemySlots(recipe, iconOverrides)}
    ${precraftBlock}
  `;
}

function renderShoppingRow(row, iconOverrides, { showIcons = true } = {}) {
  const subHint = row.substitutedFrom
    ? `<div class="muted sub-hint">replaces ${row.substitutedFrom}</div>`
    : "";
  const priceHint = row.priceSource
    ? `<div class="muted sub-hint">${row.priceSource}</div>`
    : "";
  const cell = showIcons
    ? materialCell(row.marketId, row.name, iconOverrides)
    : codexLink(row.marketId, row.name);
  return `
    <tr>
      <td>${cell}${subHint}</td>
      <td class="num">${row.qty.toLocaleString()}</td>
      <td class="num">${row.unitPrice != null ? formatSilver(row.unitPrice) : "—"}${priceHint}</td>
      <td class="num">${row.total != null ? formatSilver(row.total) : "—"}</td>
    </tr>`;
}

export function renderStats(calcResult, costInfo) {
  const statsEl = document.getElementById("stats");
  if (!statsEl) return;

  if (calcResult.mode === "party") {
    const variantLabel =
      calcResult.variantLabel ??
      calcResult.variant.charAt(0).toUpperCase() + calcResult.variant.slice(1);
    const catalystQty = calcResult.catalystItem?.qty ?? 0;
    statsEl.className = "stats";
    statsEl.innerHTML = `
      <div class="stat"><span class="stat-label">Variant</span><span class="stat-value">${variantLabel}</span></div>
      <div class="stat"><span class="stat-label">Harmonies required</span><span class="stat-value">${calcResult.harmoniesRequired.toLocaleString()}</span></div>
      <div class="stat"><span class="stat-label">Catalyst needed</span><span class="stat-value">${catalystQty.toLocaleString()}</span></div>
      <div class="stat"><span class="stat-label">Est. cost</span><span class="stat-value accent">${formatSilver(costInfo.total)}${costInfo.hasMissing ? "*" : ""}</span></div>
    `;
    return;
  }

  const isElixirs = calcResult.mode === "elixirs";

  if (isElixirs) {
    const { greenLine, blueLine } = formatExpectedOutput(calcResult.expectedOutput);
    statsEl.className = "stats";
    statsEl.innerHTML = `
      <div class="stat"><span class="stat-label">Total Crafts</span><span class="stat-value">${calcResult.crafts.toLocaleString()}</span></div>
      <div class="stat">
        <span class="stat-label">Expected output</span>
        <span class="stat-value stat-value--stacked">
          <span class="output-green">${greenLine}</span>
          <span class="output-blue">${blueLine}</span>
        </span>
      </div>
      <div class="stat stat--placeholder" aria-hidden="true"></div>
      <div class="stat"><span class="stat-label">Est. cost</span><span class="stat-value accent">${formatSilver(costInfo.total)}${costInfo.hasMissing ? "*" : ""}</span></div>
    `;
  } else {
    statsEl.className = "stats";
    statsEl.innerHTML = `
      <div class="stat"><span class="stat-label">Total Crafts</span><span class="stat-value">${calcResult.harmonyCrafts.toLocaleString()}</span></div>
      <div class="stat"><span class="stat-label">Expected output</span><span class="stat-value">${calcResult.harmonies.toLocaleString()} harmonies</span></div>
      <div class="stat">
        <span class="stat-label">Draughts / Catalyst Needed</span>
        <span class="stat-value stat-value--stacked stat-value--harmony-pair">
          <span class="harmony-stat-line">
            <span class="harmony-stat-num">${calcResult.draughtsPerType.toLocaleString()}</span>
            <span class="harmony-stat-unit">draughts</span>
          </span>
          <span class="harmony-stat-line">
            <span class="harmony-stat-num">${calcResult.catalyst.toLocaleString()}</span>
            <span class="harmony-stat-unit">catalyst</span>
          </span>
        </span>
      </div>
      <div class="stat"><span class="stat-label">Est. cost</span><span class="stat-value accent">${formatSilver(costInfo.total)}${costInfo.hasMissing ? "*" : ""}</span></div>
    `;
  }
}

export function renderBreakdown(calcResult, data, iconOverrides = {}) {
  const el = document.getElementById("breakdown-body");
  const titleEl = document.getElementById("breakdown-title");
  if (!el) return;

  if (titleEl) {
    if (calcResult.mode === "elixirs") {
      titleEl.textContent = "Materials Needed";
    } else if (calcResult.mode === "party") {
      titleEl.textContent = "Monster-Type Harmony Craft Breakdown";
    } else {
      titleEl.textContent = "Breakdown";
    }
  }

  if (calcResult.mode === "party") {
    const count = calcResult.partyCount;
    const slots = (calcResult.partyRecipePerCraft || []).map((item) => {
      const totalQty = item.qty * count;
      return `
        <div class="alchemy-slot-row alchemy-slot-row--compact">
          <span class="slot-qty">${totalQty.toLocaleString()}×</span>
          <span class="slot-icon">${itemIconImg(item.marketId, item.name, iconOverrides, { size: 20 })}</span>
          <span class="slot-name">${codexLink(item.marketId, item.name)}</span>
        </div>`;
    }).join("");

    el.innerHTML = `
      <div class="party-breakdown">
        <p class="muted breakdown-note">${calcResult.note || ""}</p>
        <p class="section-label">Simple Alchemy for ${count.toLocaleString()} party draught${count === 1 ? "" : "s"}</p>
        <div class="alchemy-slots">${slots}</div>
      </div>
    `;
    return;
  }

  if (calcResult.mode === "elixirs") {
    const { greenLine, blueLine } = formatExpectedOutput(
      calcResult.expectedOutput
    );
    const outputText = blueLine ? `${greenLine} · ${blueLine}` : greenLine;
    const rows = (calcResult.materials || [])
      .map(
        (m) =>
          `<tr>
            <td>${materialCell(m.marketId, m.name, iconOverrides)}${m.substitutedFrom ? `<div class="muted sub-hint">replaces ${m.substitutedFrom}</div>` : ""}</td>
            <td class="num"><b>${m.qty.toLocaleString()}</b></td>
          </tr>`
      )
      .join("");

    el.innerHTML = `
      <div class="breakdown-single">
        <h3>${calcResult.elixirName}</h3>
        <p class="muted">${calcResult.crafts.toLocaleString()} crafts → expect ${outputText}</p>
        <table class="data-table gather-table">
          <thead><tr><th>Material</th><th class="num">Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
    return;
  }

  const perElixir = calcResult.breakdown[0]?.elixirs[0];
  const need = perElixir?.elixirsNeeded ?? 0;
  const alchemyCrafts = perElixir?.alchemyCrafts ?? 0;

  const isBlue = calcResult.gradeMode === "blue";
  const gradeLabel = isBlue ? "blue" : "green";

  const draughtDetails = calcResult.breakdown
    .map((group) => {
      const draughtIcon = itemIconImg(group.marketId ?? data.draughts.find((d) => d.name === group.name)?.marketId, group.name, iconOverrides, { size: 20 });
      const elixirDetails = group.elixirs
        .map((e) => {
          const elixir = data.elixirs[e.greenName || e.name];
          const iconMarketId = isBlue
            ? (elixir?.blueMarketId ?? elixir?.codexId)
            : elixir?.codexId;
          const elixirIcon = itemIconImg(iconMarketId, e.name, iconOverrides, { size: 18 });
          const summary = isBlue
            ? `${e.elixirsNeeded.toLocaleString()} blue · ${e.alchemyCrafts.toLocaleString()} green crafts`
            : `${e.alchemyCrafts.toLocaleString()} crafts`;
          const slotLabel = isBlue
            ? '<p class="muted section-label">Simple Alchemy per blue</p>'
            : "";
          const precraft =
            !isBlue && e.precraftSteps?.length
              ? `<p class="muted section-label">Precraft</p>${renderPrecraftSteps(e.precraftSteps, iconOverrides, { compact: true })}`
              : "";
          return `
          <details class="elixir-recipe">
            <summary class="breakdown-title-row">${elixirIcon} ${e.name} · ${summary}</summary>
            ${slotLabel}
            ${renderAlchemySlots(e.recipePerCraft, iconOverrides, { compact: true })}
            ${precraft}
          </details>`;
        })
        .join("");

      const groupCrafts = isBlue
        ? `${need.toLocaleString()} ${gradeLabel}`
        : `${need.toLocaleString()} ${gradeLabel}`;

      return `
      <details class="draught-compact">
        <summary class="breakdown-title-row">${draughtIcon} ${group.name} — ${group.elixirs.length} elixirs · ${groupCrafts}</summary>
        ${elixirDetails}
      </details>`;
    })
    .join("");

  el.innerHTML = draughtDetails;

  if (calcResult.note) {
    el.innerHTML += `<p class="note">${calcResult.note}</p>`;
  }
}

export function renderShoppingList(calcResult, prices, sortBy = "cost", prefs = {}) {
  const tbody = document.getElementById("shopping-body");
  const footer = document.getElementById("shopping-footer");
  const countEl = document.getElementById("shopping-count");
  const noteEl = document.getElementById("shopping-note");
  const items = [];
  const isHarmony = calcResult.mode === "harmony";
  const isParty = calcResult.mode === "party";

  if (isHarmony || isParty) {
    if (calcResult.catalystItem) {
      items.push({ ...calcResult.catalystItem, type: "catalyst" });
    }
  } else {
    for (const mat of calcResult.materials || []) {
      items.push({ ...mat, type: "material" });
    }
  }

  const iconOverrides = prefs.iconOverrides || {};
  const showShoppingIcons = isHarmony || isParty;

  const rows = items.map((item) => ({
    ...item,
    unitPrice: getUnitPrice(item, prices, prefs),
    total: lineTotal(item, prices, prefs),
  }));

  if (sortBy === "cost") {
    rows.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  } else if (sortBy === "name") {
    rows.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortBy === "qty") {
    rows.sort((a, b) => b.qty - a.qty);
  }

  if (countEl) {
    countEl.textContent = rows.length ? `(${rows.length})` : "";
  }

  if (noteEl) {
    if (isHarmony) {
      noteEl.hidden = false;
      noteEl.textContent =
        "Assumes elixirs already crafted — buy catalyst only.";
    } else if (isParty) {
      noteEl.hidden = false;
      noteEl.textContent =
        "Assumes harmonies and hunt/will elixirs ready — buy catalyst only.";
    } else if (prefs.craftIntermediates !== false) {
      noteEl.hidden = false;
      noteEl.textContent =
        "Intermediates expanded — precraft oils/reagents yourself (see sidebar).";
    } else {
      noteEl.hidden = true;
      noteEl.textContent = "";
    }
  }

  tbody.innerHTML = rows
    .map((row) => renderShoppingRow(row, iconOverrides, { showIcons: showShoppingIcons }))
    .join("");

  const gradeMode =
    calcResult.mode === "harmony" ? calcResult.gradeMode : "green";
  const costInfo = computeTotalCost(calcResult, prices, gradeMode, prefs);
  const footerLabel = isHarmony || isParty
    ? "Grand total (Old Moon Merchant)"
    : "Grand total";
  footer.innerHTML = `<tr><td colspan="3"><b>${footerLabel}</b></td><td class="num accent"><b>${formatSilver(costInfo.total)}${costInfo.hasMissing ? "*" : ""}</b></td></tr>`;
}

export function renderMarketStatus(priceMeta, hasMissing, { loading = false } = {}) {
  const el = document.getElementById("market-status");
  if (!el) return;

  if (loading) {
    el.textContent = "EU · Refreshing prices…";
    return;
  }

  const {
    updatedAt,
    fromCache,
    fromStaticFallback,
    usedBdmFallback,
    fetched,
    failed,
    total,
    apiUnavailable,
  } = priceMeta;

  if (apiUnavailable && hasMissing) {
    el.textContent =
      "EU · market APIs unavailable · no prices loaded — try Refresh later";
    return;
  }

  let text = `EU · ${formatTime(updatedAt)}`;
  if (fromCache) text += " · cached";
  else if (fromStaticFallback) text += " · bundled cache";
  if (usedBdmFallback) text += " · fallback API";
  if (total > 0 && fetched != null) {
    text += ` · ${fetched}/${total} prices`;
    if (failed > 0) text += ` · ${failed} failed`;
  }
  if (priceMeta.impervaBlocked && fetched < total) {
    text += " · Arsha blocked";
  }
  if (hasMissing) text += " · some prices missing";
  el.textContent = text;
}

export function populateElixirSelect(data, selectEl) {
  selectEl.innerHTML = "";
  for (const group of data.draughts) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.name;
    for (const name of group.elixirs) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      optgroup.appendChild(opt);
    }
    selectEl.appendChild(optgroup);
  }

  const huntElixirs = [
    ...new Set(
      Object.values(data.partyHarmonies?.variants ?? {}).map((v) => v.huntElixir)
    ),
  ];
  const will = data.partyHarmonies?.willElixir;
  const miscNames = [...new Set([...huntElixirs, will].filter(Boolean))].sort();

  if (miscNames.length) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = "Misc";
    for (const name of miscNames) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      optgroup.appendChild(opt);
    }
    selectEl.appendChild(optgroup);
  }
}

export function setPanelVisibility(mode) {
  document.getElementById("panel-elixirs").hidden = mode !== "elixirs";
  document.getElementById("panel-harmony").hidden = mode !== "harmony";
  const partyPanel = document.getElementById("panel-party");
  if (partyPanel) partyPanel.hidden = mode !== "party";

  const titleEl = document.getElementById("breakdown-title");
  if (titleEl) {
    if (mode === "elixirs") titleEl.textContent = "Materials to gather";
    else if (mode === "party") titleEl.textContent = "Monster-Type Harmony Craft Breakdown";
    else titleEl.textContent = "Breakdown";
  }
}

function formatCompareContext(calcResult) {
  if (calcResult.mode === "elixirs") {
    const greens = calcResult.expectedOutput?.greens?.expected ?? 0;
    return `${calcResult.elixirName} · ${calcResult.crafts.toLocaleString()} crafts → ~${greens.toLocaleString()} green`;
  }

  if (calcResult.mode === "party") {
    const variantLabel =
      calcResult.variantLabel ??
      calcResult.variant.charAt(0).toUpperCase() + calcResult.variant.slice(1);
    return `${calcResult.partyName || "Party Harmony"} · ${variantLabel} · ${calcResult.partyCount.toLocaleString()} draughts`;
  }

  const gradeLabel =
    calcResult.gradeMode === "blue" ? "blue upgrade" : "green elixirs";
  return `Harmony Draught · ${calcResult.harmonyCrafts.toLocaleString()} crafts → ${calcResult.harmonies.toLocaleString()} harmonies (${gradeLabel})`;
}

function formatCompareSide(info, { label, showUnit = true }) {
  const missing = info.hasMissing ? "*" : "";
  const unit =
    showUnit && info.unitPrice != null
      ? `${formatSilver(info.unitPrice)} each`
      : "";
  const total =
    info.total != null ? `${formatSilver(info.total)}${missing}` : `—${missing}`;
  const qtyLine =
    info.qty != null && info.itemName
      ? `${info.qty.toLocaleString()} × ${info.itemName}`
      : "";

  return `
    <div class="compare-col stat">
      <span class="stat-label compare-col-title">${label}</span>
      ${info.detail ? `<p class="muted compare-detail">${info.detail}</p>` : ""}
      ${qtyLine ? `<p class="compare-qty">${qtyLine}</p>` : ""}
      ${unit ? `<p class="compare-unit">${unit}</p>` : ""}
      <p class="compare-total stat-value accent">${total}</p>
    </div>`;
}

export function renderCompare(calcResult, prices, craftingData, priceMeta = {}, prefs = {}) {
  const body = document.getElementById("compare-body");
  const contextEl = document.getElementById("compare-context");
  const syncEl = document.getElementById("compare-sync-status");
  if (!body) return;

  if (contextEl) {
    contextEl.textContent = formatCompareContext(calcResult);
  }

  if (syncEl) {
    if (priceMeta.loading) {
      syncEl.textContent = "Refreshing prices…";
    } else {
      let syncText = `Prices updated ${formatTime(priceMeta.updatedAt)}`;
      if (priceMeta.total > 0) {
        syncText += ` · ${priceMeta.total} market items`;
        if (priceMeta.failed > 0) {
          syncText += ` · ${priceMeta.failed} failed`;
        }
      }
      syncEl.textContent = syncText;
    }
  }

  const compare = computeCompare(calcResult, prices, craftingData, prefs);
  const { buy, craft, savings, cheaper, craftPartial } = compare;

  let savingsHtml = "";
  if (cheaper === "craft" && savings != null) {
    const partialMark = craftPartial ? "*" : "";
    const prefix = craftPartial ? "~" : "";
    savingsHtml = `<p class="compare-savings compare-savings--craft">${prefix}Craft saves ${formatSilver(savings)}${partialMark}</p>`;
    if (craftPartial) {
      savingsHtml += `<p class="compare-footnote muted">* Craft total incomplete — click Refresh if prices failed to load${priceMeta.failed > 0 ? ` (${priceMeta.failed} failed)` : ""}</p>`;
    }
  } else if (cheaper === "buy" && savings != null) {
    const partialMark = craftPartial ? "*" : "";
    const prefix = craftPartial ? "~" : "";
    savingsHtml = `<p class="compare-savings compare-savings--buy">${prefix}Buying saves ${formatSilver(Math.abs(savings))}${partialMark}</p>`;
    if (craftPartial) {
      savingsHtml += `<p class="compare-footnote muted">* Craft total incomplete — click Refresh if prices failed to load${priceMeta.failed > 0 ? ` (${priceMeta.failed} failed)` : ""}</p>`;
    }
  } else if (cheaper === "tie") {
    savingsHtml = `<p class="compare-savings">Same cost${craftPartial ? " (craft total may be incomplete*)" : ""}</p>`;
  } else if (buy.hasMissing) {
    savingsHtml =
      '<p class="compare-savings muted">Cannot compare — buy price unavailable on Central Market</p>';
  } else {
    savingsHtml =
      '<p class="compare-savings muted">Cannot compare — insufficient price data</p>';
  }

  body.innerHTML = `
    <div class="compare-grid">
      ${formatCompareSide(buy, { label: "Buy from Central Market" })}
      ${formatCompareSide(craft, { label: "Craft", showUnit: false })}
    </div>
    ${savingsHtml}
  `;
}

export function populatePartyVariants(data, selectedVariant = "human", iconOverrides = {}) {
  const container = document.getElementById("party-variant-options");
  if (!container || !data?.partyHarmonies?.variants) return;

  const variants = data.partyHarmonies.variants;
  container.innerHTML = Object.entries(variants)
    .map(([key, config]) => {
      const label =
        config.label ?? key.charAt(0).toUpperCase() + key.slice(1);
      const icon = itemIconImg(config.marketId, label, iconOverrides, {
        size: 20,
        className: "item-icon pref-icon",
      });
      const checked = key === selectedVariant ? " checked" : "";
      return `<label class="radio-option--icon"><input type="radio" name="party-variant" data-party-variant value="${key}"${checked}>${icon}<span>${label}</span></label>`;
    })
    .join("");
}

export function updateElixirSelectIcon(data, elixirName, iconOverrides = {}) {
  const iconEl = document.getElementById("elixir-select-icon");
  if (!iconEl || !data) return;

  const elixir = data.elixirs[elixirName];
  if (!elixir) {
    iconEl.innerHTML = "";
    return;
  }

  iconEl.innerHTML = itemIconImg(elixir.codexId, elixirName, iconOverrides, {
    size: 28,
    className: "item-icon elixir-select-icon-img",
  });
}
