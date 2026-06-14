import { ELEMENTS } from "./quartz.mjs";
import { LINE_NAMES, SLOT_DISABLED, SLOT_NORMAL } from "./search.mjs";

const SLOT_TOKEN_TYPES = new Map([
  ["普", SLOT_NORMAL],
  ["禁", SLOT_DISABLED],
  ...ELEMENTS.map((element) => [element, element]),
]);

export function parseSlotLine(text, context = "slot line") {
  const tokens = [...String(text ?? "")];
  if (tokens.length !== 4) {
    throw new Error(`Invalid ${context}: expected 4 slots`);
  }

  return tokens.map((token) => {
    const slotType = SLOT_TOKEN_TYPES.get(token);
    if (!slotType) {
      throw new Error(`Invalid ${context}: unknown slot token ${token}`);
    }
    return slotType;
  });
}

export function parseSlotProfilesJson(text, expectedGameId) {
  let data;
  try {
    data = JSON.parse(String(text ?? ""));
  } catch (error) {
    throw new Error(`Invalid slot profile JSON: ${error.message}`);
  }

  if (data?.game !== expectedGameId) {
    throw new Error(`Invalid slot profile game: expected ${expectedGameId}`);
  }

  if (!Array.isArray(data.characters)) {
    throw new Error("Invalid slot profile JSON: missing characters");
  }

  return data.characters.map((character, characterIndex) => {
    const id = String(character?.id ?? "");
    const name = String(character?.name ?? "").trim();
    if (!id) {
      throw new Error(`Invalid character profile ${characterIndex + 1}: missing id`);
    }
    if (!name) {
      throw new Error(`Invalid character profile ${id}: missing name`);
    }

    const slots = character?.slots;
    if (!slots || typeof slots !== "object") {
      throw new Error(`Invalid character profile ${name}: missing slots`);
    }

    const slotGrid = LINE_NAMES.map((lineName) => {
      if (typeof slots[lineName] !== "string") {
        throw new Error(`Invalid character profile ${name}: missing ${lineName} slots`);
      }
      return parseSlotLine(slots[lineName], `${name} ${lineName}`);
    });

    return { id, name, slotGrid };
  });
}
