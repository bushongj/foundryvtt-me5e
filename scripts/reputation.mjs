import { MODULE_ID, ME5E } from "./config.mjs";

export function getReputation(actor) {
  return {
    paragon: actor.getFlag(MODULE_ID, "reputation.paragon") ?? 0,
    renegade: actor.getFlag(MODULE_ID, "reputation.renegade") ?? 0
  };
}

function rankFor(value, thresholds) {
  let rank = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i]) rank = i;
  }
  return {
    rank,
    label: ME5E.reputation.ranks[rank] ?? "—",
    next: thresholds[rank + 1] ?? null
  };
}

export function getReputationDetails(actor) {
  const { paragon, renegade } = getReputation(actor);
  return {
    paragon: { value: paragon, ...rankFor(paragon, ME5E.reputation.paragonThresholds) },
    renegade: { value: renegade, ...rankFor(renegade, ME5E.reputation.renegadeThresholds) }
  };
}

export async function awardParagon(actor, amount) {
  const current = actor.getFlag(MODULE_ID, "reputation.paragon") ?? 0;
  await actor.setFlag(MODULE_ID, "reputation.paragon", Math.max(0, current + amount));
}

export async function awardRenegade(actor, amount) {
  const current = actor.getFlag(MODULE_ID, "reputation.renegade") ?? 0;
  await actor.setFlag(MODULE_ID, "reputation.renegade", Math.max(0, current + amount));
}

export async function setParagon(actor, value) {
  const v = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  await actor.setFlag(MODULE_ID, "reputation.paragon", v);
}

export async function setRenegade(actor, value) {
  const v = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  await actor.setFlag(MODULE_ID, "reputation.renegade", v);
}

export function registerReputation() {
  game.me5e ??= {};
  game.me5e.reputation = {
    get: getReputation,
    getDetails: getReputationDetails,
    awardParagon,
    awardRenegade,
    setParagon,
    setRenegade
  };
}
