import { MODULE_ID, ME5E } from "./config.mjs";

// Tech Armor — a tech-power buff that sits above shields on the damage
// stack. Absorbs every damage type 1-for-1; depletes before shields & HP.
// Activation is player-driven: bump `value` up to `max` (or any number)
// when the power is used; drop to 0 to deactivate.

export function getTechArmor(actor) {
  return {
    value: actor.getFlag(MODULE_ID, "techArmor.value") ?? 0,
    max: actor.getFlag(MODULE_ID, "techArmor.max") ?? ME5E.techArmor.defaultMax
  };
}

export async function setTechArmor(actor, { value, max } = {}) {
  const updates = {};
  if (value !== undefined) updates[`flags.${MODULE_ID}.techArmor.value`] = Math.max(0, value);
  if (max !== undefined) updates[`flags.${MODULE_ID}.techArmor.max`] = Math.max(0, max);
  return actor.update(updates);
}
