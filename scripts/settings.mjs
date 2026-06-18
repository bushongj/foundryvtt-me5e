import { MODULE_ID } from "./config.mjs";

// World settings for the ME5e module.

export const SETTINGS = {
  trackThermalClips: "trackThermalClips"
};

export function registerSettings() {
  // When on, reloading a weapon consumes a Thermal Clip from the actor's
  // inventory (mirrors dnd5e ammunition tracking, which defaults on). When
  // off, reloading still happens but no clips are accounted for.
  game.settings.register(MODULE_ID, SETTINGS.trackThermalClips, {
    name: "ME5E.Settings.TrackThermalClips.Name",
    hint: "ME5E.Settings.TrackThermalClips.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

export function tracksThermalClips() {
  return game.settings.get(MODULE_ID, SETTINGS.trackThermalClips);
}
