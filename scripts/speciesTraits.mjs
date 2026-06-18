import { MODULE_ID } from "./config.mjs";

// Runtime behaviors for species/trait mechanics that dnd5e can't express as a
// static Active Effect or advancement. Each is keyed off the raw mechanic stashed
// on the species/trait item at build time (flags.me5e.mechanics = [{ type, … }]).

function hasMechanic(actor, type) {
  return !!actor?.items?.some((i) => {
    const mech = i.getFlag?.(MODULE_ID, "mechanics");
    return Array.isArray(mech) && mech.some((m) => m?.type === type);
  });
}

// Vorcha "Limited Regeneration": regain ALL Hit Dice on a long rest (dnd5e
// restores only half by default). dnd5e has already applied its half-recovery by
// the time `restCompleted` fires, so we top every class's spent dice back to 0.
async function onRestCompleted(actor, result) {
  if (!result?.longRest || !actor) return;
  if (!hasMechanic(actor, "regain-all-hit-dice")) return;
  const updates = [];
  for (const item of actor.items) {
    if (item.type === "class" && (item.system?.hitDiceUsed ?? 0) > 0) {
      updates.push({ _id: item.id, "system.hitDiceUsed": 0 });
    }
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
}

export function registerSpeciesTraits() {
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
}
