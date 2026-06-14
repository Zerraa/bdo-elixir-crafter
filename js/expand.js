const MAX_DEPTH = 8;
export const CLEAR_REAGENT_ID = 5301;

function getIntermediate(data, marketId) {
  return data?.intermediates?.[String(marketId)];
}

function isExpandable(entry) {
  return Boolean(entry?.materials?.length);
}

function shouldSkipItem(marketId, prefs) {
  return (
    prefs?.ignoreClearReagent && Number(marketId) === CLEAR_REAGENT_ID
  );
}

function resolveMaterials(entry) {
  return (entry.materials || []).map((m) => ({ ...m }));
}

function applySubstitutionWithCheck(mat, data, prefs, shouldApplySubstitution) {
  const sub = data?.substitutions?.[mat.name];
  if (sub && shouldApplySubstitution(sub, prefs)) {
    return {
      ...mat,
      name: sub.replaceWith.name,
      marketId: sub.replaceWith.marketId,
      substitutedFrom: mat.name,
    };
  }
  return mat;
}

function buildTreeNode(mat, data, prefs, depth, visiting, shouldApplySubstitution) {
  if (depth > MAX_DEPTH) {
    return { ...mat, craftable: false };
  }

  const entry = getIntermediate(data, mat.marketId);

  if (!entry) {
    return { ...mat, craftable: false };
  }

  if (shouldSkipItem(mat.marketId, prefs) || !isExpandable(entry)) {
    return {
      name: entry.name ?? mat.name,
      marketId: mat.marketId,
      qty: mat.qty,
      craftable: false,
      note: entry.note,
      method: entry.method,
      substitutedFrom: mat.substitutedFrom,
    };
  }

  const key = String(mat.marketId);
  if (visiting.has(key)) {
    return { ...mat, craftable: false };
  }

  visiting.add(key);
  const materials = resolveMaterials(entry);
  const children = materials.map((sub, slotIndex) => {
    const scaled = {
      name: sub.name,
      marketId: sub.marketId,
      qty: sub.qty * mat.qty,
    };
    const withSub = applySubstitutionWithCheck(
      scaled,
      data,
      prefs,
      shouldApplySubstitution
    );
    const childNode = buildTreeNode(
      withSub,
      data,
      prefs,
      depth + 1,
      visiting,
      shouldApplySubstitution
    );
    const slotAlts = (entry.alternatives || []).filter(
      (a) => a.slotIndex === slotIndex
    );
    if (slotAlts.length) {
      childNode.alternatives = slotAlts;
    }
    return childNode;
  });
  visiting.delete(key);

  return {
    name: entry.name ?? mat.name,
    marketId: mat.marketId,
    qty: mat.qty,
    craftable: true,
    children,
    note: entry.note,
    method: entry.method,
    substitutedFrom: mat.substitutedFrom,
  };
}

export function buildMaterialTree(materials, data, prefs, shouldApplySubstitution) {
  const nodes = (materials || []).map((m) => {
    const withSub = applySubstitutionWithCheck(
      m,
      data,
      prefs,
      shouldApplySubstitution
    );
    return buildTreeNode(
      withSub,
      data,
      prefs,
      0,
      new Set(),
      shouldApplySubstitution
    );
  });
  return nodes.sort((a, b) => a.name.localeCompare(b.name));
}

function mergeMaterialList(items) {
  const byId = new Map();
  for (const item of items) {
    if (!item?.marketId || item.qty <= 0) continue;
    const key = String(item.marketId);
    const existing = byId.get(key) || {
      name: item.name,
      marketId: item.marketId,
      qty: 0,
    };
    existing.qty += item.qty;
    if (item.expandedFrom && !existing.expandedFrom) {
      existing.expandedFrom = item.expandedFrom;
    }
    if (item.substitutedFrom) existing.substitutedFrom = item.substitutedFrom;
    byId.set(key, existing);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function expandOne(item, totalQty, data, prefs, depth, visiting) {
  if (totalQty <= 0) return [];

  if (shouldSkipItem(item.marketId, prefs)) {
    return [];
  }

  const entry = getIntermediate(data, item.marketId);

  if (
    prefs?.craftIntermediates === false ||
    !isExpandable(entry) ||
    depth > MAX_DEPTH
  ) {
    return [
      {
        name: item.name,
        marketId: item.marketId,
        qty: totalQty,
        substitutedFrom: item.substitutedFrom,
      },
    ];
  }

  const key = String(item.marketId);
  if (visiting.has(key)) {
    return [
      {
        name: item.name,
        marketId: item.marketId,
        qty: totalQty,
        substitutedFrom: item.substitutedFrom,
      },
    ];
  }

  visiting.add(key);
  const expanded = [];

  for (const sub of resolveMaterials(entry)) {
    expanded.push(
      ...expandOne(
        {
          name: sub.name,
          marketId: sub.marketId,
          expandedFrom: item.name,
        },
        sub.qty * totalQty,
        data,
        prefs,
        depth + 1,
        visiting
      )
    );
  }

  visiting.delete(key);
  return expanded;
}

export function expandIntermediates(materials, data, prefs = {}) {
  if (prefs.craftIntermediates === false) {
    return materials.map((m) => ({ ...m }));
  }

  const expanded = [];
  for (const mat of materials || []) {
    if (shouldSkipItem(mat.marketId, prefs)) continue;
    expanded.push(
      ...expandOne(
        {
          name: mat.name,
          marketId: mat.marketId,
          substitutedFrom: mat.substitutedFrom,
        },
        mat.qty,
        data,
        prefs,
        0,
        new Set()
      )
    );
  }

  return mergeMaterialList(expanded);
}

export function scaleRecipeMaterials(materials, multiplier) {
  const m = Math.max(0, multiplier);
  return (materials || []).map((mat) => ({
    ...mat,
    qty: mat.qty * m,
  }));
}
