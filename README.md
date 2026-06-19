# Mass Effect 5e

<p align="center">
<img width="50%" alt="CharacterSheetImage" src="https://github.com/user-attachments/assets/e1195c61-611d-40bd-84cb-cbd05eb7b579" />
</p>

A **Mass Effect** setting layer for the Foundry VTT **D&D 5e** system. It adds the
defenses, weapons, powers, and combat flow of the Mass Effect universe on top of
the rules you already know: layered shields/barriers/tech armor, weapon heat and
thermal clips, biotic/tech/combat powers, the prime → detonate combo system, and
Paragon/Renegade reputation, along with ME species, classes, backgrounds, gear,
and a full bestiary.

Game content is adapted from the community **Mass Effect 5e** rules.

---

## Requirements

| | Version |
|---|---|
| **Foundry VTT** | v12 or newer (verified on v14) |
| **D&D 5e system** | v3.3.0 or newer (verified on v5.3.3) |

The module ships its own compendium content, so the only thing you need installed
alongside it is the **dnd5e** system. Install and activate dnd5e first.

---

## Installation

### Install with a manifest URL (recommended)

1. In Foundry's **Setup** screen, open **Add-on Modules → Install Module**.
2. Paste this URL into the **Manifest URL** field at the bottom and click
   **Install**:

   ```
   https://github.com/bushongj/foundryvtt-me5e/releases/latest/download/module.json
   ```

3. Open your **dnd5e world**, go to **Game Settings → Manage Modules**, enable
   **Mass Effect 5e**, and save.

### Manual install

1. Download the release `.zip` from the
   [Releases](https://github.com/bushongj/foundryvtt-me5e/releases) page.
2. Unzip it into your Foundry data folder under `Data/modules/`, so the path is
   `Data/modules/me5e/module.json`.
3. Restart Foundry.
4. In your **dnd5e world**, open **Game Settings → Manage Modules**, enable
   **Mass Effect 5e**, and save.

### Verify it loaded

Open the **Compendium Packs** sidebar — you should see a **Mass Effect 5e** folder
containing Species, Classes, Weapons, Armor, Powers, Bestiary, and more. Drag a
species, class, and background onto a new character to begin.

---

## The Character Sheet

The module extends the standard dnd5e actor sheet rather than replacing it, so
everything familiar is still there. The Mass Effect additions are:

### Defense block

Three meters sit alongside HP and AC:

- **Shields** — energy shielding (value / max), with a regen button when your
  armor grants regeneration.
- **Barriers** — biotic protection you roll to soak incoming hits.
- **Tech Armor** — a flat absorption pool activated by tech powers.

Each meter has +/− buttons for manual adjustment, and all three are available as
**token bar** options so they show above the token in play. See
[Armor & Defense Layers](#armor--defense-layers) for how they absorb damage.

### Loadout panel

A dedicated panel shows what your character is actually wearing and carrying:

- **Armor placements** — head, chest, arms, and legs (or a one-piece body suit).
  Each slot shows the equipped piece and its AC contribution. Armor is composed
  per placement, which sets your total AC, your Dexterity cap, and any Strength
  requirement (a too-heavy loadout applies a speed penalty until you meet its
  STR minimum).
- **Weapon slots** — main-hand, off-hand, or a two-handed weapon, each shown as a
  tile with its damage, properties, mod slots, and heat meter.
- **Armor buffs & set bonuses** — chips below the slots summarize senses, speed
  bonuses, resistances, carry capacity, and any **set bonuses** (e.g. wearing
  several pieces of the same armor set) that are auto-applied.

Loadout tiles **glow red** when your character isn't proficient with the equipped
weapon or armor, so mismatches are easy to spot.

### Powers, points, and reputation

- A **Powers** tab organizes your biotic/tech/combat abilities (see
  [Powers](#powers)).
- Point-based casters get a **power point** pool with a per-cast level limit.
- A **Reputation** panel tracks Paragon and Renegade (see
  [Reputation](#reputation)).

---

## Armor & Defense Layers

Mass Effect characters are protected by layers that absorb damage **before** it
reaches hit points. When a creature takes damage, the layers are consumed in this
order:

1. **Barriers** — you roll a soak die (a d8 by default, upgradeable) and subtract
   the result. Some features let you choose how much barrier to spend per hit.
2. **Tech Armor** — a flat pool that absorbs damage 1-for-1 while it lasts.
3. **Shields** — absorb damage 1-for-1, then any leftover continues to HP.
4. **Hit Points** — whatever gets through.

### AC by placement

Your Armor Class is built from the armor in each placement (head/chest/arms/legs),
with each piece contributing based on whether it's light, medium, or heavy. Heavier
loadouts cap your Dexterity bonus and can require a minimum Strength.

### Shield regeneration

- **Out of combat**, shields refill on a long rest.
- **In combat**, shields only regenerate at the start of your turn if you have the
  **shield-regen** status active — apply it (from the token HUD or the sheet's
  regen button) when you Dodge, Hide, Disengage, or are in full cover, since
  Foundry can't detect those automatically. Taking damage stops regen for that
  turn.

### Bypassing the layers

Some attacks skip layers:

- **Melee weapon attacks** bypass shields entirely (regardless of damage type).
- **Lightning** damage is especially effective against shields.
- Certain weapons and powers are flagged to bypass specific layers (for example,
  heavy weapons that strip shields and barriers outright). When a layer is
  bypassed, the damage card notes it.

---

## Weapons

Weapons come from the **ME5e Weapons** compendium. Equip one to a weapon slot on
the loadout panel and use its tile to fire.

### Heat & thermal clips

ME weapons track **heat as shots remaining**, not as a gauge that fills up. Each
tile shows a heat meter counting down the shots left before you must reload.

- Each attack consumes one shot.
- **Reload** refills the meter to maximum.
- With the **Track Thermal Clips** setting on (the default), reloading consumes a
  Thermal Clip (or a Heavy Weapon Charge, for heavy weapons) from your inventory,
  and warns you when you're out. Turn the setting off for bookkeeping-light play.

### Mass Effect weapon properties

Weapon tiles surface extra fire modes and rules as buttons/chips when the weapon
has them:

- **Burst Fire** — an area attack against everything in a small zone; targets make
  a Dexterity save instead of you rolling to hit. Costs extra heat.
- **Double Tap** — fire a second shot as a bonus action.
- **Recoil** — you may attack and damage with Strength instead of Dexterity.
- **Heavy** — heavy weapons resolve as fixed-DC saving throws rather than attack
  rolls, often with their own area template and special riders.

### Weapon mods

Weapons have mod slots shown as **pips** on the tile. Click a pip to attach or
detach a mod from the **ME5e Weapon Mods** compendium — mods can add properties,
damage, heat capacity, or change a weapon's ammo type. Armor has its own mod slots
and the **ME5e Armor Mods** compendium.

---

## Powers

Powers are the Mass Effect take on spells, sorted into three categories instead of
the standard schools:

- **Biotic** — telekinetic/mass-effect-field abilities.
- **Tech** — gadgets, drones, and hacking.
- **Combat** — trained martial techniques.

Because powers are built as dnd5e spells, you cast them the usual way — from the
Powers/spellbook tab — and they appear on advancement during level-up.

- **Slot casters** spend the usual spell slots.
- **Point casters** (e.g. Engineer/Infiltrator-style classes) spend from a **power
  point** pool: a power of level *N* costs *N* points, up to a per-cast limit. The
  pool refills on a long rest.
- **Prepared casters** get a **Prepared Powers** section pinned to the top of the
  Powers tab for quick access.

A **Primes / Detonates** column marks which powers can prime a target and which can
detonate one — the heart of the combo system below.

---

## Combat: Prime & Detonate

The signature Mass Effect combo: one ability **primes** a target with an elemental
state, and a second ability **detonates** that state for a burst of damage and
effects.

### How it works in play

1. **Use a priming power** at a target. After the roll resolves, a **Prime
   [Type]** button appears on its chat card.
2. **Click Prime** to apply the primed state to the target (it lasts about one
   round). Multiple primers can stack on the same target. Some conditions — like a
   target that's been frozen or set on fire — count as primed.
3. **Use a detonating power** on a primed target. Its chat card shows a
   **Detonate** button.
4. **Click Detonate** to resolve the combo: the module rolls the detonation damage
   and effects for each primer on the target, and produces a damage card you apply
   with the normal dnd5e Apply / ½ / ×2 tray.

Priming and detonation are **manual button clicks** so you stay in control — you
confirm the hit first, then fire the combo.

### Damage over time

A few powers (and the fire detonation) apply **damage-over-time** effects. When
you use one, its card grows an **Apply DoT** button; click it with a target
selected to attach the effect. It then ticks automatically each round — on the
caster's turn or the victim's turn, depending on the power — until removed.

### Primer reference

| Primer | Detonation damage | Save | On a failed save |
|---|---|---|---|
| **Cold** | — (effect only) | STR (DC 15→18 by level) | **Frozen** 1 round, 4 m radius |
| **Fire** | 1d6 → 4d6 fire | none | plus a 1d6 fire **damage-over-time**, 4 m radius |
| **Force** | 2d6 → 5d6 force | none | **Prone** + 6 m knockback (single target) |
| **Lightning** | 3d4 → 6d4 lightning | none | 4 m radius |
| **Necrotic** | 1d12 necrotic | CON (DC 13) | **Stunned** 1 round (single target) |
| **Radiant**\* | 3d4 radiant | CON (DC 15) | **Poisoned** 1 hour, 4 m radius |

Damage values scale up at character levels 5, 11, and 17 where shown.

\*Radiant is a subclass-specific primer (Nuclear Adept), not one of the five
general primers.

---

## Reputation

Each character tracks two independent reputation tracks, shown on a sheet panel:

- **Paragon** — heroic, principled choices.
- **Renegade** — ruthless, pragmatic choices.

Both run on the same thresholds — **0 / 25 / 50 / 75 / 100** points — through the
ranks **Recruit → Spectre Candidate → Spectre → Council Specter → Legend**. The
ranks are narrative by default; use them to gate story moments as you like.

### Reputation benefits

As your reputation grows you unlock **Reputation Benefits** — active abilities and
trained knacks drawn from your standing. They live in the **ME5e Reputation
Benefits** compendium, ready to drag onto a sheet:

- Benefits unlock at **total** reputation (Paragon + Renegade) thresholds of
  **15 / 30 / 60 / 100**, and you may hold only **one benefit per threshold**.
- Each benefit lists a **prerequisite** comparing your Paragon and Renegade
  scores (e.g. "Paragon ≥ 20 and greater than Renegade", or "scores within 10 of
  each other") — shown at the top of the item.
- Benefits that impose a saving throw use your **Reputation Ability**: the save
  **DC = 8 + your proficiency bonus + your Charisma modifier**. The pack codes
  these as save cards, and the active/reroll benefits as limited uses (once per
  long rest, or a number of times equal to your Charisma modifier).
- If gaining reputation later means you no longer qualify for a benefit, you swap
  it for one you do qualify for on your next long rest.

The module ships the benefits as content — pick the ones you qualify for, as the
rules describe; it doesn't hard-enforce the thresholds.

GMs can award or set points from a macro or script via the module API:

```js
game.me5e.reputation.awardParagon(actor, 5);   // add 5 Paragon
game.me5e.reputation.awardRenegade(actor, 5);   // add 5 Renegade
game.me5e.reputation.setParagon(actor, 50);     // set Paragon to 50
game.me5e.reputation.getDetails(actor);         // read values + ranks
```

---

## Settings

Find these under **Game Settings → Configure Settings → Mass Effect 5e**:

- **Track Thermal Clips** *(default: on)* — when on, reloading a weapon consumes a
  Thermal Clip / Heavy Weapon Charge from the actor's inventory. Turn off to
  reload freely without tracking ammo.

---

## Compendium content

The **Mass Effect 5e** compendium folder includes Species, Species Features,
Classes, Subclasses, Class Features, Backgrounds, Weapons, Armor, Powers, Weapon
Mods, Armor Mods, Equipment & Items, Feats, Feature Options, **Reputation
Benefits**, a **Bestiary** of NPCs, and **Vehicles**. Drag items onto a sheet, or
actors onto the canvas, to use them.
