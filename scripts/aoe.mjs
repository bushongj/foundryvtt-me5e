// AOE template placement + token-in-template selection for detonation
// radii. ME5e radii are specified in meters; the scene is in dnd5e's
// `ft` or generic units, so we convert via the scene's grid distance.

const METERS_PER_FOOT = 0.3048;

function metersToSceneUnits(meters) {
  const scene = canvas.scene;
  const units = scene?.grid?.units ?? "ft";
  if (units === "m") return meters;
  return meters / METERS_PER_FOOT;
}

// Weapon-property distances follow 5e conventions and are given in feet.
export function feetToSceneUnits(feet) {
  const units = canvas.scene?.grid?.units ?? "ft";
  if (units === "m") return feet * METERS_PER_FOOT;
  return feet;
}

// Actors whose token center is within `radiusFeet` of a scene point — used for
// inner "auto-fail" cores (e.g. the Cain's 5ft center).
export function getTokensWithinFeet(x, y, radiusFeet) {
  const grid = canvas.scene.grid;
  const r = feetToSceneUnits(radiusFeet) * (grid.size / grid.distance);
  const out = new Set();
  for (const t of canvas.tokens?.placeables ?? []) {
    if (!t.actor) continue;
    const tx = t.center?.x ?? t.x + t.w / 2;
    const ty = t.center?.y ?? t.y + t.h / 2;
    if (Math.hypot(tx - x, ty - y) <= r) out.add(t.actor);
  }
  return out;
}

// Place a circle template centered on the origin token, then await
// confirmation via a dialog (shown to whoever triggered the detonation —
// player-driven via the cast-card button). Returns the (possibly-moved)
// template doc on confirm, or null on cancel.
export async function placeTemplate(originToken, radiusMeters) {
  if (!originToken || radiusMeters <= 0) return null;
  const distance = metersToSceneUnits(radiusMeters);
  const center = originToken.center ?? {
    x: originToken.x + (originToken.w ?? 0) / 2,
    y: originToken.y + (originToken.h ?? 0) / 2
  };

  const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
    t: "circle",
    user: game.user.id,
    distance,
    direction: 0,
    x: center.x,
    y: center.y,
    fillColor: game.user.color,
    flags: { me5e: { detonationTemplate: true } }
  }]);
  if (!template) return null;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("ME5E.Primer.TemplateTitle") },
    content: `<p>${game.i18n.localize("ME5E.Primer.TemplatePrompt")}</p>`,
    rejectClose: false,
    modal: false
  });

  if (!confirmed) {
    await template.delete();
    return null;
  }
  return template;
}

// Place a square (cube) template the user can drag, centered on the origin
// token initially, then await confirmation. `sideFeet` is the cube edge in
// feet. Foundry models a square as a "rect" whose diagonal length is the side
// × √2 at 45°, anchored at the top-left corner. Returns the template or null.
export async function placeCubeTemplate(originToken, sideFeet) {
  if (!originToken || sideFeet <= 0) return null;
  const side = feetToSceneUnits(sideFeet);
  const grid = canvas.scene.grid;
  const sidePx = side * (grid.size / grid.distance);
  const center = originToken.center ?? {
    x: originToken.x + (originToken.w ?? 0) / 2,
    y: originToken.y + (originToken.h ?? 0) / 2
  };

  const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
    t: "rect",
    user: game.user.id,
    distance: side * Math.SQRT2,
    direction: 45,
    x: center.x - sidePx / 2,
    y: center.y - sidePx / 2,
    fillColor: game.user.color,
    flags: { me5e: { burstTemplate: true } }
  }]);
  if (!template) return null;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("ME5E.Burst.TemplateTitle") },
    content: `<p>${game.i18n.localize("ME5E.Burst.TemplatePrompt")}</p>`,
    rejectClose: false,
    modal: false
  });

  if (!confirmed) {
    await template.delete();
    return null;
  }
  return template;
}

// Place an area template of the given shape the user can position/rotate, then
// await confirmation. `shape` is "circle" | "rect" | "cone"; `sizeFeet` is the
// radius (circle), side (rect/cube), or length (cone). Cones anchor at the
// origin token (they emanate from the firer); circle/rect start centered on it
// so they can be dragged onto a target. Returns the template or null.
export async function placeAreaTemplate(originToken, shape, sizeFeet, { direction = 0, width = null, height = null } = {}) {
  if (!originToken || sizeFeet <= 0) return null;
  const size = feetToSceneUnits(sizeFeet);
  const grid = canvas.scene.grid;
  const pxPerUnit = grid.size / grid.distance;
  const center = originToken.center ?? {
    x: originToken.x + (originToken.w ?? 0) / 2,
    y: originToken.y + (originToken.h ?? 0) / 2
  };

  const data = {
    user: game.user.id,
    x: center.x,
    y: center.y,
    direction,
    fillColor: game.user.color,
    flags: { me5e: { areaTemplate: true } }
  };
  if (shape === "circle") {
    data.t = "circle";
    data.distance = size;
  } else if (shape === "rect") {
    // Foundry models a rectangle by its diagonal length + angle. A square
    // falls out when width === height. Anchor at the top-left, centered on
    // the origin so it can be dragged onto the target area.
    const w = feetToSceneUnits(width ?? sizeFeet);
    const h = feetToSceneUnits(height ?? sizeFeet);
    data.t = "rect";
    data.distance = Math.hypot(w, h);
    data.direction = Math.toDegrees(Math.atan2(h, w));
    data.x = center.x - (w * pxPerUnit) / 2;
    data.y = center.y - (h * pxPerUnit) / 2;
  } else if (shape === "cone") {
    data.t = "cone";
    data.distance = size;
  } else {
    return null;
  }

  const [template] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
  if (!template) return null;

  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize("ME5E.Area.TemplateTitle") },
    content: `<p>${game.i18n.localize("ME5E.Area.TemplatePrompt")}</p>`,
    rejectClose: false,
    modal: false
  });

  if (!confirmed) {
    await template.delete();
    return null;
  }
  return template;
}

// Find all actors whose token center sits inside the template. Prefers
// Foundry's computed template shape (handles circle/rect/cone uniformly),
// falling back to manual circle/rect math if the placeable isn't ready yet.
export function getTokensInTemplate(template) {
  if (!template) return [];
  const grid = canvas.scene.grid;
  const pxPerUnit = grid.size / grid.distance;

  const placeable = canvas.templates?.get(template.id);
  const shape = placeable?.shape;
  let hit;
  if (shape && typeof shape.contains === "function") {
    hit = (tx, ty) => shape.contains(tx - template.x, ty - template.y);
  } else if (template.t === "rect") {
    const sidePx = (template.distance / Math.SQRT2) * pxPerUnit;
    const x0 = template.x, y0 = template.y, x1 = x0 + sidePx, y1 = y0 + sidePx;
    hit = (tx, ty) => tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1;
  } else {
    const radius = template.distance * pxPerUnit;
    hit = (tx, ty) => Math.hypot(tx - template.x, ty - template.y) <= radius;
  }

  const out = [];
  for (const t of canvas.tokens?.placeables ?? []) {
    if (!t.actor) continue;
    const tx = t.center?.x ?? t.x + t.w / 2;
    const ty = t.center?.y ?? t.y + t.h / 2;
    if (hit(tx, ty)) out.push(t.actor);
  }
  return out;
}

export async function deleteTemplate(template) {
  if (template?.id) await template.delete().catch(() => {});
}
