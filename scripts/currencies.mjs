/**
 * Collapse dnd5e's CP/SP/EP/GP/PP currency block down to a single
 * "Credits" entry — Mass Effect's only currency. We keep the existing `gp`
 * key (rather than introducing a new one) so the dnd5e currency schema is
 * unchanged and pre-existing actor data still validates.
 */
export function registerCurrencies() {
  const currencies = CONFIG.DND5E?.currencies;
  if (!currencies) {
    console.warn("ME5e | CONFIG.DND5E.currencies not available; skipping currency remap");
    return;
  }

  // Remove every non-gp currency so the sheet only renders one input
  for (const key of Object.keys(currencies)) {
    if (key !== "gp") delete currencies[key];
  }

  // Relabel the surviving "gp" slot as Credits
  if (currencies.gp) {
    currencies.gp.label = "ME5E.Currency.Credits";
    currencies.gp.abbreviation = "ME5E.Currency.CreditsAbbr";
    currencies.gp.conversion = 1;
  }

  console.log("ME5e | Currency collapsed to Credits-only");
}
