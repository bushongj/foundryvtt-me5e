// Surface a character's prepared powers as a native spellbook section pinned to
// the top of the Powers tab. Rather than hand-build markup (which never quite
// matches dnd5e's responsive column grid), we wrap _prepareSpellbook and inject
// a synthetic section into its result — dnd5e then renders it through the same
// inventory template/column pipeline as every other spell section, so the
// header (including our Primes/Detonates column) lines up automatically.
//
// Method-wrap pattern mirrors inventory-section.mjs.

// A prepared-style powercaster prepares a subset of a known list, so the pinned
// view is meaningful. Known casters (Adept/Vanguard) cast their whole list, so
// it would be redundant — skip them.
function hasPreparedCasting(actor) {
  return Object.values(actor.spellcastingClasses ?? {}).some(
    (c) => CONFIG.DND5E?.spellcasting?.[c.system?.spellcasting?.type]?.prepares === true
  );
}

// Methods that have their own dedicated spellbook section and are NOT prepared
// from a class list — racial/innate grants (always-prepared, method "innate"/
// "atwill") and rituals. They must stay out of the Prepared Powers pin even
// though their `prepared` flag is 2; the rulebook treats them as separate.
const NON_PREPARED_METHODS = new Set(["innate", "atwill", "ritual"]);

// Prepared (1) or always-prepared (2) non-cantrip powers, sorted by level then
// name. Cantrips are always available and aren't "prepared", so they're omitted;
// so are innate/at-will racial grants (their own section — see above).
function getPreparedPowers(actor) {
  return actor.items
    .filter((i) => (i.type === "spell")
      && !NON_PREPARED_METHODS.has(i.system.method)
      && ((i.system.level ?? 0) > 0)
      && ((i.system.prepared === 1) || (i.system.prepared === 2)))
    .sort((a, b) => (a.system.level - b.system.level) || a.name.localeCompare(b.name));
}

// dnd5e's item-list-controls._applyFilters hides every row, then un-hides one
// element per item id (keyed in a map, so the LAST DOM occurrence wins). Our
// Prepared section duplicates each power that also lives in its level section,
// and since Prepared sits on top, the level-section copy wins and our copy
// stays hidden — an empty Prepared section. Patch the method to also re-show any
// hidden row whose id matches a visible one. No-op for non-duplicated lists.
function patchDuplicateFilter() {
  const proto = customElements.get("item-list-controls")?.prototype;
  if (!proto?._applyFilters || proto._me5eDupePatched) return;
  const original = proto._applyFilters;
  proto._applyFilters = function() {
    original.call(this);
    try {
      const list = this.list;
      if (!list) return;
      const visible = new Set();
      list.querySelectorAll(".item-list .item:not([hidden])").forEach((el) => {
        if (el.dataset.entryId) visible.add(el.dataset.entryId);
      });
      let changed = false;
      list.querySelectorAll(".item-list .item[hidden]").forEach((el) => {
        if (visible.has(el.dataset.entryId)) { el.hidden = false; changed = true; }
      });
      if (changed) {
        list.querySelectorAll(".items-section").forEach((sec) => {
          if (sec.querySelector(".item-list .item:not([hidden])")) sec.hidden = false;
        });
      }
    } catch (err) {
      console.warn("ME5e | duplicate-filter fix failed:", err);
    }
  };
  proto._me5eDupePatched = true;
}

let _wrapped = false;

export function registerPreparedPowersSection() {
  if (_wrapped) return;
  const base = globalThis.dnd5e?.applications?.actor?.BaseActorSheet;
  if (!base?.prototype?._prepareSpellbook) {
    console.warn("ME5e | BaseActorSheet._prepareSpellbook not found; Prepared Powers section disabled.");
    return;
  }
  patchDuplicateFilter();

  const original = base.prototype._prepareSpellbook;
  base.prototype._prepareSpellbook = function(context) {
    const spellbook = original.call(this, context);
    try {
      if (this.actor?.type !== "character" || !hasPreparedCasting(this.actor)) return spellbook;
      const prepared = getPreparedPowers(this.actor);
      if (!prepared.length) return spellbook;

      // Clone any existing section's columns so ours is byte-identical to the
      // rest of the book (same Primes/Detonates / Time / Range / … layout).
      const columns = foundry.utils.deepClone(Object.values(spellbook)[0]?.columns ?? []);
      spellbook.prepared = {
        label: "ME5E.Powercasting.PreparedPowers",
        id: "prepared",
        slot: "prepared",
        columns,
        order: -1, // above the cantrips section (order 0)
        usesSlots: false,
        draggable: false,
        minWidth: 220,
        items: prepared,
        dataset: { type: "spell" }
      };
    } catch (err) {
      console.warn("ME5e | Prepared Powers section failed:", err);
    }
    return spellbook;
  };

  _wrapped = true;
}
