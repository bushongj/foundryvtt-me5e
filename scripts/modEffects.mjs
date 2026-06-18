import { ME5E, MODULE_ID } from "./config.mjs";
import { getMe5eWeaponFlags } from "./weapons.mjs";
import {
  activeAttachedModItems, getMe5eModFlags, getAttackAugmentToHitBonus,
  hasInitiativeAdvantageMod
} from "./mods.mjs";
import { applyPrimer } from "./combos.mjs";

// Roll-time mod effects. Four hooks wire up the deferred mechanics that the
// loadout tile only displayed before:
//
//   1. dnd5e.preRollAttackV2 — adds attack-augment to-hit bonuses (these may
//      be negative, e.g. a burst-fire conversion).
//   2. dnd5e.preRollDamageV2 — adds attack-augment damage bonuses and (when
//      an ammo mod is loaded) overrides the damage type on the rolls.
//   3. dnd5e.applyDamage — applies the ammo's primer to the target so a
//      detonator (overload, warp, etc.) can pop the combo afterwards.
//   4. dnd5e.preConfigureInitiative — grants advantage on initiative when an
//      equipped weapon carries a combat-sensor (initiative) mod.
//
// Primer info is stashed on the damage chat message via flag so the
// applyDamage hook can recover it independently of which client routes the
// damage (mid-damage prompts open on whoever clicked Apply Damage —
// see the damage-prompt-client memory).

// dnd5e die ladder for die-step augments (e.g. Burst Fire System −1 step).
const DIE_STEPS = [4, 6, 8, 10, 12];
function stepDiceInFormula(formula, steps) {
  return String(formula).replace(/(\d+)d(\d+)/g, (whole, n, d) => {
    const i = DIE_STEPS.indexOf(Number(d));
    if (i < 0) return whole;
    const ni = Math.max(0, Math.min(DIE_STEPS.length - 1, i + steps));
    return `${n}d${DIE_STEPS[ni]}`;
  });
}

function collectModEffects(weapon, actor) {
  let attackAugment = 0;
  let dieIncrease = 0;
  let ammoType = null;
  let primer = null;
  const addDamage = []; // [{ formula, type }] extra damage components

  for (const [slot, mod] of Object.entries(activeAttachedModItems(weapon, actor))) {
    if (!mod) continue;
    const mechanics = getMe5eModFlags(mod)?.mechanics ?? [];
    for (const m of mechanics) {
      if (m?.type === "attack-augment") {
        const types = Array.isArray(m.augmentTypes) ? m.augmentTypes : [];
        if (types.includes("damage")) {
          const v = Number(m.bonus?.value);
          if (Number.isFinite(v)) attackAugment += v;
          // Die-step augment (Burst Fire System: damage die −1 step).
          const step = Number(m.dieIncrease);
          if (Number.isFinite(step)) dieIncrease += step;
        }
      }
      // Extra damage riders (Explosive Ammo +1d8 thunder per hit). `addTo:all`
      // means a standalone added component, so roll it as its own part.
      if (m?.type === "weapon-augment" && Array.isArray(m.addDamage)) {
        for (const d of m.addDamage) {
          const n = Number(d?.dieCount), die = Number(d?.dieType);
          if (Number.isFinite(n) && Number.isFinite(die) && die > 0) {
            addDamage.push({ formula: `${n}d${die}`, type: d?.type ? String(d.type) : "" });
          }
        }
      }
      if (slot === "ammo" && m?.type === "weapon-augment") {
        if (m.damageType) ammoType = String(m.damageType);
        if (m.primes) primer = String(m.primes);
      }
    }
  }
  return { attackAugment, dieIncrease, ammoType, primer, addDamage };
}

function onPreRollAttack(config, _dialog, _message) {
  const activity = config?.subject;
  const item = activity?.item;
  if (!item || item.type !== "weapon") return;
  if (!getMe5eWeaponFlags(item)) return;
  const actor = item.actor;
  if (!actor) return;

  const bonus = getAttackAugmentToHitBonus(item, actor);
  if (!bonus) return;

  const first = Array.isArray(config.rolls) ? config.rolls[0] : null;
  if (first && Array.isArray(first.parts)) first.parts.push(String(bonus));
}

function onPreRollDamage(config, _dialog, message) {
  const activity = config?.subject;
  const item = activity?.item;
  if (!item || item.type !== "weapon") return;
  if (!getMe5eWeaponFlags(item)) return;
  const actor = item.actor;
  if (!actor) return;

  const { attackAugment, dieIncrease, ammoType, primer, addDamage } = collectModEffects(item, actor);
  if (!attackAugment && !dieIncrease && !ammoType && !primer && !addDamage.length) return;

  if (Array.isArray(config.rolls) && config.rolls.length) {
    if (ammoType) {
      for (const roll of config.rolls) {
        if (roll && roll.options) roll.options.type = ammoType;
      }
    }
    // Die-step the base weapon damage (Burst Fire System: −1 step).
    if (dieIncrease) {
      const first = config.rolls[0];
      if (first && Array.isArray(first.parts)) {
        first.parts = first.parts.map((p) => stepDiceInFormula(p, dieIncrease));
      }
    }
    if (attackAugment > 0) {
      const first = config.rolls[0];
      if (first && Array.isArray(first.parts)) {
        first.parts.push(String(attackAugment));
      }
    }
    // Extra damage components (Explosive Ammo +1d8 thunder) as their own rolls.
    for (const d of addDamage) {
      config.rolls.push({ parts: [d.formula], options: d.type ? { type: d.type } : {} });
    }
  }

  if (primer) {
    message.data = message.data ?? {};
    message.data.flags = message.data.flags ?? {};
    message.data.flags[MODULE_ID] = message.data.flags[MODULE_ID] ?? {};
    message.data.flags[MODULE_ID].ammoPrimer = primer;
  }
}

async function onApplyDamage(actor, amount, options) {
  if (!actor || !Number.isFinite(amount) || amount <= 0) return;
  const message = options?.originatingMessage;
  const primer = message?.getFlag?.(MODULE_ID, "ammoPrimer");
  if (!primer || !ME5E.primers?.[primer]) return;

  const sourceItem = typeof message?.getAssociatedItem === "function"
    ? message.getAssociatedItem()
    : null;
  const sourceActor = sourceItem?.actor ?? null;

  await applyPrimer(actor, primer, sourceActor);
}

function onPreConfigureInitiative(actor, rollConfig) {
  if (!actor || !rollConfig?.options) return;
  if (hasInitiativeAdvantageMod(actor)) rollConfig.options.advantage = true;
}

export function registerModEffects() {
  Hooks.on("dnd5e.preRollAttackV2", onPreRollAttack);
  Hooks.on("dnd5e.preRollDamageV2", onPreRollDamage);
  Hooks.on("dnd5e.applyDamage", onApplyDamage);
  Hooks.on("dnd5e.preConfigureInitiative", onPreConfigureInitiative);
}
