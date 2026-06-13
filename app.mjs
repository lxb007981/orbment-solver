import { ELEMENTS, formatValues, parseQuartzCsv } from "./src/quartz.mjs";
import { LINE_NAMES, SLOT_DISABLED, SLOT_NORMAL } from "./src/search.mjs";

const elementColors = {
  地: "#8f6835",
  水: "#1976a8",
  风: "#23875d",
  火: "#b83b30",
  时: "#64547d",
  空: "#b5a972",
  幻: "#b1aabc",
};

const STORAGE_KEY = "orbment-solver-inputs";
const STORAGE_VERSION = 1;
const savedInputState = loadInputState();
const slotGrid = savedInputState?.slotGrid ?? createDefaultSlotGrid();
const savedRequirements = savedInputState?.requirements ?? createDefaultRequirements();
let quartzList = [];
const requiredQuartzIds = new Set(savedInputState?.requiredQuartzIds ?? []);
const excludedQuartzIds = new Set(savedInputState?.excludedQuartzIds ?? []);
let activeWorker = null;
let activeJobId = 0;
let computeStartedAt = 0;
let elapsedTimerId = null;

const app = document.querySelector("#app");

function createDefaultSlotGrid() {
  return Array.from({ length: 4 }, () => Array(4).fill(SLOT_NORMAL));
}

function createDefaultRequirements() {
  return Array.from({ length: 4 }, () => Object.fromEntries(ELEMENTS.map((element) => [element, 0])));
}

function isValidSlotType(type) {
  return type === SLOT_NORMAL || type === SLOT_DISABLED || ELEMENTS.includes(type);
}

function normalizeStoredSlotGrid(value) {
  if (!Array.isArray(value)) {
    return createDefaultSlotGrid();
  }

  return Array.from({ length: 4 }, (_, lineIndex) => {
    const line = Array.isArray(value[lineIndex]) ? value[lineIndex] : [];
    return Array.from({ length: 4 }, (_, slotIndex) => {
      const type = line[slotIndex];
      return isValidSlotType(type) ? type : SLOT_NORMAL;
    });
  });
}

function normalizeStoredRequirements(value) {
  if (!Array.isArray(value)) {
    return createDefaultRequirements();
  }

  return Array.from({ length: 4 }, (_, lineIndex) => {
    const requirement = value[lineIndex] ?? {};
    return Object.fromEntries(
      ELEMENTS.map((element) => [element, Math.max(0, Number(requirement[element] ?? 0) || 0)]),
    );
  });
}

function normalizeStoredRequiredQuartzIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id >= 0);
}

function loadInputState() {
  try {
    const rawState = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!rawState) {
      return null;
    }

    const state = JSON.parse(rawState);
    if (state?.version !== STORAGE_VERSION) {
      return null;
    }

    return {
      slotGrid: normalizeStoredSlotGrid(state.slotGrid),
      requirements: normalizeStoredRequirements(state.requirements),
      requiredQuartzIds: normalizeStoredRequiredQuartzIds(state.requiredQuartzIds),
      excludedQuartzIds: normalizeStoredRequiredQuartzIds(state.excludedQuartzIds),
    };
  } catch {
    return null;
  }
}

function saveInputState() {
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        slotGrid: slotGrid.map((line) => [...line]),
        requirements: readRequirements(),
        requiredQuartzIds: [...requiredQuartzIds],
        excludedQuartzIds: [...excludedQuartzIds],
      }),
    );
  } catch {
    // Ignore storage errors so private browsing or full storage does not break solving.
  }
}

function clearInputState() {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors so reset remains usable.
  }
}

function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className) {
    element.className = options.className;
  }
  if (options.text) {
    element.textContent = options.text;
  }
  return element;
}

function slotLabel(type) {
  if (type === SLOT_NORMAL) {
    return "普";
  }
  if (type === SLOT_DISABLED) {
    return "禁";
  }
  return type;
}

function slotTitle(type) {
  if (type === SLOT_NORMAL) {
    return "Normal slot";
  }
  if (type === SLOT_DISABLED) {
    return "Disabled slot";
  }
  return `${type} element-specific slot`;
}

function appendFormattedValues(container, values, slotType) {
  const boosted = slotType !== SLOT_NORMAL && slotType !== SLOT_DISABLED;
  let hasPreviousValue = false;

  for (const element of ELEMENTS) {
    const value = values[element];
    if (value <= 0) {
      continue;
    }

    if (hasPreviousValue) {
      container.append(document.createTextNode("，"));
    }

    const valueToken = createElement("span", { className: boosted ? "quartz-value boosted" : "quartz-value" });
    valueToken.textContent = `${element}×${value}`;
    if (boosted) {
      valueToken.style.setProperty("--element-color", elementColors[element]);
    }
    container.append(valueToken);
    hasPreviousValue = true;
  }
}

function renderQuartzMeta(entry) {
  const meta = createElement("span", { className: "quartz-meta" });
  meta.append(createElement("span", { text: entry.quartz.element }));
  meta.append(document.createTextNode(" · "));
  appendFormattedValues(meta, entry.contribution, entry.slotType);
  return meta;
}

function nextSlotType(type) {
  const cycle = [SLOT_NORMAL, SLOT_DISABLED, ...ELEMENTS];
  const index = cycle.indexOf(type);
  return cycle[(index + 1) % cycle.length];
}

function readRequirements() {
  return Array.from(document.querySelectorAll("[data-line]")).map((lineElement) => {
    const requirement = {};
    for (const element of ELEMENTS) {
      const input = lineElement.querySelector(`[data-requirement="${element}"]`);
      requirement[element] = Math.max(0, Number(input.value || 0) || 0);
    }
    return requirement;
  });
}

function findQuartzById(quartzId) {
  return quartzList.find((item) => item.id === quartzId);
}

function conflictingQuartz() {
  for (const quartzId of requiredQuartzIds) {
    if (excludedQuartzIds.has(quartzId)) {
      return findQuartzById(quartzId) ?? { name: `#${quartzId}` };
    }
  }
  return null;
}

function alertInvalidQuartzConflict(quartz) {
  window.alert(`${quartz.name} cannot be in both Required Quartz and Excluded Quartz.`);
}

function validateQuartzSelections() {
  const conflict = conflictingQuartz();
  if (!conflict) {
    return true;
  }

  alertInvalidQuartzConflict(conflict);
  renderStatus("Quartz selection is invalid.", "error");
  return false;
}

function renderQuartzPicker({ containerId, titleText, selectId, selectedIds, conflictIds, emptyText }) {
  const container = document.querySelector(containerId);
  if (!container) {
    return;
  }

  container.replaceChildren();

  const title = createElement("h2", { text: titleText });
  const controls = createElement("div", { className: "required-controls" });

  const elementLabel = createElement("label", { className: "select-field" });
  elementLabel.append(createElement("span", { text: "Element" }));
  const elementSelect = document.createElement("select");
  elementSelect.id = `${selectId}-element`;
  elementSelect.append(new Option("全部", "all"));
  for (const element of ELEMENTS) {
    elementSelect.append(new Option(element, element));
  }
  elementLabel.append(elementSelect);

  const quartzLabel = createElement("label", { className: "select-field" });
  quartzLabel.append(createElement("span", { text: "Quartz" }));
  const quartzSelect = document.createElement("select");
  quartzSelect.id = `${selectId}-quartz`;
  quartzLabel.append(quartzSelect);

  function updateQuartzOptions() {
    const selectedElement = elementSelect.value;
    const options = quartzList.filter(
      (quartz) => !selectedIds.has(quartz.id) && (selectedElement === "all" || quartz.element === selectedElement),
    );

    quartzSelect.replaceChildren();
    const placeholder = new Option(options.length === 0 ? "No quartz available" : "Select quartz...", "");
    placeholder.disabled = true;
    placeholder.selected = true;
    quartzSelect.append(placeholder);
    for (const quartz of options) {
      quartzSelect.append(new Option(quartz.name, String(quartz.id)));
    }
    quartzSelect.disabled = options.length === 0;
  }

  elementSelect.addEventListener("change", updateQuartzOptions);
  quartzSelect.addEventListener("change", () => {
    if (quartzSelect.value === "") {
      return;
    }

    const quartzId = Number(quartzSelect.value);
    const quartz = findQuartzById(quartzId);
    if (conflictIds.has(quartzId)) {
      alertInvalidQuartzConflict(quartz ?? { name: `#${quartzId}` });
      quartzSelect.value = "";
      return;
    }

    selectedIds.add(quartzId);
    saveInputState();
    renderQuartzPickers();
  });
  updateQuartzOptions();

  controls.append(elementLabel, quartzLabel);
  container.append(title, controls);

  const selectedList = createElement("div", { className: "required-list" });
  if (selectedIds.size === 0) {
    selectedList.append(createElement("p", { className: "empty-required", text: emptyText }));
  } else {
    for (const quartzId of selectedIds) {
      const quartz = findQuartzById(quartzId);
      if (!quartz) {
        continue;
      }

      const chip = createElement("button", { className: "required-chip", text: `${quartz.name} ×` });
      chip.type = "button";
      chip.title = `Remove ${quartz.name}`;
      chip.addEventListener("click", () => {
        selectedIds.delete(quartz.id);
        saveInputState();
        renderQuartzPickers();
      });
      selectedList.append(chip);
    }
  }
  container.append(selectedList);
}

function renderQuartzPickers() {
  renderQuartzPicker({
    containerId: "#required-quartz",
    titleText: "Required Quartz",
    selectId: "required",
    selectedIds: requiredQuartzIds,
    conflictIds: excludedQuartzIds,
    emptyText: "No required quartz selected.",
  });
  renderQuartzPicker({
    containerId: "#excluded-quartz",
    titleText: "Excluded Quartz",
    selectId: "excluded",
    selectedIds: excludedQuartzIds,
    conflictIds: requiredQuartzIds,
    emptyText: "No excluded quartz selected.",
  });
}

function renderSlots(lineIndex, container) {
  container.replaceChildren();

  slotGrid[lineIndex].forEach((type, slotIndex) => {
    const button = createElement("button", { className: "slot-button", text: slotLabel(type) });
    button.type = "button";
    button.title = slotTitle(type);
    button.dataset.type = type;
    if (ELEMENTS.includes(type)) {
      button.style.setProperty("--slot-color", elementColors[type]);
    }
    button.addEventListener("click", () => {
      slotGrid[lineIndex][slotIndex] = nextSlotType(slotGrid[lineIndex][slotIndex]);
      renderSlots(lineIndex, container);
      saveInputState();
    });
    container.append(button);
  });
}

function renderLine(lineIndex) {
  const section = createElement("section", { className: "line-panel" });
  section.dataset.line = String(lineIndex);

  const header = createElement("div", { className: "line-header" });
  header.append(createElement("h2", { text: LINE_NAMES[lineIndex] }));

  const slots = createElement("div", { className: "slots" });
  renderSlots(lineIndex, slots);
  header.append(slots);
  section.append(header);

  const requirements = createElement("div", { className: "requirements" });
  for (const element of ELEMENTS) {
    const label = createElement("label", { className: "requirement-field" });
    label.style.setProperty("--element-color", elementColors[element]);
    label.append(createElement("span", { text: element }));

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "99";
    input.step = "1";
    input.inputMode = "numeric";
    input.dataset.requirement = element;
    input.placeholder = "0";
    const savedValue = savedRequirements[lineIndex]?.[element] ?? 0;
    if (savedValue > 0) {
      input.value = String(savedValue);
    }
    input.addEventListener("input", saveInputState);
    label.append(input);
    requirements.append(label);
  }
  section.append(requirements);

  return section;
}

function renderStatus(message, tone = "neutral") {
  const status = document.querySelector("#status");
  if (!status) {
    return;
  }

  status.replaceChildren(document.createTextNode(message));
  status.dataset.tone = tone;
  delete status.dataset.busy;
}

function renderBusyStatus(message) {
  const status = document.querySelector("#status");
  if (!status) {
    return;
  }

  status.dataset.tone = "neutral";
  status.dataset.busy = "true";

  let messageElement = status.querySelector(".status-message");
  if (!messageElement) {
    messageElement = createElement("span", { className: "status-message" });
    const progress = createElement("div", { className: "busy-progress" });
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", "Search in progress");
    status.replaceChildren(messageElement, progress);
  }

  messageElement.textContent = message;
}

function formatElapsedTime(milliseconds) {
  if (milliseconds < 1000) {
    return "0s";
  }

  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`;
}

function updateBusyStatus() {
  renderBusyStatus(`Computing... ${formatElapsedTime(performance.now() - computeStartedAt)} elapsed`);
}

function setComputing(isComputing) {
  const compute = document.querySelector("#compute-button");
  const cancel = document.querySelector("#cancel-button");
  const results = document.querySelector("#results");

  if (compute) {
    compute.disabled = isComputing;
  }

  if (cancel) {
    cancel.hidden = !isComputing;
    cancel.disabled = !isComputing;
  }

  for (const control of document.querySelectorAll("input, select, .slot-button, .required-chip")) {
    if (isComputing) {
      control.dataset.wasDisabled = control.disabled ? "true" : "false";
      control.disabled = true;
    } else {
      control.disabled = control.dataset.wasDisabled === "true";
      delete control.dataset.wasDisabled;
    }
  }

  if (results) {
    results.setAttribute("aria-busy", String(isComputing));
  }
}

function clearElapsedTimer() {
  if (elapsedTimerId !== null) {
    clearInterval(elapsedTimerId);
    elapsedTimerId = null;
  }
}

function beginBusyStatus() {
  computeStartedAt = performance.now();
  clearElapsedTimer();
  updateBusyStatus();
  elapsedTimerId = setInterval(updateBusyStatus, 500);
}

function finishActiveWorker(worker) {
  if (worker !== activeWorker) {
    return false;
  }

  worker.terminate();
  activeWorker = null;
  clearElapsedTimer();
  setComputing(false);
  return true;
}

function cancelActiveCompute(message = "Search canceled.") {
  if (!activeWorker) {
    return false;
  }

  activeJobId += 1;
  activeWorker.terminate();
  activeWorker = null;
  clearElapsedTimer();
  setComputing(false);
  renderStatus(message);
  return true;
}

function renderSolution(solution, index) {
  const article = createElement("article", { className: "solution" });
  article.append(createElement("h3", { text: `Result ${index + 1}` }));

  solution.lines.forEach((line, lineIndex) => {
    if (!line) {
      return;
    }

    const lineBlock = createElement("div", { className: "solution-line" });
    const title = createElement("div", { className: "solution-line-title" });
    title.append(createElement("strong", { text: LINE_NAMES[lineIndex] }));
    title.append(createElement("span", { text: formatValues(line.values) }));
    lineBlock.append(title);

    const quartzGrid = createElement("div", { className: "solution-quartz-grid" });
    line.assignment.forEach((entry, slotIndex) => {
      const item = createElement("div", { className: "solution-quartz" });
      if (!entry) {
        item.classList.add("empty");
        item.textContent = `Slot ${slotIndex + 1}: empty`;
      } else {
        item.append(createElement("span", { className: "quartz-name", text: `${slotIndex + 1}. ${entry.quartz.name}` }));
        item.append(renderQuartzMeta(entry));
      }
      quartzGrid.append(item);
    });

    lineBlock.append(quartzGrid);
    article.append(lineBlock);
  });

  return article;
}

function renderResults(result) {
  const output = document.querySelector("#results");
  output.replaceChildren();

  if (result.skipped) {
    output.append(createElement("p", { className: "empty-state", text: "Enter requirements or select required quartz to search." }));
    return;
  }

  if (result.solutions.length === 0) {
    output.append(createElement("p", { className: "empty-state", text: "Not found." }));
    return;
  }

  if (result.limited) {
    window.alert("More than 20 possible combinations were found. Search stopped and the first 20 results are shown.");
  }

  const summary = createElement("p", {
    className: "result-summary",
    text: `${result.solutions.length} result${result.solutions.length === 1 ? "" : "s"} shown.`,
  });
  output.append(summary, ...result.solutions.map(renderSolution));
}

function handleCompute() {
  if (quartzList.length === 0) {
    renderStatus("Quartz data is not loaded.", "error");
    return;
  }

  if (typeof Worker === "undefined") {
    renderStatus("This browser does not support Web Workers.", "error");
    return;
  }

  if (activeWorker) {
    return;
  }

  if (!validateQuartzSelections()) {
    return;
  }

  saveInputState();
  let worker;
  try {
    worker = new Worker(new URL("./src/search-worker.mjs", import.meta.url), { type: "module" });
  } catch (error) {
    renderStatus(`Search failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    return;
  }

  const jobId = activeJobId + 1;
  const payload = {
    quartzList,
    slotGrid: slotGrid.map((line) => [...line]),
    requirements: readRequirements(),
    options: {
      limit: 20,
      requiredQuartzIds: [...requiredQuartzIds],
      excludedQuartzIds: [...excludedQuartzIds],
    },
  };

  activeWorker = worker;
  activeJobId = jobId;
  setComputing(true);
  beginBusyStatus();

  worker.addEventListener("message", (event) => {
    const message = event.data;
    if (message?.jobId !== activeJobId || worker !== activeWorker) {
      return;
    }

    const elapsed = formatElapsedTime(performance.now() - computeStartedAt);
    if (message.type === "done") {
      finishActiveWorker(worker);
      renderStatus(`Search complete in ${elapsed}.`, "ok");
      renderResults(message.result);
      return;
    }

    if (message.type === "error") {
      finishActiveWorker(worker);
      renderStatus(`Search failed: ${message.message}`, "error");
    }
  });

  worker.addEventListener("error", (event) => {
    if (worker !== activeWorker) {
      return;
    }

    finishActiveWorker(worker);
    renderStatus(`Search failed: ${event.message || "worker error"}`, "error");
  });

  try {
    worker.postMessage({ type: "compute", jobId, payload });
  } catch (error) {
    finishActiveWorker(worker);
    renderStatus(`Search failed: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

function handleReset() {
  cancelActiveCompute("");

  for (const line of slotGrid) {
    line.fill(SLOT_NORMAL);
  }

  document.querySelectorAll(".slots").forEach((container, lineIndex) => renderSlots(lineIndex, container));
  document.querySelectorAll("input[data-requirement]").forEach((input) => {
    input.value = "";
  });
  requiredQuartzIds.clear();
  excludedQuartzIds.clear();
  renderQuartzPickers();
  document.querySelector("#results").replaceChildren(
    createElement("p", { className: "empty-state", text: "Enter requirements or select required quartz to search." }),
  );
  clearInputState();
  if (quartzList.length > 0) {
    renderStatus(`${quartzList.length} quartz loaded.`, "ok");
  }
}

function renderApp() {
  const shell = createElement("main", { className: "shell" });

  const header = createElement("header", { className: "page-header" });
  header.append(createElement("h1", { text: "Orbment Solver" }));
  const actions = createElement("div", { className: "actions" });

  const compute = createElement("button", { className: "primary-button", text: "Compute" });
  compute.type = "button";
  compute.id = "compute-button";
  compute.addEventListener("click", handleCompute);

  const cancel = createElement("button", { className: "secondary-button", text: "Cancel" });
  cancel.type = "button";
  cancel.id = "cancel-button";
  cancel.hidden = true;
  cancel.addEventListener("click", () => cancelActiveCompute());

  const reset = createElement("button", { className: "secondary-button", text: "Reset" });
  reset.type = "button";
  reset.addEventListener("click", handleReset);

  actions.append(compute, cancel, reset);
  header.append(actions);
  shell.append(header);

  const status = createElement("div", { className: "status", text: "Loading quartz.csv..." });
  status.id = "status";
  shell.append(status);

  const requiredQuartz = createElement("section", { className: "required-panel" });
  requiredQuartz.id = "required-quartz";
  shell.append(requiredQuartz);

  const excludedQuartz = createElement("section", { className: "required-panel" });
  excludedQuartz.id = "excluded-quartz";
  shell.append(excludedQuartz);

  const grid = createElement("div", { className: "line-grid" });
  for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
    grid.append(renderLine(lineIndex));
  }
  shell.append(grid);

  const results = createElement("section", { className: "results" });
  results.id = "results";
  results.append(createElement("p", { className: "empty-state", text: "Enter requirements or select required quartz to search." }));
  shell.append(results);

  app.replaceChildren(shell);
}

async function loadQuartz() {
  try {
    const response = await fetch("./quartz.csv", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    quartzList = parseQuartzCsv(await response.text());
    const knownQuartzIds = new Set(quartzList.map((quartz) => quartz.id));
    const previousRequiredCount = requiredQuartzIds.size;
    const previousExcludedCount = excludedQuartzIds.size;
    for (const quartzId of requiredQuartzIds) {
      if (!knownQuartzIds.has(quartzId)) {
        requiredQuartzIds.delete(quartzId);
      }
    }
    for (const quartzId of excludedQuartzIds) {
      if (!knownQuartzIds.has(quartzId)) {
        excludedQuartzIds.delete(quartzId);
      }
    }
    if (requiredQuartzIds.size !== previousRequiredCount || excludedQuartzIds.size !== previousExcludedCount) {
      saveInputState();
    }
    renderQuartzPickers();
    renderStatus(`${quartzList.length} quartz loaded.`, "ok");
  } catch (error) {
    renderStatus(`Failed to load quartz.csv: ${error.message}`, "error");
  }
}

renderApp();
loadQuartz();
