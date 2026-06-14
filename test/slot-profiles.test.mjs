import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SLOT_DISABLED, SLOT_NORMAL } from "../src/search.mjs";
import { parseSlotLine, parseSlotProfilesJson } from "../src/slot-profiles.mjs";

test("parses slot profile line tokens", () => {
  assert.deepEqual(parseSlotLine("普禁水幻"), [SLOT_NORMAL, SLOT_DISABLED, "水", "幻"]);
});

test("rejects malformed slot lines", () => {
  assert.throws(() => parseSlotLine("普普普"), /expected 4 slots/);
  assert.throws(() => parseSlotLine("普普普雷"), /unknown slot token 雷/);
});

test("parses character profiles into slot grids", () => {
  const profiles = parseSlotProfilesJson(
    JSON.stringify({
      game: "kai",
      characters: [
        {
          id: "0",
          name: "范恩",
          slots: {
            武器: "普时普普",
            护盾: "普普时普",
            驱动: "普普普禁",
            Extra: "普普地普",
          },
        },
      ],
    }),
    "kai",
  );

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].name, "范恩");
  assert.deepEqual(profiles[0].slotGrid[0], [SLOT_NORMAL, "时", SLOT_NORMAL, SLOT_NORMAL]);
  assert.deepEqual(profiles[0].slotGrid[2], [SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_DISABLED]);
});

test("rejects profile files for the wrong game", () => {
  assert.throws(() => parseSlotProfilesJson('{"game":"kuro","characters":[]}', "kai"), /expected kai/);
});

test("rejects profiles with missing required lines", () => {
  assert.throws(
    () =>
      parseSlotProfilesJson(
        JSON.stringify({
          game: "kai",
          characters: [
            {
              id: "1",
              name: "角色",
              slots: {
                武器: "普普普普",
                护盾: "普普普普",
                Extra: "普普普普",
              },
            },
          ],
        }),
        "kai",
      ),
    /missing 驱动 slots/,
  );
});

test("bundled slot profile files are valid", () => {
  const files = [
    ["kuro", "kuro-slot-profiles.json", 8],
    ["kuro2", "kuro2-slot-profiles.json", 17],
    ["kai", "kai-slot-profiles.json", 24],
  ];

  for (const [gameId, filename, expectedCount] of files) {
    const profiles = parseSlotProfilesJson(readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"), gameId);
    assert.equal(profiles.length, expectedCount);
  }
});
