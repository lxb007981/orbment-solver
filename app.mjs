import { ELEMENTS, formatValues, parseQuartzCsv } from "./src/quartz.mjs";
import { LINE_NAMES, SLOT_DISABLED, SLOT_NORMAL, searchSolutions } from "./src/search.mjs";

const elementColors = {
  地: "#8f6835",
  水: "#1976a8",
  风: "#23875d",
  火: "#b83b30",
  时: "#59616f",
  空: "#ba8a17",
  幻: "#7b5bbd",
};

const slotGrid = Array.from({ length: 4 }, () => Array(4).fill(SLOT_NORMAL));
let quartzList = [];
const requiredQuartzIds = new Set();

const app = document.querySelector("#app");

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

function renderRequiredQuartzPicker() {
  const container = document.querySelector("#required-quartz");
  if (!container) {
    return;
  }

  container.replaceChildren();

  const title = createElement("h2", { text: "Required Quartz" });
  const controls = createElement("div", { className: "required-controls" });

  const elementLabel = createElement("label", { className: "select-field" });
  elementLabel.append(createElement("span", { text: "Element" }));
  const elementSelect = document.createElement("select");
  elementSelect.id = "required-element";
  elementSelect.append(new Option("全部", "all"));
  for (const element of ELEMENTS) {
    elementSelect.append(new Option(element, element));
  }
  elementLabel.append(elementSelect);

  const quartzLabel = createElement("label", { className: "select-field" });
  quartzLabel.append(createElement("span", { text: "Quartz" }));
  const quartzSelect = document.createElement("select");
  quartzSelect.id = "required-quartz-select";
  quartzLabel.append(quartzSelect);

  function updateQuartzOptions() {
    const selectedElement = elementSelect.value;
    const options = quartzList.filter(
      (quartz) => !requiredQuartzIds.has(quartz.id) && (selectedElement === "all" || quartz.element === selectedElement),
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

    requiredQuartzIds.add(Number(quartzSelect.value));
    renderRequiredQuartzPicker();
  });
  updateQuartzOptions();

  controls.append(elementLabel, quartzLabel);
  container.append(title, controls);

  const selectedList = createElement("div", { className: "required-list" });
  if (requiredQuartzIds.size === 0) {
    selectedList.append(createElement("p", { className: "empty-required", text: "No required quartz selected." }));
  } else {
    for (const quartzId of requiredQuartzIds) {
      const quartz = quartzList.find((item) => item.id === quartzId);
      if (!quartz) {
        continue;
      }

      const chip = createElement("button", { className: "required-chip", text: `${quartz.name} ×` });
      chip.type = "button";
      chip.title = `Remove ${quartz.name}`;
      chip.addEventListener("click", () => {
        requiredQuartzIds.delete(quartz.id);
        renderRequiredQuartzPicker();
      });
      selectedList.append(chip);
    }
  }
  container.append(selectedList);
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
    label.append(input);
    requirements.append(label);
  }
  section.append(requirements);

  return section;
}

function renderStatus(message, tone = "neutral") {
  const status = document.querySelector("#status");
  status.textContent = message;
  status.dataset.tone = tone;
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
        const lock = entry.slotType === SLOT_NORMAL ? "" : ` / ${entry.slotType}×2`;
        item.append(createElement("span", { className: "quartz-name", text: `${slotIndex + 1}. ${entry.quartz.name}` }));
        item.append(createElement("span", { className: "quartz-meta", text: `${entry.quartz.element}${lock} · ${formatValues(entry.contribution)}` }));
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

  const result = searchSolutions(quartzList, slotGrid, readRequirements(), {
    limit: 20,
    requiredQuartzIds: [...requiredQuartzIds],
  });
  renderResults(result);
}

function handleReset() {
  for (const line of slotGrid) {
    line.fill(SLOT_NORMAL);
  }

  document.querySelectorAll(".slots").forEach((container, lineIndex) => renderSlots(lineIndex, container));
  document.querySelectorAll("input[data-requirement]").forEach((input) => {
    input.value = "";
  });
  requiredQuartzIds.clear();
  renderRequiredQuartzPicker();
  document.querySelector("#results").replaceChildren(
    createElement("p", { className: "empty-state", text: "Enter requirements or select required quartz to search." }),
  );
}

function renderApp() {
  const shell = createElement("main", { className: "shell" });

  const header = createElement("header", { className: "page-header" });
  header.append(createElement("h1", { text: "Orbment Solver" }));
  const actions = createElement("div", { className: "actions" });

  const compute = createElement("button", { className: "primary-button", text: "Compute" });
  compute.type = "button";
  compute.addEventListener("click", handleCompute);

  const reset = createElement("button", { className: "secondary-button", text: "Reset" });
  reset.type = "button";
  reset.addEventListener("click", handleReset);

  actions.append(compute, reset);
  header.append(actions);
  shell.append(header);

  const status = createElement("div", { className: "status", text: "Loading quartz.csv..." });
  status.id = "status";
  shell.append(status);

  const requiredQuartz = createElement("section", { className: "required-panel" });
  requiredQuartz.id = "required-quartz";
  shell.append(requiredQuartz);

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
    renderRequiredQuartzPicker();
    renderStatus(`${quartzList.length} quartz loaded.`, "ok");
  } catch (error) {
    renderStatus(`Failed to load quartz.csv: ${error.message}`, "error");
  }
}

renderApp();
loadQuartz();
