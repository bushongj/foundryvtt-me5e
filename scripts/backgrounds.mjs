import { MODULE_ID } from "./config.mjs";

// Starting credits live on the background item as flags.me5e.startingCredits
// (built from the source `startingCredits`). dnd5e 5.3.3 never applies a
// background's `system.wealth`, so grant the credits here when the background is
// dropped on a character: add them to the actor's single "Credits" slot
// (system.currency.gp, relabeled by currencies.mjs).
//
// Idempotent: each background's grant is recorded under
// flags.me5e.startingCreditsApplied[<identifier>] so removing and re-adding the
// same background never double-pays.
async function onCreateBackground(item, options, userId) {
  if (game.userId !== userId) return;
  const actor = item.actor;
  if (!actor || actor.type !== "character") return;
  if (item.type !== "background") return;

  const credits = Number(item.getFlag(MODULE_ID, "startingCredits") ?? 0);
  if (!credits) return;

  const id = item.system?.identifier || item.name?.slugify?.({ strict: true }) || item.id;
  const applied = actor.getFlag(MODULE_ID, "startingCreditsApplied") ?? {};
  if (applied[id]) return;

  const current = Number(actor.system?.currency?.gp ?? 0);
  await actor.update({
    "system.currency.gp": current + credits,
    [`flags.${MODULE_ID}.startingCreditsApplied.${id}`]: true
  });

  ui.notifications?.info(game.i18n.format("ME5E.Background.CreditsApplied", {
    name: item.name,
    credits: credits.toLocaleString()
  }));
}

export function registerBackgrounds() {
  Hooks.on("createItem", onCreateBackground);
}
