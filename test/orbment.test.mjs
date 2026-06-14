import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseQuartzCsv } from "../src/quartz.mjs";
import {
  LINE_NAMES,
  SLOT_DISABLED,
  SLOT_NORMAL,
  allowedLineIndicesForQuartz,
  contributionForSlot,
  searchSolutions,
} from "../src/search.mjs";

const elements = ["地", "水", "风", "火", "时", "空", "幻"];

function req(values = {}) {
  return Object.fromEntries(elements.map((element) => [element, values[element] ?? 0]));
}

function grid(
  line0,
  line1 = [SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL],
  line2 = [SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL],
  line3 = [SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL],
) {
  return [line0, line1, line2, line3];
}

function reqs(lineIndex, requirement) {
  return Array.from({ length: 4 }, (_, index) => (index === lineIndex ? requirement : req()));
}

function equippedNames(solution) {
  return solution.lines
    .flatMap((line) => (line ? line.assignment : []))
    .filter(Boolean)
    .map((entry) => entry.quartz.name)
    .sort();
}

function quartzIdsByName(quartz, names) {
  return names.map((name) => {
    const item = quartz.find((quartzItem) => quartzItem.name === name);
    assert.ok(item, `missing quartz fixture: ${name}`);
    return item.id;
  });
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
  const extraElements = ["地", "风", "火", "时", "空", "幻"];
  const rows = extraElements.map((element, index) => `水${index + 1}\t水\t水×1，${element}×1`).join("\r\n");
  const quartz = parseQuartzCsv(`${rows}\r\n`);
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL]), [req({ 水: 1 }), req(), req(), req()], {
    limit: 3,
  });

  assert.equal(result.solutions.length, 3);
  assert.equal(result.limited, true);
});

test("filters line assignments with irrelevant extra quartz", () => {
  const quartz = parseQuartzCsv("水1\t水\t水×1\r\n水2\t水\t水×1\r\n水3\t水\t水×1\r\n火1\t火\t火×1\r\n");
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL, SLOT_NORMAL]), [req({ 水: 3 }), req(), req(), req()]);

  assert.equal(result.solutions.length, 1);
  const equipped = result.solutions[0].lines[0].assignment.filter(Boolean);
  assert.equal(equipped.length, 3);
  assert.deepEqual(
    equipped.map((entry) => entry.quartz.name).sort(),
    ["水1", "水2", "水3"],
  );
});

test("prefers weaker quartz when it still satisfies requirements", () => {
  const quartz = parseQuartzCsv("HP3\t水\t水×6\r\nHP2\t水\t水×4\r\n");
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req({ 水: 4 }), req(), req(), req()]);

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["HP2"]);
});

test("keeps stronger quartz when weaker quartz cannot satisfy requirements", () => {
  const quartz = parseQuartzCsv("HP2\t水\t水×4\r\nHP3\t水\t水×6\r\n");
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req({ 水: 5 }), req(), req(), req()]);

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["HP3"]);
});

test("suppresses exact duplicate quartz variants with the lower CSV id as canonical", () => {
  const quartz = parseQuartzCsv("魔防3\t水\t水×6\r\nHP3\t水\t水×6\r\n");
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req({ 水: 6 }), req(), req(), req()]);

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["魔防3"]);
});

test("excludes selected quartz by name instead of elemental values", () => {
  const quartz = parseQuartzCsv("魔防3\t水\t水×6\r\nHP3\t水\t水×6\r\n");
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req({ 水: 6 }), req(), req(), req()], {
    excludedQuartzIds: quartzIdsByName(quartz, ["HP3"]),
  });

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["魔防3"]);
});

test("does not use excluded quartz", () => {
  const quartz = parseQuartzCsv("HP3\t水\t水×6\r\n");
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req({ 水: 6 }), req(), req(), req()], {
    excludedQuartzIds: quartzIdsByName(quartz, ["HP3"]),
  });

  assert.equal(result.solutions.length, 0);
});

test("allows an exact duplicate quartz when the canonical duplicate is excluded", () => {
  const quartz = parseQuartzCsv("魔防3\t水\t水×6\r\nHP3\t水\t水×6\r\n");
  const result = searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req({ 水: 6 }), req(), req(), req()], {
    excludedQuartzIds: quartzIdsByName(quartz, ["魔防3"]),
  });

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["HP3"]);
});

test("rejects quartz selected as both required and excluded", () => {
  const quartz = parseQuartzCsv("HP3\t水\t水×6\r\n");

  assert.throws(
    () =>
      searchSolutions(quartz, grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]), [req(), req(), req(), req()], {
        requiredQuartzIds: quartzIdsByName(quartz, ["HP3"]),
        excludedQuartzIds: quartzIdsByName(quartz, ["HP3"]),
      }),
    /cannot be both required and excluded/,
  );
});

test("allows exact duplicate quartz to satisfy separate lines when both copies are needed", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\nHP2\t水\t水×4\r\n");
  const result = searchSolutions(
    quartz,
    grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED], [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]),
    [req({ 水: 4 }), req({ 水: 4 }), req(), req()],
  );

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["HP2", "魔防2"]);
});

test("keeps required quartz even when a weaker quartz satisfies requirements", () => {
  const quartz = parseQuartzCsv("HP3\t水\t水×6\r\nHP2\t水\t水×4\r\n");
  const result = searchSolutions(
    quartz,
    grid(
      [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
      [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
      [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
      [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    ),
    [req({ 水: 4 }), req(), req(), req()],
    {
      requiredQuartzIds: [quartz[0].id],
    },
  );

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["HP3"]);
});

test("does not collapse same-value quartz with different line eligibility", () => {
  const quartz = parseQuartzCsv("冻结之刃\t水\t水×3\r\n水3\t水\t水×3\r\n");
  const result = searchSolutions(
    quartz,
    grid([SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED], [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED]),
    [req({ 水: 3 }), req({ 水: 3 }), req(), req()],
  );

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["冻结之刃", "水3"]);
});

test("finds mandatory quartz distributions beyond early line candidate buckets", () => {
  const quartz = parseQuartzCsv(readFileSync(new URL("../kai-quartz.csv", import.meta.url), "utf8"));
  const requiredNames = ["苍冰之诗", "水灵之诗", "胧月之诗", "月灵之诗"];
  const result = searchSolutions(
    quartz,
    grid(
      [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
      [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
      [SLOT_NORMAL, SLOT_NORMAL, "风", SLOT_NORMAL],
      [SLOT_NORMAL, "水", SLOT_NORMAL, SLOT_NORMAL],
    ),
    [req(), req(), req({ 风: 6, 幻: 12 }), req({ 水: 3, 幻: 6 })],
    {
      requiredQuartzIds: quartzIdsByName(quartz, requiredNames),
    },
  );

  assert.ok(result.solutions.length > 0);
  assert.ok(requiredNames.every((name) => equippedNames(result.solutions[0]).includes(name)));
});

test("prioritizes mandatory quartz placements before empty slots", () => {
  const quartz = parseQuartzCsv(readFileSync(new URL("../kai-quartz.csv", import.meta.url), "utf8"));
  const requiredNames = ["晓星之诗", "星灵之诗", "胧月之诗", "月灵之诗"];
  const result = searchSolutions(
    quartz,
    grid(
      [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
      [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
      [SLOT_NORMAL, SLOT_NORMAL, "风", SLOT_NORMAL],
      [SLOT_NORMAL, "水", SLOT_NORMAL, SLOT_NORMAL],
    ),
    [req(), req(), req({ 风: 6, 幻: 12 }), req({ 水: 3, 幻: 6 })],
    {
      requiredQuartzIds: quartzIdsByName(quartz, requiredNames),
    },
  );

  assert.ok(result.solutions.length > 0);
  assert.ok(requiredNames.every((name) => equippedNames(result.solutions[0]).includes(name)));
});

test("derives allowed line indices from restricted quartz names", () => {
  const quartz = parseQuartzCsv("冻结之刃\t水\t水×3\r\n青晶之轮\t水\t水×3\r\n水灵之诗\t水\t水×3\r\n魔防2\t水\t水×4\r\n");

  assert.deepEqual(allowedLineIndicesForQuartz(quartz[0]).map((index) => LINE_NAMES[index]), ["武器", "Extra"]);
  assert.deepEqual(allowedLineIndicesForQuartz(quartz[1]).map((index) => LINE_NAMES[index]), ["护盾", "Extra"]);
  assert.deepEqual(allowedLineIndicesForQuartz(quartz[2]).map((index) => LINE_NAMES[index]), ["驱动", "Extra"]);
  assert.deepEqual(allowedLineIndicesForQuartz(quartz[3]).map((index) => LINE_NAMES[index]), ["武器", "护盾", "驱动", "Extra"]);
});

test("restricts blade quartz to weapon and extra lines", () => {
  const quartz = parseQuartzCsv("冻结之刃\t水\t水×3\r\n");
  const slots = grid(
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );

  assert.equal(searchSolutions(quartz, slots, reqs(0, req({ 水: 3 }))).solutions.length, 1);
  assert.equal(searchSolutions(quartz, slots, reqs(1, req({ 水: 3 }))).solutions.length, 0);
  assert.equal(searchSolutions(quartz, slots, reqs(2, req({ 水: 3 }))).solutions.length, 0);
  assert.equal(searchSolutions(quartz, slots, reqs(3, req({ 水: 3 }))).solutions.length, 1);
});

test("restricts wheel quartz to shield and extra lines", () => {
  const quartz = parseQuartzCsv("青晶之轮\t水\t水×3\r\n");
  const slots = grid(
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );

  assert.equal(searchSolutions(quartz, slots, reqs(0, req({ 水: 3 }))).solutions.length, 0);
  assert.equal(searchSolutions(quartz, slots, reqs(1, req({ 水: 3 }))).solutions.length, 1);
  assert.equal(searchSolutions(quartz, slots, reqs(2, req({ 水: 3 }))).solutions.length, 0);
  assert.equal(searchSolutions(quartz, slots, reqs(3, req({ 水: 3 }))).solutions.length, 1);
});

test("restricts poem quartz to drive and extra lines", () => {
  const quartz = parseQuartzCsv("水灵之诗\t水\t水×3\r\n");
  const slots = grid(
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );

  assert.equal(searchSolutions(quartz, slots, reqs(0, req({ 水: 3 }))).solutions.length, 0);
  assert.equal(searchSolutions(quartz, slots, reqs(1, req({ 水: 3 }))).solutions.length, 0);
  assert.equal(searchSolutions(quartz, slots, reqs(2, req({ 水: 3 }))).solutions.length, 1);
  assert.equal(searchSolutions(quartz, slots, reqs(3, req({ 水: 3 }))).solutions.length, 1);
});

test("allows unrestricted quartz on any line", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n");
  const slots = grid(
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );

  for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
    assert.equal(searchSolutions(quartz, slots, reqs(lineIndex, req({ 水: 4 }))).solutions.length, 1);
  }
});

test("searches required quartz even without elemental requirements", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n");
  const slots = grid(
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );
  const result = searchSolutions(quartz, slots, [req(), req(), req(), req()], {
    requiredQuartzIds: [quartz[0].id],
  });

  assert.equal(result.skipped, false);
  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["魔防2"]);
});

test("requires every selected quartz to appear in the final result", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n攻击1\t火\t火×2\r\n");
  const slots = grid(
    [SLOT_NORMAL, SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );
  const result = searchSolutions(quartz, slots, [req(), req(), req(), req()], {
    requiredQuartzIds: quartz.map((item) => item.id),
  });

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["攻击1", "魔防2"]);
});

test("keeps required quartz even when they are not needed for elemental totals", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n攻击1\t火\t火×2\r\n");
  const slots = grid(
    [SLOT_NORMAL, SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );
  const result = searchSolutions(quartz, slots, [req({ 水: 4 }), req(), req(), req()], {
    requiredQuartzIds: [quartz[1].id],
  });

  assert.equal(result.solutions.length, 1);
  assert.deepEqual(equippedNames(result.solutions[0]), ["攻击1", "魔防2"]);
});

test("required quartz obey line restrictions", () => {
  const quartz = parseQuartzCsv("水灵之诗\t水\t水×3\r\n");
  const weaponOnlySlots = grid(
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );
  const extraOnlySlots = grid(
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_NORMAL, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );

  assert.equal(
    searchSolutions(quartz, weaponOnlySlots, [req(), req(), req(), req()], { requiredQuartzIds: [quartz[0].id] }).solutions.length,
    0,
  );
  assert.equal(
    searchSolutions(quartz, extraOnlySlots, [req(), req(), req(), req()], { requiredQuartzIds: [quartz[0].id] }).solutions.length,
    1,
  );
});

test("required quartz obey element-specific and disabled slot restrictions", () => {
  const quartz = parseQuartzCsv("魔防2\t水\t水×4\r\n");
  const fireSlot = grid(
    ["火", SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );
  const disabledSlots = grid(
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
    [SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED, SLOT_DISABLED],
  );

  assert.equal(searchSolutions(quartz, fireSlot, [req(), req(), req(), req()], { requiredQuartzIds: [quartz[0].id] }).solutions.length, 0);
  assert.equal(
    searchSolutions(quartz, disabledSlots, [req(), req(), req(), req()], { requiredQuartzIds: [quartz[0].id] }).solutions.length,
    0,
  );
});
