import { getMe5eModFlags } from "../mods.mjs";

// Give me5e mods (weapon + armor) their own "Mods" section on the inventory
// tab instead of lumping them under Equipment.
//
// dnd5e builds inventory sections from each item data model's static
// `inventorySection`, then distributes rendered item rows into sections by
// matching the `type` group dataset (the default inventory grouping). Mods
// are stored as `equipment` items, so they'd otherwise land in the Equipment
// section. We:
//   1. retag mod rows with a "mods" group in the shared _prepareItem, and
//   2. register a matching section in each sheet's _configureInventorySections.
//
// Both are method wraps on the dnd5e sheet classes, mirroring the data-model
// wrap pattern used in armor.mjs / weapons.mjs.

const MODS_SECTION = {
  id: "mods",
  order: 250, // weapon=100, equipment=200, → mods sits right after equipment
  label: "ME5E.Mods.SectionLabel",
  groups: { type: "mods" },
  columns: ["price", "weight", "quantity", "charges", "controls"],
  minWidth: 250
};

let _wrapped = false;

export function registerInventorySection() {
  if (_wrapped) return;
  const ns = globalThis.dnd5e?.applications?.actor;
  const base = ns?.BaseActorSheet;
  if (!base?.prototype?._prepareItemPhysical) {
    console.warn("ME5e | BaseActorSheet._prepareItemPhysical not found; Mods inventory section disabled.");
    return;
  }

  // 1. Retag mod rows. The base _prepareItemPhysical sets
  //    `ctx.groups.type = item.type` as its final step, and every concrete
  //    sheet calls super (none touch groups.type afterward), so retagging
  //    right after the original runs covers character/npc/vehicle uniformly.
  const originalPhysical = base.prototype._prepareItemPhysical;
  base.prototype._prepareItemPhysical = async function(item, ctx) {
    await originalPhysical.call(this, item, ctx);
    try {
      if (getMe5eModFlags(item)) {
        ctx.groups ??= {};
        ctx.groups.type = "mods";
      }
    } catch (err) {
      console.warn("ME5e | mod inventory retag failed:", err);
    }
  };

  // 2. Register the section. Each concrete sheet overrides
  //    _configureInventorySections without calling super, so we wrap them
  //    individually rather than the (empty) base.
  for (const name of ["CharacterActorSheet", "NPCActorSheet", "VehicleActorSheet"]) {
    const cls = ns?.[name];
    const original = cls?.prototype?._configureInventorySections;
    if (!original) continue;
    cls.prototype._configureInventorySections = async function(sections) {
      await original.call(this, sections);
      if (!sections.some(s => s.id === "mods")) {
        sections.push(foundry.utils.deepClone(MODS_SECTION));
      }
    };
  }

  _wrapped = true;
}
