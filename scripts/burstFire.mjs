import { ME5E } from "./config.mjs";
import { placeCubeTemplate, getTokensInTemplate, deleteTemplate } from "./aoe.mjs";
import { getEffectiveMe5eProperties, getAttackAugmentDamageBonus, getAmmoDamageTypeOverride } from "./mods.mjs";
import { getHeatState, spendHeat } from "./heat.mjs";

// Burst Fire — the alternate AoE mode of the burst-fire weapon property:
// target a cube, each creature inside makes a Dex save (DC 8 + attacker Dex
// mod + proficiency if proficient) or takes the weapon's damage; costs extra
// heat. Single-target attacks use the normal Fire button instead.

const BURST_PROP = "burst-fire";

export function isBurstWeapon(weapon, actor) {
  if (!weapon || weapon.type !== "weapon") return false;
  return getEffectiveMe5eProperties(weapon, actor).includes(BURST_PROP);
}

// Weapon damage for a burst: base dice (+ flat item bonus) + attacker's Dex
// mod + any mod attack-augment damage bonus, of the ammo-overridden or base
// damage type. Rolled once and applied to every creature that fails its save.
function buildBurstDamage(weapon, actor) {
  const base = weapon.system?.damage?.base;
  const n = Number(base?.number);
  const d = Number(base?.denomination);
  if (!Number.isFinite(n) || !Number.isFinite(d) || n <= 0 || d <= 0) return null;

  const parts = [`${n}d${d}`];
  const itemBonus = String(base?.bonus ?? "").trim();
  if (itemBonus) parts.push(itemBonus);

  const dexMod = Number(actor.system?.abilities?.dex?.mod ?? 0);
  if (dexMod) parts.push(String(dexMod));

  const augment = getAttackAugmentDamageBonus(weapon, actor);
  if (augment) parts.push(String(augment));

  const type = getAmmoDamageTypeOverride(weapon, actor)
    ?? ((Array.isArray(base?.types) && base.types[0]) || "piercing");

  // Join with explicit signs so negatives read correctly: "2d6 + -1 + 3".
  const formula = parts.reduce((acc, p) =>
    acc ? `${acc} + ${p}` : p, "");
  return { formula, type };
}

// dnd5e v5 rollSavingThrow returns a D20Roll[] (v3 rollAbilitySave a single
// roll). Return the numeric total, or null if no save could be rolled.
async function rollSaveTotal(actor, ability, dc) {
  let result = null;
  if (typeof actor.rollSavingThrow === "function") {
    result = await actor.rollSavingThrow({ ability, target: dc });
  } else if (typeof actor.rollAbilitySave === "function") {
    result = await actor.rollAbilitySave(ability, { targetValue: dc });
  }
  const roll = Array.isArray(result) ? result[0] : result;
  return Number.isFinite(roll?.total) ? roll.total : null;
}

export async function burstFire(weapon, actor) {
  if (!isBurstWeapon(weapon, actor)) return;
  const token = actor.getActiveTokens?.()[0];
  if (!token) {
    ui.notifications?.warn(game.i18n.localize("ME5E.Burst.NoToken"));
    return;
  }

  // Heat gate up front so we don't place a template we can't pay for.
  const cost = ME5E.burstFire.heatCost ?? 3;
  const heat = getHeatState(weapon);
  if (heat.max > 0 && heat.value < cost) {
    ui.notifications?.warn(game.i18n.format("ME5E.Burst.NotEnoughHeat", { name: weapon.name, cost }));
    return;
  }

  const template = await placeCubeTemplate(token, ME5E.burstFire.cubeFeet ?? 10);
  if (!template) return; // cancelled — nothing spent

  try {
    const targets = getTokensInTemplate(template).filter(a => a !== actor);
    await spendHeat(weapon, cost);

    const dexMod = Number(actor.system?.abilities?.dex?.mod ?? 0);
    const profFlat = Number(weapon.system?.prof?.flat ?? 0);
    const dc = 8 + dexMod + profFlat;

    const dmg = buildBurstDamage(weapon, actor);
    let damageTotal = 0;
    let damageRoll = null;
    if (dmg) {
      damageRoll = await new Roll(dmg.formula).evaluate();
      damageTotal = damageRoll.total;
    }

    const results = [];
    for (const target of targets) {
      const total = await rollSaveTotal(target, ME5E.burstFire.saveAbility, dc);
      const success = total !== null && total >= dc;
      results.push({ name: target.name, total, success });
      if (!success && dmg && damageTotal > 0) {
        await target.applyDamage([{ value: damageTotal, type: dmg.type }]);
      }
    }

    await announceBurst({ actor, weapon, dc, dmg, damageTotal, damageRoll, results, cost });
  } finally {
    await deleteTemplate(template);
  }
}

async function announceBurst({ actor, weapon, dc, dmg, damageTotal, damageRoll, results, cost }) {
  const title = game.i18n.format("ME5E.Burst.ChatTitle", { weapon: weapon.name });
  const dmgLine = dmg
    ? `<div>${game.i18n.format("ME5E.Burst.Damage", { total: damageTotal, type: dmg.type })}</div>`
    : "";
  const saveLine = `<div>${game.i18n.format("ME5E.Burst.SaveLine", { ability: ME5E.burstFire.saveAbility.toUpperCase(), dc })}</div>`;
  const rows = results.length
    ? results.map(r => {
        const verdict = r.total === null
          ? game.i18n.localize("ME5E.Burst.NoSave")
          : (r.success ? game.i18n.localize("ME5E.Burst.Saved") : game.i18n.localize("ME5E.Burst.Failed"));
        const tally = r.total === null ? "" : ` (${r.total})`;
        return `<div>${r.name}${tally}: <strong>${verdict}</strong></div>`;
      }).join("")
    : `<div><em>${game.i18n.localize("ME5E.Burst.NoTargets")}</em></div>`;

  const content = `
    <div class="me5e-burst-card">
      <p><strong>${title}</strong> <span class="me5e-burst-heat">(-${cost} heat)</span></p>
      ${saveLine}
      ${dmgLine}
      ${rows}
    </div>`;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: damageRoll ? [damageRoll] : [],
    rollMode: game.settings.get("core", "rollMode")
  });
}
