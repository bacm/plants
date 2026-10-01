---
id: 105
title: Store and sync the garden plan, with its geometry helpers
status: done
priority: P2
type: feature
---

## Problem

The garden plan agreed on 2026-10-01 (Herbier canvas, row "Plan du jardin")
needs data the app does not have: the plan's size, each zone's outline and
each plant's position. All of it must sync between the phone and the web,
or the two plans diverge.

## Why it matters

Tickets 106 (plan view, placing, moving) and 107 (drawing zones) both build
on this data and on the same geometry (point in polygon, areas, scale).

## Acceptance criteria

- [x] Plants gain `planX` and `planY` (integer cm, null = not placed) in
      `PLANT_FIELDS` with their migrations; `plantFields.test.js` passes
- [x] Zones gain `polygon` (JSON list of `[x, y]` points in cm, null = not
      drawn) in `ZONE_FIELDS`, `createZone` on both platforms and a migration;
      `zoneFields.test.js` passes
- [x] A new synced table `garden_plan` (one row, id `main`: `widthCm`,
      `lengthCm`) is wired everywhere a synced table is: `SYNCED_TABLES`,
      backups (export, import, validation, older backups still import),
      `server/sync_schema.json`, `isGardenEmpty`, first-sync counts, web store
- [x] `getGardenPlan`, `saveGardenPlan`, `setPlantPosition` (position and,
      when given, zone in one write) and `setZonePolygon` exist with the same
      names in `lib/db.js` and `lib/db.web.js`
- [x] `lib/gardenPlan.js` (pure) offers point in polygon, area in m²,
      the zone under a point (smallest area when zones overlap), rectangle to
      polygon, polygon validity, screen ↔ cm conversion for a zoom and pan,
      a plant's dot diameter from its width with a touchable minimum, and the
      French formats ("4,2 m²", "15 × 25 m"); Jest covers each
- [x] `npm run verify` and server pytest pass; the server deploy accepts the
      new columns and table (checked in production after the push)

## Notes

Owner decisions (2026-10-01): a neutral metre grid (no background image),
the garden's size entered at creation, zones as polygons (corners by finger
or a rectangle by dimensions, no snapping), plant dots at real width, no
layers, single tap = name bubble → plant sheet, long press = move (the zone
follows, with Annuler), a "Plan" button in Zones, phone and web from the
start. Refused: background image, free drawing, layers, several plans, GPS.

All lengths are integer centimetres, like the plant `width` field. The plan's
size can grow later (106 offers it).
