import { MODULE_ID, ME5E } from "./config.mjs";
import { getPowerMetadata, isPower, isPrimaryActivity } from "./powers.mjs";
import { placeTemplate, getTokensInTemplate, deleteTemplate } from "./aoe.mjs";

// Powers prime "until the end of your next turn" (consistent across the power
// texts) ≈ one combat round, not the previous fixed 2.
const PRIMER_DURATION_ROUNDS = 1;

// Pick the largest scale threshold ≤ level, else return the base value.
function resolveScale(spec, level) {
  if (spec == null) return null;
  if (typeof spec === "string" || typeof spec === "number") return spec;
  if (!spec.scale) return spec.base;
  const thresholds = Object.keys(spec.scale).map(Number).sort((a, b) => a - b);
  let value = spec.base;
  for (const t of thresholds) {
    if (level >= t) value = spec.scale[t];
  }
  return value;
}

function casterLevel(actor) {
  return actor?.system?.details?.level ?? actor?.system?.details?.cr ?? 1;
}

function localize(key, data) {
  return data ? game.i18n.format(key, data) : game.i18n.localize(key);
}

// ─── Primer state (ActiveEffects on the target actor) ─────────────────────

function findPrimerEffect(target, primerType) {
  return target.effects.find(e => e.getFlag(MODULE_ID, "primer.type") === primerType);
}

export function getPrimers(target) {
  return target.effects.filter(e => e.getFlag(MODULE_ID, "primer.type"));
}

export async function applyPrimer(target, primerType, sourceActor = null, { activityId = null } = {}) {
  const config = ME5E.primers[primerType];
  if (!config) return null;

  // Replace any existing primer of the same type (refresh).
  const existing = findPrimerEffect(target, primerType);
  if (existing) await existing.delete();

  const sourceLevel = casterLevel(sourceActor);
  const effectData = {
    name: localize(config.label),
    img: config.icon,
    statuses: [config.statusId],
    duration: { rounds: PRIMER_DURATION_ROUNDS },
    flags: {
      [MODULE_ID]: {
        primer: {
          type: primerType,
          sourceActorId: sourceActor?.id ?? null,
          // Which cast applied this primer — lets a both-prime-and-detonate
          // power's Detonate button skip the primer it just applied itself.
          sourceActivityId: activityId,
          sourceLevel,
          linkedEffectIds: []
        }
      }
    },
    origin: sourceActor?.uuid
  };

  const [primerEffect] = await target.createEmbeddedDocuments("ActiveEffect", [effectData]);

  // Optional concurrent condition (radiant primer applies poisoned).
  if (config.whilePrimed?.condition) {
    const linked = await applyConditionEffect(target, config.whilePrimed.condition, {
      durationRounds: PRIMER_DURATION_ROUNDS,
      linkedPrimerId: primerEffect.id
    });
    if (linked) {
      await primerEffect.update({
        [`flags.${MODULE_ID}.primer.linkedEffectIds`]: [linked.id]
      });
    }
  }

  await ChatMessage.create({
    speaker: sourceActor ? ChatMessage.getSpeaker({ actor: sourceActor }) : undefined,
    content: `<div class="me5e-primer-banner">${localize("ME5E.Primer.Applied", {
      actor: target.name,
      primer: localize(config.label)
    })}</div>`
  });

  return primerEffect;
}

async function removePrimerEffect(target, primerEffect) {
  const linkedIds = primerEffect.getFlag(MODULE_ID, "primer.linkedEffectIds") ?? [];
  for (const id of linkedIds) {
    const linked = target.effects.get(id);
    if (linked) await linked.delete();
  }
  await primerEffect.delete();
}

// ─── Condition application ────────────────────────────────────────────────

// Lookup an icon for a dnd5e built-in condition so the custom effect we
// create displays the same badge as the engine condition.
function conditionIcon(conditionId) {
  const custom = Object.values(ME5E.customStatuses).find(s => s.id === conditionId);
  if (custom) return custom.icon;
  const built = CONFIG.statusEffects?.find(s => s.id === conditionId);
  return built?.img ?? built?.icon ?? "icons/svg/aura.svg";
}

function conditionLabel(conditionId) {
  const custom = Object.values(ME5E.customStatuses).find(s => s.id === conditionId);
  if (custom) return localize(custom.label);
  const built = CONFIG.statusEffects?.find(s => s.id === conditionId);
  if (built?.name) return game.i18n.localize(built.name);
  if (built?.label) return game.i18n.localize(built.label);
  return conditionId;
}

// Apply a condition (built-in dnd5e or one of our customs) as a duration-
// limited ActiveEffect. "frozen" pulls in dnd5e's paralyzed for mechanics.
async function applyConditionEffect(target, conditionId, { durationRounds, durationSeconds, linkedPrimerId, extraFlags } = {}) {
  const statuses = conditionId === "frozen" ? ["paralyzed", "me5e-frozen"] : [conditionId];
  const duration = {};
  if (durationRounds) duration.rounds = durationRounds;
  if (durationSeconds) duration.seconds = durationSeconds;

  const effectData = {
    name: conditionLabel(conditionId),
    img: conditionIcon(conditionId === "frozen" ? "me5e-frozen" : conditionId),
    statuses,
    duration,
    flags: {
      [MODULE_ID]: {
        condition: conditionId,
        linkedPrimerId: linkedPrimerId ?? null,
        ...(extraFlags ?? {})
      }
    }
  };

  const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [effectData]);
  return effect;
}

// Apply a recurring damage-over-time to `target` as a duration-limited
// ActiveEffect the tick engine (onCombatTurnStart) rolls each round. `descriptor`
// = { formula, type, owner, bypassShields, durationRounds } from a power's
// flags.me5e.power.dot (or an advancement's). owner:"caster" → the DoT fires on
// the SOURCE actor's turn (stamped with their id, so it ticks even when the
// bearer isn't the one acting); "victim" → on the bearer's own turn (no owner,
// like on-fire). `label` names the source power on the token + tick message.
export async function applyDotEffect(target, descriptor, sourceActor = null, label = null) {
  if (!descriptor?.formula) return null;
  const ownerId = descriptor.owner === "caster" ? (sourceActor?.id ?? null) : null;
  const name = label || conditionLabel("me5e-dot");
  const effectData = {
    name,
    img: conditionIcon("me5e-dot"),
    statuses: ["me5e-dot"],
    duration: descriptor.durationRounds ? { rounds: descriptor.durationRounds } : {},
    origin: sourceActor?.uuid,
    flags: {
      [MODULE_ID]: {
        condition: "me5e-dot",
        dot: {
          formula: descriptor.formula,
          type: descriptor.type || "",
          owner: ownerId,
          bypassShields: !!descriptor.bypassShields,
          label: name
        }
      }
    }
  };
  const [effect] = await target.createEmbeddedDocuments("ActiveEffect", [effectData]);
  await ChatMessage.create({
    speaker: sourceActor ? ChatMessage.getSpeaker({ actor: sourceActor }) : undefined,
    content: `<div class="me5e-primer-banner">${localize("ME5E.Dot.Applied", {
      actor: target.name, effect: name, formula: descriptor.formula, type: descriptor.type || ""
    })}</div>`
  });
  return effect;
}

// ─── Detonation pipeline ──────────────────────────────────────────────────

async function rollDamage(formula) {
  const roll = await new Roll(formula).evaluate();
  return { total: roll.total, formula: roll.formula, roll };
}

// Post the detonation damage as a native dnd5e damage card: a DamageRoll (which
// carries the damage type) on a chat message flagged so dnd5e renders its
// `<damage-application>` tray (Apply / ½ / ×2) for the affected tokens. The GM
// clicks Apply, routing through dnd5e's applyDamage → the ME shields/barriers
// layers — so the detonation is no longer silently rolled and auto-applied.
async function postDetonationDamageCard(config, primerType, formula, type, affected, source) {
  const DamageRoll = CONFIG.Dice.DamageRoll;
  const roll = new DamageRoll(formula, {}, { type });
  await roll.evaluate();

  // Snapshot the affected actors for the apply tray ({name,img,uuid,ac}).
  const targets = affected.map((a) => {
    const token = a.getActiveTokens?.()[0];
    return {
      name: a.name,
      img: token?.document?.texture?.src ?? a.img,
      uuid: a.uuid,
      ac: a.system?.attributes?.ac?.value ?? null
    };
  });

  await ChatMessage.create({
    speaker: source ? ChatMessage.getSpeaker({ actor: source }) : undefined,
    flavor: localize("ME5E.Primer.DetonationDamage", { primer: localize(config.label) }),
    rolls: [roll],
    flags: { dnd5e: { messageType: "roll", roll: { type: "damage" }, targets } }
  });

  return { total: roll.total, formula: roll.formula };
}

// dnd5e v4 uses `rollSavingThrow({ ability, target })`; v3 uses
// `rollAbilitySave(ability, { targetValue })`. Try the modern one first.
async function rollSave(actor, ability, dc) {
  if (typeof actor.rollSavingThrow === "function") {
    return actor.rollSavingThrow({ ability, target: dc });
  }
  if (typeof actor.rollAbilitySave === "function") {
    return actor.rollAbilitySave(ability, { targetValue: dc });
  }
  return null;
}

async function detonate(primedTarget, primerEffect, detonatorActor) {
  const primerType = primerEffect.getFlag(MODULE_ID, "primer.type");
  const config = ME5E.primers[primerType];
  if (!config) return;
  const det = config.detonation;
  const sourceLevel = primerEffect.getFlag(MODULE_ID, "primer.sourceLevel") ?? 1;

  const primedToken = primedTarget.getActiveTokens()[0];
  let template = null;
  let affected = [primedTarget];
  if (det.radius > 0 && primedToken) {
    template = await placeTemplate(primedToken, det.radius);
    if (!template) {
      await removePrimerEffect(primedTarget, primerEffect);
      return;
    }
    affected = getTokensInTemplate(template);
    if (!affected.includes(primedTarget)) affected.unshift(primedTarget);
  }

  let damageInfo = null;
  if (det.damage) {
    const formula = resolveScale(det.damage, sourceLevel);
    // Post a standard dnd5e damage card (visible dice + Apply / ½ / ×2 tray)
    // instead of auto-rolling and auto-applying. The tray's apply buttons route
    // through dnd5e's applyDamage → the ME shields/barriers layers, carrying the
    // detonation damage type so resistances/shield multipliers are respected.
    damageInfo = await postDetonationDamageCard(config, primerType, formula, det.damage.type, affected, detonatorActor);
  }

  const saveResults = [];
  if (det.save) {
    const dc = resolveScale(det.save.dc, sourceLevel);
    for (const actor of affected) {
      const roll = await rollSave(actor, det.save.ability, dc);
      const total = roll?.total ?? 0;
      const success = total >= dc;
      saveResults.push({ actor, total, success, dc });
      if (!success && det.onFail?.condition) {
        await applyConditionEffect(actor, det.onFail.condition, det.onFail.duration ?? {});
      }
    }
  }

  if (det.onHit?.condition) {
    for (const actor of affected) {
      await applyConditionEffect(actor, det.onHit.condition, det.onHit.duration ?? {});
    }
  }

  if (det.dot) {
    for (const actor of affected) {
      await applyConditionEffect(actor, "me5e-on-fire", {
        durationSeconds: det.dot.durationSeconds,
        extraFlags: { dot: { formula: det.dot.formula, type: det.dot.type } }
      });
    }
  }

  if (det.onHit?.knockbackMeters) {
    await ChatMessage.create({
      speaker: detonatorActor ? ChatMessage.getSpeaker({ actor: detonatorActor }) : undefined,
      content: `<em>${localize("ME5E.Primer.Knockback", {
        actor: primedTarget.name,
        meters: det.onHit.knockbackMeters
      })}</em>`
    });
  }

  await announceDetonation(config, primerType, primedTarget, detonatorActor, affected, damageInfo, saveResults);
  await removePrimerEffect(primedTarget, primerEffect);
  if (template) await deleteTemplate(template);
}

async function announceDetonation(config, primerType, target, source, affected, damageInfo, saveResults) {
  const lines = [];
  lines.push(`<strong>${localize("ME5E.Primer.Detonation", {
    primer: localize(config.label),
    actor: target.name
  })}</strong>`);
  if (affected.length > 1) {
    lines.push(`<div>${localize("ME5E.Primer.Affected")}: ${affected.map(a => a.name).join(", ")}</div>`);
  }
  // Detonation damage is shown on its own rollable damage card (with an apply
  // tray), so it isn't repeated here — only the narrative + save outcomes are.
  for (const s of saveResults) {
    const verdict = s.success ? localize("ME5E.Save.Success") : localize("ME5E.Save.Fail");
    lines.push(`<div>${s.actor.name}: ${s.total} vs DC ${s.dc} — <strong>${verdict}</strong></div>`);
  }
  await ChatMessage.create({
    speaker: source ? ChatMessage.getSpeaker({ actor: source }) : undefined,
    content: `<div class="me5e-detonation-banner" data-primer="${primerType}">${lines.join("")}</div>`
  });
}

// Shuffle in place (Fisher-Yates) so multi-primer detonations resolve in
// random order, per spec.
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Hook handlers ────────────────────────────────────────────────────────

// Resolve the actors currently targeted by this client, warning if none.
function comboTargets() {
  const targets = Array.from(game.user?.targets ?? []).map(t => t.actor).filter(Boolean);
  if (!targets.length) ui.notifications.warn(game.i18n.localize("ME5E.Primer.NoTarget"));
  return targets;
}

// Detonate every primer on `target` except one this same cast applied (so a
// both-prime-and-detonate power doesn't detonate the primer it just placed).
export async function detonateTarget(target, source, { exceptActivityId = null } = {}) {
  const primers = shuffle(getPrimers(target)).filter(
    p => !exceptActivityId || p.getFlag(MODULE_ID, "primer.sourceActivityId") !== exceptActivityId
  );
  for (const primer of primers) {
    await detonate(target, primer, source);
  }
  return primers.length;
}

// Prime / Detonate are player-driven, hit-gated buttons on the combo power's
// cast card (the player rolls the attack/save, confirms it landed, then clicks).
// Mirrors powers.mjs injectExtraActivityButtons.
function injectComboButtons(message, html) {
  try {
    const el = html instanceof HTMLElement ? html : html?.[0];
    const buttons = el?.querySelector(".card-buttons");
    if (!buttons || buttons.querySelector(".me5e-combo-button")) return;
    const item = message.getAssociatedItem?.();
    if (!item || !isPower(item)) return;
    const activity = message.getAssociatedActivity?.();
    // Only the base cast primes/detonates — not a power's rider activity cards.
    if (!isPrimaryActivity(activity)) return;
    const meta = getPowerMetadata(item);
    if (!meta.primer && !meta.detonator) return; // not a combo power
    const source = item.actor;
    const activityId = activity?.id ?? null;
    const sampleClass = buttons.querySelector("button")?.className ?? "";

    const makeButton = (label, icon, handler) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `me5e-combo-button ${sampleClass}`.trim();
      btn.innerHTML = `<i class="${icon}" inert></i> ${label}`;
      btn.addEventListener("click", async () => {
        const targets = comboTargets();
        if (!targets.length) return;
        for (const target of targets) {
          try {
            await handler(target, source);
          } catch (err) {
            console.error("ME5e | prime/detonate failed for", target?.name, err);
            ui.notifications.error(game.i18n.format("ME5E.Primer.ApplyFailed", { actor: target?.name ?? "?" }));
          }
        }
      });
      buttons.appendChild(btn);
    };

    if (meta.detonator) {
      makeButton(
        game.i18n.localize("ME5E.Primer.DetonateButton"),
        "fa-solid fa-burst",
        (target, source) => detonateTarget(target, source, { exceptActivityId: activityId })
      );
    }
    if (meta.primer) {
      const primerLabel = localize(ME5E.primers[meta.primer]?.label ?? meta.primer);
      makeButton(
        game.i18n.format("ME5E.Primer.PrimeButton", { primer: primerLabel }),
        "fa-solid fa-bolt",
        (target, source) => applyPrimer(target, meta.primer, source, { activityId })
      );
    }
  } catch (err) {
    console.warn("ME5e | combo button injection failed:", err);
  }
}

// Roll one DoT effect and apply it to its bearer, routing through the ME damage
// layers — honouring `bypassShields` and the real damage type (not the "kinetic"
// fallback) — then post a tick message.
async function tickDot(actor, effect) {
  const dot = effect.getFlag(MODULE_ID, "dot");
  if (!dot?.formula) return;
  const { total } = await rollDamage(dot.formula);
  const type = dot.type || "fire";
  await actor.applyDamage([{ value: total, type }], {
    _me5eDamages: [{ type, value: total }],
    _me5eBypass: dot.bypassShields ? ["shields"] : []
  });
  // Generic power DoTs carry a `label`; the fire combo doesn't, so it keeps its
  // bespoke "burns for…" message.
  const [key, data] = dot.label
    ? ["ME5E.Condition.DotTick", { actor: actor.name, amount: total, type, effect: dot.label }]
    : ["ME5E.Condition.OnFireTick", { actor: actor.name, amount: total }];
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<em>${localize(key, data)}</em>`
  });
}

// DoT engine, fired at the start of each turn (one tick/round; "start vs end of
// turn" is collapsed). Two passes:
//   • victim pass — the active actor's own DoTs that have NO owner (on-fire,
//     Dominate): they fire on the bearer's own turn.
//   • owner pass — DoTs anywhere in the encounter whose `dot.owner` is THIS actor
//     (Singularity, Dark Channel): "at the end of each of YOUR turns".
async function onCombatTurnStart(combat, _combatant) {
  const current = combat?.combatant?.actor;
  if (!current) return;

  for (const effect of current.effects) {
    const dot = effect.getFlag(MODULE_ID, "dot");
    if (!dot?.formula || dot.owner) continue;   // owner-stamped DoTs run in the owner pass
    await tickDot(current, effect);
  }

  for (const c of combat.combatants ?? []) {
    const actor = c.actor;
    if (!actor) continue;
    for (const effect of actor.effects) {
      const dot = effect.getFlag(MODULE_ID, "dot");
      if (!dot?.formula || dot.owner !== current.id) continue;
      await tickDot(actor, effect);
    }
  }
}

// Register our two custom statuses (frozen, on-fire) into CONFIG.statusEffects
// so the token HUD recognises and renders them. Called once at init.
export function registerCustomStatuses() {
  for (const status of Object.values(ME5E.customStatuses)) {
    if (CONFIG.statusEffects.some(s => s.id === status.id)) continue;
    CONFIG.statusEffects.push({
      id: status.id,
      name: status.label,
      img: status.icon
    });
  }
  // Primer statuses too — so token HUD shows the right icon when a primer
  // effect is active.
  for (const [key, config] of Object.entries(ME5E.primers)) {
    if (CONFIG.statusEffects.some(s => s.id === config.statusId)) continue;
    CONFIG.statusEffects.push({
      id: config.statusId,
      name: config.label,
      img: config.icon
    });
  }
}

export function registerCombos() {
  // Prime/Detonate are hit-gated: rather than auto-firing on cast, they're
  // buttons injected onto the power's cast card (the player rolls the attack/
  // save first, then clicks). dnd5e renders power cards via `renderChatMessage`.
  Hooks.on("dnd5e.renderChatMessage", injectComboButtons);
  // `me5e.combatTurnStart` is our own hook, emitted from a wrap of
  // Combat#_onStartTurn installed by registerShields (Foundry has no real
  // `combatTurnStart` event). This is what actually drives the on-fire DoT.
  Hooks.on("me5e.combatTurnStart", onCombatTurnStart);
}
