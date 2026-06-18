export const ME5E = {};

ME5E.species = {
  human: { label: "ME5E.Species.Human", homeworld: "Earth" },
  asari: { label: "ME5E.Species.Asari", homeworld: "Thessia" },
  turian: { label: "ME5E.Species.Turian", homeworld: "Palaven" },
  krogan: { label: "ME5E.Species.Krogan", homeworld: "Tuchanka" },
  salarian: { label: "ME5E.Species.Salarian", homeworld: "Sur'Kesh" },
  quarian: { label: "ME5E.Species.Quarian", homeworld: "Rannoch" },
  drell: { label: "ME5E.Species.Drell", homeworld: "Rakhana" },
  batarian: { label: "ME5E.Species.Batarian", homeworld: "Khar'shan" },
  hanar: { label: "ME5E.Species.Hanar", homeworld: "Kahje" },
  volus: { label: "ME5E.Species.Volus", homeworld: "Irune" },
  elcor: { label: "ME5E.Species.Elcor", homeworld: "Dekuuna" },
  geth: { label: "ME5E.Species.Geth", homeworld: "Rannoch" },
  vorcha: { label: "ME5E.Species.Vorcha", homeworld: "Heshtok" }
};

ME5E.classes = {
  soldier:    { label: "ME5E.Class.Soldier",    affinity: ["combat"] },
  engineer:   { label: "ME5E.Class.Engineer",   affinity: ["tech"] },
  adept:      { label: "ME5E.Class.Adept",      affinity: ["biotic"] },
  vanguard:   { label: "ME5E.Class.Vanguard",   affinity: ["biotic", "combat"] },
  infiltrator:{ label: "ME5E.Class.Infiltrator",affinity: ["tech", "combat"] },
  sentinel:   { label: "ME5E.Class.Sentinel",   affinity: ["tech", "biotic"] }
};

ME5E.origins = {
  spacer:       { label: "ME5E.Origin.Spacer" },
  colonist:     { label: "ME5E.Origin.Colonist" },
  earthborn:    { label: "ME5E.Origin.Earthborn" }
};

ME5E.psychProfiles = {
  soleSurvivor: { label: "ME5E.Psych.SoleSurvivor" },
  ruthless:     { label: "ME5E.Psych.Ruthless" },
  warHero:      { label: "ME5E.Psych.WarHero" }
};

// ME5e damage types align with the standard dnd5e set. Multipliers default
// to 1.0 across the board until a specific rule is needed. Lightning is
// the only multiplier-bearing type for now: "All shields are vulnerable to
// lightning" — doubled before shield absorption, leftover halved into HP
// (the distribution math in shields.mjs handles the halving naturally).
ME5E.damageTypes = {
  acid:        { label: "ME5E.Damage.Acid",        vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  bludgeoning: { label: "ME5E.Damage.Bludgeoning", vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  cold:        { label: "ME5E.Damage.Cold",        vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  fire:        { label: "ME5E.Damage.Fire",        vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  force:       { label: "ME5E.Damage.Force",       vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  lightning:   { label: "ME5E.Damage.Lightning",   vs: { shields: 2.0, armor: 1.0, health: 1.0 } },
  necrotic:    { label: "ME5E.Damage.Necrotic",    vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  piercing:    { label: "ME5E.Damage.Piercing",    vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  poison:      { label: "ME5E.Damage.Poison",      vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  psychic:     { label: "ME5E.Damage.Psychic",     vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  radiant:     { label: "ME5E.Damage.Radiant",     vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  slashing:    { label: "ME5E.Damage.Slashing",    vs: { shields: 1.0, armor: 1.0, health: 1.0 } },
  thunder:     { label: "ME5E.Damage.Thunder",     vs: { shields: 1.0, armor: 1.0, health: 1.0 } }
};

ME5E.powerCategories = {
  biotic: "ME5E.Power.Category.Biotic",
  tech:   "ME5E.Power.Category.Tech",
  combat: "ME5E.Power.Category.Combat"
};

// Canonical ME5e primed-effects spec. A creature can be primed with any
// number of these simultaneously; any detonator-flagged power triggers all
// of them in random order, then the primer drops.
//
// Damage `scale` keys are caster-level thresholds — the largest threshold
// at or below caster level is selected, else `base`. DC `scale` works the
// same way.
ME5E.primers = {
  cold: {
    label: "ME5E.Primer.Cold",
    icon: "icons/svg/frozen.svg",
    statusId: "me5e-primed-cold",
    detonation: {
      radius: 4,
      damage: null,
      save: { ability: "str", dc: { base: 15, scale: { 5: 16, 11: 17, 17: 18 } } },
      onFail: { condition: "frozen", duration: { rounds: 1 } }
    }
  },
  fire: {
    label: "ME5E.Primer.Fire",
    icon: "icons/svg/fire.svg",
    statusId: "me5e-primed-fire",
    detonation: {
      radius: 4,
      damage: { base: "1d6", scale: { 5: "2d6", 11: "3d6", 17: "4d6" }, type: "fire" },
      save: null,
      dot: { formula: "1d6", type: "fire", durationSeconds: 60 }
    }
  },
  force: {
    label: "ME5E.Primer.Force",
    icon: "icons/svg/explosion.svg",
    statusId: "me5e-primed-force",
    detonation: {
      radius: 0,
      damage: { base: "2d6", scale: { 5: "3d6", 11: "4d6", 17: "5d6" }, type: "force" },
      save: null,
      onHit: { condition: "prone", knockbackMeters: 6 }
    }
  },
  lightning: {
    label: "ME5E.Primer.Lightning",
    icon: "icons/svg/lightning.svg",
    statusId: "me5e-primed-lightning",
    detonation: {
      radius: 4,
      damage: { base: "3d4", scale: { 5: "4d4", 11: "5d4", 17: "6d4" }, type: "lightning" },
      save: null
    }
  },
  necrotic: {
    label: "ME5E.Primer.Necrotic",
    icon: "icons/svg/skull.svg",
    statusId: "me5e-primed-necrotic",
    detonation: {
      radius: 0,
      damage: { base: "1d12", type: "necrotic" },
      save: { ability: "con", dc: { base: 13 } },
      onFail: { condition: "stunned", duration: { rounds: 1 } }
    }
  },
  // Radiant is a sixth, subclass-specific primer: the general manual lists five
  // (Force/Necrotic/Fire/Cold/Lightning), but the Nuclear Adept applies
  // primed:radiant via Radiation Poisoning (L6) and Fusion (L14). Per the rules:
  // 4-meter radius, flat 3d4 radiant (NO higher-level scaling, unlike the other
  // elemental primers), DC 15 CON save → poisoned 1 hr, and poisoned while primed.
  radiant: {
    label: "ME5E.Primer.Radiant",
    icon: "icons/svg/sun.svg",
    statusId: "me5e-primed-radiant",
    whilePrimed: { condition: "poisoned" },
    detonation: {
      radius: 4,
      damage: { base: "3d4", type: "radiant" },
      save: { ability: "con", dc: { base: 15 } },
      onFail: { condition: "poisoned", duration: { seconds: 3600 } }
    }
  }
};

// Custom status effects registered into CONFIG.statusEffects at init so the
// token HUD shows them. The detonation pipeline applies them via
// ActiveEffects with these IDs.
ME5E.customStatuses = {
  frozen: { id: "me5e-frozen", label: "ME5E.Condition.Frozen", icon: "icons/svg/frozen.svg" },
  onFire: { id: "me5e-on-fire", label: "ME5E.Condition.OnFire", icon: "icons/svg/fire.svg" },
  // Generic recurring-damage marker for power DoTs (Singularity/Dominate/Dark
  // Channel). The effect's name carries the power + type; the on-fire engine
  // ticks it from its flags.me5e.dot. Registered so the DoT shows on the token
  // HUD and can be cleared by hand.
  dot: { id: "me5e-dot", label: "ME5E.Condition.Dot", icon: "icons/svg/biohazard.svg" },
  indoctrinated: { id: "me5e-indoctrinated", label: "ME5E.Condition.Indoctrinated", icon: "icons/svg/terror.svg" },
  // Sniper/marking debuff (text/en/conditions/targeting.md): speed halved, can
  // act/react only to end it, auto-fails Dex saves, attacks against it have
  // advantage. Registered so it can be applied from the token HUD.
  targeting: { id: "me5e-targeting", label: "ME5E.Condition.Targeting", icon: "icons/svg/target.svg" },
  // Player-applied at end of turn when they Dodge/Hide/Disengage or are in full
  // cover (which Foundry can't auto-detect). While active, shields regenerate by
  // the armor's regen at the start of each turn until full; taking damage clears
  // it (shields.mjs onShieldRegenTurn / clearShieldRegenOnDamage).
  shieldRegen: { id: "me5e-shield-regen", label: "ME5E.Condition.ShieldRegen", icon: "icons/svg/regen.svg" }
};

// NOTE: there is intentionally no hand-authored power→primer/detonator table
// here. Each power's primer (one of ME5E.primers, or null) and detonator
// (boolean) are derived at BUILD time from the power's authoritative source
// `primes`/`detonates` fields and stored on flags.me5e.power; the runtime reads
// those flags via getPowerMetadata. A curated table here previously diverged
// from the source (e.g. warp→force vs the book's necrotic) — that's why it's gone.

// Burst Fire property: an alternate AoE attack mode. Targets a cube of the
// given side (feet), each creature makes a Dex save or takes the weapon's
// damage, and the burst costs more heat than a normal shot.
ME5E.burstFire = {
  cubeFeet: 10,
  saveAbility: "dex",
  heatCost: 3
};

// Heat is sourced per-weapon (flags.me5e.weapon.heat = shots before reload),
// not from a per-type capacity — see heat.mjs.
ME5E.weaponTypes = {
  pistol:   { label: "ME5E.Weapon.Pistol" },
  smg:      { label: "ME5E.Weapon.SMG" },
  rifle:    { label: "ME5E.Weapon.AssaultRifle" },
  shotgun:  { label: "ME5E.Weapon.Shotgun" },
  sniper:   { label: "ME5E.Weapon.SniperRifle" },
  heavy:    { label: "ME5E.Weapon.Heavy" }
};

ME5E.weaponMods = {
  scope:            "ME5E.Mod.Scope",
  extendedBarrel:   "ME5E.Mod.ExtendedBarrel",
  pierce:           "ME5E.Mod.PiercingMod",
  highCaliber:      "ME5E.Mod.HighCaliber",
  thermalScope:     "ME5E.Mod.ThermalScope",
  ultralight:       "ME5E.Mod.UltralightMaterials",
  smartChoke:       "ME5E.Mod.SmartChoke",
  bayonet:          "ME5E.Mod.Bayonet",
  omniBlade:        "ME5E.Mod.OmniBlade"
};

ME5E.ammoTypes = {
  standard:     "ME5E.Ammo.Standard",
  incendiary:   "ME5E.Ammo.Incendiary",
  cryo:         "ME5E.Ammo.Cryo",
  disruptor:    "ME5E.Ammo.Disruptor",
  warp:         "ME5E.Ammo.Warp",
  armorPiercing:"ME5E.Ammo.ArmorPiercing",
  shredder:     "ME5E.Ammo.Shredder",
  explosive:    "ME5E.Ammo.Explosive"
};

ME5E.shields = {
  defaultMax: 0
  // Regen is per-piece (flags.me5e.armor.shields.regen.value), applied on rest
  // / at combat end and also in-combat at the start of a turn while the
  // me5e-shield-regen status is armed (see shields.mjs onShieldRegenTurn).
};

ME5E.barriers = {
  defaultMax: 0,
  decayPerRound: 0
};

ME5E.techArmor = {
  defaultMax: 0
  // Tech Armor absorbs every damage type 1-for-1 and depletes before
  // shields & HP. Persists until the buff drops (rest, dispel, or toggle).
};

ME5E.reputation = {
  paragonThresholds: [0, 25, 50, 75, 100],
  renegadeThresholds: [0, 25, 50, 75, 100],
  ranks: ["Recruit", "Spectre Candidate", "Spectre", "Council Specter", "Legend"]
};

ME5E.flagKeys = {
  techArmorValue: "techArmor.value",
  techArmorMax: "techArmor.max",
  shieldsValue: "shields.value",
  shieldsMax: "shields.max",
  barrierValue: "barriers.value",
  barrierMax: "barriers.max",
  heatValue: "heat.value",
  heatMax: "heat.max",
  heatLocked: "heat.locked",
  paragon: "reputation.paragon",
  renegade: "reputation.renegade",
  powerCategory: "power.category",
  powerPrimer: "power.primer",
  powerDetonator: "power.detonator"
};

ME5E.skills = {
  acrobatics:      { label: "DND5E.SkillAcr",       ability: "dex" },
  athletics:       { label: "DND5E.SkillAth",       ability: "str" },
  deception:       { label: "DND5E.SkillDec",       ability: "cha" },
  electronics:     { label: "ME5E.Skill.Electronics", ability: "int" },
  engineering:     { label: "ME5E.Skill.Engineering", ability: "int" },
  history:         { label: "DND5E.SkillHis",       ability: "int" },
  insight:         { label: "DND5E.SkillIns",       ability: "wis" },
  intimidation:    { label: "DND5E.SkillItm",       ability: "cha" },
  investigation:   { label: "DND5E.SkillInv",       ability: "int" },
  medicine:        { label: "DND5E.SkillMed",       ability: "wis" },
  perception:      { label: "DND5E.SkillPrc",       ability: "wis" },
  performance:     { label: "DND5E.SkillPrf",       ability: "cha" },
  persuasion:      { label: "DND5E.SkillPer",       ability: "cha" },
  science:         { label: "ME5E.Skill.Science",   ability: "int" },
  sleightOfHand:   { label: "DND5E.SkillSlt",       ability: "dex" },
  stealth:         { label: "DND5E.SkillSte",       ability: "dex" },
  survival:        { label: "DND5E.SkillSur",       ability: "wis" },
  vehicleHandling: { label: "ME5E.Skill.VehicleHandling", ability: "dex" }
};

ME5E.dnd5eSkillsToRemove = ["ani", "arc", "nat", "rel"];

ME5E.dnd5eSkillsToAdd = {
  elec: { label: "ME5E.Skill.Electronics",     ability: "int", fullKey: "electronics" },
  eng:  { label: "ME5E.Skill.Engineering",     ability: "int", fullKey: "engineering" },
  sci:  { label: "ME5E.Skill.Science",         ability: "int", fullKey: "science" },
  veh:  { label: "ME5E.Skill.VehicleHandling", ability: "dex", fullKey: "vehicleHandling" }
};

export const MODULE_ID = "me5e";

// dnd5e ships common/uncommon/rare/veryRare/legendary/artifact in
// CONFIG.DND5E.itemRarity. ME5e gear adds a top-end "spectre" tier (Spectre-
// requisitioned equipment); without registering it, ~90 compendium items show a
// BLANK rarity on the sheet. Register at setup — i18n is ready and dnd5e has
// finished building its own config.
export function registerItemRarity() {
  Hooks.once("setup", () => {
    const rarities = CONFIG?.DND5E?.itemRarity;
    if (!rarities) {
      console.warn("ME5e | dnd5e itemRarity config unavailable; spectre rarity skipped.");
      return;
    }
    if (!("spectre" in rarities)) rarities.spectre = game.i18n.localize("ME5E.ItemRarity.Spectre");
  });
}
