import { MODULE_ID, ME5E } from "./config.mjs";
import { applyDotEffect } from "./combos.mjs";

// Power combo metadata is read straight off the item's flags, which the build
// derives from each power's authoritative source `primes`/`detonates` fields.
// A selected advanced-version that adds priming (Singularity → Damage primes
// necrotic, BEC Field → Cold Aura primes cold, Cryo Blast → Frigid Air, Sabotage
// → Primed) overrides the base primer when chosen.
export function getPowerMetadata(item) {
  let primer = item.getFlag(MODULE_ID, "power.primer") ?? null;
  const chosen = item.getFlag(MODULE_ID, "power.advancement");
  if (chosen) {
    const advs = item.getFlag(MODULE_ID, "power.advancements");
    const adv = Array.isArray(advs) ? advs.find((a) => a?.id === chosen) : null;
    if (adv?.primer) primer = adv.primer;
  }
  return {
    category: item.getFlag(MODULE_ID, "power.category") ?? null,
    primer,
    detonator: item.getFlag(MODULE_ID, "power.detonator") ?? null,
    selfBuff: item.getFlag(MODULE_ID, "power.selfBuff") ?? false
  };
}

export function isPower(item) {
  return !!item.getFlag(MODULE_ID, "power.category");
}

// A power's "cast" is the use of its base activity; rider/extra activities
// (advanced-version add-ons — bleed damage, condition-save buttons) share the
// item and would otherwise re-trigger combo logic when their card
// buttons are clicked. Identify riders by the advancement metadata's
// `override.extraActivityIds` (order-independent, unlike "first in the
// collection"); the base cast is never listed there. Falls back to the
// first-activity heuristic only when no advancement metadata is present.
export function isPrimaryActivity(activity) {
  const item = activity?.item;
  if (!item) return true;
  const advs = item.getFlag?.(MODULE_ID, "power.advancements");
  if (Array.isArray(advs)) {
    const riders = new Set(advs.flatMap((a) => a?.override?.extraActivityIds ?? []));
    return !riders.has(activity.id);
  }
  const acts = item.system?.activities;
  return !acts || (activity.id === acts.contents?.[0]?.id);
}

// ME5e powers are dnd5e spells; their `system.school` is the power category.
// Register Biotic / Combat / Tech as spell schools so the spellbook labels and
// groups them (additive — the stock dnd5e schools are left intact).
const ME5E_POWER_SCHOOLS = {
  biotic: { label: "Biotic", fullKey: "biotic", icon: "icons/magic/control/energy-stream-link-blue.webp" },
  combat: { label: "Combat", fullKey: "combat", icon: "icons/skills/ranged/target-bullseye-arrow-red.webp" },
  tech: { label: "Tech", fullKey: "tech", icon: "icons/magic/lightning/bolt-strike-blue.webp" }
};

export function registerPowerSchools() {
  const schools = CONFIG.DND5E?.spellSchools;
  if (!schools) return;
  Object.assign(schools, ME5E_POWER_SCHOOLS);
}

// The inner HTML of a power's "Primes / Detonates" cell: the primer it applies
// (element icon) and a burst icon if it's a detonator — icons only, with hover
// tooltips, so the column stays compact. Empty for non-combo powers. Shared by
// the spellbook column helper and any other caller.
export function renderPowerComboCell(item) {
  let meta;
  try {
    meta = getPowerMetadata(item);
  } catch {
    return "";
  }
  const parts = [];
  const primer = meta.primer && ME5E.primers[meta.primer];
  if (primer) {
    const label = game.i18n.localize(primer.label);
    parts.push(
      `<img class="me5e-combo-icon me5e-combo-primer" src="${primer.icon}" alt=""`
      + ` data-tooltip="${game.i18n.format("ME5E.Primer.PrimesTooltip", { primer: label })}">`
    );
  }
  if (meta.detonator) {
    parts.push(
      `<i class="fa-solid fa-burst me5e-combo-det" data-tooltip="${game.i18n.localize("ME5E.Primer.DetonatesTooltip")}"></i>`
    );
  }
  return parts.join("");
}

// Repurpose dnd5e's spellbook "School" column as "Primes / Detonates". The
// column descriptor lives on the InventoryElement custom element and is
// deep-cloned per section by mapColumns(), so mutating it here (before any
// sheet renders) reskins the column for every powercasting section uniformly.
export function registerPowerComboColumn() {
  const InventoryElement = globalThis.dnd5e?.applications?.components?.InventoryElement
    ?? customElements.get("dnd5e-inventory");
  const school = InventoryElement?.COLUMNS?.school;
  if (!school) {
    console.warn("ME5e | InventoryElement.COLUMNS.school not found; Primes/Detonates column disabled.");
    return;
  }
  // Empty label: the long "Primes / Detonates" text won't fit a compact column,
  // so the header is rendered as an icon + tooltip via the sheet injector
  // (injectComboHeaders in sheets/inject.mjs). Width feeds the resize math; the
  // visible width is the .item-school CSS rule (overridden in me5e.css).
  school.label = "";
  school.width = 60;
  school.priority = 750; // survive responsive column-culling (was 100)
  // A real file path: dnd5e exposes COLUMNS templates via InventoryElement.templates,
  // which the sheet feeds to Foundry's template preloader — a bare partial name would
  // be fetched as a URL and 404. The cell markup mirrors dnd5e's columns/school.hbs
  // and defers to the helper so the content logic stays in JS.
  school.template = "modules/me5e/templates/columns/power-combo.hbs";

  Handlebars.registerHelper(
    "me5ePowerCombo",
    (item) => new Handlebars.SafeString(renderPowerComboCell(item))
  );
}

// The canonical ME5e full-powercaster slot table, indexed by character level:
// ME_POWER_SLOT_TABLE[level - 1] = [slots of power level 1, 2, 3, 4, 5]. This is
// the Adept/Explorer/Sentinel/Vanguard progression transposed from the source
// `power_slots_by_power_level` column (gains 1st-level powers at L1, 2nd at L5,
// 3rd at L9, 4th at L13, 5th at L17). dnd5e's MultiLevelSpellcasting consumes
// table[level-1] directly. Trailing zeros are trimmed (the inner field is
// positive-only); ME slots fill contiguously from power level 1, so no gaps.
const ME_POWER_SLOT_TABLE = [
  [2],            // 1
  [4],            // 2
  [6],            // 3
  [7],            // 4
  [7, 2],         // 5
  [7, 3],         // 6
  [7, 4],         // 7
  [7, 5],         // 8
  [7, 6, 1],      // 9
  [7, 6, 2],      // 10
  [7, 6, 3],      // 11
  [7, 6, 3],      // 12
  [7, 6, 3, 1],   // 13
  [7, 6, 3, 1],   // 14
  [7, 6, 3, 2],   // 15
  [7, 6, 3, 2],   // 16
  [7, 6, 3, 2, 1],// 17
  [7, 6, 4, 2, 1],// 18
  [7, 6, 5, 2, 1],// 19
  [7, 6, 5, 3, 1] // 20
];

// The Explorer prepared-caster slot table (its own progression, capped at 2nd
// level), transposed from the source `slots` arrays: table[level-1] = [p1, p2].
const ME_PREPARED_TABLE = [
  [2], [4], [6], [7], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 6],
  [7, 6], [7, 6], [7, 6], [7, 6], [7, 6], [7, 6], [7, 6], [7, 6], [7, 6], [7, 6]
];

// The Vanguard half-caster slot table — its OWN canonical per-level slot arrays
// (source `slots`), transposed to table[level-1] = [p1, p2, p3] with trailing
// zeros trimmed (the inner field is positive-only; L1 has 0 slots → []). Unlike
// Adept (full, ÷1 on ME_POWER_SLOT_TABLE), the half progression is BAKED into
// this table at ÷1 rather than derived via ÷2 on the shared full table — the
// divisor approach diverged from the source at L1/L3/L6 (ceil rounding gave 2/4/6
// where the book has 0/3/7). Mirrors how Explorer gets its own ME_PREPARED_TABLE.
const ME_VANGUARD_SLOT_TABLE = [
  [],          // 1  (cantrips only)
  [2],         // 2
  [3],         // 3
  [4],         // 4
  [6],         // 5
  [7],         // 6
  [7],         // 7
  [7],         // 8
  [7, 2],      // 9
  [7, 2],      // 10
  [7, 3],      // 11
  [7, 3],      // 12
  [7, 4],      // 13
  [7, 4],      // 14
  [7, 5],      // 15
  [7, 5],      // 16
  [7, 6, 1],   // 17
  [7, 6, 1],   // 18
  [7, 6, 2],   // 19
  [7, 6, 2]    // 20
];

// The Sentinel pact-style table: caster level → { slots, level } (all slots are
// the same power level), from the source `numSlots` / `slotLevel` arrays. Only
// change points are listed; SingleLevelSpellcasting picks the highest key ≤ level.
const ME_PACT_TABLE = {
  1: { slots: 1, level: 1 },
  2: { slots: 2, level: 1 },
  5: { slots: 2, level: 2 },
  9: { slots: 2, level: 3 },
  11: { slots: 3, level: 3 },
  17: { slots: 4, level: 3 }
};

// Register ME5e powercasting methods on dnd5e. Powers are dnd5e spells; class
// items set `system.spellcasting.progression` to the matching key. dnd5e's
// SpellcastingModel.fromConfig() (run at i18nInit, after our init) turns these
// into spellcasting models and publishes the progression keys into
// CONFIG.DND5E.spellProgression.
export function registerPowercasting() {
  if (!CONFIG.DND5E?.spellcasting) return;
  // Full known slot-caster (Adept): multi-level slots in spells.power1-5;
  // `prepares:false` → known powers castable without preparation (sorcerer-style).
  // power-third (the 0.25 Biotic Scar subclass) shares this full table via ÷3 — an
  // approximation, but no canonical single-class third-caster table exists to bake.
  CONFIG.DND5E.spellcasting.power = {
    label: "ME5E.Powercasting.Label",
    type: "multi",
    cantrips: true,
    prepares: false,
    table: ME_POWER_SLOT_TABLE,
    progression: {
      "power-full": { label: "ME5E.Powercasting.Full", divisor: 1 },
      "power-third": { label: "ME5E.Powercasting.Third", divisor: 3 }
    }
  };
  // Half known slot-caster (Vanguard): its own bespoke table at ÷1 (not the shared
  // full table at ÷2 — see ME_VANGUARD_SLOT_TABLE). Slots in spells["power-half"1-3].
  CONFIG.DND5E.spellcasting["power-half"] = {
    label: "ME5E.Powercasting.Label",
    type: "multi",
    cantrips: true,
    prepares: false,
    table: ME_VANGUARD_SLOT_TABLE,
    progression: {
      "power-half": { label: "ME5E.Powercasting.Half", divisor: 1 }
    }
  };
  // Pact-style known caster (Sentinel): single-level slots in spells["power-pact"].
  CONFIG.DND5E.spellcasting["power-pact"] = {
    label: "ME5E.Powercasting.PactLabel",
    type: "single",
    cantrips: true,
    prepares: false,
    table: ME_PACT_TABLE,
    progression: {
      "power-pact-full": { label: "ME5E.Powercasting.PactLabel", divisor: 1 }
    }
  };
  // Prepared slot-caster (Explorer): multi-level slots; `prepares:true` →
  // powers are prepared from the class list up to spellcasting.preparation.max.
  CONFIG.DND5E.spellcasting["power-prepared"] = {
    label: "ME5E.Powercasting.PreparedLabel",
    type: "multi",
    cantrips: false,
    prepares: true,
    table: ME_PREPARED_TABLE,
    progression: {
      "power-prepared-full": { label: "ME5E.Powercasting.PreparedLabel", divisor: 1 }
    }
  };
  // Point-based caster (Engineer/Infiltrator/Musician/Tracker): a multi-level
  // method so powers group by power level and dnd5e's "cast at level" dialog
  // serves as the upcast (spend-more-points) selector. The empty table is
  // replaced per-actor by powerPoints.mjs (preparePower-pointsSlots) with one
  // marker slot per power level up to the class's Tech Point Limit; the
  // powerPoints hooks then spend points = the chosen level instead of a slot.
  CONFIG.DND5E.spellcasting["power-points"] = {
    label: "ME5E.PowerPoints.Label",
    type: "multi",
    cantrips: false, // tech point-casters have no cantrips → no empty Cantrips section
    prepares: true,
    table: [],
    progression: {
      "power-points-full": { label: "ME5E.PowerPoints.Label", divisor: 1 }
    }
  };

  // ME spell-slot methods aren't in dnd5e's default rest recovery (only
  // spell/pact), so without this ME slots would never refill. Power slots
  // refill on a long rest; pact slots also on a short rest (warlock-style).
  const rest = CONFIG.DND5E.restTypes;
  rest?.long?.recoverSpellSlotTypes?.add("power").add("power-half").add("power-pact").add("power-prepared");
  rest?.short?.recoverSpellSlotTypes?.add("power-pact");

  // Enforce prepared-power limits (dnd5e only displays them) and strip spell
  // scrolls (not part of ME5e).
  Hooks.on("preUpdateItem", onPreparePower);
  Hooks.on("preUpdateItem", onSelectEnhancement);
  Hooks.on("getItemContextOptions", removeScrollOption);
  Hooks.on("dnd5e.preCreateScrollFromSpell", blockPowerScroll);
  Hooks.on("dnd5e.preCreateScrollFromCompendiumSpell", blockPowerScroll);

  // The spellcasting configs above become SpellcastingModel instances at
  // i18nInit (SpellcastingModel.fromConfig); patch the instances at setup.
  Hooks.once("setup", () => {
    patchCantripSlotKey();
    patchDualCastingAbility();
  });
}

// dnd5e's _prepareSpellbook hard-registers the cantrip section under the literal
// key "spell0" (it assumes the cantrip-bearing method's key is "spell", as it is
// for dnd5e's own caster). But MultiLevelSpellcasting.getSpellSlotKey returns
// `${key}${level}`, so an ME slot-caster (key "power") routes its cantrips to a
// "power0" section instead — producing TWO cantrip headers: an empty "spell0" at
// the top and a populated "power0" below the leveled powers. The base
// SlotSpellcasting.getSpellSlotKey already maps level 0 → "spell0"; restore that
// on our cantrip-bearing power models so power cantrips land in the one native
// cantrip section. (SingleLevel methods like power-pact already inherit the base
// mapping, so this only touches the multi-level "power"/"power-half" methods.)
function patchCantripSlotKey() {
  for ( const config of Object.values(CONFIG.DND5E?.spellcasting ?? {}) ) {
    if ( !config?.cantrips || (typeof config.getSpellSlotKey !== "function") ) continue;
    if ( config.getSpellSlotKey(0) === "spell0" ) continue;
    const inner = config.getSpellSlotKey.bind(config);
    config.getSpellSlotKey = (level) => (level === 0) ? "spell0" : inner(level);
  }
}

// Dual-ability casters (Sentinel: WIS or INT) let the player choose their
// powercasting ability when learning powers — the ItemChoice ability picker
// stamps the pick onto each power, so individual power attack/save DCs are
// already correct. But the class's `spellcasting.ability` is a single static
// value ("wis"), so the class sheet's Spellcasting card would always show a WIS
// DC even for an INT build. Wrap ClassData.prepareFinalData (which feeds the
// card via SpellcastingField.prepareData) to substitute the player's actual
// pick — read from the class's own ItemChoice advancement selections — for any
// class flagged `me5e.castingAbilityOptions`. Derived-only: no persistent write.
let _castingAbilityWrapped = false;
function patchDualCastingAbility() {
  if (_castingAbilityWrapped) return;
  const proto = CONFIG.Item?.dataModels?.class?.prototype;
  if (typeof proto?.prepareFinalData !== "function") {
    console.warn("ME5e | ClassData.prepareFinalData not found; dual casting-ability sync disabled.");
    return;
  }
  const original = proto.prepareFinalData;
  proto.prepareFinalData = function () {
    try {
      const opts = this.parent?.getFlag?.("me5e", "castingAbilityOptions");
      if (Array.isArray(opts) && opts.length > 1 && this.parent?.actor) {
        const chosen = chosenCastingAbility(this.parent, opts);
        if (chosen) this.spellcasting.ability = chosen;
      }
    } catch (err) {
      console.warn("ME5e | dual casting-ability sync failed:", err);
    }
    return original.call(this);
  };
  _castingAbilityWrapped = true;
}

// The ability a dual-ability caster actually uses, read from the picks stored on
// the class's ItemChoice advancements (value.ability) by the level-up ability
// dropdown. Returns the most-chosen option, or null if nothing's been picked yet
// (then the class keeps its static default).
function chosenCastingAbility(classItem, options) {
  const opts = new Set(options);
  const tally = new Map();
  for (const adv of classItem.advancement?.byType?.ItemChoice ?? []) {
    const ab = adv.value?.ability;
    if (ab && opts.has(ab)) tally.set(ab, (tally.get(ab) ?? 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [ab, n] of tally) if (n > bestN) { best = ab; bestN = n; }
  return best;
}

const POWER_SCHOOLS = new Set(["biotic", "combat", "tech"]);
const PREPARED_METHODS = new Set(["power-prepared", "power-points"]);
// Known casters spend a fixed number of "powers known" picks; prepared/point
// casters spend prepared slots. Either way an enhancement costs one extra pick.
const KNOWN_METHODS = new Set(["power", "power-half", "power-pact"]);
const isPowerData = (data) => POWER_SCHOOLS.has(data?.system?.school);

// dnd5e shows "prepared X / max" but never blocks over-preparing. For ME
// prepared casters, refuse to prepare a power beyond the class's preparation
// max (cantrips and always-prepared powers don't count).
function onPreparePower(item, changes) {
  if (item.type !== "spell") return;
  if (foundry.utils.getProperty(changes, "system.prepared") !== 1) return;
  if ((item.system.level ?? 0) === 0) return;
  const actor = item.actor;
  if (!actor || !PREPARED_METHODS.has(item.system.method)) return;
  const classes = actor.spellcastingClasses ?? {};
  // Prefer the spell's own class; fall back to the class using this method.
  const cls = classes[item.system.classIdentifier]
    ?? Object.values(classes).find((c) => c.system?.spellcasting?.type === item.system.method);
  const max = cls?.system?.spellcasting?.preparation?.max;
  if (!max) return;
  const prepared = actor.items.filter((i) =>
    (i.id !== item.id) && (i.type === "spell") && (i.system.method === item.system.method)
    && ((i.system.level ?? 0) > 0) && (i.system.prepared === 1)).length;
  if (prepared >= max) {
    ui.notifications.warn(game.i18n.format("ME5E.Powercasting.PrepLimit", { max }));
    return false;
  }
}

// ─── Power enhancement budget ──────────────────────────────────────────────
// Selecting a power's advanced version (flags.me5e.power.advancement) costs one
// pick, exactly as if you'd learned an extra power — the rulebook lets you
// augment a power INSTEAD of learning a new one (manual/learning-spells.md).
// Cantrips and leveled powers are SEPARATE pools (the class progression tracks
// "Cantrips Known" and "Powers Known" independently), so each is budgeted on its
// own: (cantrips + cantrip augments) ≤ cantrips-known, and (leveled/prepared
// powers + power augments) ≤ powers-known / preparation max.

// The casting class for a power: prefer its own class, else any class using the
// same method (mirrors onPreparePower).
function powerClass(actor, item) {
  const classes = actor?.spellcastingClasses ?? {};
  return classes[item.system?.classIdentifier]
    ?? Object.values(classes).find((c) => c.system?.spellcasting?.type === item.system?.method)
    ?? null;
}

// Cumulative pick count from a class's spell ItemChoice advancements at its
// current level. `cantrip` selects which pool: cantrips are the level-"0"
// restriction pickers ("Cantrips Known"); powers are the non-cantrip spell
// pickers ("Powers Known", restriction.level ""). Gear pickers (type "") are
// ignored. Returns null when the class has no picker of that pool (e.g. prepared
// casters have no powers-known picker → caller falls back to the prep max; point
// casters have no cantrips).
function sumSpellChoices(classItem, { cantrip }) {
  const level = classItem?.system?.levels ?? 0;
  const advs = classItem?.advancement?.byType?.ItemChoice ?? [];
  let total = 0;
  let found = false;
  for (const adv of advs) {
    const cfg = adv.configuration ?? {};
    if (cfg.type !== "spell") continue;
    const isCantripPicker = (cfg.restriction?.level ?? "") === "0";
    if (cantrip !== isCantripPicker) continue;
    if (!cantrip && !String(adv.title ?? "").startsWith("Powers Known")) continue;
    found = true;
    for (const [lvl, c] of Object.entries(cfg.choices ?? {})) {
      if (Number(lvl) <= level) total += (c?.count ?? 0);
    }
  }
  return found ? total : null;
}
const getKnownLimit = (classItem) => sumSpellChoices(classItem, { cantrip: false });
const getCantripLimit = (classItem) => sumSpellChoices(classItem, { cantrip: true });

// Picks consumed in one pool of a casting method, split into base powers and the
// enhancements layered on them. `cantrip` counts level-0 powers; otherwise
// leveled powers (prepared/point methods count only prepared=1). Each selected
// enhancement is an extra pick on top of its power.
function powerPickBreakdown(actor, method, { cantrip = false } = {}) {
  let powers = 0;
  let enhancements = 0;
  for (const i of actor.items) {
    if (i.type !== "spell" || i.system.method !== method) continue;
    const lvl = i.system.level ?? 0;
    if (cantrip ? (lvl !== 0) : (lvl === 0)) continue;
    if (!cantrip && PREPARED_METHODS.has(method) && i.system.prepared !== 1) continue;
    powers += 1;
    if (i.getFlag(MODULE_ID, "power.advancement")) enhancements += 1;
  }
  return { powers, enhancements };
}

// Budget for the pool a given power belongs to: { limit, used, method, cantrip }
// or null when it can't be determined (unknown class / no limit → don't
// enforce). A cantrip draws on the cantrips-known pool; a leveled power on the
// powers-known / preparation pool. `used` counts the target power's base pick but
// not its (still-empty) enhancement — the guard adds +1 for the new one.
function getEnhancementBudget(actor, item) {
  const method = item.system?.method;
  if (!method) return null;
  const cls = powerClass(actor, item);
  const cantrip = (item.system?.level ?? 0) === 0;
  let limit = null;
  if (cantrip) limit = getCantripLimit(cls);
  else if (PREPARED_METHODS.has(method)) limit = cls?.system?.spellcasting?.preparation?.max ?? null;
  else if (KNOWN_METHODS.has(method)) limit = getKnownLimit(cls);
  if (!limit) return null;
  const { powers, enhancements } = powerPickBreakdown(actor, method, { cantrip });
  return { limit, used: powers + enhancements, method, classItem: cls, cantrip };
}

// Per casting class, the cantrip + power budgets for the sheet indicator (one
// row per pool that the class actually has).
export function getPowerBudgets(actor) {
  const out = [];
  for (const [classId, cls] of Object.entries(actor?.spellcastingClasses ?? {})) {
    const method = cls.system?.spellcasting?.type;
    if (!method || (!KNOWN_METHODS.has(method) && !PREPARED_METHODS.has(method))) continue;
    // Leveled powers pool.
    const powerLimit = PREPARED_METHODS.has(method)
      ? cls.system?.spellcasting?.preparation?.max ?? null
      : getKnownLimit(cls);
    if (powerLimit) {
      const { powers, enhancements } = powerPickBreakdown(actor, method, { cantrip: false });
      out.push({ classId, label: cls.name, method, pool: "powers", limit: powerLimit, powers, enhancements, used: powers + enhancements });
    }
    // Cantrips pool (known casters that learn a fixed number of cantrips).
    const cantripLimit = getCantripLimit(cls);
    if (cantripLimit) {
      const { powers, enhancements } = powerPickBreakdown(actor, method, { cantrip: true });
      out.push({ classId, label: cls.name, method, pool: "cantrips", limit: cantripLimit, powers, enhancements, used: powers + enhancements });
    }
  }
  return out;
}

// Hard-block selecting an enhancement that would exceed the pool's budget
// (cantrips and powers tracked separately). Clearing or switching an existing
// enhancement is net-zero and never blocked.
function onSelectEnhancement(item, changes) {
  if (item.type !== "spell") return;
  const path = `flags.${MODULE_ID}.power.advancement`;
  if (!foundry.utils.hasProperty(changes, path)) return;
  const next = foundry.utils.getProperty(changes, path);
  if (!next) return; // unsetting / clearing
  if (item.getFlag(MODULE_ID, "power.advancement")) return; // switching A→B
  const actor = item.actor;
  if (!actor) return;
  const budget = getEnhancementBudget(actor, item);
  if (!budget) return; // GM-trusted when class/limit can't be resolved
  // `used` already counts this power's base pick; the new enhancement is +1.
  if (budget.used + 1 > budget.limit) {
    const key = budget.cantrip ? "ME5E.Powercasting.EnhanceLimitCantrip" : "ME5E.Powercasting.EnhanceLimit";
    ui.notifications.warn(game.i18n.format(key, { max: budget.limit }));
    return false;
  }
}

// Remove the core "Create Scroll" directory context option (ME5e has no scrolls).
function removeScrollOption(_app, options) {
  const i = options.findIndex((o) => o?.name === "DND5E.Scroll.CreateScroll");
  if (i >= 0) options.splice(i, 1);
}

// Block scroll creation from a power (safety net for any other entry point).
function blockPowerScroll(itemData) {
  if (isPowerData(itemData)) return false;
}


// ─── Power advancement (advanced-version) options ──────────────────────────
// Each power carries two advancement options (flags.me5e.power.advancements).
// A dropdown on the spellbook row (sheets/inject.mjs) stores the chosen id in
// flags.me5e.power.advancement; here we apply that option's mechanical override
// to the power's derived data so the sheet/cast reflect it. GM-trusted: the
// rulebook cost (a known pick / 2 prepared slots) is not auto-enforced.

// Apply the selected advancement's precomputed `override` to the power's
// derived data. The build (powerActivities.buildAdvancementOverrides) does all
// the mechanic interpretation, so this just assigns fields: item-level (range,
// duration, concentration, uses) and activity-level (damage parts, save). When
// the option has no override (transform/condition/combo), nothing changes and
// the dropdown's text is the only effect.
function applyAdvancementOverride(spellData) {
  const item = spellData?.parent;
  const advs = item?.getFlag?.(MODULE_ID, "power.advancements");
  if (!Array.isArray(advs) || !advs.length) return;
  const chosen = item.getFlag(MODULE_ID, "power.advancement");

  // Add-on extras (damage + save activities) ship in the item source; keep only
  // the chosen option's and prune the rest so the card shows just the active
  // one's buttons.
  for (const a of advs) {
    if (a.id === chosen) continue;
    for (const exId of a?.override?.extraActivityIds ?? []) spellData.activities?.delete?.(exId);
  }
  // A transform option (Ice Lance) replaces the base activity: drop it so the
  // power BECOMES the transform (e.g. casts as the lance attack, not the blast).
  const replaceId = (chosen ? advs.find((a) => a?.id === chosen) : null)?.override?.replacesActivityId;
  if (replaceId) spellData.activities?.delete?.(replaceId);

  const ov = (chosen ? advs.find((a) => a?.id === chosen) : null)?.override;
  if (!ov) return;

  // Item-level fields.
  if (ov.range) { spellData.range.value = ov.range.value; spellData.range.units = ov.range.units; }
  if (ov.duration) { spellData.duration.value = ov.duration.value; spellData.duration.units = ov.duration.units; }
  if (typeof ov.concentration === "boolean") {
    spellData.duration.concentration = ov.concentration;
    const props = spellData.properties;
    if (props instanceof Set) ov.concentration ? props.add("concentration") : props.delete("concentration");
  }
  if (ov.uses) {
    if (ov.uses.max != null) spellData.uses.max = ov.uses.max;
    if (ov.uses.per) spellData.uses.recovery = [{ period: ov.uses.per, type: "recoverAll", formula: "" }];
  }

  // Activity-level fields. Damage parts MUST be real DamageData instances —
  // prepareFinalData calls activity.toObject(), which fails on plain objects
  // ("value.toObject is not a function"). Build them via dnd5e's DamageData
  // class (the rider-damage case has an empty base parts array, so there's no
  // existing part to clone from). If the class isn't available, skip rather
  // than inject plain objects.
  const activities = spellData.activities ? [...spellData.activities] : [];
  if (ov.damage?.length) {
    const act = activities.find((a) => a?.damage && Array.isArray(a.damage.parts));
    // Get the DamageData class: an existing part's class if present, else the
    // activity's own schema field model (reliable even when base parts is empty,
    // i.e. rider damage — no dependency on a global API path).
    const DamageData = act?.damage.parts[0]?.constructor
      ?? act?.schema?.fields?.damage?.fields?.parts?.element?.model
      ?? globalThis.dnd5e?.dataModels?.shared?.DamageData;
    if (act && DamageData) {
      act.damage.parts = ov.damage.map((p) => new DamageData(foundry.utils.deepClone(p), { parent: act }));
    }
  }
  if (ov.save?.ability) {
    const act = activities.find((a) => a?.save && ("ability" in a.save));
    if (act) act.save.ability = new Set(ov.save.ability);
  }
}

// Save targets: controlled tokens, else the user's assigned character. Mirrors
// dnd5e's getSceneTargets so the injected save button behaves like a native one.
function advSaveTargets() {
  let tokens = canvas?.tokens?.controlled?.filter((t) => t.actor) ?? [];
  if (!tokens.length && game.user?.character) tokens = game.user.character.getActiveTokens();
  return tokens.map((t) => (t instanceof Actor ? t : t.actor)).filter(Boolean);
}

// Add buttons to a power's cast card for the selected add-on advancement's extra
// activities (bleed damage, a condition's save DC, …) so the roll mechanic lives
// on the same card as the attack/damage. The activities also stay on the sheet
// for later re-rolls. Status effects (stun/prone) remain player-applied.
function injectExtraActivityButtons(message, html) {
  try {
    const el = html instanceof HTMLElement ? html : html?.[0];
    const buttons = el?.querySelector(".card-buttons");
    if (!buttons || buttons.querySelector(".me5e-extra-activity")) return;
    const item = message.getAssociatedItem?.();
    if (!item || item.type !== "spell") return;
    const chosen = item.getFlag(MODULE_ID, "power.advancement");
    if (!chosen) return;
    const advs = item.getFlag(MODULE_ID, "power.advancements");
    const adv = Array.isArray(advs) ? advs.find((a) => a?.id === chosen) : null;
    const ids = adv?.override?.extraActivityIds;
    if (!Array.isArray(ids) || !ids.length) return;
    const usedId = message.getAssociatedActivity?.()?.id;
    const sampleClass = buttons.querySelector("button")?.className ?? "";

    for (const exId of ids) {
      if (exId === usedId) continue; // don't re-add on the extra's own card
      const extra = item.system.activities?.get(exId);
      if (!extra) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `me5e-extra-activity ${sampleClass}`.trim();

      if (extra.type === "save") {
        const ability = extra.save?.ability?.first?.() ?? [...(extra.save?.ability ?? [])][0];
        const dc = extra.save?.dc?.value;
        const abLabel = CONFIG.DND5E.abilities[ability]?.abbreviation?.toUpperCase() ?? String(ability ?? "").toUpperCase();
        btn.innerHTML = `<i class="fa-solid fa-shield-heart" inert></i> ${adv.name} (DC ${dc ?? "?"} ${abLabel})`;
        btn.addEventListener("click", async (event) => {
          const targets = advSaveTargets();
          if (!targets.length) { ui.notifications.warn(game.i18n.localize("DND5E.ActionWarningNoToken")); return; }
          for (const actor of targets) await actor.rollSavingThrow({ event, ability, target: dc }, {}, {});
        });
      } else if (extra.type === "attack") {
        btn.innerHTML = `<i class="dnd5e-icon" data-src="systems/dnd5e/icons/svg/trait-weapon-proficiencies.svg" inert></i> ${adv.name}`;
        btn.addEventListener("click", (event) => extra.use({ event }));
      } else {
        btn.innerHTML = `<i class="fa-solid fa-burst" inert></i> ${adv.name}`;
        btn.addEventListener("click", (event) => extra.rollDamage({ event }));
      }
      buttons.appendChild(btn);
    }
  } catch (err) {
    console.warn("ME5e | extra-activity button injection failed:", err);
  }
}

// Add an "Apply <Type> DoT" button to a power's cast card when it grants a
// recurring damage-over-time — on the BASE power (Dark Channel, always) or via
// the SELECTED advancement (Singularity/Dominate "Damage"). Clicking applies the
// DoT effect to the targeted tokens; combos.mjs ticks it each round. The "whose
// turn / bypass shields" semantics ride on the descriptor.
function injectDotButton(message, html) {
  try {
    const el = html instanceof HTMLElement ? html : html?.[0];
    const buttons = el?.querySelector(".card-buttons");
    if (!buttons || buttons.querySelector(".me5e-dot-apply")) return;
    const item = message.getAssociatedItem?.();
    if (!item || item.type !== "spell") return;
    // Only the primary cast card carries the DoT (not a rider activity's card).
    if (!isPrimaryActivity(message.getAssociatedActivity?.())) return;

    const power = item.getFlag(MODULE_ID, "power");
    let dot = power?.dot ?? null;
    if (!dot) {
      const chosen = power?.advancement;
      const adv = Array.isArray(power?.advancements) ? power.advancements.find((a) => a?.id === chosen) : null;
      dot = adv?.dot ?? null;
    }
    if (!dot?.formula) return;

    const source = item.actor;
    const typeLabel = CONFIG.DND5E.damageTypes?.[dot.type]?.label
      ?? (dot.type ? dot.type[0].toUpperCase() + dot.type.slice(1) : "");
    const sampleClass = buttons.querySelector("button")?.className ?? "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `me5e-dot-apply ${sampleClass}`.trim();
    btn.innerHTML = `<i class="fa-solid fa-biohazard" inert></i> ${game.i18n.format("ME5E.Dot.Apply", { type: typeLabel })}`;
    btn.addEventListener("click", async () => {
      const targets = Array.from(game.user?.targets ?? []).map((t) => t.actor).filter(Boolean);
      if (!targets.length) { ui.notifications.warn(game.i18n.localize("ME5E.Primer.NoTarget")); return; }
      for (const target of targets) {
        try {
          await applyDotEffect(target, dot, source, item.name);
        } catch (err) {
          console.error("ME5e | apply DoT failed for", target?.name, err);
          ui.notifications.error(game.i18n.format("ME5E.Primer.ApplyFailed", { actor: target?.name ?? "?" }));
        }
      }
    });
    buttons.appendChild(btn);
  } catch (err) {
    console.warn("ME5e | DoT button injection failed:", err);
  }
}

let _advWrapped = false;
export function registerPowerAdvancements() {
  if (_advWrapped) return;
  // Wrap at setup — CONFIG.Item.dataModels.spell exists by then. Apply the
  // override BEFORE the original so any label computation sees the new values.
  Hooks.once("setup", () => {
    const proto = CONFIG.Item?.dataModels?.spell?.prototype;
    if (typeof proto?.prepareDerivedData !== "function") {
      console.warn("ME5e | SpellData.prepareDerivedData not found; power advancements disabled.");
      return;
    }
    const original = proto.prepareDerivedData;
    proto.prepareDerivedData = function () {
      try { applyAdvancementOverride(this); } catch (err) { console.warn("ME5e | advancement override failed:", err); }
      return original.call(this);
    };
    _advWrapped = true;
  });
  // Cast-card buttons for add-on extras (bleed damage, condition save DC).
  Hooks.on("dnd5e.renderChatMessage", injectExtraActivityButtons);
  // "Apply DoT" button for powers that grant a recurring damage-over-time.
  Hooks.on("dnd5e.renderChatMessage", injectDotButton);
}
