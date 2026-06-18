// ME5e point-based powercasting (Engineer / Infiltrator / Musician / Tracker).
//
// dnd5e has no spell points, so these classes use a custom pool: casting a power
// of level N spends N points (capped by a per-level `limit`), refilling on a
// long rest. The class is registered as a no-slot prepared caster (the
// `power-points` spellcasting method), and these hooks divert leveled-power
// casts off spell slots and onto the points pool.
//
// Pool size + limit scale with class level and come from ScaleValue advancements
// on the class (`@scale.<class>.power-points` / `power-point-limit`), read here
// from the actor's roll data. The current value lives in flags.me5e.powerPoints.

import { MODULE_ID } from "./config.mjs";

const PROGRESSION = "power-points-full";
const METHOD = "power-points";
const MAX_POWER_LEVEL = 9;

const num = (v) => Number(v?.value ?? v) || 0;

// The actor's point-caster class + its pool max / per-cast spend limit at the
// current level (null if not a point caster). Read from the class item's scale
// values (safe during data prep, unlike getRollData).
function pointCaster(actor) {
  const classes = actor?.spellcastingClasses ?? {};
  for (const [id, cls] of Object.entries(classes)) {
    if (cls?.system?.spellcasting?.progression !== PROGRESSION) continue;
    const sv = cls.scaleValues ?? {};
    return { id, cls, max: num(sv["power-points"]), limit: num(sv["power-point-limit"]) };
  }
  return null;
}

// Replace the (empty) power-points slot table with one marker slot per power
// level up to the class's Tech Point Limit, so the spellbook groups powers by
// level and the "cast at level" dialog offers exactly the castable levels. No
// real slots are spent — onActivityConsumption charges the point pool instead.
function onPreparePowerPointsSlots(spells, actor) {
  const pc = pointCaster(actor);
  if (!pc) return;
  const maxLevel = Math.min(pc.limit || 0, MAX_POWER_LEVEL);
  for (let l = 1; l <= MAX_POWER_LEVEL; l++) {
    const on = l <= maxLevel;
    spells[`${METHOD}${l}`] = {
      ...(spells[`${METHOD}${l}`] || {}),
      value: on ? 1 : 0, max: on ? 1 : 0, level: l, type: METHOD,
      label: game.i18n.localize(`DND5E.SPELLCASTING.SLOTS.${METHOD}${l}`)
    };
  }
  return false; // skip dnd5e's default (empty-table) preparation
}

// Current pool { value, max, limit, classId } — value defaults to full.
export function getPowerPoints(actor) {
  const info = pointCaster(actor);
  if (!info) return { value: 0, max: 0, limit: 0, classId: null };
  const stored = actor.getFlag(MODULE_ID, "powerPoints.value");
  return { value: stored ?? info.max, max: info.max, limit: info.limit, classId: info.id };
}

export async function setPowerPoints(actor, value) {
  return actor.update({ [`flags.${MODULE_ID}.powerPoints.value`]: Math.max(0, value) });
}

// Is this activity a leveled power cast by a point-caster?
function isPointPowerCast(activity) {
  const item = activity?.item;
  return item?.type === "spell" && item.system?.method === "power-points" && (item.system?.level ?? 0) > 0;
}

// A feature whose activity spends/recovers tech points (Drone, Recharge).
function featureTechPoints(activity) {
  const tp = activity?.item?.getFlag?.(MODULE_ID, "techPoints");
  return tp && typeof tp === "object" ? tp : null;
}

// Engineer's Efficiency: the chosen power (granted by a feature flagged
// `freeCast`) may be cast for free up to a tech-point level that grows with
// class level (1 at L3, 2 at L11). Identify the granted power via its
// advancementOrigin and return the free cast level (0 = no waiver).
function freeCastLevel(actor, item) {
  const origin = item?.getFlag?.("dnd5e", "advancementOrigin");
  if (!origin || !actor) return 0;
  const featId = String(origin).split(".")[0];
  const fc = actor.items?.get?.(featId)?.getFlag?.(MODULE_ID, "freeCast");
  if (!fc?.value || typeof fc.value !== "object") return 0;
  const lvl = actor.system?.classes?.[fc.klass]?.levels
    ?? actor.getRollData?.()?.classes?.[fc.klass]?.levels ?? 0;
  let free = 0, bestKey = -1;
  for (const [k, v] of Object.entries(fc.value)) {
    const key = Number(k);
    if (lvl >= key && key > bestKey) { bestKey = key; free = Number(v) || 0; }
  }
  return free;
}

// Before use: a point-cast must not consume its (marker) spell slot — the real
// cost is points, charged in onActivityConsumption. Force `consume.spellSlot =
// false` for every shape `consume` can take, preserving other consumption.
function onPreUseActivity(activity, usageConfig) {
  // Block a tech-point feature (e.g. Drone) when the pool is short.
  const tp = featureTechPoints(activity);
  if (tp?.cost) {
    const pool = getPowerPoints(activity.actor);
    if (pool.classId && pool.value < tp.cost) {
      ui.notifications.warn(game.i18n.format("ME5E.PowerPoints.NotEnough", { name: activity.item.name, cost: tp.cost, value: pool.value }));
      return false;
    }
  }
  if (!isPointPowerCast(activity)) return;
  const c = usageConfig.consume;
  if (c === true || c == null) usageConfig.consume = { action: true, resources: true, spellSlot: false };
  else if (typeof c === "object") c.spellSlot = false;
  else usageConfig.consume = { spellSlot: false };
}

// After use: actually spend (Drone) or roll-and-recover (Recharge) tech points.
async function onPostUseTechPoints(activity) {
  const tp = featureTechPoints(activity);
  if (!tp) return;
  const actor = activity.actor ?? activity.item?.actor;
  const pool = getPowerPoints(actor);
  if (!pool.classId) return;
  if (tp.cost) {
    await setPowerPoints(actor, Math.max(0, pool.value - tp.cost));
  } else if (tp.recover) {
    const roll = await new Roll(String(tp.recover), actor.getRollData()).evaluate();
    await setPowerPoints(actor, Math.min(pool.max, pool.value + (roll.total || 0)));
    await roll.toMessage({
      flavor: game.i18n.format("ME5E.PowerPoints.Recharged", { n: roll.total }),
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }
}

// At consumption: charge the points pool. Cost = the power's (possibly upcast)
// level. Block if the level exceeds the class spend limit or the pool is short.
function onActivityConsumption(activity, usageConfig, _messageConfig, updates) {
  if (!isPointPowerCast(activity)) return;
  const actor = activity.actor;
  const pool = getPowerPoints(actor);
  if (!pool.classId) return;
  const level = (activity.item.system.level ?? 0) + (Number(usageConfig?.scaling) || 0);

  if (level > pool.limit) {
    ui.notifications.warn(game.i18n.format("ME5E.PowerPoints.OverLimit", { name: activity.item.name, limit: pool.limit }));
    return false;
  }
  // Engineer's Efficiency: a cast at or below the free level costs no points.
  // A higher-level cast spends all points as normal.
  const free = freeCastLevel(actor, activity.item);
  const cost = (free && level <= free) ? 0 : level;
  if (pool.value < cost) {
    ui.notifications.warn(game.i18n.format("ME5E.PowerPoints.NotEnough", { name: activity.item.name, cost, value: pool.value }));
    return false;
  }
  if (cost) foundry.utils.mergeObject(updates.actor ?? (updates.actor = {}), {
    [`flags.${MODULE_ID}.powerPoints.value`]: pool.value - cost
  });
}

// The cast dialog (ActivityUsageDialog) is built around spell slots/levels. For
// a point-cast there are no slots — the cost is points — so relabel it: the
// scaling selector becomes "Spend how many points?" with "N Points" options
// (the option value is `power-points<level>`; points spent == level), and the
// "Consume Power Slot?" toggle becomes "Consume Power Points?". DOM-level because
// dnd5e bakes these strings into the slot-based context.
function onRenderUsageDialog(app, html) {
  const item = app?.item ?? app?.activity?.item;
  if (item?.type !== "spell" || item.system?.method !== METHOD) return;
  const root = html instanceof HTMLElement ? html : (html?.[0] ?? app?.element);
  if (!root) return;

  const select = root.querySelector('select[name="spell.slot"]');
  if (select) {
    const label = select.closest(".form-group")?.querySelector("label");
    if (label) label.textContent = game.i18n.localize("ME5E.PowerPoints.SpendLabel");
    for (const opt of select.options) {
      const n = Number(/(\d+)$/.exec(opt.value)?.[1]);
      if (!n) continue;
      const unit = game.i18n.localize(`ME5E.PowerPoints.Point${n === 1 ? "One" : "Other"}`);
      opt.textContent = game.i18n.format("ME5E.PowerPoints.SpendOption", { n, unit });
    }
  }

  const consume = root.querySelector('[name="consume.spellSlot"]');
  const cLabel = consume?.closest(".form-group")?.querySelector("label");
  if (cLabel) {
    const warn = cLabel.querySelector("i"); // preserve any warning icon
    cLabel.textContent = `${game.i18n.localize("ME5E.PowerPoints.ConsumeLabel")} `;
    if (warn) cLabel.appendChild(warn);
  }
}

// Long rest refills the pool to full.
function onRestCompleted(actor, result) {
  if (!result?.longRest) return;
  const pool = getPowerPoints(actor);
  if (pool.classId && pool.value !== pool.max) setPowerPoints(actor, pool.max);
}

export function registerPowerPoints() {
  // dnd5e fires `dnd5e.prepare<Method>Slots`; for the "power-points" method that
  // is `dnd5e.preparePower-pointsSlots`.
  Hooks.on("dnd5e.preparePower-pointsSlots", onPreparePowerPointsSlots);
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.postUseActivity", onPostUseTechPoints);
  Hooks.on("dnd5e.activityConsumption", onActivityConsumption);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  Hooks.on("renderActivityUsageDialog", onRenderUsageDialog);
}
