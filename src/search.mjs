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

function requiredIdsArray(requiredQuartzIds) {
  return [...requiredQuartzIds].sort((first, second) => first - second);
}

function canPlaceRequiredQuartzInSlots(requiredQuartzIds, quartzById, availableSlots) {
  const ids = requiredIdsArray(requiredQuartzIds);
  if (ids.length === 0) {
    return true;
  }

  if (ids.length > availableSlots.length) {
    return false;
  }

  const requiredQuartz = ids.map((id) => quartzById.get(id));
  if (requiredQuartz.some((quartz) => !quartz)) {
    return false;
  }

  const candidates = requiredQuartz
    .map((quartz) => ({
      quartz,
      slots: availableSlots
        .map((slot, slotIndex) => (canUseQuartzInSlot(quartz, slot.slotType, slot.lineIndex) ? slotIndex : -1))
        .filter((slotIndex) => slotIndex >= 0),
    }))
    .sort((first, second) => first.slots.length - second.slots.length || first.quartz.id - second.quartz.id);

  if (candidates.some((candidate) => candidate.slots.length === 0)) {
    return false;
  }

  const usedSlotIndices = new Set();
  function match(candidateIndex) {
    if (candidateIndex === candidates.length) {
      return true;
    }

    for (const slotIndex of candidates[candidateIndex].slots) {
      if (usedSlotIndices.has(slotIndex)) {
        continue;
      }

      usedSlotIndices.add(slotIndex);
      if (match(candidateIndex + 1)) {
        return true;
      }
      usedSlotIndices.delete(slotIndex);
    }

    return false;
  }

  return match(0);
}

function slotsForLineIndices(slotGrid, lineIndices) {
  const slots = [];
  for (const lineIndex of lineIndices) {
    for (const slotType of slotGrid[lineIndex] ?? []) {
      if (slotType !== SLOT_DISABLED) {
        slots.push({ lineIndex, slotType });
      }
    }
  }
  return slots;
}

function canPlaceRequiredQuartz(requiredQuartzIds, quartzById, slotGrid, lineIndices) {
  return canPlaceRequiredQuartzInSlots(requiredQuartzIds, quartzById, slotsForLineIndices(slotGrid, lineIndices));
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

function lineRequirementContributionScore(lineIndex, slotTypes, requirement, quartz) {
  let score = 0;

  for (const slotType of slotTypes) {
    if (!canUseQuartzInSlot(quartz, slotType, lineIndex)) {
      continue;
    }

    const contribution = contributionForSlot(quartz, slotType);
    let slotScore = 0;
    for (const element of ELEMENTS) {
      if (requirement[element] > 0) {
        slotScore += Math.min(contribution[element], requirement[element]);
      }
    }
    score = Math.max(score, slotScore);
  }

  return score;
}

function signatureForQuartzIds(ids) {
  return [...ids].sort((a, b) => a - b).join(",");
}

function signatureForAssignment(assignment, dedupeByQuartzList) {
  const entries = assignment.filter(Boolean);
  if (dedupeByQuartzList) {
    return signatureForQuartzIds(entries.map((entry) => entry.quartz.id));
  }

  return entries
    .map((entry) => `${entry.slotType}:${entry.quartz.id}`)
    .sort()
    .join(",");
}

function signatureForSolutionLines(lines) {
  return signatureForQuartzIds(
    lines.flatMap((line) => (line ? line.assignment.filter(Boolean).map((entry) => entry.quartz.id) : [])),
  );
}

function searchLineCombinations(
  lineIndex,
  slotTypes,
  requirement,
  quartzList,
  usedQuartzIds,
  requiredQuartzIds,
  limit,
  dedupeByQuartzList,
  options = {},
) {
  const values = emptyValues();
  const assignment = Array(slotTypes.length).fill(null);
  const includedRequiredQuartzIds = new Set();
  const quartzById = options.quartzById ?? new Map(quartzList.map((quartz) => [quartz.id, quartz]));
  const slotGrid = options.slotGrid;
  const futureLineIndices = options.futureLineIndices ?? [];
  const onCombination = options.onCombination;
  const hasLineRequirement = hasRequirement(requirement);
  const relevantQuartzList = hasLineRequirement
    ? quartzList.filter((quartz) => requiredQuartzIds.has(quartz.id) || lineRequirementContributionScore(lineIndex, slotTypes, requirement, quartz) > 0)
    : quartzList;
  const candidateQuartzList =
    requiredQuartzIds.size > 0
      ? [...relevantQuartzList].sort((first, second) => {
          const firstRequired = requiredQuartzIds.has(first.id) ? 0 : 1;
          const secondRequired = requiredQuartzIds.has(second.id) ? 0 : 1;
          if (hasLineRequirement) {
            const firstScore = lineRequirementContributionScore(lineIndex, slotTypes, requirement, first);
            const secondScore = lineRequirementContributionScore(lineIndex, slotTypes, requirement, second);
            const firstHelpfulRequired = firstRequired === 0 && firstScore > 0 ? 0 : 1;
            const secondHelpfulRequired = secondRequired === 0 && secondScore > 0 ? 0 : 1;
            return (
              firstHelpfulRequired - secondHelpfulRequired ||
              secondScore - firstScore ||
              firstRequired - secondRequired ||
              first.id - second.id
            );
          }
          if (firstRequired !== secondRequired) {
            return firstRequired - secondRequired;
          }
          return first.id - second.id;
        })
      : relevantQuartzList;
  const results = [];
  const seen = new Set();
  const resultCountsByRequiredSignature = new Map();
  let limited = false;
  let stopped = false;

  function canDeferMissingRequiredQuartz() {
    if (requiredQuartzIds.size === 0 || !slotGrid) {
      return true;
    }

    const deferredRequiredQuartzIds = new Set();
    for (const quartzId of requiredQuartzIds) {
      if (!includedRequiredQuartzIds.has(quartzId)) {
        deferredRequiredQuartzIds.add(quartzId);
      }
    }

    return canPlaceRequiredQuartz(deferredRequiredQuartzIds, quartzById, slotGrid, futureLineIndices);
  }

  function canPlaceMissingRequiredFrom(slotIndex) {
    if (requiredQuartzIds.size === 0 || !slotGrid) {
      return true;
    }

    const missingRequiredQuartzIds = new Set();
    for (const quartzId of requiredQuartzIds) {
      if (!includedRequiredQuartzIds.has(quartzId)) {
        missingRequiredQuartzIds.add(quartzId);
      }
    }

    const availableSlots = [];
    for (let index = slotIndex; index < slotTypes.length; index += 1) {
      const slotType = slotTypes[index];
      if (slotType !== SLOT_DISABLED) {
        availableSlots.push({ lineIndex, slotType });
      }
    }
    availableSlots.push(...slotsForLineIndices(slotGrid, futureLineIndices));

    return canPlaceRequiredQuartzInSlots(missingRequiredQuartzIds, quartzById, availableSlots);
  }

  function recordResult() {
    if (!canDeferMissingRequiredQuartz()) {
      return;
    }

    if (
      !isMinimalAssignment(assignment, values, requirement, requiredQuartzIds) ||
      !isPreferredAssignment(lineIndex, assignment, values, requirement, quartzList, usedQuartzIds, requiredQuartzIds)
    ) {
      return;
    }

    const signature = signatureForAssignment(assignment, dedupeByQuartzList);
    if (seen.has(signature)) {
      return;
    }

    const requiredSignature = signatureForQuartzIds(includedRequiredQuartzIds);
    const signatureCount = resultCountsByRequiredSignature.get(requiredSignature) ?? 0;
    if (signatureCount >= limit) {
      limited = true;
      return;
    }

    const result = {
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
    };

    seen.add(signature);
    resultCountsByRequiredSignature.set(requiredSignature, signatureCount + 1);
    if (onCombination) {
      if (onCombination(result) === false) {
        stopped = true;
      }
      return;
    }

    results.push(result);
  }

  function backtrack(slotIndex) {
    if (requiredQuartzIds.size === 0 && results.length > limit) {
      limited = true;
      stopped = true;
      return;
    }

    if (!canPlaceMissingRequiredFrom(slotIndex)) {
      return;
    }

    const requirementMet = meetsRequirement(values, requirement);
    if (requirementMet) {
      recordResult();
      if (stopped) {
        return;
      }
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
    if (!canStillReachRequirement(lineIndex, values, [slotType, ...remainingSlots], requirement, relevantQuartzList, usedQuartzIds)) {
      return;
    }

    const tryEmptySlot = () => {
      assignment[slotIndex] = null;
      backtrack(slotIndex + 1);
      assignment[slotIndex] = null;
    };

    if (
      requiredQuartzIds.size === 0 &&
      canStillReachRequirement(lineIndex, values, remainingSlots, requirement, relevantQuartzList, usedQuartzIds)
    ) {
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

      if (canStillReachRequirement(lineIndex, values, remainingSlots, requirement, relevantQuartzList, usedQuartzIds)) {
        backtrack(slotIndex + 1);
      }

      assignment[slotIndex] = null;
      subtractValues(values, contribution);
      if (isRequired) {
        includedRequiredQuartzIds.delete(quartz.id);
      }
      usedQuartzIds.delete(quartz.id);

      if (stopped) {
        return;
      }
    }

    if (
      requiredQuartzIds.size > 0 &&
      canStillReachRequirement(lineIndex, values, remainingSlots, requirement, relevantQuartzList, usedQuartzIds)
    ) {
      tryEmptySlot();
    }
  }

  backtrack(0);
  return { combinations: requiredQuartzIds.size === 0 ? results.slice(0, limit) : results, limited };
}

export function searchSolutions(quartzList, slotGrid, requirements, options = {}) {
  const limit = Number(options.limit ?? 20);
  const dedupeByQuartzList = options.dedupeByQuartzList !== false;
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
  const availableQuartzById = new Map(availableQuartzList.map((quartz) => [quartz.id, quartz]));
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
              firstScore.slotFlexibility - secondScore.slotFlexibility ||
              firstScore.lineIndex - secondScore.lineIndex
            );
          })
      : activeLines;

  if (lineSearchOrder.length === 0) {
    return { solutions: [], limited: false, skipped: true };
  }

  const solutions = [];
  const seenSolutionQuartzSignatures = new Set();
  const usedQuartzIds = new Set();
  const currentLines = Array(slotGrid.length).fill(null);
  let limited = false;

  function backtrack(lineSearchIndex, remainingRequiredQuartzIds) {
    if (solutions.length > limit) {
      limited = true;
      return;
    }

    const remainingLineIndices = lineSearchOrder.slice(lineSearchIndex).map(({ lineIndex }) => lineIndex);
    if (!canPlaceRequiredQuartz(remainingRequiredQuartzIds, availableQuartzById, slotGrid, remainingLineIndices)) {
      return;
    }

    if (lineSearchIndex === lineSearchOrder.length) {
      if (remainingRequiredQuartzIds.size > 0) {
        return;
      }

      if (dedupeByQuartzList) {
        const signature = signatureForSolutionLines(currentLines);
        if (seenSolutionQuartzSignatures.has(signature)) {
          return;
        }
        seenSolutionQuartzSignatures.add(signature);
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
    const futureLineIndices = lineSearchOrder.slice(lineSearchIndex + 1).map((line) => line.lineIndex);
    const lineResult = searchLineCombinations(
      lineIndex,
      slotGrid[lineIndex],
      requirement,
      availableQuartzList,
      usedQuartzIds,
      remainingRequiredQuartzIds,
      limit + 1,
      dedupeByQuartzList,
      {
        quartzById: availableQuartzById,
        slotGrid,
        futureLineIndices,
        onCombination(combination) {
          const ids = combination.assignment.filter(Boolean).map((entry) => entry.quartz.id);
          const nextRemainingRequiredQuartzIds = new Set(remainingRequiredQuartzIds);
          for (const id of combination.requiredQuartzIds) {
            nextRemainingRequiredQuartzIds.delete(id);
          }

          const hasEquippedQuartz = ids.length > 0;
          currentLines[lineIndex] = hasRequirement(requirement) || hasEquippedQuartz ? combination : null;
          backtrack(lineSearchIndex + 1, nextRemainingRequiredQuartzIds);
          currentLines[lineIndex] = null;

          if (solutions.length > limit) {
            limited = true;
            return false;
          }

          return true;
        },
      },
    );

    if (lineResult.limited && lineSearchOrder.length === 1) {
      limited = true;
    }
  }

  backtrack(0, requiredQuartzIds);

  return {
    solutions: solutions.slice(0, limit),
    limited: limited || solutions.length > limit,
    skipped: false,
  };
}
