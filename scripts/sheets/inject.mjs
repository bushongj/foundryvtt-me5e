import { MODULE_ID } from "../config.mjs";
import { getShields, getBarriers, setShields, setBarriers } from "../shields.mjs";
import { getTechArmor, setTechArmor } from "../techArmor.mjs";
import { getPowerPoints, setPowerPoints } from "../powerPoints.mjs";
import { getReputation, setParagon, setRenegade } from "../reputation.mjs";
import { getPowerBudgets } from "../powers.mjs";
import { computeArmorState, getEquippedByPlacement, summarizeArmorBuffs, getArmorShieldsRegen, isArmorProficient, getActiveSetBonuses } from "../armor.mjs";
import { getWeaponSlots, getWeaponDamageFormula, getDisplayProperties, isWeaponProficient } from "../weapons.mjs";
import { weaponPropertyLabel, weaponPropertyDescription } from "../weaponProperties.mjs";
import {
  getSlotsForWeapon, getAttachedModItems, hasSpecialProperty,
  getAttackAugmentDamageBonus, getAmmoDamageTypeOverride, detachMod,
  isToggleableMod, isModActive, getModSlot
} from "../mods.mjs";
import {
  ARMOR_SLOT_LIMITS, getArmorEligibleAreas, getAttachedArmorModItems, detachArmorMod
} from "../armorMods.mjs";
import { openModPicker } from "./mod-picker.mjs";
import { openArmorModPicker } from "./armor-mod-picker.mjs";
import { getHeatState, reloadWeapon } from "../heat.mjs";
import { isBurstWeapon, burstFire } from "../burstFire.mjs";
import { isHeavyWeapon, heavyWeaponFire, spitfireActive, sustainSpitfire, endSpitfire } from "../heavyWeapon.mjs";
import { isDoubleTapWeapon, doubleTapFire } from "../doubleTap.mjs";
import { setModActive } from "../mods.mjs";

// Base weapon-carry slots before any holster-mod bonus (PHB rule).
const WEAPON_BASE_SLOTS = 4;

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function itemDescriptionText(item) {
  const html = item?.system?.description?.value ?? "";
  if (!html) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Rich HTML tooltip for a mod pip: a bold header line over the mod's
// description. Foundry v13 renders data-tooltip as HTML, so structural tags
// stay literal while the dynamic text is attribute-escaped.
function modTooltipHtml(mod, headText) {
  const head = `<strong>${escapeAttr(headText)}</strong>`;
  const desc = itemDescriptionText(mod);
  return desc ? `${head}<br>${escapeAttr(desc)}` : head;
}

const METER_GET = {
  shields: getShields,
  techArmor: getTechArmor,
  barriers: getBarriers,
  powerPoints: getPowerPoints,
  hp: (actor) => ({
    value: Number(actor.system.attributes?.hp?.value ?? 0),
    max: Number(actor.system.attributes?.hp?.max ?? 0)
  })
};
const METER_SET = {
  shields: setShields,
  techArmor: setTechArmor,
  barriers: setBarriers,
  powerPoints: (actor, { value }) => setPowerPoints(actor, value),
  hp: (actor, { value }) => actor.update({ "system.attributes.hp.value": Math.max(0, value) })
};

function adjustMeter(actor, meter, delta) {
  const get = METER_GET[meter];
  const set = METER_SET[meter];
  if (!get || !set) return;
  const current = get(actor);
  const next = Math.max(0, Math.min(current.max, current.value + delta));
  if (next === current.value) return;
  return set(actor, { value: next });
}

function renderMeterControls(meter, extras = "") {
  const dec = game.i18n.localize("ME5E.UI.MeterDecrement");
  const inc = game.i18n.localize("ME5E.UI.MeterIncrement");
  return `
    <span class="me5e-meter-controls">
      <button type="button" class="me5e-meter-decrement" data-meter="${meter}"
              aria-label="${escapeAttr(dec)}" data-tooltip="${escapeAttr(dec)}">−</button>
      <button type="button" class="me5e-meter-increment" data-meter="${meter}"
              aria-label="${escapeAttr(inc)}" data-tooltip="${escapeAttr(inc)}">+</button>
      ${extras}
    </span>
  `;
}

function renderTechArmorMeter(actor) {
  const t = getTechArmor(actor);
  const tPct = t.max > 0 ? Math.round((t.value / t.max) * 100) : 0;
  const label = game.i18n.localize("ME5E.UI.TechArmor");
  return `
    <div class="meter-group">
      <div class="label roboto-condensed-upper">
        <span>${label}</span>
        ${renderMeterControls("techArmor")}
      </div>
      <div class="meter me5e-tech-armor progress" role="meter"
           aria-valuemin="0" aria-valuenow="${t.value}" aria-valuemax="${t.max}"
           style="--bar-percentage: ${tPct}%">
        <div class="label">
          <input type="number" class="me5e-tech-armor-value value" value="${t.value}" min="0" max="${t.max}" />
          <span class="separator">&sol;</span>
          <input type="number" class="me5e-tech-armor-max max" value="${t.max}" min="0" />
        </div>
      </div>
    </div>
  `;
}

function renderShieldsMeter(actor) {
  const s = getShields(actor);
  const sPct = s.max > 0 ? Math.round((s.value / s.max) * 100) : 0;
  const shieldsLabel = game.i18n.localize("ME5E.UI.Shields");
  const regen = getArmorShieldsRegen(actor);
  const canRegen = regen > 0 && s.value < s.max;
  const regenTooltip = regen > 0
    ? game.i18n.format("ME5E.UI.RegenShieldsTooltip", { amount: regen, max: s.max })
    : "";
  const regenBtn = regen > 0
    ? `<button type="button" class="me5e-shields-regen-button"
                aria-label="${escapeAttr(game.i18n.localize("ME5E.UI.RegenShields"))}"
                data-tooltip="${escapeAttr(regenTooltip)}"
                ${canRegen ? "" : "disabled"}>
         <i class="fa-solid fa-arrows-rotate" inert></i>
       </button>`
    : "";
  return `
    <div class="meter-group">
      <div class="label roboto-condensed-upper">
        <span>${shieldsLabel}</span>
        ${renderMeterControls("shields", regenBtn)}
      </div>
      <div class="meter me5e-shields progress" role="meter"
           aria-valuemin="0" aria-valuenow="${s.value}" aria-valuemax="${s.max}"
           style="--bar-percentage: ${sPct}%">
        <div class="label">
          <input type="number" class="me5e-shields-value value" value="${s.value}" min="0" max="${s.max}" />
          <span class="separator">&sol;</span>
          <input type="number" class="me5e-shields-max max" value="${s.max}" min="0" />
        </div>
      </div>
    </div>
  `;
}

function renderBarriersMeter(actor) {
  const b = getBarriers(actor);
  const bPct = b.max > 0 ? Math.round((b.value / b.max) * 100) : 0;
  const barriersLabel = game.i18n.localize("ME5E.UI.Barriers");
  return `
    <div class="meter-group">
      <div class="label roboto-condensed-upper">
        <span>${barriersLabel}</span>
        ${renderMeterControls("barriers")}
      </div>
      <div class="meter me5e-barriers progress" role="meter"
           aria-valuemin="0" aria-valuenow="${b.value}" aria-valuemax="${b.max}"
           style="--bar-percentage: ${bPct}%">
        <div class="label">
          <input type="number" class="me5e-barriers-value value" value="${b.value}" min="0" max="${b.max}" />
          <span class="separator">&sol;</span>
          <input type="number" class="me5e-barriers-max max" value="${b.max}" min="0" />
        </div>
      </div>
    </div>
  `;
}

function renderShieldBar(actor) {
  // Order mirrors damage flow: Barriers (player-rolled soak) → Tech Armor → Shields → HP.
  const body = renderBarriersMeter(actor) + renderTechArmorMeter(actor) + renderShieldsMeter(actor);
  return `<div class="me5e-defense" data-actor-id="${actor.id}">${body}</div>`;
}

// Point-caster pool (Engineer/Infiltrator/Musician/Tracker). The max scales with
// class level (read-only display); the per-cast spend limit is shown alongside.
function renderPowerPointsMeter(actor) {
  const p = getPowerPoints(actor);
  const pct = p.max > 0 ? Math.round((p.value / p.max) * 100) : 0;
  const label = game.i18n.localize("ME5E.PowerPoints.Label");
  const limitNote = p.limit ? ` (max lvl ${p.limit})` : "";
  return `
    <div class="me5e-injected me5e-injected-power-points">
      <div class="me5e-defense" data-actor-id="${actor.id}">
        <div class="meter-group">
          <div class="label roboto-condensed-upper">
            <span>${label}${limitNote}</span>
            ${renderMeterControls("powerPoints")}
          </div>
          <div class="meter me5e-power-points progress" role="meter"
               aria-valuemin="0" aria-valuenow="${p.value}" aria-valuemax="${p.max}"
               style="--bar-percentage: ${pct}%">
            <div class="label">
              <input type="number" class="me5e-power-points-value value" value="${p.value}" min="0" max="${p.max}" />
              <span class="separator">&sol;</span>
              <span class="max">${p.max}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Vehicle-sheet shield rendering — mirrors the dnd5e vehicle HP block
 * (.pills-group > h3.icon) so it visually matches Hit Points on that sheet.
 */
function renderShieldsVehicle(actor) {
  const s = getShields(actor);
  const label = game.i18n.localize("ME5E.UI.Shields");
  return `
    <div class="pills-group me5e-vehicle-shields-group" data-actor-id="${actor.id}">
      <h3 class="icon">
        <i class="fa-solid fa-shield-halved fa-fw" inert></i>
        <span class="roboto-upper">${label}</span>
        <span class="counter display me5e-vehicle-shields-counter">
          <input type="number" class="me5e-shields-value" value="${s.value}" min="0" />
          <span class="separator">&sol;</span>
          <input type="number" class="me5e-shields-max" value="${s.max}" min="0" />
        </span>
      </h3>
    </div>
  `;
}

function renderArmorSlot(item, placement, opts = {}) {
  const wide = opts.wide ? " wide" : "";
  const placementLabel = game.i18n.localize(`ME5E.Armor.Placement.${placement}`);
  if (!item) {
    return `
      <div class="me5e-armor-slot empty${wide}" data-placement="${placement}">
        <div class="me5e-armor-slot-label">${placementLabel}</div>
        <div class="me5e-armor-slot-icon">—</div>
        <div class="me5e-armor-slot-name">${game.i18n.localize("ME5E.Armor.Empty")}</div>
        <div class="me5e-armor-slot-bonus"></div>
      </div>
    `;
  }
  const acBonus = Number(item.flags?.me5e?.armor?.acBonus ?? 0);
  const bonusStr = acBonus > 0 ? `+${acBonus}` : `${acBonus}`;
  const tooltip = itemDescriptionText(item);
  const tooltipAttr = tooltip ? ` data-tooltip="${escapeAttr(tooltip)}"` : "";
  const profClass = isArmorProficient(item, opts.actor) ? "" : " not-proficient";
  return `
    <div class="me5e-armor-slot equipped${wide}${profClass}" data-placement="${placement}" data-item-id="${item.id}"${tooltipAttr}>
      <div class="me5e-armor-slot-label">${placementLabel}</div>
      <div class="me5e-armor-slot-icon">
        <img src="${item.img}" alt="" />
      </div>
      <div class="me5e-armor-slot-name">${item.name}</div>
      <div class="me5e-armor-slot-bonus">${bonusStr} AC</div>
      ${renderArmorModSlots(item, opts.actor)}
    </div>
  `;
}

function renderArmorModPip(armor, area, mod) {
  const areaLabel = game.i18n.localize(`ME5E.Armor.Placement.${area}`);
  if (mod) {
    const head = `${areaLabel}: ${mod.name}`;
    return `<button type="button" class="me5e-mod-pip filled" data-area="${area}"
                    data-mod-id="${mod.id}" data-armor-id="${armor.id}"
                    data-tooltip="${modTooltipHtml(mod, head)}" data-tooltip-direction="UP"
                    aria-label="${escapeAttr(head)}">
              <img src="${mod.img}" alt="" />
            </button>`;
  }
  const tip = game.i18n.format("ME5E.Mods.ArmorPipEmptyTooltip", { area: areaLabel });
  return `<button type="button" class="me5e-mod-pip empty" data-area="${area}"
                  data-armor-id="${armor.id}"
                  data-tooltip="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}">
            <span class="me5e-mod-pip-symbol">+</span>
          </button>`;
}

function renderArmorModSlots(armor, actor) {
  if (!actor) return "";
  const areas = getArmorEligibleAreas(armor);
  if (!areas.length) return "";
  const byArea = {};
  for (const mod of getAttachedArmorModItems(armor, actor)) {
    const a = getModSlot(mod);
    (byArea[a] ??= []).push(mod);
  }
  let pips = "";
  for (const area of areas) {
    const limit = ARMOR_SLOT_LIMITS[area] ?? 0;
    const mods = byArea[area] ?? [];
    for (let i = 0; i < limit; i++) pips += renderArmorModPip(armor, area, mods[i] ?? null);
  }
  return `<div class="me5e-armor-slot-mods">${pips}</div>`;
}

// Pretty-print sense/condition/damage-type slug → display label. Tries
// dnd5e CONFIG first (covers damageTypes, conditionTypes), falls back to
// title-cased slug.
function prettyLabel(slug, configKey) {
  const cfg = CONFIG?.DND5E?.[configKey];
  const entry = cfg?.[slug];
  if (typeof entry === "string") return game.i18n.localize(entry);
  if (entry?.label) return game.i18n.localize(entry.label);
  if (entry?.name) return game.i18n.localize(entry.name);
  return String(slug).split(/[-_ ]+/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

// Convert feet → meters when the actor uses metric movement. ME5e's
// convention (matches the existing speed-penalty constants in armor.mjs)
// is roughly 5ft = 2m, i.e. multiply by 0.4.
function formatDistance(ft, isMeters) {
  if (!isMeters) return `${ft}ft`;
  const m = Math.round(ft * 0.4);
  return `${m}m`;
}

function renderArmorBuffs(buffs, actor) {
  const isMeters = (actor.system.attributes?.movement?.units ?? "ft") === "m";
  const chips = [];

  if (buffs) {
    for (const [sense, dist] of Object.entries(buffs.senses)) {
      chips.push(`${prettyLabel(sense, "senses")} ${formatDistance(dist, isMeters)}`);
    }
    for (const [key, ft] of Object.entries(buffs.speedBonus)) {
      const label = prettyLabel(key, "movementTypes");
      const sign = ft >= 0 ? "+" : "";
      chips.push(`${label} ${sign}${formatDistance(ft, isMeters)}`);
    }
    if (buffs.resistances.size) {
      const list = [...buffs.resistances].map(r => prettyLabel(r, "damageTypes")).join(", ");
      chips.push(`${game.i18n.localize("ME5E.Armor.BuffResist")}: ${list}`);
    }
    if (buffs.condImmunities.size) {
      const list = [...buffs.condImmunities].map(c => prettyLabel(c, "conditionTypes")).join(", ");
      chips.push(`${game.i18n.localize("ME5E.Armor.BuffImmune")}: ${list}`);
    }
    if (buffs.acBonus) {
      const sign = buffs.acBonus >= 0 ? "+" : "";
      chips.push(`${game.i18n.localize("ME5E.Armor.BuffAC")} ${sign}${buffs.acBonus}`);
    }
    if (buffs.thermalClips) chips.push(`${game.i18n.localize("ME5E.Armor.BuffThermalClips")} +${buffs.thermalClips}`);
    if (buffs.mediGel)      chips.push(`${game.i18n.localize("ME5E.Armor.BuffMediGel")} +${buffs.mediGel}`);
    if (buffs.grenades)     chips.push(`${game.i18n.localize("ME5E.Armor.BuffGrenades")} +${buffs.grenades}`);

    // Weapon-carry capacity: 4 base slots + holster-mod bonuses (player tracks
    // which weapons are stowed; two-handed weapons take 2 slots).
    if (buffs.weaponSlots) {
      chips.push(`${game.i18n.localize("ME5E.Armor.BuffWeaponSlots")}: ${WEAPON_BASE_SLOTS + buffs.weaponSlots}`);
    }
    const cap = s => String(s).replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    for (const s of (buffs.advSaves ?? [])) {
      chips.push(`${game.i18n.localize("ME5E.Armor.BuffAdvSave")}: ${cap(s)}`);
    }
    for (const sk of (buffs.advSkills ?? [])) {
      chips.push(`${game.i18n.localize("ME5E.Armor.BuffAdvSkill")}: ${cap(sk)}`);
    }
  }

  const plainInner = chips.map(c => `<span class="me5e-armor-buff">${c}</span>`).join("");

  // Active set bonuses — one chip per set, with each active threshold's effect
  // text in the tooltip. AC/shields/HP thresholds are auto-applied; conditional
  // ones the player tracks from the chip.
  const bySet = new Map();
  for (const b of getActiveSetBonuses(actor)) {
    const e = bySet.get(b.setId) ?? { label: b.label, count: b.count, max: b.max, texts: [] };
    if (b.text) e.texts.push(`${b.threshold} pc: ${b.text}`);
    bySet.set(b.setId, e);
  }
  const setInner = [...bySet.values()].map(e => {
    const tip = e.texts.length ? ` data-tooltip="${escapeAttr(e.texts.join("\n\n"))}"` : "";
    const pieces = `${e.count}/${e.max ?? e.count}`;
    return `<span class="me5e-armor-buff set"${tip}>${escapeAttr(e.label)} (${pieces})</span>`;
  }).join("");

  if (!plainInner && !setInner) return "";
  return `<div class="me5e-armor-buffs">${plainInner}${setInner}</div>`;
}

const BYPASS_LAYER_LABEL_KEY = {
  shields: "ME5E.UI.Shields",
  barriers: "ME5E.UI.Barriers",
  techArmor: "ME5E.UI.TechArmor"
};

function renderBypassChips(bypass) {
  if (!Array.isArray(bypass) || !bypass.length) return "";
  return bypass.map(key => {
    const layer = game.i18n.localize(BYPASS_LAYER_LABEL_KEY[key] ?? key);
    const text = game.i18n.format("ME5E.Weapon.BypassChip", { layer });
    const tip = game.i18n.format("ME5E.Weapon.BypassTooltip", { layer });
    return `<span class="me5e-weapon-prop me5e-weapon-bypass" data-tooltip="${escapeAttr(tip)}">${text}</span>`;
  }).join("");
}

function renderModPip(weapon, slot, mod, opts = {}) {
  const slotLabel = game.i18n.localize(`ME5E.Mods.Slot.${slot}`);
  const disabled = opts.disabled ? " disabled" : "";
  if (mod) {
    const toggleable = isToggleableMod(mod);
    const active = isModActive(weapon, slot);
    const inactive = toggleable && !active;
    const stateCls = inactive ? " inactive" : (toggleable ? " ammo-active" : "");
    const stateTip = toggleable
      ? ` (${game.i18n.localize(active ? "ME5E.Mods.ActiveState" : "ME5E.Mods.InactiveState")})`
      : "";
    const head = `${slotLabel}: ${mod.name}${stateTip}`;
    return `<button type="button" class="me5e-mod-pip filled${stateCls}${disabled}" data-slot="${slot}"
                    data-mod-id="${mod.id}" data-weapon-id="${weapon.id}"
                    data-tooltip="${modTooltipHtml(mod, head)}" data-tooltip-direction="UP"
                    aria-label="${escapeAttr(head)}">
              <img src="${mod.img}" alt="" />
            </button>`;
  }
  const tip = opts.disabled
    ? game.i18n.format("ME5E.Mods.PipDisabledTooltip", { slot: slotLabel })
    : game.i18n.format("ME5E.Mods.PipEmptyTooltip", { slot: slotLabel });
  return `<button type="button" class="me5e-mod-pip empty${disabled}" data-slot="${slot}"
                  data-weapon-id="${weapon.id}"
                  data-tooltip="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}">
            <span class="me5e-mod-pip-symbol">+</span>
          </button>`;
}

function renderModSlots(weapon, actor) {
  const disabled = hasSpecialProperty(weapon);
  const attached = getAttachedModItems(weapon, actor);
  const pips = getSlotsForWeapon(weapon)
    .map(slot => renderModPip(weapon, slot, attached[slot], { disabled }))
    .join("");
  return `<div class="me5e-weapon-slot-mods">${pips}</div>`;
}

// Heat bar + reload button for the weapon tile. Heat counts DOWN — the bar
// shows shots remaining (full = charged, empty = must reload). Returns "" for
// weapons with no heat (e.g. melee). Mod heat-increase bonuses raise the max.
function renderHeatMeter(item) {
  const heat = getHeatState(item);
  if (!(heat.max > 0)) return "";
  const pct = Math.round((heat.value / heat.max) * 100);
  const label = game.i18n.format("ME5E.Heat.Meter", { value: heat.value, max: heat.max });
  const text = heat.empty ? game.i18n.localize("ME5E.Heat.EmptyShort") : label;
  const reloadTip = escapeAttr(game.i18n.localize("ME5E.Heat.Reload"));
  return `
    <div class="me5e-weapon-heat${heat.empty ? " empty" : ""}">
      <div class="me5e-weapon-heat-track" role="meter" aria-label="${escapeAttr(label)}">
        <span class="me5e-weapon-heat-fill" style="width:${pct}%"></span>
        <span class="me5e-weapon-heat-label">${text}</span>
      </div>
      <button type="button" class="me5e-weapon-heat-reload" data-item-id="${item.id}"
              data-tooltip="${reloadTip}" aria-label="${reloadTip}"${heat.full ? " disabled" : ""}>
        <i class="fas fa-arrows-rotate"></i>
      </button>
    </div>
  `;
}

function renderWeaponSlot(item, slotKey, actor, opts = {}) {
  const wide = opts.wide ? " wide" : "";
  const labelKey = slotKey === "twoHanded"
    ? "ME5E.Weapon.SlotTwoHanded"
    : slotKey === "mainHand" ? "ME5E.Weapon.SlotMain" : "ME5E.Weapon.SlotOff";
  const label = game.i18n.localize(labelKey);
  if (!item) {
    return `
      <div class="me5e-weapon-slot empty${wide}" data-slot="${slotKey}">
        <div class="me5e-weapon-slot-label">${label}</div>
        <div class="me5e-weapon-slot-icon">—</div>
        <div class="me5e-weapon-slot-name">${game.i18n.localize("ME5E.Weapon.Empty")}</div>
        <div class="me5e-weapon-slot-formula"></div>
      </div>
    `;
  }
  let formula = getWeaponDamageFormula(item) || "—";
  const ammoType = getAmmoDamageTypeOverride(item, actor);
  if (ammoType) formula = formula.replace(/\s+\S+$/, ` ${ammoType}`);
  const augBonus = getAttackAugmentDamageBonus(item, actor);
  if (augBonus) formula = formula.replace(/^(\d+d\d+)/, `$1+${augBonus}`);

  const props = getDisplayProperties(item);
  const propChips = props
    .map(p => {
      const desc = weaponPropertyDescription(p);
      const tip = desc ? ` data-tooltip="${escapeAttr(desc)}"` : "";
      return `<span class="me5e-weapon-prop"${tip}>${weaponPropertyLabel(p)}</span>`;
    })
    .join("");
  const bypassChips = renderBypassChips(item?.flags?.me5e?.weapon?.bypass);
  const chips = propChips + bypassChips;
  const tooltip = itemDescriptionText(item);
  const tooltipAttr = tooltip ? ` data-tooltip="${escapeAttr(tooltip)}"` : "";
  const profClass = isWeaponProficient(item) ? "" : " not-proficient";
  return `
    <div class="me5e-weapon-slot equipped${wide}${profClass}" data-slot="${slotKey}" data-item-id="${item.id}"${tooltipAttr}>
      <div class="me5e-weapon-slot-label">${label}</div>
      <div class="me5e-weapon-slot-icon">
        <img src="${item.img}" alt="" />
      </div>
      <div class="me5e-weapon-slot-name">${item.name}</div>
      <div class="me5e-weapon-slot-formula">${formula}</div>
      ${item?.flags?.me5e?.weapon?.type === "shield" ? "" : `
      <div class="me5e-weapon-fire-row">
        <button type="button" class="me5e-weapon-fire" data-item-id="${item.id}"
                data-tooltip="${escapeAttr(game.i18n.localize("ME5E.Weapon.FireTooltip"))}">
          <i class="fas fa-crosshairs"></i> ${game.i18n.localize("ME5E.Weapon.Fire")}
        </button>
        ${isBurstWeapon(item, actor) ? `
          <button type="button" class="me5e-weapon-burst" data-item-id="${item.id}"
                  data-tooltip="${escapeAttr(game.i18n.localize("ME5E.Weapon.BurstTooltip"))}">
            <i class="fas fa-bomb"></i> ${game.i18n.localize("ME5E.Weapon.Burst")}
          </button>` : ""}
        ${isDoubleTapWeapon(item, actor) ? `
          <button type="button" class="me5e-weapon-doubletap" data-item-id="${item.id}"
                  data-tooltip="${escapeAttr(game.i18n.localize("ME5E.Weapon.DoubleTapTooltip"))}">
            <i class="fas fa-angles-right"></i> ${game.i18n.localize("ME5E.Weapon.DoubleTap")}
          </button>` : ""}
        ${isHeavyWeapon(item) && spitfireActive(item) ? `
          <button type="button" class="me5e-weapon-sustain" data-item-id="${item.id}"
                  data-tooltip="${escapeAttr(game.i18n.localize("ME5E.Heavy.SustainTooltip"))}">
            <i class="fas fa-fire"></i> ${game.i18n.localize("ME5E.Heavy.Sustain")}
          </button>
          <button type="button" class="me5e-weapon-endsustain" data-item-id="${item.id}"
                  data-tooltip="${escapeAttr(game.i18n.localize("ME5E.Heavy.EndTooltip"))}">
            <i class="fas fa-ban"></i> ${game.i18n.localize("ME5E.Heavy.End")}
          </button>` : ""}
      </div>`}
      ${renderHeatMeter(item)}
      ${chips ? `<div class="me5e-weapon-slot-props">${chips}</div>` : ""}
      ${renderModSlots(item, actor)}
    </div>
  `;
}

function renderWeaponLoadout(actor) {
  const slots = getWeaponSlots(actor);
  const title = game.i18n.localize("ME5E.Weapon.LoadoutTitle");
  const body = slots.twoHanded
    ? renderWeaponSlot(slots.twoHanded, "twoHanded", actor, { wide: true })
    : renderWeaponSlot(slots.mainHand, "mainHand", actor)
      + renderWeaponSlot(slots.offHand, "offHand", actor);
  return `
    <div class="me5e-weapon-loadout" data-actor-id="${actor.id}">
      <div class="me5e-weapon-loadout-header">
        <span class="me5e-weapon-loadout-title">${title}</span>
      </div>
      <div class="me5e-weapon-loadout-slots">${body}</div>
    </div>
  `;
}

function wireWeaponLoadout(root, actor) {
  for (const slot of root.querySelectorAll(".me5e-weapon-slot.equipped")) {
    const itemId = slot.dataset.itemId;
    slot.addEventListener("click", (ev) => {
      if (ev.target.closest(".me5e-mod-pip, .me5e-weapon-heat-reload, .me5e-weapon-fire, .me5e-weapon-burst, .me5e-weapon-doubletap, .me5e-weapon-sustain, .me5e-weapon-endsustain")) return;
      actor.items.get(itemId)?.sheet?.render(true);
    });
    slot.addEventListener("contextmenu", (ev) => {
      if (ev.target.closest(".me5e-mod-pip, .me5e-weapon-heat-reload, .me5e-weapon-fire, .me5e-weapon-burst, .me5e-weapon-doubletap, .me5e-weapon-sustain, .me5e-weapon-endsustain")) return;
      ev.preventDefault();
      actor.items.get(itemId)?.update({ "system.equipped": false });
    });
  }

  for (const btn of root.querySelectorAll(".me5e-weapon-fire")) {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const item = actor.items.get(btn.dataset.itemId);
      if (!item) return;
      // Heavy weapons fire as a fixed-DC save effect, not a normal attack roll.
      if (isHeavyWeapon(item)) await heavyWeaponFire(item, actor);
      else await item.use({ event: ev });
    });
  }

  for (const btn of root.querySelectorAll(".me5e-weapon-burst")) {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const item = actor.items.get(btn.dataset.itemId);
      if (item) await burstFire(item, actor);
    });
  }

  for (const btn of root.querySelectorAll(".me5e-weapon-doubletap")) {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const item = actor.items.get(btn.dataset.itemId);
      if (item) await doubleTapFire(item, actor, ev);
    });
  }

  for (const btn of root.querySelectorAll(".me5e-weapon-sustain")) {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const item = actor.items.get(btn.dataset.itemId);
      if (item) await sustainSpitfire(item, actor);
    });
  }

  for (const btn of root.querySelectorAll(".me5e-weapon-endsustain")) {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const item = actor.items.get(btn.dataset.itemId);
      if (item) await endSpitfire(item);
    });
  }

  for (const btn of root.querySelectorAll(".me5e-weapon-heat-reload")) {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const item = actor.items.get(btn.dataset.itemId);
      if (item) await reloadWeapon(item);
    });
  }

  for (const pip of root.querySelectorAll(".me5e-mod-pip")) {
    pip.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (pip.classList.contains("disabled")) {
        ui.notifications?.info(game.i18n.localize("ME5E.Mods.SpecialWeaponNotice"));
        return;
      }
      const weapon = actor.items.get(pip.dataset.weaponId);
      const slot = pip.dataset.slot;
      if (!weapon || !slot) return;
      const modId = pip.dataset.modId;
      if (modId && ev.shiftKey) {
        actor.items.get(modId)?.sheet?.render(true);
        return;
      }
      // Alt-click flips a toggleable (ammo) mod on/off without the dialog.
      const mod = modId ? actor.items.get(modId) : null;
      if (mod && ev.altKey && isToggleableMod(mod)) {
        const next = !isModActive(weapon, slot);
        await setModActive(weapon, slot, next);
        const slotLabel = game.i18n.localize(`ME5E.Mods.Slot.${slot}`);
        ui.notifications?.info(game.i18n.format(
          next ? "ME5E.Mods.Activated" : "ME5E.Mods.Deactivated",
          { slot: slotLabel }
        ));
        return;
      }
      await openModPicker({ actor, weapon, slot });
    });
    pip.addEventListener("contextmenu", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!pip.classList.contains("filled") || pip.classList.contains("disabled")) return;
      const weapon = actor.items.get(pip.dataset.weaponId);
      const slot = pip.dataset.slot;
      if (!weapon || !slot) return;
      await detachMod(weapon, slot);
      const slotLabel = game.i18n.localize(`ME5E.Mods.Slot.${slot}`);
      ui.notifications?.info(game.i18n.format("ME5E.Mods.Detached", { slot: slotLabel }));
    });
  }
}

function renderProficiencyWarning(unproficientCount) {
  if (unproficientCount < 2) return "";
  const severe = unproficientCount >= 4;
  const key = severe ? "ME5E.Armor.ProfWarningSevere" : "ME5E.Armor.ProfWarning";
  const message = game.i18n.format(key, { count: unproficientCount });
  const severity = severe ? "severe" : "warn";
  return `<div class="me5e-armor-loadout-warning ${severity}">${message}</div>`;
}

function renderSpeedPenaltyWarning(actor, state) {
  if (!state?.strReq || state.strReq <= 0) return "";
  const strVal = Number(actor.system?.abilities?.str?.value ?? 0);
  if (strVal >= state.strReq) return "";
  const isMeters = (actor.system?.attributes?.movement?.units ?? "ft") === "m";
  const penalty = isMeters ? 4 : 10;
  const unit = isMeters ? "m" : "ft";
  const message = game.i18n.format("ME5E.Armor.SpeedPenalty", {
    penalty, unit, strReq: state.strReq, strVal
  });
  return `<div class="me5e-armor-loadout-warning warn">${message}</div>`;
}

function renderArmorLoadout(actor) {
  const state = computeArmorState(actor);
  const byPlacement = getEquippedByPlacement(actor);
  const buffs = summarizeArmorBuffs(actor);
  const ac = actor.system.attributes?.ac?.value ?? 10;
  const shieldsMax = state?.shieldsMax ?? 0;
  const shieldsRegen = state?.shieldsRegen ?? 0;
  const unproficientCount = state?.unproficientCount ?? 0;
  const acLabel = game.i18n.localize("ME5E.Armor.TotalsAC");
  const shieldsLabel = game.i18n.localize("ME5E.Armor.TotalsShields");
  const regenLabel = game.i18n.localize("ME5E.Armor.TotalsRegen");
  const title = game.i18n.localize("ME5E.Armor.LoadoutTitle");

  const slots = byPlacement.body
    ? renderArmorSlot(byPlacement.head, "head", { actor }) + renderArmorSlot(byPlacement.body, "body", { wide: true, actor })
    : renderArmorSlot(byPlacement.head, "head", { actor })
      + renderArmorSlot(byPlacement.chest, "chest", { actor })
      + renderArmorSlot(byPlacement.arms, "arms", { actor })
      + renderArmorSlot(byPlacement.legs, "legs", { actor });

  return `
    <div class="me5e-armor-loadout" data-actor-id="${actor.id}">
      <div class="me5e-armor-loadout-header">
        <span class="me5e-armor-loadout-title">${title}</span>
        <span class="me5e-armor-loadout-totals">
          <span>${acLabel} <strong>${ac}</strong></span>
          <span>${shieldsLabel} <strong>${shieldsMax}</strong></span>
          <span>${regenLabel} <strong>${shieldsRegen}</strong></span>
        </span>
      </div>
      <div class="me5e-armor-loadout-slots">${slots}</div>
      ${renderArmorBuffs(buffs, actor)}
      ${renderSpeedPenaltyWarning(actor, state)}
      ${renderProficiencyWarning(unproficientCount)}
    </div>
  `;
}

function wireArmorLoadout(root, actor) {
  for (const slot of root.querySelectorAll(".me5e-armor-slot.equipped")) {
    const itemId = slot.dataset.itemId;
    slot.addEventListener("click", (ev) => {
      if (ev.target.closest(".me5e-mod-pip")) return;
      actor.items.get(itemId)?.sheet?.render(true);
    });
    slot.addEventListener("contextmenu", (ev) => {
      if (ev.target.closest(".me5e-mod-pip")) return;
      ev.preventDefault();
      actor.items.get(itemId)?.update({ "system.equipped": false });
    });
  }

  for (const pip of root.querySelectorAll(".me5e-armor-slot .me5e-mod-pip")) {
    pip.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const armor = actor.items.get(pip.dataset.armorId);
      if (!armor) return;
      const modId = pip.dataset.modId;
      if (modId && ev.shiftKey) {
        actor.items.get(modId)?.sheet?.render(true);
        return;
      }
      await openArmorModPicker({ actor, armor, currentModId: modId ?? null });
    });
    pip.addEventListener("contextmenu", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!pip.classList.contains("filled")) return;
      const armor = actor.items.get(pip.dataset.armorId);
      const modId = pip.dataset.modId;
      if (!armor || !modId) return;
      await detachArmorMod(armor, modId);
      ui.notifications?.info(game.i18n.format("ME5E.Mods.ArmorDetached", {
        mod: actor.items.get(modId)?.name ?? "",
        armor: armor.name
      }));
    });
  }
}

function findInventoryTabAnchor(root) {
  const tab = root.querySelector('section.tab[data-tab="inventory"]')
    || root.querySelector('.tab[data-tab="inventory"]')
    || root.querySelector('.tab.inventory');
  if (!tab) return null;
  return tab.querySelector(".top") ?? tab.firstElementChild;
}

function renderReputationPanel(actor) {
  const rep = getReputation(actor);
  return `
    <filigree-box class="me5e-reputation" data-actor-id="${actor.id}">
      <h3>
        <i class="fa-solid fa-scale-balanced" inert></i>
        <span class="roboto-upper">${game.i18n.localize("ME5E.UI.Reputation")}</span>
      </h3>
      <div class="me5e-rep-body">
        <div class="me5e-rep-row me5e-rep-paragon">
          <label>${game.i18n.localize("ME5E.UI.Paragon")}</label>
          <input type="number" class="me5e-rep-paragon-input" min="0" value="${rep.paragon}" />
        </div>
        <div class="me5e-rep-row me5e-rep-renegade">
          <label>${game.i18n.localize("ME5E.UI.Renegade")}</label>
          <input type="number" class="me5e-rep-renegade-input" min="0" value="${rep.renegade}" />
        </div>
      </div>
    </filigree-box>
  `;
}

function bindHandlers(html, actor) {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  root.querySelector(".me5e-tech-armor-value")?.addEventListener("change", (ev) => {
    setTechArmor(actor, { value: Number(ev.target.value) });
  });
  root.querySelector(".me5e-tech-armor-max")?.addEventListener("change", (ev) => {
    setTechArmor(actor, { max: Number(ev.target.value) });
  });
  root.querySelector(".me5e-shields-value")?.addEventListener("change", (ev) => {
    setShields(actor, { value: Number(ev.target.value) });
  });
  root.querySelector(".me5e-shields-max")?.addEventListener("change", (ev) => {
    setShields(actor, { max: Number(ev.target.value) });
  });
  root.querySelector(".me5e-shields-regen-button")?.addEventListener("click", async () => {
    const s = getShields(actor);
    const regen = getArmorShieldsRegen(actor);
    if (regen <= 0 || s.value >= s.max) return;
    await setShields(actor, { value: Math.min(s.max, s.value + regen) });
  });
  for (const btn of root.querySelectorAll(".me5e-meter-decrement, .me5e-meter-increment")) {
    const delta = btn.classList.contains("me5e-meter-increment") ? 1 : -1;
    btn.addEventListener("click", () => adjustMeter(actor, btn.dataset.meter, delta));
  }
  root.querySelector(".me5e-barriers-value")?.addEventListener("change", (ev) => {
    setBarriers(actor, { value: Number(ev.target.value) });
  });
  root.querySelector(".me5e-barriers-max")?.addEventListener("change", (ev) => {
    setBarriers(actor, { max: Number(ev.target.value) });
  });
  root.querySelector(".me5e-power-points-value")?.addEventListener("change", (ev) => {
    setPowerPoints(actor, Number(ev.target.value));
  });
  root.querySelector(".me5e-rep-paragon-input")?.addEventListener("change", (ev) => {
    setParagon(actor, Number(ev.target.value));
  });
  root.querySelector(".me5e-rep-renegade-input")?.addEventListener("change", (ev) => {
    setRenegade(actor, Number(ev.target.value));
  });
}

function injectHPControls(root, actor) {
  const hpInput = root.querySelector('input[name="system.attributes.hp.value"]');
  if (!hpInput) return;
  const meterGroup = hpInput.closest(".meter-group");
  const labelRow = meterGroup?.querySelector(":scope > .label");
  if (!labelRow || labelRow.querySelector(".me5e-hp-controls")) return;

  const dec = game.i18n.localize("ME5E.UI.MeterDecrement");
  const inc = game.i18n.localize("ME5E.UI.MeterIncrement");
  const span = document.createElement("span");
  span.className = "me5e-meter-controls me5e-hp-controls";
  span.innerHTML = `
    <button type="button" class="me5e-meter-decrement" data-meter="hp"
            aria-label="${escapeAttr(dec)}" data-tooltip="${escapeAttr(dec)}">−</button>
    <button type="button" class="me5e-meter-increment" data-meter="hp"
            aria-label="${escapeAttr(inc)}" data-tooltip="${escapeAttr(inc)}">+</button>
  `;
  labelRow.appendChild(span);

  for (const btn of span.querySelectorAll(".me5e-meter-decrement, .me5e-meter-increment")) {
    const delta = btn.classList.contains("me5e-meter-increment") ? 1 : -1;
    btn.addEventListener("click", () => adjustMeter(actor, "hp", delta));
  }
}

function findHPAnchor(root, actorType) {
  if (actorType === "character") {
    const stats = root.querySelector(".sidebar .card .stats");
    if (stats) {
      const firstMeter = stats.querySelector(".meter-group");
      if (firstMeter) return firstMeter;
    }
  }

  const sidebar = root.querySelector(".sidebar");
  if (sidebar) {
    const meter = sidebar.querySelector(".meter-group");
    if (meter) return meter;
    return sidebar.firstElementChild;
  }
  return (
    root.querySelector(".tab.attributes") ||
    root.querySelector(".sheet-body") ||
    root.querySelector(".window-content")
  );
}

function findVehicleHPPillGroup(root) {
  const hpInput = root.querySelector('input[name="system.attributes.hp.value"]');
  return hpInput?.closest(".pills-group") ?? null;
}

function findFavoritesAnchor(root) {
  return (
    root.querySelector(".favorites") ||
    root.querySelector('section.favorites') ||
    root.querySelector('[data-tab="details"] .favorites') ||
    root.querySelector('.tab.details .favorites') ||
    root.querySelector('.tab[data-tab="details"]')?.firstElementChild ||
    null
  );
}

function insertBefore(node, anchor) {
  anchor.parentElement.insertBefore(node, anchor);
}

// Sheet re-renders replace the inventory tab DOM and reset scrollTop. We
// can't rely on dnd5e's built-in preservation surviving our re-injection,
// and any scroll-event listener naively listening for scroll changes will
// also capture *programmatic* scrollTop writes (dnd5e zeroing the new
// element, our own restore call, etc.) — that's what was overwriting the
// saved value with 0 after a couple of equip cycles.
//
// Approach: per-tab listener that only commits to the WeakMap when a real
// user gesture (wheel / keydown / pointerdown / touchstart) preceded the
// scroll event by under 250ms. Programmatic scrolls have no preceding
// gesture and are filtered out.
//
// Restoration runs immediately, on the next animation frame, and once
// more after a short setTimeout — that wins races with any deferred
// internal restoration the system might apply.
// dnd5e v5 character & NPC sheets declare each tab as scrollable, but the
// element that actually scrolls (per CSS `overflow: hidden auto`) is the
// outer `.main-content` grid container that wraps the sidebar + tabs.
// Tracking the tab itself was a no-op because it never scrolled. Prefer
// `.main-content`; fall back to the tab selectors for any other variant.
function findInventoryScrollContainer(root) {
  return root.querySelector('.main-content')
    || root.querySelector('[data-application-part="inventory"]')
    || root.querySelector('section.tab[data-tab="inventory"]')
    || root.querySelector('.tab[data-tab="inventory"]');
}

const lastScrolls = new WeakMap();
const USER_INTENT_WINDOW_MS = 250;

function ensureScrollTracking(sheet, tab) {
  if (!tab || tab.dataset.me5eTracked === "1") return;
  tab.dataset.me5eTracked = "1";
  let lastUserIntent = 0;
  const mark = () => { lastUserIntent = performance.now(); };
  tab.addEventListener("wheel", mark, { passive: true });
  tab.addEventListener("keydown", mark);
  tab.addEventListener("pointerdown", mark);
  tab.addEventListener("touchstart", mark, { passive: true });
  tab.addEventListener("scroll", () => {
    if (performance.now() - lastUserIntent < USER_INTENT_WINDOW_MS) {
      lastScrolls.set(sheet, tab.scrollTop);
    }
  });
}

// The spellbook "Primes / Detonates" column header is rendered empty by dnd5e
// (its column label was cleared in registerPowerComboColumn) so the long text
// can't wrap a narrow column. Fill each spell-section header with a compact icon
// + hover tooltip instead. Idempotent across re-renders.
function injectComboHeaders(root) {
  for (const cell of root.querySelectorAll('.items-header [data-column-id="school"]')) {
    if (cell.querySelector(".me5e-combo-head")) continue;
    cell.innerHTML = '<i class="fa-solid fa-explosion me5e-combo-head" inert></i>';
    cell.dataset.tooltip = game.i18n.localize("ME5E.SpellHeader.PrimeDetonate");
  }
}

// Advanced-version selector on each power's spellbook row. The chosen option id
// is stored on the item (flags.me5e.power.advancement); powers.mjs applies its
// mechanical override in derived data. Idempotent across re-renders.
function injectAdvancementSelectors(root, actor) {
  // Per-method/pool picks-used/limit, so an augment a player can't afford shows
  // up as a disabled option (with a "free a pick" hint) instead of snapping back
  // after the runtime guard rejects it. Cantrips and powers are separate pools.
  const budgetByKey = new Map();
  for (const b of getPowerBudgets(actor)) budgetByKey.set(`${b.method}:${b.pool}`, b);

  for (const row of root.querySelectorAll("[data-item-id]")) {
    const item = actor.items?.get?.(row.dataset.itemId);
    if (!item || item.type !== "spell") continue;
    const advs = item.getFlag(MODULE_ID, "power.advancements");
    if (!Array.isArray(advs) || !advs.length) continue;
    // Prefer the name cell; fall back through known dnd5e v5 variants, then the
    // row itself so the control still shows if the markup differs.
    const nameCell = row.querySelector(".item-name")
      || row.querySelector('[data-column-id="name"]')
      || row.querySelector(".name-stacked")
      || row;
    if (nameCell.querySelector(".me5e-adv-select")) continue;

    const current = item.getFlag(MODULE_ID, "power.advancement") || "";
    const chosen = advs.find((a) => a?.id === current);
    // Adding a new augment costs a pick from this power's pool (cantrips vs
    // leveled powers); if this power has none yet and its pool is at the limit,
    // lock the augment options (switching/clearing an existing one is net-zero,
    // so leave them open when `current` is set).
    const pool = (item.system?.level ?? 0) === 0 ? "cantrips" : "powers";
    const budget = budgetByKey.get(`${item.system?.method}:${pool}`);
    const lockAug = !current && !!budget && budget.used >= budget.limit;
    const sel = document.createElement("select");
    sel.className = lockAug ? "me5e-adv-select me5e-adv-select--full" : "me5e-adv-select";
    sel.dataset.itemId = item.id;
    sel.innerHTML = ['<option value="">— Base power —</option>']
      .concat(advs.map((a) => `<option value="${a.id}"${a.id === current ? " selected" : ""}${lockAug ? " disabled" : ""}>${a.name}</option>`))
      .join("");
    const limitKey = pool === "cantrips" ? "ME5E.Powercasting.EnhanceLimitCantrip" : "ME5E.Powercasting.EnhanceLimit";
    sel.dataset.tooltip = lockAug
      ? game.i18n.format(limitKey, { max: budget.limit })
      : (chosen?.text || game.i18n.localize("ME5E.Advancement.SelectHint"));

    // Keep the row's own click/drag handlers from hijacking the control.
    sel.addEventListener("click", (ev) => ev.stopPropagation());
    sel.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    sel.addEventListener("change", async (ev) => {
      ev.stopPropagation();
      const it = actor.items.get(sel.dataset.itemId);
      if (!it) return;
      if (sel.value) await it.setFlag(MODULE_ID, "power.advancement", sel.value);
      else await it.unsetFlag(MODULE_ID, "power.advancement");
    });
    nameCell.appendChild(sel);
  }
}

// Power budget indicator: one line per casting class showing picks used vs the
// class limit (learned/prepared powers + selected enhancements). Enhancements
// cost a pick, so this is where a player sees the cost before hitting it.
function renderPowerBudget(actor) {
  const budgets = getPowerBudgets(actor);
  if (!budgets.length) return "";
  const hint = escapeAttr(game.i18n.localize("ME5E.Powercasting.EnhanceBudgetHint"));
  const rows = budgets.map((b) => {
    const state = b.used > b.limit ? " me5e-over-budget" : (b.used >= b.limit ? " me5e-at-budget" : "");
    const key = b.pool === "cantrips" ? "ME5E.Powercasting.EnhanceBudgetCantrips" : "ME5E.Powercasting.EnhanceBudget";
    let text = game.i18n.format(key, { class: b.label, used: b.used, limit: b.limit });
    if (b.enhancements > 0) {
      text += ` ${game.i18n.format("ME5E.Powercasting.EnhanceBudgetAug", { n: b.enhancements })}`;
    }
    return `<span class="me5e-power-budget-row${state}">${escapeAttr(text)}</span>`;
  }).join("");
  return `<div class="me5e-injected me5e-injected-power-budget" data-tooltip="${hint}">${rows}</div>`;
}

export function injectIntoSheet(app, html, data) {
  const actor = app.actor ?? app.object;
  if (!actor) return;
  if (!["character", "npc", "vehicle"].includes(actor.type)) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  if (actor.type === "vehicle") {
    // Mirror the vehicle HP .pills-group structure for shields; insert
    // immediately after the HP block, before AC.
    if (!root.querySelector(".me5e-vehicle-shields-group")) {
      const hpGroup = findVehicleHPPillGroup(root);
      if (hpGroup?.parentElement) {
        const wrapper = document.createElement("div");
        wrapper.className = "me5e-injected me5e-injected-vehicle-shields";
        wrapper.innerHTML = renderShieldsVehicle(actor);
        hpGroup.parentElement.insertBefore(wrapper, hpGroup.nextSibling);
        bindHandlers(wrapper, actor);
      }
    }
    return;
  }

  // HP +/- buttons inside dnd5e's own HP meter-group label row.
  injectHPControls(root, actor);

  // Spellbook "Primes / Detonates" column header → icon + tooltip.
  injectComboHeaders(root);

  // Advanced-version dropdown on each power row.
  injectAdvancementSelectors(root, actor);

  // Power budget indicator at the top of the spells tab (characters only).
  if (actor.type === "character" && !root.querySelector(".me5e-injected-power-budget")) {
    const spellsTab = root.querySelector('.tab[data-tab="spells"], .tab.spells, [data-application-part="spells"]');
    const budgetHTML = renderPowerBudget(actor);
    if (spellsTab && budgetHTML) {
      const wrap = document.createElement("div");
      wrap.innerHTML = budgetHTML;
      const node = wrap.firstElementChild;
      if (node) spellsTab.insertBefore(node, spellsTab.firstChild);
    }
  }

  // Character / NPC: shields + barriers above HP (.meter-group style)
  if (!root.querySelector(".me5e-defense")) {
    const anchor = findHPAnchor(root, actor.type);
    if (anchor?.parentElement) {
      const def = document.createElement("div");
      def.className = "me5e-injected me5e-injected-defense";
      def.innerHTML = renderShieldBar(actor);
      insertBefore(def, anchor);
      bindHandlers(def, actor);
    }
  }

  // Point-caster pool (Engineer/Infiltrator/Musician/Tracker) — above HP, after
  // the defense bar, only when the actor actually has a power-point pool.
  if (actor.type === "character" && !root.querySelector(".me5e-injected-power-points")
      && getPowerPoints(actor).max > 0) {
    const anchor = findHPAnchor(root, actor.type);
    if (anchor?.parentElement) {
      const pp = document.createElement("div");
      pp.innerHTML = renderPowerPointsMeter(actor);
      const ppNode = pp.firstElementChild;
      insertBefore(ppNode, anchor);
      bindHandlers(ppNode, actor);
    }
  }

  // Armor loadout panel at the top of the inventory tab (characters only —
  // NPCs use plain stat-block AC + action attacks, not the equipment loadout).
  if (actor.type === "character" && !root.querySelector(".me5e-armor-loadout")) {
    const invAnchor = findInventoryTabAnchor(root);
    if (invAnchor?.parentElement) {
      const loadout = document.createElement("div");
      loadout.className = "me5e-injected me5e-injected-armor-loadout";
      loadout.innerHTML = renderArmorLoadout(actor);
      // Insert after the anchor (`.top` div) so encumbrance stays on top.
      invAnchor.parentElement.insertBefore(loadout, invAnchor.nextSibling);
      wireArmorLoadout(loadout, actor);
    }
  }

  // Weapon loadout panel directly under armor loadout (characters only).
  if (actor.type === "character" && !root.querySelector(".me5e-weapon-loadout")) {
    const armorPanel = root.querySelector(".me5e-injected-armor-loadout");
    const anchor = armorPanel ?? findInventoryTabAnchor(root);
    if (anchor?.parentElement) {
      const loadout = document.createElement("div");
      loadout.className = "me5e-injected me5e-injected-weapon-loadout";
      loadout.innerHTML = renderWeaponLoadout(actor);
      anchor.parentElement.insertBefore(loadout, anchor.nextSibling);
      wireWeaponLoadout(loadout, actor);
    }
  }

  // Reputation above favorites (character only)
  if (actor.type === "character" && !root.querySelector(".me5e-reputation")) {
    const anchor = findFavoritesAnchor(root);
    if (anchor?.parentElement) {
      const rep = document.createElement("div");
      rep.className = "me5e-injected me5e-injected-reputation";
      rep.innerHTML = renderReputationPanel(actor);
      insertBefore(rep, anchor);
      bindHandlers(rep, actor);
    }
  }

  const tab = findInventoryScrollContainer(root);
  if (tab) {
    const saved = lastScrolls.get(app);
    if (saved !== undefined && saved > 0) {
      const apply = () => { if (tab.isConnected) tab.scrollTop = saved; };
      apply();
      requestAnimationFrame(apply);
      setTimeout(apply, 50);
      setTimeout(apply, 200);
    }
    ensureScrollTracking(app, tab);
  }
}

export function registerSheetInjection() {
  // Injects shield/barrier/reputation panel into the *stock* dnd5e sheets only.
  // dnd5e 5.3.3 ships AppV2 sheets; the legacy `renderActorSheet5e*` (AppV1)
  // hook names no longer fire and were removed.
  Hooks.on("renderCharacterActorSheet", injectIntoSheet);
  Hooks.on("renderNPCActorSheet", injectIntoSheet);
  Hooks.on("renderVehicleActorSheet", injectIntoSheet);
}
