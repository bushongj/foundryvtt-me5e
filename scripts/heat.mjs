import { MODULE_ID } from "./config.mjs";
import { getModHeatCapacityBonus } from "./mods.mjs";
import { tracksThermalClips } from "./settings.mjs";

// ME5e heat is a COUNTDOWN of shots remaining, not an accumulating gauge.
// Canon (PHB "Heat" property): a weapon's Heat stat is the number of times it
// can be fired before it must be reloaded. Each attack uses one heat; at 0 the
// weapon must be reloaded (the Reload action expends a Thermal Clip and
// restores heat to its maximum). We store shots-remaining in `heat.value`,
// defaulting to full when unset.

const THERMAL_CLIP_ID = "thermal-clip";
const HEAVY_CHARGE_ID = "heavy-weapon-charge";

export function getWeaponType(item) {
  return item.getFlag(MODULE_ID, "weapon.type") ?? null;
}

// Heavy weapons reload with Heavy Weapon Charges; all other guns use Thermal
// Clips. Returns the consumable identifier + a label for messaging.
function reloadAmmo(item) {
  return getWeaponType(item) === "heavy"
    ? { id: HEAVY_CHARGE_ID, label: game.i18n.localize("ME5E.Heat.HeavyCharges") }
    : { id: THERMAL_CLIP_ID, label: game.i18n.localize("ME5E.Heat.ThermalClips") };
}

// Max heat = the weapon's own Heat stat (flags.me5e.weapon.heat) plus any
// heat-increase mod bonus. An explicit `heat.max` flag still wins (manual
// override / NPC bookkeeping).
export function getHeatMax(item) {
  const override = item.getFlag(MODULE_ID, "heat.max");
  if (override !== undefined && override !== null && Number.isFinite(Number(override))) {
    return Number(override);
  }
  const base = Number(item.getFlag(MODULE_ID, "weapon.heat") ?? 0);
  const modBonus = item.actor ? getModHeatCapacityBonus(item, item.actor, base) : 0;
  return base + modBonus;
}

export function getHeatState(item) {
  const max = getHeatMax(item);
  const stored = item.getFlag(MODULE_ID, "heat.value");
  // `value` is shots remaining; an unset flag means the weapon is full.
  const value = (stored === undefined || stored === null)
    ? max
    : Math.max(0, Math.min(Number(stored), max));
  return { value, max, empty: max > 0 && value <= 0, full: value >= max };
}

async function setHeatValue(item, value) {
  const max = getHeatMax(item);
  await item.setFlag(MODULE_ID, "heat.value", Math.max(0, Math.min(value, max)));
}

function findAmmo(actor, identifier) {
  if (!actor) return null;
  return actor.items.find(i =>
    i.system?.identifier === identifier && Number(i.system?.quantity ?? 0) > 0
  ) ?? null;
}

// Reload — restore heat to max. With clip tracking on, consume one unit of the
// weapon's reload ammo (Thermal Clip, or Heavy Weapon Charge for heavy
// weapons) first; abort (with a warning) if none remain.
export async function reloadWeapon(item) {
  const state = getHeatState(item);
  if (!(state.max > 0) || state.full) return;
  if (tracksThermalClips()) {
    const ammo = reloadAmmo(item);
    const stack = findAmmo(item.actor, ammo.id);
    if (!stack) {
      ui.notifications?.warn(game.i18n.format("ME5E.Heat.NoAmmo", { name: item.name, ammo: ammo.label }));
      return;
    }
    const qty = Number(stack.system?.quantity ?? 0);
    await stack.update({ "system.quantity": Math.max(0, qty - 1) });
  }
  await setHeatValue(item, state.max);
  ui.notifications?.info(game.i18n.format("ME5E.Heat.Reloaded", { name: item.name }));
}

// Spend `amount` heat (e.g. a Burst Fire shot costs more than one). Returns
// false without spending if the weapon tracks heat and lacks enough; weapons
// with no heat track always succeed. Used by alternate fire modes.
export async function spendHeat(item, amount) {
  const state = getHeatState(item);
  if (!(state.max > 0)) return true;
  if (state.value < amount) return false;
  await setHeatValue(item, state.value - amount);
  return true;
}

// Block firing when out of heat — this must run BEFORE the roll. Returning
// false from this sync pre-roll hook cancels the attack. It does NOT deduct
// heat; deduction happens post-roll so a cancelled dialog costs nothing.
//
// dnd5e v5 fires `dnd5e.preRollAttack` with (config, dialog, message); the
// weapon is config.subject.item (NOT the first arg, as in the v3 signature).
function onPreRollAttack(config) {
  const item = config?.subject?.item;
  if (!item || item.type !== "weapon" || !getWeaponType(item)) return;
  const state = getHeatState(item);
  if (!(state.max > 0)) return; // no heat track (e.g. melee)
  if (state.value <= 0) {
    ui.notifications?.warn(game.i18n.format("ME5E.Heat.Empty", { name: item.name }));
    return false;
  }
}

// Deduct one heat AFTER the attack has actually rolled. dnd5e fires
// `dnd5e.rollAttackV2` (rolls, { subject }) only once a roll exists — a
// cancelled roll dialog aborts earlier (`if (!rolls.length) return`) and never
// reaches here, so a misclick that's backed out never burns heat.
function onRollAttack(_rolls, data) {
  const item = data?.subject?.item;
  if (!item || item.type !== "weapon" || !getWeaponType(item)) return;
  const state = getHeatState(item);
  if (!(state.max > 0) || state.value <= 0) return;
  setHeatValue(item, state.value - 1); // fire-and-forget; hook is synchronous
}

export function registerHeat() {
  Hooks.on("dnd5e.preRollAttack", onPreRollAttack);
  Hooks.on("dnd5e.rollAttackV2", onRollAttack);
}
