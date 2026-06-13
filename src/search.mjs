import { ELEMENTS, emptyValues } from "./quartz.mjs";

export const SLOT_NORMAL = "normal";
export const SLOT_DISABLED = "disabled";
export const LINE_NAMES = ["武器", "护盾", "驱动", "Extra"];

const LINE_MARKER_RULES = [
  { marker: "刃", allowedLineIndices: new Set([0, 3]) },
  { marker: "轮", allowedLineIndices: new Set([1, 3]) },
  { marker: "诗", allowedLineIndices: new Set([2, 3]) },
];

function normalizeRequirement(requirement) {
  const normalized = emptyValues();
  for (const element of ELEMENTS) {
    normalized[element] = Math.max(0, Number(requirement?.[element] ?? 0) || 0);
  }
  return normalized;
}

function hasRequirement(requirement) {
  return ELEMENTS.some((element) => requirement[element] > 0);
}

export function allowedLineIndicesForQuartz(quartz) {
  let allowed = new Set(LINE_NAMES.map((_, lineIndex) => lineIndex));

  for (const rule of LINE_MARKER_RULES) {
    if (!quartz.name.includes(rule.marker)) {
      continue;
    }

    allowed = new Set([...allowed].filter((lineIndex) => rule.allowedLineIndices.has(lineIndex)));
  }

  return [...allowed].sort((a, b) => a - b);
}

function canUseQuartzInLine(quartz, lineIndex) {
  return allowedLineIndicesForQuartz(quartz).includes(lineIndex);
}

function canUseQuartzInSlot(quartz, slotType, lineIndex) {
  if (slotType === SLOT_DISABLED) {
    return false;
  }

  return canUseQuartzInLine(quartz, lineIndex) && (slotType === SLOT_NORMAL || quartz.element === slotType);
}

export function contributionForSlot(quartz, slotType) {
  const multiplier = slotType !== SLOT_NORMAL && slotType !== SLOT_DISABLED ? 2 : 1;
  const values = emptyValues();

  for (const element of ELEMENTS) {
    values[element] = quartz.values[element] * multiplier;
  }

  return values;
}

function addValues(target, source) {
  for (const element of ELEMENTS) {
    target[element] += source[element];
  }
}

function subtractValues(target, source) {
  for (const element of ELEMENTS) {
    target[element] -= source[element];
  }
}

function meetsRequirement(values, requirement) {
  return ELEMENTS.every((element) => values[element] >= requirement[element]);
}

function isMinimalAssignment(assignment, values, requirement) {
  for (const entry of assignment) {
    if (!entry) {
      continue;
    }

    const reduced = { ...values };
    subtractValues(reduced, entry.contribution);
    if (meetsRequirement(reduced, requirement)) {
      return false;
    }
  }

  return true;
}

function canStillReachRequirement(lineIndex, values, remainingSlots, requirement, quartzList, usedQuartzIds) {
  for (const element of ELEMENTS) {
    if (values[element] >= requirement[element]) {
      continue;
    }

    const bestContributions = [];
    for (const quartz of quartzList) {
      if (usedQuartzIds.has(quartz.id)) {
        continue;
      }

      let best = 0;
      for (const slotType of remainingSlots) {
        if (canUseQuartzInSlot(quartz, slotType, lineIndex)) {
          best = Math.max(best, contributionForSlot(quartz, slotType)[element]);
        }
      }
      if (best > 0) {
        bestContributions.push(best);
      }
    }

    bestContributions.sort((a, b) => b - a);
    const possible = bestContributions.slice(0, remainingSlots.length).reduce((sum, value) => sum + value, 0);
    if (values[element] + possible < requirement[element]) {
      return false;
    }
  }

  return true;
}

function signatureForAssignment(assignment) {
  return assignment
    .filter(Boolean)
    .map((entry) => `${entry.slotType}:${entry.quartz.id}`)
    .sort()
    .join(",");
}

function searchLineCombinations(lineIndex, slotTypes, requirement, quartzList, usedQuartzIds, limit) {
  const values = emptyValues();
  const assignment = Array(slotTypes.length).fill(null);
  const results = [];
  const seen = new Set();
  let limited = false;

  function recordResult() {
    if (!isMinimalAssignment(assignment, values, requirement)) {
      return;
    }

    const signature = signatureForAssignment(assignment);
    if (seen.has(signature)) {
      return;
    }

    seen.add(signature);
    results.push({
      lineIndex,
      assignment: assignment.map((entry) =>
        entry
          ? {
              quartz: entry.quartz,
              slotType: entry.slotType,
              contribution: { ...entry.contribution },
            }
          : null,
      ),
      values: { ...values },
    });
  }

  function backtrack(slotIndex) {
    if (results.length > limit) {
      limited = true;
      return;
    }

    if (meetsRequirement(values, requirement)) {
      recordResult();
      return;
    }

    if (slotIndex === slotTypes.length) {
      return;
    }

    const slotType = slotTypes[slotIndex];
    if (slotType === SLOT_DISABLED) {
      assignment[slotIndex] = null;
      backtrack(slotIndex + 1);
      assignment[slotIndex] = null;
      return;
    }

    const remainingSlots = slotTypes.slice(slotIndex + 1).filter((type) => type !== SLOT_DISABLED);
    if (!canStillReachRequirement(lineIndex, values, [slotType, ...remainingSlots], requirement, quartzList, usedQuartzIds)) {
      return;
    }

    assignment[slotIndex] = null;
    if (canStillReachRequirement(lineIndex, values, remainingSlots, requirement, quartzList, usedQuartzIds)) {
      backtrack(slotIndex + 1);
    }

    for (const quartz of quartzList) {
      if (usedQuartzIds.has(quartz.id) || !canUseQuartzInSlot(quartz, slotType, lineIndex)) {
        continue;
      }

      const contribution = contributionForSlot(quartz, slotType);
      usedQuartzIds.add(quartz.id);
      addValues(values, contribution);
      assignment[slotIndex] = { quartz, slotType, contribution };

      if (canStillReachRequirement(lineIndex, values, remainingSlots, requirement, quartzList, usedQuartzIds)) {
        backtrack(slotIndex + 1);
      }

      assignment[slotIndex] = null;
      subtractValues(values, contribution);
      usedQuartzIds.delete(quartz.id);

      if (limited) {
        return;
      }
    }
  }

  backtrack(0);
  return { combinations: results.slice(0, limit), limited };
}

export function searchSolutions(quartzList, slotGrid, requirements, options = {}) {
  const limit = Number(options.limit ?? 20);
  const normalizedRequirements = requirements.map(normalizeRequirement);
  const activeLines = normalizedRequirements
    .map((requirement, lineIndex) => ({ lineIndex, requirement }))
    .filter(({ requirement }) => hasRequirement(requirement));

  if (activeLines.length === 0) {
    return { solutions: [], limited: false, skipped: true };
  }

  const solutions = [];
  const usedQuartzIds = new Set();
  const currentLines = Array(slotGrid.length).fill(null);
  let limited = false;

  function backtrack(activeLineIndex) {
    if (solutions.length > limit) {
      limited = true;
      return;
    }

    if (activeLineIndex === activeLines.length) {
      solutions.push({
        lines: currentLines.map((line) =>
          line
            ? {
                lineIndex: line.lineIndex,
                assignment: line.assignment,
                values: { ...line.values },
              }
            : null,
        ),
      });
      return;
    }

    const { lineIndex, requirement } = activeLines[activeLineIndex];
    const lineResult = searchLineCombinations(
      lineIndex,
      slotGrid[lineIndex],
      requirement,
      quartzList,
      usedQuartzIds,
      limit + 1,
    );

    if (lineResult.limited && activeLines.length === 1) {
      limited = true;
    }

    for (const combination of lineResult.combinations) {
      const ids = combination.assignment.filter(Boolean).map((entry) => entry.quartz.id);
      for (const id of ids) {
        usedQuartzIds.add(id);
      }

      currentLines[lineIndex] = combination;
      backtrack(activeLineIndex + 1);
      currentLines[lineIndex] = null;

      for (const id of ids) {
        usedQuartzIds.delete(id);
      }

      if (solutions.length > limit) {
        limited = true;
        return;
      }
    }
  }

  backtrack(0);

  return {
    solutions: solutions.slice(0, limit),
    limited: limited || solutions.length > limit,
    skipped: false,
  };
}
