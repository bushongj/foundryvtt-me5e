import { ME5E } from "./config.mjs";

export function registerSkills() {
  const skills = CONFIG.DND5E?.skills;
  if (!skills) {
    console.warn("ME5e | CONFIG.DND5E.skills not available; skipping skill remap");
    return;
  }

  for (const key of ME5E.dnd5eSkillsToRemove) {
    delete skills[key];
  }

  for (const [key, def] of Object.entries(ME5E.dnd5eSkillsToAdd)) {
    skills[key] = { ...def };
  }

  console.log("ME5e | Skill list remapped to ME5e setting");
}

// ME5e weapon proficiency categories (by weapon type), added to dnd5e's
// sim/mar so features/classes can grant proficiency in a weapon type and it
// shows on the sheet. Keys match the build's WEAPON_PROF_KEY map.
export const ME5E_WEAPON_PROFICIENCIES = {
  pistol:  "ME5E.Weapon.Pistol",
  smg:     "ME5E.Weapon.SMG",
  rifle:   "ME5E.Weapon.AssaultRifle",
  shotgun: "ME5E.Weapon.Shotgun",
  sniper:  "ME5E.Weapon.SniperRifle",
  heavy:   "ME5E.Weapon.Heavy",
  melee:   "ME5E.Weapon.Melee"
};

// Melee/ranged classification per ME5e weapon type, so dnd5e's `attackType`
// getter (CONFIG.DND5E.weaponTypeMap[type]) classifies ME5e guns correctly.
const ME5E_WEAPON_TYPE_MAP = {
  pistol: "ranged", smg: "ranged", rifle: "ranged", shotgun: "ranged",
  sniper: "ranged", heavy: "ranged", melee: "melee"
};

// ME5e tools (workbenches, kits) for tool proficiency. `id` points at the
// items-pack item so the proficiency picker shows a proper name; keys match
// the source slugs used in tool-choice limits and the build's tool grants.
export const ME5E_TOOLS = {
  "armorsmiths-workbench": { ability: "int", id: "Compendium.me5e.items.Item.1540702082a4b2f3" },
  "brewers-supplies": { ability: "int", id: "Compendium.me5e.items.Item.0867ecca6a1412fc" },
  "chemists-supplies": { ability: "int", id: "Compendium.me5e.items.Item.aacfdb5886d6bd59" },
  "cooks-utensils": { ability: "int", id: "Compendium.me5e.items.Item.be667cbdafc8ea44" },
  "musical-instrument": { ability: "cha", id: "Compendium.me5e.items.Item.2a237d424c2136b2" },
  "painters-supplies": { ability: "int", id: "Compendium.me5e.items.Item.54cc33f049a5c0d9" },
  "tailors-tools": { ability: "int", id: "Compendium.me5e.items.Item.5bd9e095518cbeff" },
  "tinkers-tools": { ability: "int", id: "Compendium.me5e.items.Item.8a07b35d71891130" },
  "weaponsmiths-workbench": { ability: "int", id: "Compendium.me5e.items.Item.996c616e445e039a" },
  "disguise-kit": { ability: "cha", id: "Compendium.me5e.items.Item.4a621286c347f2bc" },
  "gaming-set": { ability: "wis", id: "Compendium.me5e.items.Item.7cc9dcc338fec00f" },
  "hacking-tools": { ability: "int", id: "Compendium.me5e.items.Item.bce0d1e675b30264" },
  "medical-kit": { ability: "wis", id: "Compendium.me5e.items.Item.6a7d6f88599e9e16" },
  "thieves-tools": { ability: "dex", id: "Compendium.me5e.items.Item.5f79226ad331935c" },
  "vehicles": { ability: "dex", id: "Compendium.me5e.items.Item.b56366c9433e3517" },
  "starship-system-drive": { ability: "int", id: "Compendium.me5e.items.Item.11c835b2fa6ecc2a" },
  "starship-system-ews": { ability: "int", id: "Compendium.me5e.items.Item.29e848336f35cf65" },
  "starship-system-helm": { ability: "dex", id: "Compendium.me5e.items.Item.4b0b3fc7ec091a25" },
  "starship-system-navigation": { ability: "int", id: "Compendium.me5e.items.Item.6006db41a7f8a483" },
  "starship-system-ssc": { ability: "int", id: "Compendium.me5e.items.Item.4855450b108b2f71" },
  "starship-system-weapons": { ability: "int", id: "Compendium.me5e.items.Item.e078028a605ae51a" }
};

// Replace dnd5e's tool roster in place (preserving the toolIds Proxy's target).
export function registerTools() {
  const tools = CONFIG.DND5E?.tools;
  if (!tools) return;
  for (const k of Object.keys(tools)) delete tools[k];
  Object.assign(tools, ME5E_TOOLS);
}

// ME5e has only three creature types — Organic, Synthetic, Synth-organic — in
// place of dnd5e's 14 (celestials/undead/fey/etc. don't fit the setting). Player
// species are Organic except Geth / Unshackled AI (Synthetic); the build sets
// each item's system.type.value. Replace the config in-place.
const ME5E_CREATURE_TYPES = {
  organic: { label: "Organic", plural: "Organics", icon: "systems/dnd5e/icons/svg/items/race.svg" },
  synthetic: { label: "Synthetic", plural: "Synthetics", icon: "systems/dnd5e/icons/svg/actors/npc.svg" },
  synthorganic: { label: "Synth-organic", plural: "Synth-organics", icon: "systems/dnd5e/icons/svg/items/race.svg" }
};

export function registerCreatureTypes() {
  const types = CONFIG.DND5E?.creatureTypes;
  if (!types) return;
  for (const k of Object.keys(types)) delete types[k];
  Object.assign(types, ME5E_CREATURE_TYPES);
}

// dnd5e's expertise-mode Trait advancement only lists skills you're already
// proficient in. ME5e wants "choose any skill → expertise", so those choices
// are built as default-mode (full list) Trait advancements flagged
// `me5e.forceExpertise`. Patch apply() to bump the chosen skill from
// proficiency (1) to expertise (2).
export function patchExpertiseAdvancement() {
  const cls = CONFIG.DND5E?.advancementTypes?.Trait?.documentClass;
  if (!cls?.prototype?.apply || cls.prototype._me5eExpertisePatched) return;
  const original = cls.prototype.apply;
  cls.prototype.apply = async function(level, data, options = {}) {
    await original.call(this, level, data, options);
    if (!this.flags?.me5e?.forceExpertise) return;
    const keys = data?.chosen ?? (data?.key ? [data.key] : null);
    if (!keys) return;
    const updates = {};
    for (const key of keys) {
      const [type, k] = String(key).split(":");
      if (type === "skills" && k) updates[`system.skills.${k}.value`] = 2;
    }
    if (Object.keys(updates).length) this.actor?.updateSource(updates);
  };
  cls.prototype._me5eExpertisePatched = true;
}

export function registerWeaponProficiencies() {
  const dnd5e = CONFIG.DND5E;
  if (!dnd5e?.weaponProficiencies) return;
  // Proficiency categories (sim/mar + ME5e weapon types).
  Object.assign(dnd5e.weaponProficiencies, ME5E_WEAPON_PROFICIENCIES);
  // Each ME5e weapon type is also a weapon TYPE (system.type.value) so a
  // weapon's proficiency keys off its type.
  if (dnd5e.weaponTypes) Object.assign(dnd5e.weaponTypes, ME5E_WEAPON_PROFICIENCIES);
  // Map each type → its own proficiency category (proficiencyMultiplier looks
  // up weaponProficienciesMap[type] and checks the actor's weaponProf set).
  if (dnd5e.weaponProficienciesMap) {
    for (const key of Object.keys(ME5E_WEAPON_PROFICIENCIES)) dnd5e.weaponProficienciesMap[key] = key;
  }
  // Classify each ME5e weapon type as melee/ranged for dnd5e's attackType.
  if (dnd5e.weaponTypeMap) Object.assign(dnd5e.weaponTypeMap, ME5E_WEAPON_TYPE_MAP);
}
