import { getMe5eWeaponFlags } from "./weapons.mjs";

// Weapon mod system. Each weapon has up to 4 ranged slots (magazine, body,
// ammo, barrel) or 2 melee slots (grip, strike). Mods come from the mods
// pack — items with `flags.me5e.mod.kind === "weapon"`. The mod's
// `placement` is the slot it occupies; `availability` is the list of
// weapon types it's compatible with (using source-style names like
// `assault_rifle`).
//
// Attachment is stored as `flags.me5e.weapon.mods.{slot}: itemId` on the
// weapon. The mod item itself stays in the actor's inventory.

export const RANGED_SLOTS = ["magazine", "body", "ammo", "barrel"];
export const MELEE_SLOTS  = ["grip", "strike"];

// Source `availability` uses these long-form keys; the weapon's
// `flags.me5e.weapon.type` uses short keys. Translate one → other so
// availability lists match runtime weapon types.
const WEAPON_TYPE_TO_AVAILABILITY = {
  rifle:   "assault_rifle",
  pistol:  "heavy_pistol",
  smg:     "smg",
  shotgun: "shotgun",
  sniper:  "sniper_rifle",
  heavy:   "heavy_weapon",
  melee:   "melee"
};

export function getMe5eModFlags(item) {
  return item?.flags?.me5e?.mod ?? null;
}

export function isWeaponMod(item) {
  return getMe5eModFlags(item)?.kind === "weapon";
}

export function getModSlot(item) {
  return getMe5eModFlags(item)?.placement ?? null;
}

export function getModAvailability(item) {
  const a = getMe5eModFlags(item)?.availability;
  return Array.isArray(a) ? a : [];
}

function getModMechanics(item) {
  const m = getMe5eModFlags(item)?.mechanics;
  return Array.isArray(m) ? m : [];
}

// A mod is toggleable if any of its mechanics declares `toggle: true`
// (ammo types like cryo/incendiary/warp). Non-toggle mods are always active.
export function isToggleableMod(item) {
  return getModMechanics(item).some(m => m?.toggle === true);
}

export function hasSpecialProperty(weapon) {
  const f = getMe5eWeaponFlags(weapon);
  const props = Array.isArray(f?.properties) ? f.properties : [];
  return props.includes("special");
}

export function isMeleeWeapon(weapon) {
  return getMe5eWeaponFlags(weapon)?.type === "melee";
}

export function getSlotsForWeapon(weapon) {
  // Shields can't be modded — no slots at all.
  if (getMe5eWeaponFlags(weapon)?.type === "shield") return [];
  return isMeleeWeapon(weapon) ? MELEE_SLOTS : RANGED_SLOTS;
}

// Returns { slot: itemRef, ... } — itemRef is the attached mod item id or null.
export function getModAttachments(weapon) {
  const stored = getMe5eWeaponFlags(weapon)?.mods ?? {};
  const out = {};
  for (const slot of getSlotsForWeapon(weapon)) {
    out[slot] = stored[slot] ?? null;
  }
  return out;
}

// Resolve attachments to actual mod items (filter dangling refs).
export function getAttachedModItems(weapon, actor) {
  const out = {};
  for (const [slot, id] of Object.entries(getModAttachments(weapon))) {
    out[slot] = id ? actor.items.get(id) ?? null : null;
  }
  return out;
}

// Per-slot active flag. Defaults to true so non-toggle mods (and any mod
// attached before this flag existed) are always live.
export function isModActive(weapon, slot) {
  const stored = getMe5eWeaponFlags(weapon)?.modActive ?? {};
  return stored[slot] !== false;
}

export async function setModActive(weapon, slot, active) {
  await weapon.update({ [`flags.me5e.weapon.modActive.${slot}`]: !!active });
}

// Like getAttachedModItems but drops mods toggled inactive — the basis for
// every roll-time effect collector, so an inactive mod contributes nothing.
export function activeAttachedModItems(weapon, actor) {
  const out = {};
  for (const [slot, mod] of Object.entries(getAttachedModItems(weapon, actor))) {
    out[slot] = mod && isModActive(weapon, slot) ? mod : null;
  }
  return out;
}

// Mod items in the actor's inventory that aren't currently attached to any
// weapon — eligible candidates for new attachments. (Detaching from one
// weapon and attaching elsewhere is a two-step user action by design.)
export function getUnattachedMods(actor) {
  const attachedIds = new Set();
  for (const item of actor.items) {
    if (item.type !== "weapon") continue;
    const mods = getMe5eWeaponFlags(item)?.mods;
    if (!mods) continue;
    for (const id of Object.values(mods)) if (id) attachedIds.add(id);
  }
  return actor.items.filter(i => isWeaponMod(i) && !attachedIds.has(i.id));
}

// Reason a mod can't be attached, or null if it can.
export function whyCannotAttach(mod, weapon, slot) {
  if (!isWeaponMod(mod)) return "ME5E.Mods.NotAWeaponMod";
  if (hasSpecialProperty(weapon)) return "ME5E.Mods.SpecialWeapon";
  if (getModSlot(mod) !== slot) return "ME5E.Mods.WrongSlot";
  const weaponType = getMe5eWeaponFlags(weapon)?.type;
  const availabilityKey = WEAPON_TYPE_TO_AVAILABILITY[weaponType];
  const allowed = getModAvailability(mod);
  if (availabilityKey && allowed.length && !allowed.includes(availabilityKey)) {
    return "ME5E.Mods.IncompatibleType";
  }
  return null;
}

export function canAttach(mod, weapon, slot) {
  return whyCannotAttach(mod, weapon, slot) === null;
}

export function getCompatibleMods(actor, weapon, slot) {
  return getUnattachedMods(actor).filter(m => canAttach(m, weapon, slot));
}

// Attach a mod to a slot, replacing whatever was there. Returns the
// previous mod id (or null), useful for caller notifications.
export async function attachMod(weapon, slot, modId) {
  const current = getModAttachments(weapon);
  const previousId = current[slot] ?? null;
  const next = { ...current, [slot]: modId };
  await weapon.update({ "flags.me5e.weapon.mods": next });
  return previousId;
}

export async function detachMod(weapon, slot) {
  const current = getModAttachments(weapon);
  const previousId = current[slot] ?? null;
  if (!previousId) return null;
  await weapon.update({ [`flags.me5e.weapon.mods.${slot}`]: null });
  return previousId;
}

// Sum of `attack-augment` damage bonuses from currently attached mods.
// Used for tile damage-formula display; doesn't affect actual rolls (yet).
export function getAttackAugmentDamageBonus(weapon, actor) {
  let total = 0;
  for (const mod of Object.values(activeAttachedModItems(weapon, actor))) {
    if (!mod) continue;
    for (const m of getModMechanics(mod)) {
      if (m?.type !== "attack-augment") continue;
      const types = Array.isArray(m.augmentTypes) ? m.augmentTypes : [];
      if (!types.includes("damage")) continue;
      const v = Number(m.bonus?.value);
      if (Number.isFinite(v)) total += v;
    }
  }
  return total;
}

// Sum of `attack-augment` to-hit bonuses (augmentTypes includes "hit") from
// currently attached active mods. Bonuses may be negative.
export function getAttackAugmentToHitBonus(weapon, actor) {
  let total = 0;
  for (const mod of Object.values(activeAttachedModItems(weapon, actor))) {
    if (!mod) continue;
    for (const m of getModMechanics(mod)) {
      if (m?.type !== "attack-augment") continue;
      const types = Array.isArray(m.augmentTypes) ? m.augmentTypes : [];
      if (!types.includes("hit")) continue;
      const v = Number(m.bonus?.value);
      if (Number.isFinite(v)) total += v;
    }
  }
  return total;
}

// Sum of `weapon-heat-increase` capacity bonuses from active mods. Two
// forms: a flat `value`, or a `multiplier` of the weapon's base heat
// capacity (e.g. heat-sink = +2× base). Multiplier results round down.
// `baseCap` is the weapon's unmodded capacity, supplied by the caller.
export function getModHeatCapacityBonus(weapon, actor, baseCap = 0) {
  let total = 0;
  for (const mod of Object.values(activeAttachedModItems(weapon, actor))) {
    if (!mod) continue;
    for (const m of getModMechanics(mod)) {
      if (m?.type !== "weapon-heat-increase") continue;
      const flat = Number(m.value);
      if (Number.isFinite(flat)) total += flat;
      const mult = Number(m.multiplier);
      if (Number.isFinite(mult)) total += Math.floor(mult * baseCap);
    }
  }
  return total;
}

// If an ammo-slot mod with `weapon-augment` mechanic specifies a damage
// type, return it; otherwise null. Used for tile damage-type display.
export function getAmmoDamageTypeOverride(weapon, actor) {
  const ammo = activeAttachedModItems(weapon, actor)?.ammo;
  if (!ammo) return null;
  for (const m of getModMechanics(ammo)) {
    if (m?.type === "weapon-augment" && m.damageType) return String(m.damageType);
  }
  return null;
}

// Source kebab-case weapon property → dnd5e itemProperties abbreviation.
// Mirrors me5e-build's DND5E_PROPERTY_KEY. ME5e-only properties (arc,
// burst-fire, double-tap, hip-fire, vented, ...) have no abbreviation and
// pass through unchanged — they're registered with dnd5e at setup.
const DND5E_PROP_KEY = {
  "finesse":    "fin",
  "heavy":      "hvy",
  "light":      "lgt",
  "reach":      "rch",
  "special":    "spc",
  "thrown":     "thr",
  "two-handed": "two",
  "versatile":  "ver"
};

function toDndProp(p) {
  return DND5E_PROP_KEY[p] ?? p;
}

// Merge every active mod's `adjust-weapon-props` add/remove lists. Returns
// both the long-form sets (for me5e display + wield rules) and the
// dnd5e-keyed sets (for live system.properties injection). Remove wins over
// add on conflict.
export function getModPropertyAdjustments(weapon, actor) {
  const addLong = new Set();
  const removeLong = new Set();
  const basePropsArr = getMe5eWeaponFlags(weapon)?.properties;
  const baseProps = new Set(Array.isArray(basePropsArr) ? basePropsArr : []);
  for (const mod of Object.values(activeAttachedModItems(weapon, actor))) {
    if (!mod) continue;
    for (const m of getModMechanics(mod)) {
      if (m?.type !== "adjust-weapon-props") continue;
      for (const p of (Array.isArray(m.add) ? m.add : [])) addLong.add(p);
      for (const p of (Array.isArray(m.remove) ? m.remove : [])) removeLong.add(p);
      // Conditional entries depend on the weapon's *base* properties — e.g.
      // weight-reduction mods: "remove Heavy if present, else add Light".
      for (const c of (Array.isArray(m.conditional) ? m.conditional : [])) {
        if (c?.ifHas !== undefined && !baseProps.has(c.ifHas)) continue;
        if (c?.ifLacks !== undefined && baseProps.has(c.ifLacks)) continue;
        if (c?.add) addLong.add(c.add);
        if (c?.remove) removeLong.add(c.remove);
      }
    }
  }
  for (const p of removeLong) addLong.delete(p);
  return {
    addLong,
    removeLong,
    addDnd: new Set([...addLong].map(toDndProp)),
    removeDnd: new Set([...removeLong].map(toDndProp))
  };
}

// True if the actor has an equipped me5e weapon carrying an active,
// attached mod that grants advantage on initiative (combat-sensor). The
// granting weapon must be equipped for the effect to apply.
export function hasInitiativeAdvantageMod(actor) {
  for (const weapon of actor?.items ?? []) {
    if (weapon.type !== "weapon" || !weapon.system?.equipped) continue;
    if (!getMe5eWeaponFlags(weapon)) continue;
    for (const mod of Object.values(activeAttachedModItems(weapon, actor))) {
      if (!mod) continue;
      for (const m of getModMechanics(mod)) {
        if (m?.type === "initiative" && m.effect?.type === "advantage") return true;
      }
    }
  }
  return false;
}

// Effective me5e (long-form) weapon properties after applying attached mods'
// adjustments — used for display chips and wield-slot rules.
export function getEffectiveMe5eProperties(weapon, actor) {
  const base = getMe5eWeaponFlags(weapon)?.properties;
  const out = new Set(Array.isArray(base) ? base : []);
  const { addLong, removeLong } = getModPropertyAdjustments(weapon, actor);
  for (const p of removeLong) out.delete(p);
  for (const p of addLong) out.add(p);
  return [...out];
}
