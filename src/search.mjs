import { ELEMENTS, emptyValues } from "./quartz.mjs";

export const SLOT_NORMAL = "normal";
export const SLOT_DISABLED = "disabled";
export const LINE_NAMES = ["武器", "护盾", "驱动", "Extra"];

const LINE_MARKER_RULES = [
  { marker: "刃", allowedLineIndices: [0, 3] },
  { marker: "轮", allowedLineIndices: [1, 3] },
  { marker: "诗", allowedLineIndices: [2, 3] },
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
  const rule = LINE_MARKER_RULES.find(({ marker }) => quartz.name.includes(marker));
  return rule ? rule.allowedLineIndices : LINE_NAMES.map((_, lineIndex) => lineIndex);
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

function sameLineEligibility(firstQuartz, secondQuartz) {
  const firstAllowed = allowedLineIndicesForQuartz(firstQuartz);
  const secondAllowed = allowedLineIndicesForQuartz(secondQuartz);
  return firstAllowed.length === secondAllowed.length && firstAllowed.every((lineIndex, index) => lineIndex === secondAllowed[index]);
}

function compareContributions(candidateContribution, currentContribution) {
  let hasLowerValue = false;

  for (const element of ELEMENTS) {
    if (candidateContribution[element] > currentContribution[element]) {
      return { lowerOrEqual: false, hasLowerValue: false };
    }

    if (candidateContribution[element] < currentContribution[element]) {
      hasLowerValue = true;
    }
  }

  return { lowerOrEqual: true, hasLowerValue };
}

function meetsRequirementWithReplacement(values, currentContribution, candidateContribution, requirement) {
  const replaced = { ...values };
  subtractValues(replaced, currentContribution);
  addValues(replaced, candidateContribution);
  return meetsRequirement(replaced, requirement);
}

function isMinimalAssignment(assignment, values, requirement, requiredQuartzIds) {
  for (const entry of assignment) {
    if (!entry) {
      continue;
    }

    if (requiredQuartzIds.has(entry.quartz.id)) {
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

function isPreferredAssignment(lineIndex, assignment, values, requirement, quartzList, usedQuartzIds, requiredQuartzIds) {
  for (const entry of assignment) {
    if (!entry || requiredQuartzIds.has(entry.quartz.id)) {
      continue;
    }

    for (const candidate of quartzList) {
      if (
        candidate.id === entry.quartz.id ||
        usedQuartzIds.has(candidate.id) ||
        requiredQuartzIds.has(candidate.id) ||
        candidate.element !== entry.quartz.element ||
        !sameLineEligibility(candidate, entry.quartz) ||
        !canUseQuartzInSlot(candidate, entry.slotType, lineIndex)
      ) {
        continue;
      }

      const candidateContribution = contributionForSlot(candidate, entry.slotType);
      const comparison = compareContributions(candidateContribution, entry.contribution);
      if (!comparison.lowerOrEqual) {
        continue;
      }

      const isCanonicalDuplicate = !comparison.hasLowerValue && candidate.id < entry.quartz.id;
      if (!comparison.hasLowerValue && !isCanonicalDuplicate) {
        continue;
      }

      if (meetsRequirementWithReplacement(values, entry.contribution, candidateContribution, requirement)) {
        return false;
      }
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

function lineConstraintScore(lineIndex, slotTypes, requirement, quartzList) {
  const activeRequirementCount = ELEMENTS.filter((element) => requirement[element] > 0).length;
  const slotFlexibility = slotTypes.reduce((sum, slotType) => {
    if (slotType === SLOT_DISABLED) {
      return sum;
    }

    return sum + quartzList.filter((quartz) => canUseQuartzInSlot(quartz, slotType, lineIndex)).length;
  }, 0);

  return {
    hasRequirement: hasRequirement(requirement) ? 0 : 1,
    activeRequirementCount: -activeRequirementCount,
    slotFlexibility,
    lineIndex,
  };
}

function signatureForAssignment(assignment) {
  return assignment
    .filter(Boolean)
    .map((entry) => `${entry.slotType}:${entry.quartz.id}`)
    .sort()
    .join(",");
}

function signatureForQuartzIds(ids) {
  return [...ids].sort((a, b) => a - b).join(",");
}

function searchLineCombinations(lineIndex, slotTypes, requirement, quartzList, usedQuartzIds, requiredQuartzIds, limit) {
  const values = emptyValues();
  const assignment = Array(slotTypes.length).fill(null);
  const includedRequiredQuartzIds = new Set();
  const candidateQuartzList =
    requiredQuartzIds.size > 0
      ? [...quartzList].sort((first, second) => {
          const firstRequired = requiredQuartzIds.has(first.id) ? 0 : 1;
          const secondRequired = requiredQuartzIds.has(second.id) ? 0 : 1;
          return firstRequired - secondRequired || first.id - second.id;
        })
      : quartzList;
  const results = [];
  const seen = new Set();
  const resultCountsByRequiredSignature = new Map();
  let limited = false;

  function recordResult() {
    if (
      !isMinimalAssignment(assignment, values, requirement, requiredQuartzIds) ||
      !isPreferredAssignment(lineIndex, assignment, values, requirement, quartzList, usedQuartzIds, requiredQuartzIds)
    ) {
      return;
    }

    const signature = signatureForAssignment(assignment);
    if (seen.has(signature)) {
      return;
    }

    const requiredSignature = signatureForQuartzIds(includedRequiredQuartzIds);
    const signatureCount = resultCountsByRequiredSignature.get(requiredSignature) ?? 0;
    if (signatureCount >= limit) {
      limited = true;
      return;
    }

    seen.add(signature);
    resultCountsByRequiredSignature.set(requiredSignature, signatureCount + 1);
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
      requiredQuartzIds: [...includedRequiredQuartzIds],
    });
  }

  function backtrack(slotIndex) {
    if (requiredQuartzIds.size === 0 && results.length > limit) {
      limited = true;
      return;
    }

    const requirementMet = meetsRequirement(values, requirement);
    if (requirementMet) {
      recordResult();
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

    const tryEmptySlot = () => {
      assignment[slotIndex] = null;
      backtrack(slotIndex + 1);
      assignment[slotIndex] = null;
    };

    if (requiredQuartzIds.size === 0 && canStillReachRequirement(lineIndex, values, remainingSlots, requirement, quartzList, usedQuartzIds)) {
      tryEmptySlot();
    }

    for (const quartz of candidateQuartzList) {
      if (usedQuartzIds.has(quartz.id) || !canUseQuartzInSlot(quartz, slotType, lineIndex)) {
        continue;
      }

      const isRequired = requiredQuartzIds.has(quartz.id);
      if (requirementMet && !isRequired) {
        continue;
      }

      const contribution = contributionForSlot(quartz, slotType);
      usedQuartzIds.add(quartz.id);
      if (isRequired) {
        includedRequiredQuartzIds.add(quartz.id);
      }
      addValues(values, contribution);
      assignment[slotIndex] = { quartz, slotType, contribution };

      if (canStillReachRequirement(lineIndex, values, remainingSlots, requirement, quartzList, usedQuartzIds)) {
        backtrack(slotIndex + 1);
      }

      assignment[slotIndex] = null;
      subtractValues(values, contribution);
      if (isRequired) {
        includedRequiredQuartzIds.delete(quartz.id);
      }
      usedQuartzIds.delete(quartz.id);

      if (limited) {
        return;
      }
    }

    if (requiredQuartzIds.size > 0 && canStillReachRequirement(lineIndex, values, remainingSlots, requirement, quartzList, usedQuartzIds)) {
      tryEmptySlot();
    }
  }

  backtrack(0);
  return { combinations: requiredQuartzIds.size === 0 ? results.slice(0, limit) : results, limited };
}

export function searchSolutions(quartzList, slotGrid, requirements, options = {}) {
  const limit = Number(options.limit ?? 20);
  const knownQuartzIds = new Set(quartzList.map((quartz) => quartz.id));
  const requiredQuartzIds = new Set(
    (options.requiredQuartzIds ?? [])
      .map((id) => Number(id))
      .filter((id) => knownQuartzIds.has(id)),
  );
  const excludedQuartzIds = new Set(
    (options.excludedQuartzIds ?? [])
      .map((id) => Number(id))
      .filter((id) => knownQuartzIds.has(id)),
  );
  for (const quartzId of requiredQuartzIds) {
    if (excludedQuartzIds.has(quartzId)) {
      const quartz = quartzList.find((item) => item.id === quartzId);
      throw new Error(`${quartz?.name ?? `Quartz #${quartzId}`} cannot be both required and excluded`);
    }
  }

  const availableQuartzList = quartzList.filter((quartz) => !excludedQuartzIds.has(quartz.id));
  const normalizedRequirements = requirements.map(normalizeRequirement);
  const activeLines = normalizedRequirements
    .map((requirement, lineIndex) => ({ lineIndex, requirement }))
    .filter(({ requirement }) => hasRequirement(requirement));
  const lineSearchOrder =
    requiredQuartzIds.size > 0
      ? slotGrid
          .map((_, lineIndex) => ({ lineIndex, requirement: normalizedRequirements[lineIndex] }))
          .sort((first, second) => {
            const firstScore = lineConstraintScore(first.lineIndex, slotGrid[first.lineIndex], first.requirement, availableQuartzList);
            const secondScore = lineConstraintScore(second.lineIndex, slotGrid[second.lineIndex], second.requirement, availableQuartzList);
            return (
              firstScore.hasRequirement - secondScore.hasRequirement ||
              firstScore.activeRequirementCount - secondScore.activeRequirementCount ||
              secondScore.slotFlexibility - firstScore.slotFlexibility ||
              firstScore.lineIndex - secondScore.lineIndex
            );
          })
      : activeLines;

  if (lineSearchOrder.length === 0) {
    return { solutions: [], limited: false, skipped: true };
  }

  const solutions = [];
  const usedQuartzIds = new Set();
  const currentLines = Array(slotGrid.length).fill(null);
  let limited = false;

  function backtrack(lineSearchIndex, remainingRequiredQuartzIds) {
    if (solutions.length > limit) {
      limited = true;
      return;
    }

    if (lineSearchIndex === lineSearchOrder.length) {
      if (remainingRequiredQuartzIds.size > 0) {
        return;
      }

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

    const { lineIndex, requirement } = lineSearchOrder[lineSearchIndex];
    const lineResult = searchLineCombinations(
      lineIndex,
      slotGrid[lineIndex],
      requirement,
      availableQuartzList,
      usedQuartzIds,
      remainingRequiredQuartzIds,
      limit + 1,
    );

    if (lineResult.limited && lineSearchOrder.length === 1) {
      limited = true;
    }

    for (const combination of lineResult.combinations) {
      const ids = combination.assignment.filter(Boolean).map((entry) => entry.quartz.id);
      for (const id of ids) {
        usedQuartzIds.add(id);
      }

      const nextRemainingRequiredQuartzIds = new Set(remainingRequiredQuartzIds);
      for (const id of combination.requiredQuartzIds) {
        nextRemainingRequiredQuartzIds.delete(id);
      }

      const hasEquippedQuartz = ids.length > 0;
      currentLines[lineIndex] = hasRequirement(requirement) || hasEquippedQuartz ? combination : null;
      backtrack(lineSearchIndex + 1, nextRemainingRequiredQuartzIds);
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

  backtrack(0, requiredQuartzIds);

  return {
    solutions: solutions.slice(0, limit),
    limited: limited || solutions.length > limit,
    skipped: false,
  };
}
