// ME5e language registry. The rulebook (Manual §4.e) treats languages as flavor
// only — universal translation tech means everyone effectively shares a common
// tongue — so the canonical roster is small: Citadel Trade as the lingua franca
// plus the handful of species languages the source names. Registered into
// CONFIG.DND5E.languages so race Trait advancements (built by me5e-build) can
// grant/choose them. Keys here MUST match the build's LANG_KEY map.

export const ME5E_LANGUAGES = {
  trade: {
    label: "Trade Languages",
    selectable: false,
    children: {
      "citadel-trade": "Citadel Trade",
      "gruul-trade": "Gruul Trade",
      "omegan-trade": "Omegan Trade",
      "zhulthai": "Zhulthai"
    }
  },
  "milky-way": {
    label: "Milky Way Languages",
    selectable: false,
    children: {
      "high-thessian": "High Thessian",   // Asari
      "palaven-standard": "Palaven Standard", // Turian
      "salarian": "Salarian",             // Bartuk / Covus / Ja'Salar / Vresh
      "krogan": "Krogan",                 // Old Urdnot / Krestnock
      "khelish": "Khelish",               // Quarian (formerly Shunar)
      "volus": "Volus",
      "elcor": "Elcor",                   // Thrruum / Ba-Baar
      "hanar": "Hanar",                   // bioluminescent
      "batarian": "Batarian",             // Hralik + caste slang
      "drell": "Drell",
      "vorcha": "Vorcha",
      "yahg": "Yahg",
      "prothean": "Prothean",             // Collectors / Protheans
      "geth": "Geth Machine Code",
      "basic": "Basic"                    // Human
    }
  },
  andromeda: {
    label: "Andromeda Languages",
    selectable: false,
    children: {
      "shelesh": "Shelesh",               // Angara
      "tonaizhet": "Tonaizhet",           // Kett
      "remnant": "Remnant"
    }
  }
};

export function registerLanguages() {
  const dnd5e = globalThis.CONFIG?.DND5E;
  if (!dnd5e) {
    console.warn("ME5e | CONFIG.DND5E not found; language registry skipped.");
    return;
  }
  // ME5e doesn't use the D&D language roster — replace it wholesale.
  dnd5e.languages = ME5E_LANGUAGES;
}
