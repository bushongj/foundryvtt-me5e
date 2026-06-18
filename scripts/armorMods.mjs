import { getMe5eModFlags, getModSlot } from "./mods.mjs";

// Armor mod system. Unlike weapon mods (fixed named slots), armor mods use a
// per-area slot COUNT: each equipped armor piece offers a number of generic
// slots equal to the per-area limit, and a mod attaches only when its
// placement matches an area the piece covers.
//
//   head 3 · chest 3 · arms 2 · legs 2
//
// Body armor covers chest+arms+legs and offers all three areas' slots
// (3+2+2 = 7), each sub-area capped independently.
//
// Attachments are stored as `flags.me5e.armor.mods: [itemId, ...]` on the
// armor item; the mod item itself stays in the actor's inventory.

export const ARMOR_SLOT_LIMITS = { head: 3, chest: 3, arms: 2, legs: 2 };

// Read armor flags directly (avoids importing armor.mjs, which imports us).
function armorFlags(item) {
  return item?.flags?.me5e?.armor ?? null;
}

function getModMechanics(item) {
  const m = getMe5eModFlags(item)?.mechanics;
  return Array.isArray(m) ? m : [];
}

export function isArmorMod(item) {
  return getMe5eModFlags(item)?.kind === "armor";
}

export function getArmorPlacement(armor) {
  return armorFlags(armor)?.placement ?? null;
}

// Areas (and thus mod placements) a piece accepts. Body spans chest/arms/legs.
export function getArmorEligibleAreas(armor) {
  const placement = getArmorPlacement(armor);
  if (placement === "body") return ["chest", "arms", "legs"];
  return placement ? [placement] : [];
}

export function getArmorModAttachments(armor) {
  const stored = armorFlags(armor)?.mods;
  return Array.isArray(stored) ? stored : [];
}

// Resolve attached ids to mod items (drop dangling refs).
export function getAttachedArmorModItems(armor, actor) {
  const out = [];
  for (const id of getArmorModAttachments(armor)) {
    const item = actor.items.get(id);
    if (item) out.push(item);
  }
  return out;
}

// Count of attached mods per area (keyed by each mod's placement).
export function getAreaCounts(armor, actor) {
  const counts = {};
  for (const mod of getAttachedArmorModItems(armor, actor)) {
    const area = getModSlot(mod);
    if (area) counts[area] = (counts[area] ?? 0) + 1;
  }
  return counts;
}

// Armor mods not currently attached to any armor piece on the actor.
export function getUnattachedArmorMods(actor) {
  const attachedIds = new Set();
  for (const item of actor.items) {
    const mods = armorFlags(item)?.mods;
    if (!Array.isArray(mods)) continue;
    for (const id of mods) if (id) attachedIds.add(id);
  }
  return actor.items.filter(i => isArmorMod(i) && !attachedIds.has(i.id));
}

// Reason a mod can't be attached to this piece, or null if it can.
export function whyCannotAttachArmorMod(mod, armor, actor) {
  if (!isArmorMod(mod)) return "ME5E.Mods.NotAnArmorMod";
  const area = getModSlot(mod);
  if (!area || !getArmorEligibleAreas(armor).includes(area)) return "ME5E.Mods.WrongArea";
  const limit = ARMOR_SLOT_LIMITS[area] ?? 0;
  const used = getAreaCounts(armor, actor)[area] ?? 0;
  if (used >= limit) return "ME5E.Mods.AreaFull";
  return null;
}

export function canAttachArmorMod(mod, armor, actor) {
  return whyCannotAttachArmorMod(mod, armor, actor) === null;
}

export function getCompatibleArmorMods(actor, armor) {
  return getUnattachedArmorMods(actor).filter(m => canAttachArmorMod(m, armor, actor));
}

export async function attachArmorMod(armor, modId) {
  const current = getArmorModAttachments(armor);
  if (current.includes(modId)) return;
  await armor.update({ "flags.me5e.armor.mods": [...current, modId] });
}

export async function detachArmorMod(armor, modId) {
  const current = getArmorModAttachments(armor);
  if (!current.includes(modId)) return;
  await armor.update({ "flags.me5e.armor.mods": current.filter(id => id !== modId) });
}

// Flattened mechanics of every mod attached to this piece — consumed by
// armor.mjs so a mod's effects fold into the piece's own aggregation.
export function getAttachedArmorModMechanics(armor, actor) {
  const out = [];
  for (const mod of getAttachedArmorModItems(armor, actor)) {
    for (const m of getModMechanics(mod)) out.push(m);
  }
  return out;
}
