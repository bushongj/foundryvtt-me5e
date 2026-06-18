import { ME5E, registerItemRarity } from "./config.mjs";
import { registerSettings } from "./settings.mjs";
import { registerShields } from "./shields.mjs";
import { registerPowerSchools, registerPowercasting, registerPowerComboColumn, registerPowerAdvancements } from "./powers.mjs";
import { registerPowerPoints } from "./powerPoints.mjs";
import { registerCombos, registerCustomStatuses, applyPrimer, detonateTarget } from "./combos.mjs";
import { registerArmor } from "./armor.mjs";
import { registerReputation } from "./reputation.mjs";
import { registerHeat } from "./heat.mjs";
import { registerSheetInjection } from "./sheets/inject.mjs";
import { registerInventorySection } from "./sheets/inventory-section.mjs";
import { registerPreparedPowersSection } from "./sheets/prepared-powers.mjs";
import { registerPowerChoice } from "./sheets/power-choice.mjs";
import { registerSkills, registerWeaponProficiencies, registerTools, patchExpertiseAdvancement, registerCreatureTypes } from "./skills.mjs";
import { registerCurrencies } from "./currencies.mjs";
import { registerBackgrounds } from "./backgrounds.mjs";
import { registerWeaponProperties } from "./weaponProperties.mjs";
import { registerWeapons, registerModProperties, patchRecoilAbility } from "./weapons.mjs";
import { registerModEffects } from "./modEffects.mjs";
import { registerDoubleTap } from "./doubleTap.mjs";
import { registerLanguages } from "./languages.mjs";
import { registerSpeciesTraits } from "./speciesTraits.mjs";
import { getPowerPoints, setPowerPoints } from "./powerPoints.mjs";
import { getShields, setShields, getBarriers, setBarriers } from "./shields.mjs";
import { getPowerBudgets } from "./powers.mjs";

globalThis.me5e = {
  config: ME5E,
  version: "0.1.0",
  // Public API for macros / diagnostics.
  api: {
    getPowerPoints, setPowerPoints, getShields, setShields, getBarriers, setBarriers, getPowerBudgets,
    // Macro-friendly prime/detonate (the cast-card buttons call the same paths).
    primeTarget: (target, type, source = null) => applyPrimer(target, type, source),
    detonateTarget: (target, source = null) => detonateTarget(target, source)
  }
};

Hooks.once("init", () => {
  console.log("ME5e | Initializing Mass Effect 5e module");
  CONFIG.ME5E = ME5E;
  registerSettings();
  registerLanguages();
  registerSpeciesTraits();
  registerShields();
  registerPowerSchools();
  registerPowerComboColumn();
  registerPowercasting();
  registerPowerAdvancements();
  registerPowerChoice();
  registerPowerPoints();
  registerArmor();
  // dnd5e rebuilds CONFIG.statusEffects wholesale in _configureStatusEffects()
  // at i18nInit (AFTER init), which drops anything we push here. Register our
  // custom + primer statuses on i18nInit too — our handler runs after dnd5e's
  // (the system's handler is registered first), so our entries survive.
  Hooks.once("i18nInit", registerCustomStatuses);
  registerCombos();
  registerReputation();
  registerHeat();
  registerSkills();
  registerWeaponProficiencies();
  registerTools();
  registerCreatureTypes();
  patchExpertiseAdvancement();
  registerCurrencies();
  registerBackgrounds();
  registerWeaponProperties();
  registerItemRarity();
  registerWeapons();
  registerModProperties();
  patchRecoilAbility();
  registerModEffects();
  registerDoubleTap();
  registerInventorySection();
  registerPreparedPowersSection();
  registerSheetInjection();
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") {
    ui.notifications.error("ME5e requires the dnd5e system.");
    return;
  }
  console.log(`ME5e | Ready (dnd5e ${game.system.version})`);
});
