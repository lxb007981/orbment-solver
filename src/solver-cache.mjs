import { ELEMENTS, emptyValues } from "./quartz.mjs";
import { contributionForSlot } from "./search.mjs";

export const SOLVER_CACHE_STORAGE_KEY = "orbment-solver-result-cache";
export const SOLVER_CACHE_ENTRY_LIMIT = 500;

function storageOrDefault(storage) {
  return storage ?? globalThis.localStorage;
}

function uniqueSortedIds(ids) {
  return [...new Set(ids ?? [])]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id >= 0)
    .sort((first, second) => first - second);
}

function normalizeRequirements(requirements) {
  return Array.from({ length: 4 }, (_, lineIndex) => {
    const requirement = requirements?.[lineIndex] ?? {};
    return Object.fromEntries(
      ELEMENTS.map((element) => [element, Math.max(0, Number(requirement[element] ?? 0) || 0)]),
    );
  });
}

function normalizeSlotGrid(slotGrid) {
  return Array.from({ length: 4 }, (_, lineIndex) => Array.from({ length: 4 }, (_, slotIndex) => slotGrid?.[lineIndex]?.[slotIndex] ?? "normal"));
}

export function createSolverCacheKey(payload, quartzSourceId) {
  const options = payload?.options ?? {};
  return JSON.stringify({
    source: quartzSourceId,
    slotGrid: normalizeSlotGrid(payload?.slotGrid),
    requirements: normalizeRequirements(payload?.requirements),
    limit: Number(options.limit ?? 20),
    requiredQuartzIds: uniqueSortedIds(options.requiredQuartzIds),
    excludedQuartzIds: uniqueSortedIds(options.excludedQuartzIds),
    dedupeByQuartzList: options.dedupeByQuartzList !== false,
  });
}

export function compactSearchResult(result) {
  return {
    limited: Boolean(result?.limited),
    skipped: Boolean(result?.skipped),
    solutions: (result?.solutions ?? []).map((solution) => ({
      lines: (solution?.lines ?? []).map((line) =>
        line
          ? line.assignment.map((entry) => (entry ? entry.quartz.id : null))
          : null,
      ),
    })),
  };
}

function quartzLookup(quartzList) {
  return new Map(quartzList.map((quartz) => [quartz.id, quartz]));
}

export function rehydrateCachedSearchResult(compactResult, quartzList, slotGrid) {
  const quartzById = quartzLookup(quartzList);

  return {
    limited: Boolean(compactResult?.limited),
    skipped: Boolean(compactResult?.skipped),
    solutions: (compactResult?.solutions ?? []).map((solution) => ({
      lines: (solution?.lines ?? []).map((compactLine, lineIndex) => {
        if (!compactLine) {
          return null;
        }

        const values = emptyValues();
        const assignment = compactLine.map((quartzId, slotIndex) => {
          if (quartzId === null) {
            return null;
          }

          const quartz = quartzById.get(quartzId);
          if (!quartz) {
            throw new Error(`Cached quartz #${quartzId} is not available`);
          }

          const slotType = slotGrid[lineIndex][slotIndex];
          const contribution = contributionForSlot(quartz, slotType);
          for (const element of ELEMENTS) {
            values[element] += contribution[element];
          }
          return { quartz, slotType, contribution };
        });

        return { lineIndex, assignment, values };
      }),
    })),
  };
}

function readEntries(storage = storageOrDefault()) {
  try {
    const rawCache = storage?.getItem(SOLVER_CACHE_STORAGE_KEY);
    if (!rawCache) {
      return [];
    }

    const entries = JSON.parse(rawCache);
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries.filter((entry) => typeof entry?.key === "string" && entry.result);
  } catch {
    return [];
  }
}

function writeEntries(entries, storage = storageOrDefault()) {
  storage?.setItem(SOLVER_CACHE_STORAGE_KEY, JSON.stringify(entries));
}

function pruneEntries(entries, limit = SOLVER_CACHE_ENTRY_LIMIT) {
  if (entries.length <= limit) {
    return entries;
  }

  return [...entries]
    .sort((first, second) => Number(second.lastAccessedAt ?? 0) - Number(first.lastAccessedAt ?? 0))
    .slice(0, limit);
}

export function getCachedSearchResult(cacheKey, quartzList, slotGrid, options = {}) {
  const storage = storageOrDefault(options.storage);
  const now = options.now ?? Date.now;
  const entries = readEntries(storage);
  const entry = entries.find((candidate) => candidate.key === cacheKey);
  if (!entry) {
    return null;
  }

  let result;
  try {
    result = rehydrateCachedSearchResult(entry.result, quartzList, slotGrid);
  } catch {
    const remainingEntries = entries.filter((candidate) => candidate !== entry);
    try {
      writeEntries(remainingEntries, storage);
    } catch {
      // Ignore cache cleanup failures; the caller can still compute normally.
    }
    return null;
  }

  entry.lastAccessedAt = now();
  try {
    writeEntries(pruneEntries(entries), storage);
  } catch {
    // The cached result is still valid even if recency persistence fails.
  }
  return result;
}

function tryWritePrunedEntries(entries, storage) {
  let prunedEntries = pruneEntries(entries);
  while (prunedEntries.length > 0) {
    try {
      writeEntries(prunedEntries, storage);
      return;
    } catch {
      prunedEntries = prunedEntries
        .sort((first, second) => Number(first.lastAccessedAt ?? 0) - Number(second.lastAccessedAt ?? 0))
        .slice(1);
    }
  }

  writeEntries([], storage);
}

export function putCachedSearchResult(cacheKey, result, options = {}) {
  const storage = storageOrDefault(options.storage);
  const now = options.now ?? Date.now;
  try {
    const entries = readEntries(storage).filter((entry) => entry.key !== cacheKey);
    entries.push({
      key: cacheKey,
      result: compactSearchResult(result),
      lastAccessedAt: now(),
    });
    tryWritePrunedEntries(entries, storage);
  } catch {
    // Cache failures should never block solving.
  }
}

export function clearSolverCache(options = {}) {
  try {
    storageOrDefault(options.storage)?.removeItem(SOLVER_CACHE_STORAGE_KEY);
  } catch {
    // Cache failures should never block the app.
  }
}
