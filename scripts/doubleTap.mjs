import { getEffectiveMe5eProperties } from "./mods.mjs";

// Double Tap property: "When you make a ranged attack with this weapon, you can
// use your bonus action to make a second ranged attack. You do not add your
// ability modifier to the damage of the bonus attack, unless that modifier is
// negative."
//
// The button fires a normal second attack (item.use → attack roll, heat, mods)
// and flags it; the next damage roll for that weapon cancels the ability
// modifier (when positive) via dnd5e.preRollDamageV2, matching the rule.

let pendingItemId = null;

export function isDoubleTapWeapon(weapon, actor) {
  if (!weapon || weapon.type !== "weapon") return false;
  return getEffectiveMe5eProperties(weapon, actor).includes("double-tap");
}

export async function doubleTapFire(weapon, actor, event) {
  if (!isDoubleTapWeapon(weapon, actor)) return;
  pendingItemId = weapon.id;
  await weapon.use({ event });
  // Consumed by the damage hook; not cleared here because damage is rolled
  // from the chat card after this resolves.
}

// Strip the ability modifier from the bonus attack's damage (unless negative).
// dnd5e adds `@mod` (= abilities[activity.ability].mod) to weapon damage, so we
// push a canceling term onto the first roll's parts.
function onPreRollDamage(config) {
  if (!pendingItemId) return;
  const activity = config?.subject;
  const item = activity?.item;
  if (!item || item.id !== pendingItemId) return;
  pendingItemId = null; // one-shot

  const ability = activity.ability;
  const mod = Number(item.actor?.system?.abilities?.[ability]?.mod ?? 0);
  if (mod <= 0) return; // a negative modifier still applies, per the rule

  const first = Array.isArray(config.rolls) ? config.rolls[0] : null;
  if (first && Array.isArray(first.parts)) first.parts.push(String(-mod));
}

export function registerDoubleTap() {
  Hooks.on("dnd5e.preRollDamageV2", onPreRollDamage);
}
