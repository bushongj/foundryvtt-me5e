// ME5e weapon property catalog. Slugs match the kebab-case strings stored
// in `flags.me5e.weapon.properties` on every weapon item in the pack.
//
// `isMe5e: true` entries don't exist in dnd5e at all and are registered
// with `CONFIG.DND5E.itemProperties` + `validProperties.weapon` at setup
// so the dnd5e item sheet, filters, and our weapon loadout chips all
// treat them as first-class.
//
// `isMe5e: false` entries already exist in dnd5e under abbreviations
// (`fin`/`hvy`/`lgt`/`rch`/`spc`/`thr`/`two`/`ver`). The kebab-case slug
// in the pack flags doesn't match those abbreviations, so we don't try to
// re-register them — we just provide label + rule lookup so our chip
// rendering has consistent text regardless of which property is shown.

export const ME5E_WEAPON_PROPERTIES = {
  "arc":        { labelKey: "ME5E.WeaponProp.Arc.Label",        descKey: "ME5E.WeaponProp.Arc.Desc",        isMe5e: true  },
  "burst-fire": { labelKey: "ME5E.WeaponProp.BurstFire.Label",  descKey: "ME5E.WeaponProp.BurstFire.Desc",  isMe5e: true  },
  "double-tap": { labelKey: "ME5E.WeaponProp.DoubleTap.Label",  descKey: "ME5E.WeaponProp.DoubleTap.Desc",  isMe5e: true  },
  "hip-fire":   { labelKey: "ME5E.WeaponProp.HipFire.Label",    descKey: "ME5E.WeaponProp.HipFire.Desc",    isMe5e: true  },
  "recoil":     { labelKey: "ME5E.WeaponProp.Recoil.Label",     descKey: "ME5E.WeaponProp.Recoil.Desc",     isMe5e: true  },
  "silent":     { labelKey: "ME5E.WeaponProp.Silent.Label",     descKey: "ME5E.WeaponProp.Silent.Desc",     isMe5e: true  },
  "vented":     { labelKey: "ME5E.WeaponProp.Vented.Label",     descKey: "ME5E.WeaponProp.Vented.Desc",     isMe5e: true  },

  "finesse":    { labelKey: "ME5E.WeaponProp.Finesse.Label",    descKey: "ME5E.WeaponProp.Finesse.Desc",    isMe5e: false },
  "heavy":      { labelKey: "ME5E.WeaponProp.Heavy.Label",      descKey: "ME5E.WeaponProp.Heavy.Desc",      isMe5e: false },
  "light":      { labelKey: "ME5E.WeaponProp.Light.Label",      descKey: "ME5E.WeaponProp.Light.Desc",      isMe5e: false },
  "reach":      { labelKey: "ME5E.WeaponProp.Reach.Label",      descKey: "ME5E.WeaponProp.Reach.Desc",      isMe5e: false },
  "special":    { labelKey: "ME5E.WeaponProp.Special.Label",    descKey: "ME5E.WeaponProp.Special.Desc",    isMe5e: false },
  "thrown":     { labelKey: "ME5E.WeaponProp.Thrown.Label",     descKey: "ME5E.WeaponProp.Thrown.Desc",     isMe5e: false },
  "two-handed": { labelKey: "ME5E.WeaponProp.TwoHanded.Label",  descKey: "ME5E.WeaponProp.TwoHanded.Desc",  isMe5e: false },
  "versatile":  { labelKey: "ME5E.WeaponProp.Versatile.Label",  descKey: "ME5E.WeaponProp.Versatile.Desc",  isMe5e: false }
};

export function weaponPropertyLabel(key) {
  const entry = ME5E_WEAPON_PROPERTIES[key];
  if (entry) return game.i18n.localize(entry.labelKey);
  return String(key).split(/[-_ ]+/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

export function weaponPropertyDescription(key) {
  const entry = ME5E_WEAPON_PROPERTIES[key];
  return entry ? game.i18n.localize(entry.descKey) : "";
}

// Runs on setup — i18n is ready, dnd5e's preLocalize sweep over its own
// itemProperties has finished. We pre-localize labels at insert time so
// dnd5e never sees a raw "ME5E..." key in CONFIG.
function injectIntoDnd5eConfig() {
  const props = CONFIG?.DND5E?.itemProperties;
  const validSet = CONFIG?.DND5E?.validProperties?.weapon;
  if (!props || !validSet) {
    console.warn("ME5e | dnd5e item-property config unavailable; weapon property registration skipped.");
    return;
  }
  for (const [key, entry] of Object.entries(ME5E_WEAPON_PROPERTIES)) {
    if (!entry.isMe5e) continue;
    if (!(key in props)) props[key] = { label: game.i18n.localize(entry.labelKey) };
    validSet.add(key);
  }
}

export function registerWeaponProperties() {
  Hooks.once("setup", injectIntoDnd5eConfig);
}
