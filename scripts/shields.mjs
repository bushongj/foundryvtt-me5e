import { MODULE_ID, ME5E } from "./config.mjs";
import { getTechArmor } from "./techArmor.mjs";
import { getArmorShieldsMax, getArmorBarriersMax, getArmorShieldsRegen } from "./armor.mjs";

export function getShields(actor) {
  // Prefer armor-derived max when any equipped chest/body piece supplies
  // shield points; fall back to the legacy flag for NPCs and unarmored PCs.
  const armorMax = getArmorShieldsMax(actor);
  const flagMax = actor.getFlag(MODULE_ID, "shields.max");
  return {
    value: actor.getFlag(MODULE_ID, "shields.value") ?? 0,
    max: armorMax > 0 ? armorMax : (flagMax ?? ME5E.shields.defaultMax)
  };
}

export function getBarriers(actor) {
  // Barrier mods (e.g. the Barrier mod's ticks) add to the actor's barrier max
  // on top of any class/flag-derived barrier.
  const base = actor.getFlag(MODULE_ID, "barriers.max") ?? ME5E.barriers.defaultMax;
  return {
    value: actor.getFlag(MODULE_ID, "barriers.value") ?? 0,
    max: base + getArmorBarriersMax(actor)
  };
}

export async function setShields(actor, { value, max } = {}) {
  const updates = {};
  if (value !== undefined) updates[`flags.${MODULE_ID}.shields.value`] = Math.max(0, value);
  if (max !== undefined) updates[`flags.${MODULE_ID}.shields.max`] = Math.max(0, max);
  return actor.update(updates);
}

export async function setBarriers(actor, { value, max } = {}) {
  const updates = {};
  if (value !== undefined) updates[`flags.${MODULE_ID}.barriers.value`] = Math.max(0, value);
  if (max !== undefined) updates[`flags.${MODULE_ID}.barriers.max`] = Math.max(0, max);
  return actor.update(updates);
}

function applyDamageTypeMultiplier(amount, damageType, layer) {
  const def = ME5E.damageTypes[damageType];
  if (!def) return amount;
  const multiplier = def.vs?.[layer] ?? 1.0;
  return Math.ceil(amount * multiplier);
}

// When a Barrier class feature is activated, fill the barrier bar to the
// feature's `barrier-ticks` scale value for the actor's current class level.
// The feature carries flags.me5e.barrier = { class, scale } (set by the build);
// the tick count is read from the actor's roll data (@scale.<class>.<id>).
async function onActivateBarrier(activity) {
  const item = activity?.item;
  const cfg = item?.flags?.[MODULE_ID]?.barrier;
  if (!cfg) return;
  const actor = activity.actor ?? item.actor;
  if (!actor) return;
  const scaleVal = actor.getRollData()?.scale?.[cfg.class]?.[cfg.scale ?? "barrier-ticks"];
  const ticks = Math.floor(Number(scaleVal?.value ?? scaleVal));
  if (!Number.isFinite(ticks) || ticks <= 0) return;
  await setBarriers(actor, { max: ticks, value: ticks });
}

// Features that spend the Barrier pool carry flags.me5e.barrierTicks = { cost }
// (Vanguard Cabal Cloak / Stunning Strike / Teleporting Dodge, Battle Master
// maneuvers). Block the use when the pool is short; spend the ticks on use.
function barrierTickCost(activity) {
  const bt = activity?.item?.getFlag?.(MODULE_ID, "barrierTicks");
  const cost = bt && typeof bt === "object" ? Number(bt.cost) : 0;
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}
function onPreUseBarrierTicks(activity) {
  const cost = barrierTickCost(activity);
  if (!cost) return;
  const actor = activity.actor ?? activity.item?.actor;
  if (!actor) return;
  if (getBarriers(actor).value < cost) {
    ui.notifications.warn(game.i18n.format("ME5E.UI.NotEnoughBarrierTicks",
      { name: activity.item?.name ?? "", cost, value: getBarriers(actor).value }));
    return false;
  }
}
async function onSpendBarrierTicks(activity) {
  const cost = barrierTickCost(activity);
  if (!cost) return;
  const actor = activity.actor ?? activity.item?.actor;
  if (!actor) return;
  await setBarriers(actor, { value: Math.max(0, getBarriers(actor).value - cost) });
}

// In ME5e, piercing/slashing/bludgeoning are the "kinetic" damage types
// (bullets, melee weapons, blunt force). This classification is informational;
// the shield bypass below keys on whether the hit was a *melee weapon attack*
// (any damage type — see distributeTyped), not on the kinetic type itself.
const KINETIC_TYPES = new Set([
  "piercing", "slashing", "bludgeoning"
]);

export function isKineticDamage(damageType) {
  return KINETIC_TYPES.has(damageType);
}

// Look at the originating chat message to decide if the incoming damage
// came from a melee weapon attack. Used so that ALL damage from a melee
// weapon attack (any type) can bypass shields (per shields.md).
function isMeleeWeaponAttack(options) {
  const message = options?.originatingMessage;
  if (!message) return false;

  const activity = typeof message.getAssociatedActivity === "function"
    ? message.getAssociatedActivity()
    : null;
  if (activity) {
    if (activity.actionType === "mwak") return true;
    const attackType = activity.attack?.type;
    if (attackType?.value === "melee") return true;
    if (typeof attackType === "string" && attackType === "melee") return true;
  }

  const item = typeof message.getAssociatedItem === "function"
    ? message.getAssociatedItem()
    : null;
  if (item?.system?.actionType === "mwak") return true;

  return false;
}

// Collect bypass keywords from the originating activity → item flags. Used
// so weapons / powers whose description says "bypasses shields" (etc.)
// route around that layer regardless of attack type. Per-rider bypass
// (Kishock bleed) is not modelled here; the flag is item-level.
export function getBypassLayers(options) {
  const out = new Set();
  // Direct bypass request from a programmatic applyDamage (e.g. a DoT tick that
  // has no originating chat message) — shields.mjs reads it the same as an
  // activity/item bypass flag.
  if (Array.isArray(options?._me5eBypass)) for (const b of options._me5eBypass) out.add(b);
  const message = options?.originatingMessage;
  if (!message) return out;

  const activity = typeof message.getAssociatedActivity === "function"
    ? message.getAssociatedActivity()
    : null;
  const actBypass = activity?.flags?.me5e?.bypass;
  if (Array.isArray(actBypass)) for (const b of actBypass) out.add(b);

  const item = typeof message.getAssociatedItem === "function"
    ? message.getAssociatedItem()
    : null;
  const sources = [
    item?.flags?.me5e?.bypass,
    item?.flags?.me5e?.weapon?.bypass,
    item?.flags?.me5e?.power?.bypass
  ];
  for (const src of sources) {
    if (Array.isArray(src)) for (const b of src) out.add(b);
  }
  return out;
}

// Route a list of typed damage components through Tech Armor → Shields
// (with melee-kinetic bypass and item-flagged bypass) → HP. Tech Armor and
// Shields are shared pools that deplete across components. Barriers are
// NOT in this chain — they're a player-rolled soak handled separately.
export function distributeTyped(actor, typed, { meleeWeaponAttack = false, bypass = new Set() } = {}) {
  let techArmorPool = bypass.has("techArmor") ? 0 : getTechArmor(actor).value;
  let shieldsPool = bypass.has("shields") ? 0 : getShields(actor).value;
  const bypassShieldsAlways = bypass.has("shields");
  const result = { techArmor: 0, shields: 0, health: 0 };

  for (const d of typed) {
    let remaining = d.value;
    if (remaining <= 0) continue;

    // 1. Tech Armor: absorbs everything 1-for-1.
    if (techArmorPool > 0) {
      const absorbed = Math.min(techArmorPool, remaining);
      techArmorPool -= absorbed;
      result.techArmor += absorbed;
      remaining -= absorbed;
    }

    // 2. Shields: stop everything EXCEPT a melee weapon attack (per shields.md
    //    "All damage resulting from a melee weapon attack bypasses shield
    //    points" — ALL of it, not just kinetic; e.g. Omni-Torch fire, Cryo
    //    Gauntlet cold, Electric Firaan's lightning rider) or item-flagged
    //    bypass. Ranged kinetic (gunfire) still hits the shield.
    const bypassShields = bypassShieldsAlways || meleeWeaponAttack;
    if (remaining > 0 && !bypassShields && shieldsPool > 0) {
      if (d.type === "lightning") {
        // ME5e: all shields are vulnerable to lightning (shields.md "Lightning
        // Damage"). Double the damage against the shield. If that removes ALL
        // shield points, subtract the shield from the doubled total and halve
        // the remainder onto HP (steps 1–4); otherwise the shield just drains at
        // the doubled rate.
        const doubled = remaining * 2;
        if (doubled <= shieldsPool) {
          shieldsPool -= doubled;
          result.shields += doubled;
          remaining = 0;
        } else {
          result.shields += shieldsPool;          // shield fully depleted
          // Halve leftover onto HP, rounding DOWN (5e "reduce by half"
          // convention; the downstream Math.ceil must not round this up).
          remaining = Math.floor((doubled - shieldsPool) / 2);
          shieldsPool = 0;
        }
      } else {
        // Every other type is 1-for-1 vs shields (lightning is the only
        // shield-multiplier type in ME5E.damageTypes).
        const absorbed = Math.min(shieldsPool, remaining);
        shieldsPool -= absorbed;
        result.shields += absorbed;
        remaining -= absorbed;
      }
    }

    // 3. HP: anything left, with the health multiplier.
    if (remaining > 0) {
      result.health += applyDamageTypeMultiplier(remaining, d.type, "health");
    }
  }

  return result;
}

// The barrier soak die for an actor. Base is 1d8 (barrier-adept et al.); Improved
// Barrier (Vanguard Battle Master L10/L18) steps the die type up to d10/d12. Both
// are stamped on the owning feature at build time (flags.me5e.barrier.die and
// flags.me5e.barrierUpgrade.dieType); we take the largest die present.
function barrierDie(actor) {
  let count = 1, type = 8, found = false;
  for (const item of actor.items) {
    const b = item.getFlag?.(MODULE_ID, "barrier");
    if (b?.die) { count = Number(b.die.count) || count; type = Math.max(type, Number(b.die.type) || 0); found = true; }
    const up = item.getFlag?.(MODULE_ID, "barrierUpgrade");
    if (up?.dieType) type = Math.max(type, Number(up.dieType) || 0);
  }
  return found ? { count, type } : { count: 1, type: 8 };
}

// Tactical Barrier (Vanguard 7) lets the player choose how many ticks to spend
// per hit (including 0). Without it, the soak is mandatory and spends exactly 1
// tick (barrier-adept.md: "remove 1 barrier tick and reduce the damage by 1d8").
function hasTacticalBarrier(actor) {
  return actor.items.some((i) => i.system?.identifier === "tactical-barrier" || i.getFlag?.(MODULE_ID, "barrierChoice"));
}

// Prompt a Tactical Barrier user for how many ticks (0..max) to spend on this hit.
async function promptBarrierTicks(actor, max, amount) {
  const content = `<p>${game.i18n.format("ME5E.UI.BarrierSoakChoose", { amount })}</p>`
    + `<p><input type="number" name="ticks" value="1" min="0" max="${max}" step="1" style="width:5em" autofocus> / ${max}</p>`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("ME5E.UI.BarrierSoakTitle") },
    content,
    rejectClose: false,
    modal: true,
    ok: { callback: (_ev, btn) => Math.max(0, Math.min(max, Number(btn.form.elements.ticks.value) || 0)) }
  });
  return result ?? 0;
}

// Barrier soak: reduce incoming damage by rolling the barrier die per tick spent.
// Mandatory (1 tick) for base Barrier; player-chosen (0..available) with Tactical
// Barrier. Runs before the absorption chain.
async function maybeSpendBarrierDie(actor, amount) {
  if (amount <= 0) return amount;
  const barriers = getBarriers(actor);
  if (barriers.value <= 0) return amount;

  const die = barrierDie(actor);
  let ticks = 1;
  if (hasTacticalBarrier(actor)) {
    ticks = await promptBarrierTicks(actor, barriers.value, amount);
    if (ticks <= 0) return amount; // chose to spend 0
  }
  ticks = Math.min(ticks, barriers.value);

  const roll = await new Roll(`${die.count * ticks}d${die.type}`).evaluate();
  const reduced = Math.max(0, amount - roll.total);
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.format("ME5E.UI.BarrierSoakFlavor", { before: amount, after: reduced })
  });
  await setBarriers(actor, { value: barriers.value - ticks });
  return reduced;
}

// dnd5e's `dnd5e.preApplyDamage` hook receives a summed `amount` and an
// `options` bag that does NOT carry damage-type info — types live in the
// `damages` array that gets passed to the earlier `dnd5e.calculateDamage`
// hook. We stash a typed copy on `options` there so this handler can route
// per type.
function onCalculateDamage(actor, damages, options) {
  // damages here has been mutated to include `.amount`, `.temp`, `.tempMax`
  // props plus the per-component entries. We only care about damage-type
  // components (skip temphp / maximum / healing entries).
  options._me5eDamages = (damages ?? [])
    .filter(d => d && typeof d.value === "number" && d.value > 0 && d.type !== "temphp" && d.type !== "maximum")
    .map(d => ({ type: d.type ?? "kinetic", value: d.value }));
}

// dnd5e fires `dnd5e.preApplyDamage` via Hooks.call (synchronous) and then
// awaits its own actor.update. Any mutation of `updates` we do after our
// first `await` lands too late — dnd5e has already consumed the original
// updates. So when we have work to do, we cancel dnd5e's flow (return false
// synchronously) and run the whole damage application ourselves.
function onPreApplyDamage(actor, amount, updates, options) {
  if (!actor) return true;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return true;
  if (amount <= 0) return true;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) return true;

  const techArmor = getTechArmor(actor);
  const shields = getShields(actor);
  const barriers = getBarriers(actor);

  // Nothing to intercept (no layers and no barrier dice) → dnd5e default flow.
  if (techArmor.value <= 0 && shields.value <= 0 && barriers.value <= 0) return true;

  // Use the typed damages captured by onCalculateDamage; fall back to a
  // single "kinetic" component for direct/numeric applyDamage calls.
  const typed = options._me5eDamages?.length
    ? options._me5eDamages
    : [{ type: "kinetic", value: amount }];

  applyDamageThroughLayers(actor, amount, typed, options);
  return false;
}

async function applyDamageThroughLayers(actor, totalAmount, typed, options) {
  const bypass = getBypassLayers(options);

  // 1. Optional barrier-die soak (player choice). Skipped entirely when the
  //    incoming damage bypasses barriers.
  const afterBarrier = bypass.has("barriers")
    ? totalAmount
    : await maybeSpendBarrierDie(actor, totalAmount);

  // Scale the typed components proportionally so they sum to afterBarrier.
  const ratio = totalAmount > 0 ? afterBarrier / totalAmount : 0;
  const scaled = typed.map(d => ({ type: d.type, value: d.value * ratio }));

  // 2. Route through Tech Armor → Shields (with melee-kinetic and item
  //    bypass) → HP.
  const meleeWeaponAttack = isMeleeWeaponAttack(options);
  const dist = distributeTyped(actor, scaled, { meleeWeaponAttack, bypass });

  // 3. Build a single actor update with layer flags + HP changes.
  //    Round at the boundaries so we never store fractional HP/shields.
  const techArmorAbsorbed = Math.ceil(dist.techArmor);
  const shieldsAbsorbed = Math.ceil(dist.shields);
  const healthDamage = Math.ceil(dist.health);

  const techArmor = getTechArmor(actor);
  const shields = getShields(actor);
  const hp = actor.system.attributes?.hp ?? {};
  const currentTemp = hp.temp ?? 0;
  const currentValue = hp.value ?? 0;
  const tempAbsorbed = Math.min(currentTemp, healthDamage);
  const hpDamage = healthDamage - tempAbsorbed;

  const updates = {
    "system.attributes.hp.temp": currentTemp - tempAbsorbed,
    "system.attributes.hp.value": Math.max(0, currentValue - hpDamage)
  };
  if (techArmorAbsorbed > 0) {
    updates[`flags.${MODULE_ID}.techArmor.value`] = Math.max(0, techArmor.value - techArmorAbsorbed);
  }
  if (shieldsAbsorbed > 0) {
    updates[`flags.${MODULE_ID}.shields.value`] = Math.max(0, shields.value - shieldsAbsorbed);
  }
  await actor.update(updates);

  if (bypass.size > 0) await postBypassChat(actor, bypass, options);

  // Taking damage ends in-combat shield regen.
  if (healthDamage > 0 || shieldsAbsorbed > 0 || techArmorAbsorbed > 0) await clearShieldRegenOnDamage(actor);

  // Mirror dnd5e's post-update hook so other modules see damage was applied.
  Hooks.callAll("dnd5e.applyDamage", actor, totalAmount, options);
}

const BYPASS_LABEL_KEY = {
  shields: "ME5E.UI.Shields",
  barriers: "ME5E.UI.Barriers",
  techArmor: "ME5E.UI.TechArmor"
};

async function postBypassChat(actor, bypass, options) {
  const layers = [...bypass]
    .map(k => game.i18n.localize(BYPASS_LABEL_KEY[k] ?? k))
    .join(", ");
  const message = options?.originatingMessage;
  const item = typeof message?.getAssociatedItem === "function"
    ? message.getAssociatedItem()
    : null;
  const sourceName = item?.name ?? game.i18n.localize("ME5E.Damage.UnnamedSource");
  const content = `<p>${game.i18n.format("ME5E.Damage.Bypass", {
    target: actor.name,
    source: sourceName,
    layers
  })}</p>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content
  });
}

async function refillShields(actor) {
  const shields = getShields(actor);
  if (shields.max > 0 && shields.value < shields.max) {
    await actor.update({ [`flags.${MODULE_ID}.shields.value`]: shields.max });
  }
}

// ─── In-combat shield regeneration ────────────────────────────────────────
// Per shields.md: after a Dodge/Hide/Disengage or while in full cover with no
// damage taken, shields regenerate by the armor's `regen` at the start of each
// turn until full or until damage is taken. Foundry can't detect those actions,
// so the trigger is the player-applied `me5e-shield-regen` status; we automate
// the per-turn tick, cap at max, and clear it when damage lands.

const SHIELD_REGEN_STATUS = ME5E.customStatuses.shieldRegen.id;

function hasShieldRegen(actor) {
  return actor?.statuses?.has?.(SHIELD_REGEN_STATUS)
    || actor?.effects?.some?.((e) => e.statuses?.has?.(SHIELD_REGEN_STATUS));
}

// At the start of the active combatant's turn, tick shield regen if armed.
async function onShieldRegenTurn(combat) {
  const actor = combat?.combatant?.actor;
  if (!actor || !hasShieldRegen(actor)) return;
  const shields = getShields(actor);
  const regen = getArmorShieldsRegen(actor);
  if (regen <= 0 || shields.max <= 0 || shields.value >= shields.max) return;
  const next = Math.min(shields.max, shields.value + regen);
  await actor.update({ [`flags.${MODULE_ID}.shields.value`]: next });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<em>${game.i18n.format("ME5E.UI.ShieldRegenTick", { actor: actor.name, amount: next - shields.value })}</em>`
  });
}

// Taking damage ends shield regeneration (shields.md). Remove the status after a
// damaging hit so the next turn won't regen until the player re-arms it.
async function clearShieldRegenOnDamage(actor) {
  if (!hasShieldRegen(actor)) return;
  const effect = actor.effects.find((e) => e.statuses?.has?.(SHIELD_REGEN_STATUS));
  if (effect) await effect.delete();
  else if (typeof actor.toggleStatusEffect === "function") await actor.toggleStatusEffect(SHIELD_REGEN_STATUS, { active: false });
}

async function onRestCompleted(actor) {
  if (actor) await refillShields(actor);
}

async function onCombatEnd(combat) {
  for (const combatant of combat.combatants) {
    if (combatant.actor) await refillShields(combatant.actor);
  }
}

// Foundry has NO `combatTurnStart` hook (the real combat hooks are
// combatStart/combatTurn/combatRound/combatTurnChange), and dnd5e routes
// start-of-turn through Combat#_onStartTurn without emitting any hook. So we
// wrap that method once and emit our own `me5e.combatTurnStart`. _onStartTurn
// runs only on the active GM with the combatant whose turn is starting, which
// is exactly the single-execution, correct-permission point we want for shield
// regen and the on-fire DoT.
let _turnStartWrapped = false;
function installTurnStartHook() {
  if (_turnStartWrapped) return;
  const proto = CONFIG.Combat?.documentClass?.prototype;
  if (!proto || typeof proto._onStartTurn !== "function") {
    console.warn("ME5e | Combat#_onStartTurn unavailable — start-of-turn automation (shield regen, on-fire DoT) disabled");
    return;
  }
  const original = proto._onStartTurn;
  proto._onStartTurn = async function (combatant) {
    const result = await original.call(this, combatant);
    Hooks.callAll("me5e.combatTurnStart", this, combatant);
    return result;
  };
  _turnStartWrapped = true;
}

export function registerShields() {
  Hooks.on("dnd5e.calculateDamage", onCalculateDamage);
  Hooks.on("dnd5e.preApplyDamage", onPreApplyDamage);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  Hooks.on("deleteCombat", onCombatEnd);
  Hooks.once("setup", installTurnStartHook);
  Hooks.on("me5e.combatTurnStart", onShieldRegenTurn);
  Hooks.on("dnd5e.postUseActivity", onActivateBarrier);
  Hooks.on("dnd5e.preUseActivity", onPreUseBarrierTicks);
  Hooks.on("dnd5e.postUseActivity", onSpendBarrierTicks);
}
