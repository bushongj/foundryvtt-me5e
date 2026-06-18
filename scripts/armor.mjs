import { MODULE_ID, ME5E } from "./config.mjs";
import { getAttachedArmorModMechanics } from "./armorMods.mjs";

// ME5e armor rules differ from dnd5e: base AC 10 + per-placement bonuses
// (chest/arms/legs/head with light/medium/heavy variants), a global Dex cap
// derived from loadout composition, and Str minimums on heavier loadouts.
// We replace dnd5e's prepareArmorClass when ME5e armor is equipped.

const PLACEMENT_BODY_COVERS = new Set(["chest", "arms", "legs"]);
const SPEED_PENALTY_FEET = 10;  // dnd5e units
const SPEED_PENALTY_METERS = 4;

// Pieces a body-armor item conflicts with at equip time.
function placementsConflictWith(placement) {
  if (placement === "body") return new Set(["chest", "arms", "legs", "body"]);
  if (PLACEMENT_BODY_COVERS.has(placement)) return new Set([placement, "body"]);
  return new Set([placement]);
}

export function getMe5eArmorFlags(item) {
  return item?.flags?.me5e?.armor ?? null;
}

export function getEquippedMe5eArmor(actor) {
  const out = [];
  for (const item of actor?.items ?? []) {
    if (!item.system?.equipped) continue;
    const f = getMe5eArmorFlags(item);
    if (f?.placement) out.push(item);
  }
  return out;
}

// Returns { head, chest, arms, legs, body } — each is the equipped item in
// that placement, or null. When `body` is set the chest/arms/legs entries
// will also be null (placement enforcement prevents the conflict).
export function getEquippedByPlacement(actor) {
  const out = { head: null, chest: null, arms: null, legs: null, body: null };
  for (const item of getEquippedMe5eArmor(actor)) {
    const placement = getMe5eArmorFlags(item)?.placement;
    if (placement in out) out[placement] = item;
  }
  return out;
}

// Body armor counts as 3 pieces of its type (chest+arms+legs). Head counts
// as 1 piece — the limitations table refers to "pieces" without excluding
// head, so we include it.
function countByType(pieces) {
  const counts = { light: 0, medium: 0, heavy: 0 };
  for (const item of pieces) {
    const f = getMe5eArmorFlags(item);
    const t = f?.type;
    if (!(t in counts)) continue;
    counts[t] += (f.placement === "body" ? 3 : 1);
  }
  return counts;
}

// Map loadout composition to the {dexCap, strReq, stealthDisadvantage}
// row from the Armor Bonuses and Limitations table. Speed penalty applies
// whenever a Str minimum is listed and the wearer doesn't meet it.
function resolveLimitations(counts) {
  const { light: L, medium: M, heavy: H } = counts;
  if (H >= 3) return { dexCap: 0,        strReq: 16, stealthDisadvantage: true  };
  if (H === 2) return { dexCap: 0,        strReq: 15, stealthDisadvantage: true  };
  if (H === 1) return { dexCap: 0,        strReq: 13, stealthDisadvantage: true  };
  if (M >= 3) return { dexCap: 2,        strReq: 13, stealthDisadvantage: true  };
  if (M === 2) return { dexCap: 2,        strReq: 12, stealthDisadvantage: false };
  if (M === 1) return { dexCap: 2,        strReq: 0,  stealthDisadvantage: false };
  return        { dexCap: Infinity, strReq: 0,  stealthDisadvantage: false };
}

// Count equipped pieces whose type the actor lacks proficiency in. Used
// for the sheet warning at 2+ (disadvantage rule) and 4+ (no powers rule).
// Body counts as 1 here — the rule is about *pieces worn*, not loadout
// weight; counts-by-type treatment for AC limits is separate.
//
// dnd5e stores armor proficiencies as abbreviations (lgt/med/hvy) but our
// armor flags carry the full type word (light/medium/heavy). Map via
// CONFIG.DND5E.armorProficienciesMap before checking.
// Is the actor proficient with this single armor piece? Unknown/natural types
// and non-ME5e items are treated as proficient (don't penalize).
export function isArmorProficient(item, actor) {
  const type = getMe5eArmorFlags(item)?.type;
  if (!type) return true;
  const map = CONFIG?.DND5E?.armorProficienciesMap ?? {
    light: "lgt", medium: "med", heavy: "hvy"
  };
  const profKey = map[type];
  if (profKey === true || !profKey) return true;  // natural/clothing or unknown
  const profs = actor?.system?.traits?.armorProf?.value;
  return profs ? profs.has(profKey) : false;
}

export function countUnproficientPieces(actor) {
  if (!actor?.system?.traits?.armorProf?.value) return 0;
  let count = 0;
  for (const item of getEquippedMe5eArmor(actor)) {
    if (!isArmorProficient(item, actor)) count += 1;
  }
  return count;
}

// Sum of flat-AC mechanics in a piece's raw mechanics — `{type: "ac",
// bonus: {type: "flat", value: N}}`. Stacks on top of the per-placement
// table bonus already stored in `flags.me5e.armor.acBonus`. A handful of
// source entries have a typo `bonus.type: 1`, so we accept any numeric
// `bonus.value` regardless of `bonus.type`.
function flatAcBonusFromMechanics(item) {
  const raw = getMe5eArmorFlags(item)?.raw;
  if (!Array.isArray(raw)) return 0;
  let sum = 0;
  for (const m of raw) {
    if (m?.type !== "ac") continue;
    const v = Number(m?.bonus?.value);
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

// Active armor set bonuses: group equipped pieces by set id, count them (capped
// at the set's max), and return one entry per bonus threshold the count meets.
// Set definitions ride on each member piece's flags (flags.me5e.armor.set* —
// baked by the build from set-bonuses.json).
export function getActiveSetBonuses(actor) {
  const pieces = getEquippedMe5eArmor(actor);
  if (!pieces.length) return [];
  const bySet = new Map();
  for (const item of pieces) {
    const a = getMe5eArmorFlags(item);
    const id = a?.set;
    if (!id || !Array.isArray(a.setBonuses) || !a.setBonuses.length) continue;
    const e = bySet.get(id) ?? { count: 0, max: a.setMax ?? null, label: a.setLabel ?? id, bonuses: a.setBonuses };
    e.count += 1;
    bySet.set(id, e);
  }
  const out = [];
  for (const [id, e] of bySet) {
    const count = e.max ? Math.min(e.count, e.max) : e.count;
    for (const b of e.bonuses) {
      if (count >= Number(b.threshold)) {
        out.push({ setId: id, label: e.label, count, max: e.max, threshold: b.threshold, text: b.text, mechanics: b.mechanics ?? [] });
      }
    }
  }
  return out;
}

// Flat list of mechanics from every active set-bonus threshold.
export function getActiveSetBonusMechanics(actor) {
  return getActiveSetBonuses(actor).flatMap(b => b.mechanics ?? []);
}

export function computeArmorState(actor) {
  const pieces = getEquippedMe5eArmor(actor);
  if (!pieces.length) return null;
  const counts = countByType(pieces);
  const limits = resolveLimitations(counts);
  let acBonus = 0;
  let flatAcBonus = 0;
  let shieldsMax = 0;
  let shieldsRegen = 0;
  for (const item of pieces) {
    const f = getMe5eArmorFlags(item);
    acBonus += Number(f.acBonus ?? 0);
    flatAcBonus += flatAcBonusFromMechanics(item);
    // Sum shields capacity + regen across every equipped piece. Per the
    // canonical manual, helmets/arms/legs add to the pool and some pieces
    // (e.g. Cerberus Assault Helmet) carry regen alone with no capacity.
    if (f.shields?.capacity?.value) shieldsMax += Number(f.shields.capacity.value);
    if (f.shields?.regen?.value) shieldsRegen += Number(f.shields.regen.value);
    // Attached armor mods contribute their own ac / shields mechanics.
    for (const m of getAttachedArmorModMechanics(item, actor)) {
      if (m?.type === "ac") {
        const v = Number(m?.bonus?.value);
        if (Number.isFinite(v)) flatAcBonus += v;
      } else if (m?.type === "shields") {
        if (m.capacity?.value) shieldsMax += Number(m.capacity.value);
        if (m.regen?.value) shieldsRegen += Number(m.regen.value);
      }
    }
  }
  // Active set bonuses contribute flat AC + shields (capacity/regen) numerically.
  for (const m of getActiveSetBonusMechanics(actor)) {
    if (m?.type === "ac") {
      const v = Number(m?.bonus?.value);
      if (Number.isFinite(v)) flatAcBonus += v;
    } else if (m?.type === "shields") {
      if (m.capacity?.value) shieldsMax += Number(m.capacity.value);
      if (m.regen?.value) shieldsRegen += Number(m.regen.value);
    }
  }
  const unproficientCount = countUnproficientPieces(actor);
  return {
    pieces, counts, ...limits,
    acBonus: acBonus + flatAcBonus,
    flatAcBonus,
    shieldsMax, shieldsRegen, unproficientCount
  };
}

export function getArmorShieldsMax(actor) {
  return computeArmorState(actor)?.shieldsMax ?? 0;
}

export function getArmorShieldsRegen(actor) {
  return computeArmorState(actor)?.shieldsRegen ?? 0;
}

// Aggregate the "helpful buff" mechanics across equipped pieces for sheet
// display. Skips shields/strReq/stealth/AC (already surfaced elsewhere).
// Returns null when nothing useful is equipped — the renderer can skip.
//
// Aggregation rules:
//   • senses          — max range per sense (don't stack overlapping vision)
//   • resistances     — union of damage types
//   • condImmunities  — union of conditions
//   • capacities      — sum (clip / medi-gel / grenade are additive deltas)
//   • speedBonus      — sum per movement key (additive across pieces)
// Fold a list of raw mechanics into the buff accumulators. Used for both an
// armor piece's `f.raw` and its attached mods' mechanics. `full` enables the
// capacity + flat-ac cases — off for pieces (those come from baked buckets),
// on for mods (whose mechanics are raw).
function accumulateBuffMechanics(mechanics, acc, { full } = {}) {
  for (const m of mechanics) {
    if (!m?.type) continue;
    switch (m.type) {
      case "sense": {
        if (!m.sense) break;
        const d = Number(m.distance ?? 0);
        acc.senses[m.sense] = Math.max(acc.senses[m.sense] ?? 0, d);
        break;
      }
      case "resistance":
        if (m.value) acc.resistances.add(String(m.value));
        break;
      case "condition-immunity":
        if (m.value) acc.condImmunities.add(String(m.value));
        break;
      case "speed-bonus": {
        const v = Number(m.bonus?.value ?? 0);
        if (!v) break;
        const keys = Array.isArray(m.value) ? m.value : ["walk"];
        for (const k of keys) acc.speedBonus[k] = (acc.speedBonus[k] ?? 0) + v;
        break;
      }
      case "thermal-clip-capacity":
        if (full) acc.caps.thermalClips += Number(m.value ?? 0);
        break;
      case "grenade-capacity":
        if (full) acc.caps.grenades += Number(m.value ?? 0);
        break;
      case "medi-gel-capacity":
        if (full) acc.caps.mediGel += Number(m.value ?? 0);
        break;
      case "ac": {
        if (!full) break;
        const v = Number(m.bonus?.value);
        if (Number.isFinite(v)) acc.caps.acBonus += v;
        break;
      }
      // Additional weapon-carry slots (holster mods). Display only — the
      // player tracks which weapons are stowed; this doesn't touch wield hands.
      case "weapon-slots":
        acc.weaponSlots += Number(m.value ?? 0);
        break;
      // Advantage riders the player resolves on their own rolls — surfaced as
      // a chip so they remember they have it.
      case "saving-throw":
        if (m.effect?.type === "advantage") {
          for (const a of (Array.isArray(m.against) ? m.against : [])) acc.advSaves.add(String(a));
        }
        break;
      case "skill-check":
        if (m.effect?.type === "advantage" && m.value) acc.advSkills.add(String(m.value));
        break;
    }
  }
}

export function summarizeArmorBuffs(actor) {
  const pieces = getEquippedMe5eArmor(actor);
  if (!pieces.length) return null;
  const senses = {};
  const resistances = new Set();
  const condImmunities = new Set();
  const speedBonus = {};

  const caps = { thermalClips: 0, mediGel: 0, grenades: 0, acBonus: 0 };
  const advSaves = new Set();
  const advSkills = new Set();
  const acc = { senses, resistances, condImmunities, speedBonus, caps, weaponSlots: 0, advSaves, advSkills };

  for (const item of pieces) {
    const f = getMe5eArmorFlags(item);
    if (!f) continue;
    // Piece capacities + flat AC come from build-baked buckets.
    caps.thermalClips += Number(f.thermalClipCapacity ?? 0);
    caps.mediGel      += Number(f.mediGelCapacity ?? 0);
    caps.grenades     += Number(f.grenadeCapacity ?? 0);
    caps.acBonus      += flatAcBonusFromMechanics(item);
    for (const r of f.resistances ?? []) if (r) resistances.add(String(r));
    // Piece raw mechanics: sense/resistance/condition/speed only (capacities
    // + ac already counted from buckets above).
    accumulateBuffMechanics(f.raw ?? [], acc, { full: false });
    // Attached mods contribute the full buff set (incl. capacities + flat ac).
    accumulateBuffMechanics(getAttachedArmorModMechanics(item, actor), acc, { full: true });
  }

  const { thermalClips, mediGel, grenades, acBonus } = caps;
  const weaponSlots = acc.weaponSlots;

  const empty = !Object.keys(senses).length
    && !resistances.size
    && !condImmunities.size
    && !thermalClips && !mediGel && !grenades && !acBonus
    && !weaponSlots && !advSaves.size && !advSkills.size
    && !Object.keys(speedBonus).length;
  if (empty) return null;
  return {
    senses, resistances, condImmunities, thermalClips, mediGel, grenades, acBonus, speedBonus,
    weaponSlots, advSaves, advSkills
  };
}

// Sum the bonus max HP granted by attached armor mods. A mod's `hp` mechanic
// is either a flat value or `{ type: "level" }` (1 per character level).
export function getArmorModHpBonus(actor) {
  const level = Number(actor?.system?.details?.level ?? 1) || 1;
  let total = 0;
  for (const item of getEquippedMe5eArmor(actor)) {
    for (const m of getAttachedArmorModMechanics(item, actor)) {
      if (m?.type !== "hp") continue;
      const b = m.bonus ?? {};
      total += b.type === "level" ? level * Number(b.value ?? 1) : Number(b.value ?? 0);
    }
  }
  // Active set bonuses can also grant HP (e.g. N7: +1 HP per character level).
  for (const m of getActiveSetBonusMechanics(actor)) {
    if (m?.type !== "hp") continue;
    const b = m.bonus ?? {};
    total += b.type === "level" ? level * Number(b.value ?? 1) : Number(b.value ?? 0);
  }
  return Number.isFinite(total) ? total : 0;
}

// Barrier points granted by attached armor mods (e.g. the Barrier mod's 3
// ticks). `ticks` is a per-level array; take this character's level.
export function getArmorBarriersMax(actor) {
  const level = Number(actor?.system?.details?.level ?? 1) || 1;
  let total = 0;
  for (const item of getEquippedMe5eArmor(actor)) {
    for (const m of getAttachedArmorModMechanics(item, actor)) {
      if (m?.type !== "barrier") continue;
      const ticks = Array.isArray(m.ticks) ? m.ticks : [];
      if (!ticks.length) continue;
      const idx = Math.min(Math.max(level - 1, 0), ticks.length - 1);
      const t = Number(ticks[idx]);
      if (Number.isFinite(t)) total += t;
    }
  }
  return total;
}

// dnd5e's AttributesFields.prepareArmorClass walks the actor's equipment,
// reads system.armor.value, applies the Dex cap from the first armor piece,
// and writes ac.value. With our armor.value=0 / dex=null bake, calling it
// produces base 10 + full Dex. We compute ME5e's version and overwrite.
function applyMe5eArmorClass(model, rollData, state) {
  const ac = model.attributes.ac;
  const dexMod = model.abilities?.dex?.mod ?? 0;
  const dex = Math.min(state.dexCap, dexMod);

  ac.armor = state.acBonus;
  ac.dex = dex;
  ac.base = 10 + state.acBonus + dex;
  ac.label = game.i18n.localize("ME5E.Armor.ACLabel");

  const shield = ac.shield ?? 0;
  const bonus = ac.bonus ?? 0;
  const cover = ac.cover ?? 0;
  const min = ac.min ?? 0;
  ac.value = Math.max(min, ac.base + shield + bonus + cover);
}

function applyStealthDisadvantage(model) {
  const cls = dnd5e?.dataModels?.fields?.AdvantageModeField;
  if (cls?.setMode) {
    cls.setMode(model, "skills.ste.roll.mode", -1);
    return;
  }
  const ste = model.skills?.ste;
  if (ste?.roll) ste.roll.mode = Math.min(ste.roll.mode ?? 0, -1);
}

// Krogan (Redundant Nervous System) and Volus (Power Armor Training) carry the
// `nullify-armor-str-restriction` mechanic: "your speed is not reduced by wearing
// armor." Honor it by skipping the penalty entirely.
function actorNullifiesArmorStr(actor) {
  return !!actor?.items?.some((i) => {
    const mech = i.getFlag?.(MODULE_ID, "mechanics");
    return Array.isArray(mech) && mech.some((m) => m?.type === "nullify-armor-str-restriction");
  });
}

function applySpeedPenalty(model, strScore) {
  if (strScore >= 0 && (model.abilities?.str?.value ?? 0) >= strScore) return;
  if (actorNullifiesArmorStr(model?.parent)) return;
  const movement = model.attributes?.movement;
  if (!movement) return;
  const isMeters = (movement.units ?? "ft") === "m";
  const penalty = isMeters ? SPEED_PENALTY_METERS : SPEED_PENALTY_FEET;
  for (const key of ["walk", "fly", "swim", "climb", "burrow"]) {
    if (typeof movement[key] === "number" && movement[key] > 0) {
      movement[key] = Math.max(0, movement[key] - penalty);
    }
  }
}

let _wrapped = false;

export function wrapPrepareArmorClass() {
  if (_wrapped) return;
  const cls = globalThis.dnd5e?.dataModels?.actor?.AttributesFields;
  const original = cls?.prepareArmorClass;
  if (!original) {
    console.warn("ME5e | dnd5e.dataModels.actor.AttributesFields.prepareArmorClass not found; AC override disabled.");
    return;
  }
  cls.prepareArmorClass = function(rollData) {
    const state = computeArmorState(this.parent);
    // No ME5e armor equipped → native pipeline, which honors flat/custom AC
    // and any unarmored-defense formula (e.g. Elcor natural armor 13 + Dex).
    if (!state) return original.call(this, rollData);
    // An explicitly flat AC (NPC bookkeeping) still wins over ME5e math; but a
    // `custom` calc (natural armor) yields to worn ME5e armor — that's how
    // natural armor switches off when you put armor on.
    if (this.attributes?.ac?.calc === "flat") return original.call(this, rollData);
    // Run dnd5e's pipeline first to populate ac.bonus/cover/min/shield from
    // any standing modifiers, then stomp the base+value with ME5e math.
    original.call(this, rollData);
    applyMe5eArmorClass(this, rollData, state);
    if (state.stealthDisadvantage) applyStealthDisadvantage(this);
    // Speed penalty is applied in the prepareMovement wrap below — applying
    // it here gets clobbered, because dnd5e calls prepareMovement after
    // prepareArmorClass and re-derives movement.walk from base values.
  };
  wrapPrepareMovement();
  wrapPrepareHitPoints();
  wrapPrepareResistImmune();
  _wrapped = true;
}

// Damage types granted by equipped ME5e armor — per-piece resistances (baked
// `resistances` bucket + raw `resistance` mechanics + attached armor-mod
// mechanics) plus active set-bonus `resistance` mechanics.
export function getArmorResistanceTypes(actor) {
  const out = new Set();
  for (const item of getEquippedMe5eArmor(actor)) {
    const f = getMe5eArmorFlags(item);
    for (const r of (f?.resistances ?? [])) if (r) out.add(String(r));
    for (const m of (f?.raw ?? [])) if (m?.type === "resistance" && m.value) out.add(String(m.value));
    for (const m of getAttachedArmorModMechanics(item, actor)) {
      if (m?.type === "resistance" && m.value) out.add(String(m.value));
    }
  }
  for (const m of getActiveSetBonusMechanics(actor)) {
    if (m?.type === "resistance" && m.value) out.add(String(m.value));
  }
  return out;
}

// dnd5e finalizes system.traits.dr.value in TraitsFields.prepareResistImmune
// (called from character/npc prepareDerivedData). Wrap it to fold in armor +
// set-bonus resistances, so they show in the Details-tab Resistances section.
function wrapPrepareResistImmune() {
  const cls = globalThis.dnd5e?.dataModels?.actor?.TraitsFields;
  const original = cls?.prepareResistImmune;
  if (!original) {
    console.warn("ME5e | TraitsFields.prepareResistImmune not found; armor resistances won't show on the sheet.");
    return;
  }
  cls.prepareResistImmune = function(...args) {
    original.apply(this, args);
    const dr = this.traits?.dr?.value;
    if (!dr || !this.parent) return;
    for (const type of getArmorResistanceTypes(this.parent)) dr.add(type);
  };
}

// Fold attached armor mods' HP bonuses into max HP. prepareHitPoints takes a
// `bonus` option that's added straight into hp.max, so we top it up before
// dnd5e finalizes — mirroring the AC/movement wraps.
function wrapPrepareHitPoints() {
  const cls = globalThis.dnd5e?.dataModels?.actor?.AttributesFields;
  const original = cls?.prepareHitPoints;
  if (!original) {
    console.warn("ME5e | AttributesFields.prepareHitPoints not found; armor-mod HP bonus disabled.");
    return;
  }
  cls.prepareHitPoints = function(hp, options = {}) {
    const bonus = getArmorModHpBonus(this.parent);
    if (bonus) options = { ...options, bonus: (options.bonus ?? 0) + bonus };
    original.call(this, hp, options);
    // A character with no class has no Hit Dice → 0 max HP. dnd5e would otherwise
    // surface a stale/overridden hp.max (and armor/set HP bonuses), so HP appears
    // to "carry over" when swapping classes. Zero it so HP reflects only what
    // classes actually grant — a clean baseline.
    if (this.parent?.type === "character" && !Object.keys(this.parent.classes ?? {}).length) {
      hp.max = 0;
      hp.effectiveMax = Math.max(hp.tempmax ?? 0, 0);
      hp.value = Math.min(hp.value ?? 0, hp.effectiveMax);
      hp.damage = hp.effectiveMax - hp.value;
      hp.pct = 0;
    }
  };
}

// dnd5e's prepareDerivedData calls prepareArmorClass first, then four steps
// later prepareMovement re-derives movement.walk/fly/etc from base values —
// stomping any speed penalty we tried to apply earlier. So we wrap
// prepareMovement and apply the penalty after dnd5e has finalized speeds.
function wrapPrepareMovement() {
  const cls = globalThis.dnd5e?.dataModels?.actor?.AttributesFields;
  const original = cls?.prepareMovement;
  if (!original) {
    console.warn("ME5e | AttributesFields.prepareMovement not found; speed penalty disabled.");
    return;
  }
  cls.prepareMovement = function(rollData) {
    original.call(this, rollData);
    const state = computeArmorState(this.parent);
    if (state && state.strReq > 0) applySpeedPenalty(this, state.strReq);
    mirrorPoolsToSystem(this);
  };
}

// Token resource bars can only bind `system.*` paths, never `flags.*`, so the
// shields / barriers / tech-armor pools (stored in flags) are invisible to the
// bar dropdown. Mirror them onto derived `system.me5e.<pool>` here (safe: this
// runs in prepareDerivedData where computeArmorState already resolves) and
// register the paths via CONFIG.Actor.trackableAttributes (registerArmor) so
// they appear as bar options. The flags remain the source of truth; this is a
// read-only projection refreshed each data prep.
function mirrorPoolsToSystem(model) {
  const actor = model?.parent;
  if (!actor) return;
  const flag = (p, d = 0) => Number(actor.getFlag(MODULE_ID, p) ?? d);
  const shieldsMax = effectiveShieldsMax(actor);
  const barriersMax = flag("barriers.max") + getArmorBarriersMax(actor);
  const techMax = flag("techArmor.max");
  model.me5e = {
    shields:   { value: flag("shields.value"),   max: shieldsMax },
    barriers:  { value: flag("barriers.value"),  max: barriersMax },
    techArmor: { value: flag("techArmor.value"), max: techMax }
  };
}

// Effective shields max for an actor — armor-derived if any chest/body
// armor is equipped, else the flag-based fallback used by NPCs.
function effectiveShieldsMax(actor) {
  const armorMax = getArmorShieldsMax(actor);
  if (armorMax > 0) return armorMax;
  return Number(actor.getFlag(MODULE_ID, "shields.max") ?? 0);
}

// shields.max is derived (recomputed from equipped armor every render) but
// shields.value is a persisted flag. When the loadout changes, the value
// can end up exceeding the new max (classic "30 / 0" after unequip). Clamp
// the persisted value to the new max.
async function clampShieldsValueToMax(actor) {
  const max = effectiveShieldsMax(actor);
  const rawValue = Number(actor.getFlag(MODULE_ID, "shields.value") ?? 0);
  if (rawValue <= max) return;
  await actor.update({ [`flags.${MODULE_ID}.shields.value`]: Math.max(0, max) });
}

// Equip enforcement: when a piece is being equipped, unequip any other
// pieces in conflicting placements. Body conflicts with chest/arms/legs.
async function onUpdateItem(item, changes, options, userId) {
  if (game.userId !== userId) return;
  const actor = item.actor;
  const f = getMe5eArmorFlags(item);
  if (!actor || !f?.placement) return;
  const equipChanged = changes.system?.equipped !== undefined;
  if (!equipChanged) return;

  if (changes.system.equipped === true) {
    const conflicts = placementsConflictWith(f.placement);
    const toUnequip = [];
    for (const other of actor.items) {
      if (other.id === item.id) continue;
      if (!other.system?.equipped) continue;
      const of = getMe5eArmorFlags(other);
      if (of?.placement && conflicts.has(of.placement)) toUnequip.push(other.id);
    }
    if (toUnequip.length) {
      await actor.updateEmbeddedDocuments("Item", toUnequip.map(id => ({
        _id: id,
        "system.equipped": false
      })));
      ui.notifications?.info(game.i18n.format("ME5E.Armor.PlacementSwap", {
        name: item.name,
        placement: game.i18n.localize(`ME5E.Armor.Placement.${f.placement}`)
      }));
    }
  }

  await clampShieldsValueToMax(actor);
  await reconcileSuitEffects(actor);
}

// An armor piece (or the suit trait itself) being added can change sealed state.
async function onCreateItem(item, options, userId) {
  if (game.userId !== userId) return;
  const actor = item.actor;
  if (!actor) return;
  const isArmor = !!getMe5eArmorFlags(item)?.placement;
  const isSuitTrait = item.effects?.some((e) => e.getFlag(MODULE_ID, "suitGated"));
  if (isArmor || isSuitTrait) await reconcileSuitEffects(actor);
}

async function onDeleteItem(item, options, userId) {
  if (game.userId !== userId) return;
  const actor = item.actor;
  if (!actor) return;
  if (!item.system?.equipped) return;
  if (!getMe5eArmorFlags(item)?.placement) return;
  await clampShieldsValueToMax(actor);
  await reconcileSuitEffects(actor);
}

// ─── Suit-gated trait resistances ─────────────────────────────────────────
// Quarian Hermetic Suit / Volus Pressurized Suit grant poison/necrotic resistance
// and disease immunity "while within your suit". The enviro-suit is sealed when a
// chest (or full-body) armor piece is equipped, so toggle those trait effects'
// `disabled` to match — the resistances then appear in / drop from the normal
// dnd5e resistance list as the suit goes on and off.

function isWearingSuit(actor) {
  return actor.items.some((i) => {
    if (!i.system?.equipped) return false;
    const placement = getMe5eArmorFlags(i)?.placement;
    return placement === "chest" || placement === "body";
  });
}

async function reconcileSuitEffects(actor) {
  if (!actor) return;
  const disable = !isWearingSuit(actor);
  for (const item of actor.items) {
    const updates = [];
    for (const e of item.effects) {
      if (!e.getFlag(MODULE_ID, "suitGated")) continue;
      if (e.disabled !== disable) updates.push({ _id: e.id, disabled: disable });
    }
    if (updates.length) await item.updateEmbeddedDocuments("ActiveEffect", updates);
  }
}

// Reconcile every owned actor once at startup so the initial sealed/unsealed
// state is correct without waiting for an equip change.
async function reconcileAllSuitEffects() {
  for (const actor of game.actors ?? []) {
    if (!actor.isOwner) continue;
    if (!actor.items?.some((i) => i.effects?.some((e) => e.getFlag(MODULE_ID, "suitGated")))) continue;
    await reconcileSuitEffects(actor);
  }
}

// Expose the mirrored pools (system.me5e.<pool>) as token-bar options.
function registerTrackablePools() {
  const ta = CONFIG.Actor.trackableAttributes ?? (CONFIG.Actor.trackableAttributes = {});
  for (const type of ["character", "npc"]) {
    const entry = ta[type] ?? (ta[type] = { bar: [], value: [] });
    entry.bar ??= [];
    for (const p of ["me5e.shields", "me5e.barriers", "me5e.techArmor"]) {
      if (!entry.bar.includes(p)) entry.bar.push(p);
    }
  }
}

// The token resource-bar dropdown labels each attribute from the raw path, so the
// mirrored pools show as "me5e.shields" etc. Wrap getTrackedAttributeChoices to
// give them friendly labels and group them under "Mass Effect 5e".
const POOL_BAR_LABELS = {
  "me5e.shields": "ME5E.UI.Shields",
  "me5e.barriers": "ME5E.UI.Barriers",
  "me5e.techArmor": "ME5E.UI.TechArmor"
};
function patchTokenBarLabels() {
  const cls = CONFIG.Token?.documentClass;
  const original = cls?.getTrackedAttributeChoices;
  if (typeof original !== "function") {
    console.warn("ME5e | getTrackedAttributeChoices not found; pool bar labels not relabeled.");
    return;
  }
  cls.getTrackedAttributeChoices = function(attributes) {
    const groups = original.call(this, attributes);
    const groupLabel = game.i18n.localize("ME5E.UI.Pools");
    // groups may be a flat array of { value, label, group } (v12) — relabel ours.
    for (const entry of (Array.isArray(groups) ? groups : [])) {
      const key = POOL_BAR_LABELS[entry?.value];
      if (key) { entry.label = game.i18n.localize(key); entry.group = groupLabel; }
    }
    return groups;
  };
}

export function registerArmor() {
  // Install the prepareData wraps at i18nInit (which fires BEFORE Foundry's
  // initializeDocuments() prepares every actor) rather than setup (which fires
  // AFTER). Otherwise cold-loaded actors are prepared without our wraps:
  // system.me5e stays null (empty token bars) and armored AC/HP/resistances
  // miss their initial derivation until the actor is next touched. dnd5e's
  // data-model field classes already exist at this point, so the wrap is safe.
  Hooks.once("i18nInit", wrapPrepareArmorClass);
  Hooks.once("setup", registerTrackablePools);
  Hooks.once("setup", patchTokenBarLabels);
  Hooks.once("ready", reconcileAllSuitEffects);
  Hooks.on("updateItem", onUpdateItem);
  Hooks.on("createItem", onCreateItem);
  Hooks.on("deleteItem", onDeleteItem);
}
