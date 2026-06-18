import {
  getCompatibleMods, attachMod, detachMod, getModAttachments,
  isToggleableMod, isModActive, setModActive
} from "../mods.mjs";

// Subclass so the render hook gets a unique name (`renderModPickerDialog`)
// and we can attach our row handlers after the dialog's DOM is in place.
// DialogV2 doesn't expose a `render` callback in its constructor options,
// so the previous attempt to wire handlers there silently no-op'd.
class ModPickerDialog extends foundry.applications.api.DialogV2 {}

function escape(s) {
  return foundry.utils.escapeHTML(String(s ?? ""));
}

function buildContent({ compatible, currentItem, slotLabel, active }) {
  const rows = compatible.length
    ? compatible.map(m => `
        <li class="me5e-mod-picker-row" data-mod-id="${m.id}">
          <img src="${m.img}" alt="" />
          <span class="me5e-mod-picker-name">${escape(m.name)}</span>
          <span class="me5e-mod-picker-rarity">${escape(m.system?.rarity ?? "")}</span>
        </li>
      `).join("")
    : `<li class="me5e-mod-picker-empty">${game.i18n.localize("ME5E.Mods.NoneAvailable")}</li>`;

  const toggleBtn = currentItem && isToggleableMod(currentItem)
    ? `<button type="button" class="me5e-mod-picker-toggle">
         ${game.i18n.localize(active ? "ME5E.Mods.Deactivate" : "ME5E.Mods.Activate")}
       </button>`
    : "";

  const currentBlock = currentItem
    ? `<div class="me5e-mod-picker-current">
         <span>${game.i18n.format("ME5E.Mods.CurrentlyEquipped", { name: escape(currentItem.name) })}</span>
         ${toggleBtn}
         <button type="button" class="me5e-mod-picker-detach">
           ${game.i18n.localize("ME5E.Mods.Detach")}
         </button>
       </div>`
    : "";

  return `${currentBlock}<ul class="me5e-mod-picker-list">${rows}</ul>`;
}

function wireRows(root, { actor, weapon, slot, slotLabel, active, dialog }) {
  for (const row of root.querySelectorAll(".me5e-mod-picker-row")) {
    row.addEventListener("click", async () => {
      const modId = row.dataset.modId;
      await attachMod(weapon, slot, modId);
      ui.notifications?.info(game.i18n.format("ME5E.Mods.Attached", {
        mod: actor.items.get(modId)?.name ?? "",
        slot: slotLabel
      }));
      dialog.close();
    });
  }
  root.querySelector(".me5e-mod-picker-toggle")?.addEventListener("click", async () => {
    const next = !active;
    await setModActive(weapon, slot, next);
    ui.notifications?.info(game.i18n.format(
      next ? "ME5E.Mods.Activated" : "ME5E.Mods.Deactivated",
      { slot: slotLabel }
    ));
    dialog.close();
  });
  root.querySelector(".me5e-mod-picker-detach")?.addEventListener("click", async () => {
    await detachMod(weapon, slot);
    ui.notifications?.info(game.i18n.format("ME5E.Mods.Detached", { slot: slotLabel }));
    dialog.close();
  });
}

export async function openModPicker({ actor, weapon, slot }) {
  const compatible = getCompatibleMods(actor, weapon, slot);
  const currentId = getModAttachments(weapon)[slot];
  const currentItem = currentId ? actor.items.get(currentId) : null;
  const active = isModActive(weapon, slot);
  const slotLabel = game.i18n.localize(`ME5E.Mods.Slot.${slot}`);
  const title = game.i18n.format("ME5E.Mods.PickerTitle", { weapon: weapon.name, slot: slotLabel });

  const dialog = new ModPickerDialog({
    window: { title },
    content: buildContent({ compatible, currentItem, slotLabel, active }),
    buttons: [{ action: "cancel", label: game.i18n.localize("Cancel") }]
  });

  Hooks.once("renderModPickerDialog", (app, html) => {
    if (app !== dialog) return;
    const root = html instanceof HTMLElement ? html : (html?.[0] ?? app.element);
    wireRows(root, { actor, weapon, slot, slotLabel, active, dialog });
  });

  await dialog.render({ force: true });
}
