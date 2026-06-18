import { MODULE_ID } from "./config.mjs";
import { placeAreaTemplate, getTokensInTemplate, getTokensWithinFeet, deleteTemplate } from "./aoe.mjs";
import { getWeaponType, getHeatState, spendHeat } from "./heat.mjs";
import { setShields, setBarriers } from "./shields.mjs";

// Heavy weapons fire as fixed-DC saving-throw effects (often AoE), not as
// attack rolls. Each weapon's shape/save/DC/rider is stashed in
// `flags.me5e.weapon.heavy` by the build; damage is the weapon's flat dice
// (no ability modifier). A shot spends one charge unless a rider says
// otherwise.
//
// Riders implemented:
//   hydra     — auto-hit; strip all shields + barriers, -3 AC for 1 hour, then
//               the Con save halves the blast.
//   landon    — up to 10 targeted creatures, 1 charge each (no save).
//   cain      — prompt for charges spent; damage = (charges*2)d12 + 5d12;
//               creatures within 5ft of the center auto-fail.
//   blackstar — applies the Indoctrinated status marker (GM adjudicates).
//   spitfire  — the cone persists; Sustain re-resolves it for another charge,
//               End clears it.

const HEAT_COST = 1;
const CAIN_BASE_DICE = 5;       // the fixed "+5d12" component
const HYDRA_AC_PENALTY = 3;
const HYDRA_AC_SECONDS = 3600;  // 1 hour

export function isHeavyWeapon(item) {
  return item?.type === "weapon" && getWeaponType(item) === "heavy";
}

function getHeavy(weapon) {
  return weapon?.flags?.[MODULE_ID]?.weapon?.heavy ?? null;
}

function aoeShape(type) {
  switch (String(type ?? "").toLowerCase()) {
    case "cube":
    case "square":
    case "rect": return "rect";
    case "cone": return "cone";
    default:     return "circle"; // sphere / circle / radius
  }
}

function damageSpec(weapon) {
  const base = weapon.system?.damage?.base;
  const n = Number(base?.number);
  const d = Number(base?.denomination);
  if (!Number.isFinite(n) || !Number.isFinite(d) || n <= 0 || d <= 0) return null;
  const bonus = String(base?.bonus ?? "").trim();
  const formula = bonus ? `${n}d${d} + ${bonus}` : `${n}d${d}`;
  const type = (Array.isArray(base?.types) && base.types[0]) || "force";
  return { formula, type };
}

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

function degreesTo(originToken, targetToken) {
  const o = originToken.center, t = targetToken.center;
  return Math.toDegrees(Math.atan2(t.y - o.y, t.x - o.x));
}

// Prompt for how many charges were spent charging the Cain (1..max).
async function promptChargeCount(maxCharges) {
  const max = Math.max(1, maxCharges);
  const content = `<p>${game.i18n.localize("ME5E.Heavy.CainPrompt")}</p>
    <input type="number" name="charges" value="1" min="1" max="${max}" step="1" autofocus
           style="width:100%;" />`;
  let value = null;
  try {
    value = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ME5E.Heavy.CainTitle") },
      content,
      ok: {
        label: game.i18n.localize("ME5E.Weapon.Fire"),
        callback: (event, button) => Number(button.form.elements.charges.value)
      },
      rejectClose: false
    });
  } catch (_e) { return null; }
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

async function applyAcDebuff(target) {
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: game.i18n.localize("ME5E.Heavy.AcDebuffName"),
    img: "icons/svg/downgrade.svg",
    duration: { seconds: HYDRA_AC_SECONDS },
    changes: [{ key: "system.attributes.ac.bonus", mode: 2, value: String(-HYDRA_AC_PENALTY) }],
    flags: { [MODULE_ID]: { acDebuff: true } }
  }]);
}

async function applyIndoctrination(target) {
  try { await target.toggleStatusEffect?.("me5e-indoctrinated", { active: true }); }
  catch (_e) { /* status may be unavailable; ignore */ }
}

// Shared damage/save resolution + chat. `targets` is a list of actors;
// `innerAutoFail` is a Set of actors that auto-fail (Cain core).
async function resolveHeavy({ weapon, actor, targets, heavy, dmg, innerAutoFail, charges, label }) {
  const rider = heavy.rider ?? null;
  const hasSave = Number.isFinite(Number(heavy.dc)) && heavy.dc > 0;
  const ability = heavy.save || "dex";
  const dc = Number(heavy.dc);

  let damageTotal = 0;
  let damageRoll = null;
  if (dmg) {
    damageRoll = await new Roll(dmg.formula).evaluate();
    damageTotal = damageRoll.total;
  }

  const results = [];
  for (const target of targets) {
    const entry = { name: target.name };

    // Hydra strips defenses first so the blast lands on HP, and debuffs AC.
    if (rider === "hydra") {
      await setShields(target, { value: 0 });
      await setBarriers(target, { value: 0 });
      await applyAcDebuff(target);
      entry.stripped = true;
    }

    let applied = damageTotal;
    const autoFail = innerAutoFail?.has(target);
    if (autoFail || !hasSave) {
      entry.auto = true; // full damage
    } else {
      const total = await rollSaveTotal(target, ability, dc);
      const success = total !== null && total >= dc;
      applied = success ? Math.floor(damageTotal / 2) : damageTotal;
      entry.total = total;
      entry.success = success;
    }

    if (dmg && applied > 0) await target.applyDamage([{ value: applied, type: dmg.type }]);

    if (rider === "blackstar") {
      await applyIndoctrination(target);
      entry.indoctrinated = true;
    }
    results.push(entry);
  }

  await announce({ actor, weapon, hasSave, ability, dc, dmg, damageTotal, damageRoll, results, charges, label });
}

export async function heavyWeaponFire(weapon, actor) {
  if (!isHeavyWeapon(weapon)) return;
  const heavy = getHeavy(weapon) ?? {};
  const rider = heavy.rider ?? null;
  const token = actor.getActiveTokens?.()[0] ?? null;
  const heat = getHeatState(weapon);

  // Restarting a Spitfire ends the previous sustained cone first.
  if (rider === "spitfire" && spitfireActive(weapon)) await endSpitfire(weapon);

  // Cain: choose how many charges were spent (scales damage), up front.
  let cainCharges = 0;
  if (rider === "cain") {
    const avail = heat.max > 0 ? heat.value : 99;
    if (avail < 1) {
      ui.notifications?.warn(game.i18n.format("ME5E.Heat.Empty", { name: weapon.name }));
      return;
    }
    cainCharges = await promptChargeCount(avail);
    if (!cainCharges) return;
  }

  let dmg = damageSpec(weapon);
  if (rider === "cain") dmg = { formula: `${cainCharges * 2}d12 + ${CAIN_BASE_DICE}d12`, type: dmg?.type ?? "radiant" };

  let template = null;
  let targets;
  let innerAutoFail = new Set();
  if (heavy.aoe?.size) {
    if (!token) { ui.notifications?.warn(game.i18n.localize("ME5E.Burst.NoToken")); return; }
    const shape = aoeShape(heavy.aoe.type);
    const firstTarget = [...(game.user?.targets ?? [])][0];
    const direction = (shape === "cone" && firstTarget) ? degreesTo(token, firstTarget) : 0;
    template = await placeAreaTemplate(token, shape, Number(heavy.aoe.size), {
      direction, width: heavy.aoe.width ?? null, height: heavy.aoe.height ?? null
    });
    if (!template) return; // cancelled — no charge spent
    targets = getTokensInTemplate(template).filter(a => a !== actor);
    if (rider === "cain") innerAutoFail = getTokensWithinFeet(template.x, template.y, 5);
  } else {
    targets = [...new Set([...(game.user?.targets ?? [])].map(t => t.actor).filter(Boolean))];
    if (rider === "landon") targets = targets.slice(0, 10);
    if (!targets.length) { ui.notifications?.warn(game.i18n.localize("ME5E.Heavy.NoTarget")); return; }
  }

  // Charge cost: Landon spends one per missile, Cain the charged amount.
  let cost = HEAT_COST;
  if (rider === "cain") cost = cainCharges;
  else if (rider === "landon") cost = Math.max(1, targets.length);
  if (heat.max > 0 && heat.value < cost) {
    ui.notifications?.warn(game.i18n.format("ME5E.Heavy.NotEnoughCharges", { name: weapon.name, cost }));
    if (template && rider !== "spitfire") await deleteTemplate(template);
    return;
  }

  try {
    await spendHeat(weapon, cost);
    await resolveHeavy({ weapon, actor, targets, heavy, dmg, innerAutoFail, charges: cost });
  } finally {
    if (rider === "spitfire" && template) {
      await weapon.setFlag(MODULE_ID, "sustainTemplate", template.id);
    } else if (template) {
      await deleteTemplate(template);
    }
  }
}

// ----- Spitfire sustain -------------------------------------------------

function getSustainTemplate(weapon) {
  const id = weapon.getFlag?.(MODULE_ID, "sustainTemplate");
  return id ? (canvas.scene?.templates?.get(id) ?? null) : null;
}

export function spitfireActive(weapon) {
  return !!getSustainTemplate(weapon);
}

export async function sustainSpitfire(weapon, actor) {
  const template = getSustainTemplate(weapon);
  if (!template) return;
  const heat = getHeatState(weapon);
  if (heat.max > 0 && heat.value < 1) {
    ui.notifications?.warn(game.i18n.format("ME5E.Heat.Empty", { name: weapon.name }));
    return;
  }
  await spendHeat(weapon, 1);
  const heavy = getHeavy(weapon) ?? {};
  const targets = getTokensInTemplate(template).filter(a => a !== actor);
  await resolveHeavy({ weapon, actor, targets, heavy, dmg: damageSpec(weapon), charges: 1, label: "sustain" });
}

export async function endSpitfire(weapon) {
  const template = getSustainTemplate(weapon);
  if (template) await deleteTemplate(template);
  await weapon.unsetFlag?.(MODULE_ID, "sustainTemplate");
}

// ----- chat -------------------------------------------------------------

async function announce({ actor, weapon, hasSave, ability, dc, dmg, damageTotal, damageRoll, results, charges, label }) {
  const titleKey = label === "sustain" ? "ME5E.Heavy.SustainTitle" : "ME5E.Heavy.ChatTitle";
  const title = game.i18n.format(titleKey, { weapon: weapon.name });
  const saveLine = hasSave
    ? `<div>${game.i18n.format("ME5E.Heavy.SaveLine", { ability: ability.toUpperCase(), dc })}</div>`
    : `<div>${game.i18n.localize("ME5E.Heavy.AutoHit")}</div>`;
  const dmgLine = dmg ? `<div>${game.i18n.format("ME5E.Heavy.Damage", { total: damageTotal, type: dmg.type })}</div>` : "";
  const rows = results.length
    ? results.map(r => {
        let verdict;
        if (r.auto) verdict = game.i18n.localize("ME5E.Burst.Failed");
        else if (r.total === null || r.total === undefined) verdict = game.i18n.localize("ME5E.Burst.NoSave");
        else verdict = r.success ? game.i18n.localize("ME5E.Burst.Saved") : game.i18n.localize("ME5E.Burst.Failed");
        const tally = (r.total ?? null) === null ? "" : ` (${r.total})`;
        const tags = [
          r.stripped ? game.i18n.localize("ME5E.Heavy.StrippedTag") : "",
          r.indoctrinated ? game.i18n.localize("ME5E.Heavy.IndoctrinatedTag") : ""
        ].filter(Boolean).join(" ");
        return `<div>${r.name}${tally}: <strong>${verdict}</strong> ${tags}</div>`;
      }).join("")
    : `<div><em>${game.i18n.localize("ME5E.Burst.NoTargets")}</em></div>`;

  const chargeText = charges ? `(-${charges} charge${charges === 1 ? "" : "s"})` : "";
  const content = `
    <div class="me5e-burst-card">
      <p><strong>${title}</strong> <span class="me5e-burst-heat">${chargeText}</span></p>
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
