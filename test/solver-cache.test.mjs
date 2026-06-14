import assert from "node:assert/strict";
import { test } from "node:test";
import { ELEMENTS, parseQuartzCsv } from "../src/quartz.mjs";
import { searchSolutions, SLOT_DISABLED, SLOT_NORMAL } from "../src/search.mjs";
import {
  clearSolverCache,
  compactSearchResult,
  createSolverCacheKey,
  getCachedSearchResult,
  putCachedSearchResult,
  rehydrateCachedSearchResult,
  SOLVER_CACHE_ENTRY_LIMIT,
  SOLVER_CACHE_STORAGE_KEY,
} from "../src/solver-cache.mjs";

class FakeStorage {
  constructor() {
    this.items = new Map();
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    this.items.set(key, String(value));
  }

  removeItem(key) {
    this.items.delete(key);
  }
}

function req(values = {}) {
  return Object.fromEntries(ELEMENTS.map((element) => [element, values[element] ?? 0]));
}

function defaultGrid() {
  return Array.from({ length: 4 }, () => Array(4).fill(SLOT_NORMAL));
}

function payload(overrides = {}) {
  return {
    quartzList: [],
    slotGrid: defaultGrid(),
    requirements: [req({ 水: 4 }), req(), req(), req()],
    options: {
      limit: 20,
      requiredQuartzIds: [],
      excludedQuartzIds: [],
      dedupeByQuartzList: true,
    },
    ...overrides,
  };
}

function readStoredEntries(storage) {
  return JSON.parse(storage.getItem(SOLVER_CACHE_STORAGE_KEY));
}

function emptyResult() {
  return { solutions: [], limited: false, skipped: true };
}

test("compacts and rehydrates cached search results", () => {
  const quartz = parseQuartzCsv("HP2\t水\t水×4\r\n攻击2\t火\t火×4\r\n");
  const slotGrid = defaultGrid();
  slotGrid[0][1] = SLOT_DISABLED;
  const result = searchSolutions(quartz, slotGrid, [req({ 水: 4 }), req(), req(), req()]);
  const compact = compactSearchResult(result);
  const rehydrated = rehydrateCachedSearchResult(compact, quartz, slotGrid);

  assert.deepEqual(rehydrated, result);
  assert.deepEqual(compact.solutions[0].lines[0], [null, null, null, 0]);
});

test("cache keys are stable for reordered quartz selection ids", () => {
  const firstKey = createSolverCacheKey(
    payload({
      options: {
        limit: 20,
        requiredQuartzIds: [5, 1, 5],
        excludedQuartzIds: [9, 3],
        dedupeByQuartzList: true,
      },
    }),
    "kai",
  );
  const secondKey = createSolverCacheKey(
    payload({
      options: {
        limit: 20,
        requiredQuartzIds: [1, 5],
        excludedQuartzIds: [3, 9],
        dedupeByQuartzList: true,
      },
    }),
    "kai",
  );

  assert.equal(firstKey, secondKey);
});

test("cache keys change for compute-relevant inputs", () => {
  const baseKey = createSolverCacheKey(payload(), "kai");
  const differentSource = createSolverCacheKey(payload(), "kuro");
  const differentRequirement = createSolverCacheKey(payload({ requirements: [req({ 水: 5 }), req(), req(), req()] }), "kai");
  const differentSlotGrid = createSolverCacheKey(
    payload({ slotGrid: [["水", SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL], ...defaultGrid().slice(1)] }),
    "kai",
  );
  const differentLimit = createSolverCacheKey(
    payload({
      options: {
        limit: 10,
        requiredQuartzIds: [],
        excludedQuartzIds: [],
        dedupeByQuartzList: true,
      },
    }),
    "kai",
  );
  const differentDedupe = createSolverCacheKey(
    payload({
      options: {
        limit: 20,
        requiredQuartzIds: [],
        excludedQuartzIds: [],
        dedupeByQuartzList: false,
      },
    }),
    "kai",
  );

  assert.notEqual(baseKey, differentSource);
  assert.notEqual(baseKey, differentRequirement);
  assert.notEqual(baseKey, differentSlotGrid);
  assert.notEqual(baseKey, differentLimit);
  assert.notEqual(baseKey, differentDedupe);
});

test("cache hit refreshes recency before LRU eviction", () => {
  const storage = new FakeStorage();
  const entries = Array.from({ length: SOLVER_CACHE_ENTRY_LIMIT }, (_, index) => ({
    key: `key-${index}`,
    result: compactSearchResult(emptyResult()),
    lastAccessedAt: index,
  }));
  storage.setItem(SOLVER_CACHE_STORAGE_KEY, JSON.stringify(entries));

  assert.deepEqual(getCachedSearchResult("key-0", [], defaultGrid(), { storage, now: () => 1000 }), emptyResult());
  putCachedSearchResult("key-new", emptyResult(), { storage, now: () => 1001 });

  const storedKeys = readStoredEntries(storage).map((entry) => entry.key);
  assert.equal(storedKeys.length, SOLVER_CACHE_ENTRY_LIMIT);
  assert.ok(storedKeys.includes("key-0"));
  assert.ok(storedKeys.includes("key-new"));
  assert.ok(!storedKeys.includes("key-1"));
});

test("cache evicts oldest entries when the entry limit is exceeded", () => {
  const storage = new FakeStorage();
  for (let index = 0; index <= SOLVER_CACHE_ENTRY_LIMIT; index += 1) {
    putCachedSearchResult(`key-${index}`, emptyResult(), { storage, now: () => index });
  }

  const storedKeys = readStoredEntries(storage).map((entry) => entry.key);
  assert.equal(storedKeys.length, SOLVER_CACHE_ENTRY_LIMIT);
  assert.ok(!storedKeys.includes("key-0"));
  assert.ok(storedKeys.includes(`key-${SOLVER_CACHE_ENTRY_LIMIT}`));
});

test("cache helpers tolerate malformed storage", () => {
  const storage = new FakeStorage();
  storage.setItem(SOLVER_CACHE_STORAGE_KEY, "not json");

  assert.equal(getCachedSearchResult("key", [], defaultGrid(), { storage }), null);
  assert.doesNotThrow(() => putCachedSearchResult("key", emptyResult(), { storage }));
});

test("clearSolverCache removes cached entries", () => {
  const storage = new FakeStorage();
  putCachedSearchResult("key", emptyResult(), { storage });

  clearSolverCache({ storage });

  assert.equal(storage.getItem(SOLVER_CACHE_STORAGE_KEY), null);
});
