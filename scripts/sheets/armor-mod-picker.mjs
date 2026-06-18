import { getCompatibleArmorMods, attachArmorMod, detachArmorMod } from "../armorMods.mjs";
import { getModSlot } from "../mods.mjs";

// Picker for armor mods. Unlike the weapon picker (one named slot), an armor
// piece has a pool of generic slots, so this just lists every compatible
// unattached mod and attaches the clicked one. When opened from a filled pip
// it also offers a Detach button for that specific mod.
class ArmorModPickerDialog extends foundry.applications.api.DialogV2 {}

function escape(s) {
  return foundry.utils.escapeHTML(String(s ?? ""));
}

function buildContent({ compatible, currentItem }) {
  const rows = compatible.length
    ? compatible.map(m => `
        <li class="me5e-mod-picker-row" data-mod-id="${m.id}">
          <img src="${m.img}" alt="" />
          <span class="me5e-mod-picker-name">${escape(m.name)}</span>
          <span class="me5e-mod-picker-rarity">${escape(getModSlot(m) ?? "")}</span>
        </li>
      `).join("")
    : `<li class="me5e-mod-picker-empty">${game.i18n.localize("ME5E.Mods.ArmorNoneAvailable")}</li>`;

  const currentBlock = currentItem
    ? `<div class="me5e-mod-picker-current">
         <span>${game.i18n.format("ME5E.Mods.CurrentlyEquipped", { name: escape(currentItem.name) })}</span>
         <button type="button" class="me5e-mod-picker-detach">
           ${game.i18n.localize("ME5E.Mods.Detach")}
         </button>
       </div>`
    : "";

  return `${currentBlock}<ul class="me5e-mod-picker-list">${rows}</ul>`;
}

function wireRows(root, { actor, armor, currentModId, dialog }) {
  for (const row of root.querySelectorAll(".me5e-mod-picker-row")) {
    row.addEventListener("click", async () => {
      const modId = row.dataset.modId;
      await attachArmorMod(armor, modId);
      ui.notifications?.info(game.i18n.format("ME5E.Mods.ArmorAttached", {
        mod: actor.items.get(modId)?.name ?? "",
        armor: armor.name
      }));
      dialog.close();
    });
  }
  root.querySelector(".me5e-mod-picker-detach")?.addEventListener("click", async () => {
    await detachArmorMod(armor, currentModId);
    ui.notifications?.info(game.i18n.format("ME5E.Mods.ArmorDetached", {
      mod: actor.items.get(currentModId)?.name ?? "",
      armor: armor.name
    }));
    dialog.close();
  });
}

export async function openArmorModPicker({ actor, armor, currentModId = null }) {
  const compatible = getCompatibleArmorMods(actor, armor);
  const currentItem = currentModId ? actor.items.get(currentModId) : null;
  const title = game.i18n.format("ME5E.Mods.ArmorPickerTitle", { armor: armor.name });

  const dialog = new ArmorModPickerDialog({
    window: { title },
    content: buildContent({ compatible, currentItem }),
    buttons: [{ action: "cancel", label: game.i18n.localize("Cancel") }]
  });

  Hooks.once("renderArmorModPickerDialog", (app, html) => {
    if (app !== dialog) return;
    const root = html instanceof HTMLElement ? html : (html?.[0] ?? app.element);
    wireRows(root, { actor, armor, currentModId, dialog });
  });

  await dialog.render({ force: true });
}
