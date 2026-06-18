// Weapon loadout helpers for the inventory-tab panel. Pure read helpers —
// no system mutation. Mirrors the shape of armor.mjs's display exports
// (getEquippedByPlacement / summarizeArmorBuffs).
//
// registerModProperties() (bottom) is the one stateful piece: it wraps the
// dnd5e weapon data model so attached mods' `adjust-weapon-props` mutate the
// live `system.properties` Set, making them affect real rolls.

import { MODULE_ID } from "./config.mjs";
import { getEffectiveMe5eProperties, getModPropertyAdjustments } from "./mods.mjs";

const TWO_HANDED_PROPS = new Set(["two-handed", "two_handed", "twoHanded"]);

export function getMe5eWeaponFlags(item) {
  return item?.flags?.me5e?.weapon ?? null;
}

// Effective long-form me5e properties: mod-adjusted when the weapon is
// actor-owned (mods live in the actor's inventory), raw flags otherwise.
function effectiveMe5eProps(item) {
  const actor = item?.actor;
  if (actor) return getEffectiveMe5eProperties(item, actor);
  const raw = getMe5eWeaponFlags(item)?.properties;
  return Array.isArray(raw) ? raw : [];
}

export function isTwoHanded(item) {
  const f = getMe5eWeaponFlags(item);
  if (!f) return false;
  // A mod that removes two-handed (e.g. Ultralight Materials II) overrides the
  // base `slots: 2` flag — otherwise the slots short-circuit would keep the
  // weapon two-handed even after the property is stripped from system.properties.
  const actor = item?.actor;
  if (actor) {
    const { removeLong } = getModPropertyAdjustments(item, actor);
    if ([...TWO_HANDED_PROPS].some(p => removeLong.has(p))) return false;
  }
  if (Number(f.slots) === 2) return true;
  return effectiveMe5eProps(item).some(p => TWO_HANDED_PROPS.has(p));
}

// Is the actor proficient with this weapon? Uses dnd5e's proficiencyMultiplier
// (0/1), which keys the weapon's type.value off CONFIG.DND5E.weaponProficienciesMap
// against the actor's traits.weaponProf — i.e. the ME5e types we register. Items
// off an actor only; non-weapons / unowned are treated as proficient.
export function isWeaponProficient(item) {
  if (!item || item.type !== "weapon" || !item.actor) return true;
  return Number(item.system?.proficiencyMultiplier ?? 1) >= 1;
}

export function getEquippedMe5eWeapons(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    if (item.type !== "weapon") continue;
    if (!item.system?.equipped) continue;
    if (!getMe5eWeaponFlags(item)) continue;
    out.push(item);
  }
  return out;
}

// Resolve equipped weapons into hand slots.
//   • A two-handed weapon claims both slots — `twoHanded` set, `mainHand`/`offHand` null.
//   • Otherwise the first equipped one-hander is main, the second is off-hand.
// dnd5e has no explicit main/off-hand flag, so order falls back to actor.items iteration.
export function getWeaponSlots(actor) {
  const weapons = getEquippedMe5eWeapons(actor);
  if (!weapons.length) return { mainHand: null, offHand: null, twoHanded: null };
  const twoH = weapons.find(isTwoHanded);
  if (twoH) return { mainHand: null, offHand: null, twoHanded: twoH };
  const [mainHand = null, offHand = null] = weapons;
  return { mainHand, offHand, twoHanded: null };
}

// "2d6 lightning", "1d8+2 piercing", "1d6 cold/fire". Empty string if the
// item has no parseable damage.base.
export function getWeaponDamageFormula(item) {
  const base = item?.system?.damage?.base;
  if (!base) return "";
  const n = Number(base.number);
  const d = Number(base.denomination);
  if (!Number.isFinite(n) || !Number.isFinite(d) || n <= 0 || d <= 0) return "";
  let formula = `${n}d${d}`;
  const bonusRaw = base.bonus;
  if (bonusRaw !== undefined && bonusRaw !== null && String(bonusRaw).trim() !== "") {
    const s = String(bonusRaw).trim();
    formula += /^[+\-]/.test(s) ? s : `+${s}`;
  }
  const types = Array.isArray(base.types) ? base.types.filter(Boolean) : [];
  if (types.length) formula += ` ${types.join("/")}`;
  return formula;
}

// Properties suitable for chip display. Drops "two-handed" — the wide slot
// already conveys that.
export function getDisplayProperties(item) {
  return effectiveMe5eProps(item).filter(p => !TWO_HANDED_PROPS.has(p));
}

// Enforce wield-slot limits. The loadout panel collapses the view once it
// sees a 2H weapon, but dnd5e's per-item `system.equipped` flag stays true on
// every other equipped weapon — leaving the inventory rows out of sync with
// the panel. This hook clears that ghost state.
//
// Triggers:
//   • a ME5e weapon is equipped (`system.equipped` → true), or
//   • a mod attach/detach/toggle changes an equipped weapon's two-handedness
//     (e.g. removing Ultralight Materials II reverts it to two-handed, which
//     must re-claim the off-hand slot even though `equipped` didn't change).
//
// Rules:
//   2H weapon  → unequip every other ME5e weapon (it claims both slots).
//   1H equipped → unequip any equipped 2H; if two 1H were already on, also
//                 unequip the first one (max 2 hands). Only on an actual equip
//                 — a mod that *frees* a hand never needs to unequip anything.
async function onUpdateItem(item, changes, options, userId) {
  if (game.userId !== userId) return;
  if (item.type !== "weapon") return;
  if (!getMe5eWeaponFlags(item)) return;
  const equippedNow = changes.system?.equipped === true;
  const modsChanged = foundry.utils.hasProperty(changes, "flags.me5e.weapon");
  if (!equippedNow && !modsChanged) return;
  if (!item.system?.equipped) return;
  const actor = item.actor;
  if (!actor) return;

  const others = [];
  for (const other of actor.items) {
    if (other.id === item.id) continue;
    if (other.type !== "weapon") continue;
    if (!other.system?.equipped) continue;
    if (!getMe5eWeaponFlags(other)) continue;
    others.push(other);
  }
  if (!others.length) return;

  let toUnequip;
  if (isTwoHanded(item)) {
    toUnequip = others;
  } else if (equippedNow) {
    const twoHs = others.filter(isTwoHanded);
    if (twoHs.length) toUnequip = twoHs;
    else if (others.length >= 2) toUnequip = [others[0]];
    else return;
  } else {
    return;
  }

  await actor.updateEmbeddedDocuments("Item", toUnequip.map(o => ({
    _id: o.id,
    "system.equipped": false
  })));
  ui.notifications?.info(game.i18n.format("ME5E.Weapon.LoadoutSwap", {
    name: item.name,
    others: toUnequip.map(o => o.name).join(", ")
  }));
}

export function registerWeapons() {
  Hooks.on("updateItem", onUpdateItem);
}

// Wrap the dnd5e weapon data model so attached mods' `adjust-weapon-props`
// mutate the live `system.properties` Set. Mirrors armor.mjs's prepareMovement
// wrap. We run BEFORE the original body so range.reach (computed there from
// `properties.has("rch")`) and the activity getters (attackModes /
// attackAbilities / isVersatile — all read `this.properties` live) see the
// adjusted set. Source resets from scratch each prep cycle, so the mutation
// is idempotent and reverts cleanly when a mod is detached.
let _propsWrapped = false;
export function registerModProperties() {
  if (_propsWrapped) return;
  const cls = globalThis.dnd5e?.dataModels?.item?.WeaponData;
  const original = cls?.prototype?.prepareDerivedData;
  if (!original) {
    console.warn("ME5e | WeaponData.prepareDerivedData not found; mod property adjustments disabled.");
    return;
  }
  cls.prototype.prepareDerivedData = function() {
    try {
      const item = this.parent;
      const actor = item?.actor;
      if (actor && item?.flags?.[MODULE_ID]?.weapon && this.properties instanceof Set) {
        const { addDnd, removeDnd } = getModPropertyAdjustments(item, actor);
        for (const p of removeDnd) this.properties.delete(p);
        for (const p of addDnd) this.properties.add(p);
      }
    } catch (err) {
      console.warn("ME5e | mod property adjustment failed:", err);
    }
    return original.call(this);
  };
  _propsWrapped = true;
}

// ME5e Recoil rule: "you may apply your Strength modifier to your attack and
// damage roll when attacking with Recoil weapons." dnd5e's availableAbilities
// only offers both STR and DEX for finesse/natural, so wrap it to also offer
// both when the weapon has the (effective) recoil property — the attack/damage
// then use whichever is larger, matching "may use Strength."
let _recoilWrapped = false;
export function patchRecoilAbility() {
  if (_recoilWrapped) return;
  const proto = globalThis.dnd5e?.dataModels?.item?.WeaponData?.prototype;
  const desc = proto && Object.getOwnPropertyDescriptor(proto, "availableAbilities");
  if (!desc?.get) {
    console.warn("ME5e | WeaponData.availableAbilities getter not found; recoil ability rule disabled.");
    return;
  }
  const original = desc.get;
  Object.defineProperty(proto, "availableAbilities", {
    configurable: true,
    get() {
      try {
        const item = this.parent;
        if (getEffectiveMe5eProperties(item, item?.actor).includes("recoil")) {
          const melee = CONFIG.DND5E.defaultAbilities.meleeAttack;
          const ranged = CONFIG.DND5E.defaultAbilities.rangedAttack;
          return new Set([melee, ranged]);
        }
      } catch (err) {
        console.warn("ME5e | recoil ability check failed:", err);
      }
      return original.call(this);
    }
  });
  _recoilWrapped = true;
}
