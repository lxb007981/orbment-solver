export const ELEMENTS = ["地", "水", "风", "火", "时", "空", "幻"];

const ELEMENT_SET = new Set(ELEMENTS);

export function emptyValues() {
  return Object.fromEntries(ELEMENTS.map((element) => [element, 0]));
}

export function parseValues(text) {
  const values = emptyValues();
  const parts = String(text ?? "")
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const match = part.match(/^([地水风火时空幻])\s*[×xX*]\s*(\d+)$/u);
    if (!match) {
      throw new Error(`Invalid elemental value: ${part}`);
    }

    values[match[1]] += Number(match[2]);
  }

  return values;
}

export function parseQuartzCsv(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const columns = line.split("\t").map((column) => column.trim());
      if (columns.length !== 3) {
        throw new Error(`Invalid quartz row ${index + 1}: expected 3 tab-separated columns`);
      }

      const [name, element, valueText] = columns;
      if (!name) {
        throw new Error(`Invalid quartz row ${index + 1}: missing name`);
      }

      if (!ELEMENT_SET.has(element)) {
        throw new Error(`Invalid quartz row ${index + 1}: unknown element ${element}`);
      }

      return {
        id: index,
        name,
        element,
        values: parseValues(valueText),
      };
    });
}

export function formatValues(values) {
  return ELEMENTS.filter((element) => values[element] > 0)
    .map((element) => `${element}×${values[element]}`)
    .join("，") || "无";
}
