import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuartzCsv } from "../src/quartz.mjs";
import { SLOT_DISABLED, SLOT_NORMAL, contributionForSlot, searchSolutions } from "../src/search.mjs";

const elements = ["地", "水", "风", "火", "时", "空", "幻"];

function req(values = {}) {
  return Object.fromEntries(elements.map((element) => [element, values[element] ?? 0]));
}

function grid(line0, line1 = [SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL]) {
  return [line0, line1, [SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL], [SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL]];
}

test("parses tab-delimited quartz CSV rows", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n三月兔\t空\t空×5，风×3\r\n");

  assert.equal(quartz.length, 2);
  assert.equal(quartz[0].name, "魔防2");
  assert.equal(quartz[0].element, "水");
  assert.equal(quartz[0].values["水"], 4);
  assert.equal(quartz[1].values["空"], 5);
  assert.equal(quartz[1].values["风"], 3);
});

test("doubles every elemental value in an element-specific slot", () => {
  const [quartz] = parseQuartzCsv("三月兔\t空\t空×5，风×3\r\n");
  const contribution = contributionForSlot(quartz, "空");

  assert.equal(contribution["空"], 10);
  assert.equal(contribution["风"], 6);
});

test("disabled slots do not equip quartz", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n");
  const result = searchSolutions(quartz, grid([SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req({ 水: 1 }), req(), req(), req()]);

  assert.equal(result.solutions.length, 0);
  assert.equal(result.skipped, false);
});

test("matches requirements as minimum thresholds", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n");
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req({ 水: 3 }), req(), req(), req()]);

  assert.equal(result.solutions.length, 1);
  assert.equal(result.solutions[0].lines[0].values["水"], 4);
});

test("element-specific slots only accept matching quartz type", () => {
  const quartz = parseQuartzCsv("攻击2\t火\t火×4\r\n魔防2\t水\t水×4\r\n");
  const result = searchSolutions(quartz, grid(["水", SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req({ 火: 1 }), req(), req(), req()]);

  assert.equal(result.solutions.length, 0);
});

test("globally prevents the same quartz from being reused across lines", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n");
  const result = searchSolutions(
    quartz,
    grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED], [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]),
    [req({ 水: 4 }), req({ 水: 4 }), req(), req()],
  );

  assert.equal(result.solutions.length, 0);
});

test("skips lines without requirements", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n");
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req(), req(), req(), req()]);

  assert.equal(result.skipped, true);
  assert.equal(result.solutions.length, 0);
});

test("stops after more than the requested solution limit", () => {
  const rows = Array.from({ length: 6 }, (_, index) => `水${index + 1}\t水\t水×1`).join("\r\n");
  const quartz = parseQuartzCsv(`${rows}\r\n`);
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL]), [req({ 水: 1 }), req(), req(), req()], {
    limit: 3,
  });

  assert.equal(result.solutions.length, 3);
  assert.equal(result.limited, true);
});
