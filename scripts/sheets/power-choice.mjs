// Power-selection level-up fixes for dnd5e's ItemChoiceFlow.
//
// ME powers are learned through an ItemChoice advancement of type "spell" with a
// per-level `choices` count map (one advancement spanning several levels). dnd5e's
// flow has two shortcomings for that shape:
//   1. It computes `previouslySelected` (powers picked at earlier levels) but never
//      applies it, so the full pool stays selectable at every level — leveling
//      several levels at once lets you pick the SAME power repeatedly (duplicates).
//   2. It renders the current level's pool as one flat list, which is unwieldy once
//      a class knows powers across several power levels.
//
// We wrap `_prepareContentContext` (which builds `context.sections`) and, for
// spell-type advancements only, (1) disable + label already-learned powers and
// (2) split the current-level section into one section per power level. dnd5e's
// own template iterates `sections` with per-section headers + checkboxes, so we
// reuse it as-is and only restructure the data it renders.

let _wrapped = false;

export function registerPowerChoice() {
  if (_wrapped) return;
  // Wrap at setup — dnd5e's application classes are published by then.
  Hooks.once("setup", () => {
    const Flow = globalThis.dnd5e?.applications?.advancement?.ItemChoiceFlow;
    const proto = Flow?.prototype;
    if (typeof proto?._prepareContentContext !== "function") {
      console.warn("ME5e | ItemChoiceFlow._prepareContentContext not found; power-choice fixes disabled.");
      return;
    }
    const original = proto._prepareContentContext;
    proto._prepareContentContext = async function (context, options) {
      await original.call(this, context, options);
      try {
        if (this.advancement?.configuration?.type === "spell") regroupPowerSections(this, context);
      } catch (err) {
        console.warn("ME5e | power-choice regroup failed:", err);
      }
      return context;
    };
    _wrapped = true;
  });
}

// Section header for a power level (0 = Cantrips). Reuses the powercasting slot
// labels added in lang/en.json (`...SLOTS.power0-9`), which always resolve.
function powerLevelLabel(level) {
  return game.i18n.localize(`DND5E.SPELLCASTING.SLOTS.power${level}`);
}

// Rewrite `context.sections` (an iterator after the original builds it) so the
// current-level pool is deduped against earlier picks and grouped by power level.
function regroupPowerSections(flow, context) {
  const sections = [...(context.sections ?? [])];
  const currentIdx = sections.findIndex((s) => s?.isCurrentLevel);
  if (currentIdx < 0) { context.sections = sections; return; }

  // UUIDs learned at earlier levels of this advancement (earlier-level sections
  // list the prior picks; they carry no checkbox of their own).
  const earlier = new Set();
  sections.forEach((s, i) => {
    if (i === currentIdx || s?.isCurrentLevel) return;
    for (const it of s.items ?? []) if (it?.uuid) earlier.add(it.uuid);
  });

  const current = sections[currentIdx];
  const items = current.items ?? [];

  // Power level per pool UUID. The flow caches the resolved pool on `this.pool`;
  // context item uuids match `flags.dnd5e.sourceId ?? uuid` (item-choice-flow.mjs).
  const levelByUuid = new Map();
  for (const p of flow.pool ?? []) {
    const uuid = p?.flags?.dnd5e?.sourceId ?? p?.uuid;
    if (uuid) levelByUuid.set(uuid, p.system?.level ?? 0);
  }

  // Bug 2: an already-learned power that isn't selected at THIS level can't be
  // picked again — grey it out and mark it (a checked item is one being added now).
  for (const it of items) {
    if (earlier.has(it.uuid) && !it.checked) {
      it.disabled = true;
      it.name = game.i18n.format("ME5E.Powercasting.AlreadyKnown", { name: it.name });
    }
  }

  // Bug 3: bucket items by power level, then emit one current-level section each.
  const byLevel = new Map();
  for (const it of items) {
    const lvl = levelByUuid.get(it.uuid) ?? 0;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl).push(it);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);

  // Preserve dnd5e's "Chosen X / Y" count (the per-character-level budget applies
  // across all groups) by keeping it on the first group's header.
  const groups = levels.map((lvl, i) => ({
    header: i === 0 ? `${powerLevelLabel(lvl)} · ${current.header}` : powerLevelLabel(lvl),
    isCurrentLevel: true,
    items: byLevel.get(lvl)
  }));

  sections.splice(currentIdx, 1, ...groups);
  context.sections = sections;
}
