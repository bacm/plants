import {
  DEFAULT_SNAP_SETTINGS,
  makeSnapper,
  parseSnapSettings,
  snapPoint,
  snapShapes,
} from '../planSnap';
import { addCorner, resizePolygon } from '../zoneDraw';
import { dragFeatureCorner, dragFeatureShape } from '../planFeatures';

const plan = { widthCm: 1500, lengthCm: 2500 };
// A 400 x 300 bed at (500, 500).
const bed = [
  [500, 500],
  [900, 500],
  [900, 800],
  [500, 800],
];
const shapes = [{ id: 'zone:1', polygon: bed }];
const base = { ...DEFAULT_SNAP_SETTINGS, grid: false };
const snap = (point, over = {}, ctx = {}) =>
  snapPoint(point, { settings: { ...base, ...over }, shapes, plan, scalePxPerCm: 1, ...ctx });

describe('snapPoint', () => {
  test('a corner within reach wins over a side and the grid', () => {
    const out = snap({ x: 905, y: 503 }, { grid: true });
    expect(out).toEqual({ point: { x: 900, y: 500 }, kind: 'vertex' });
  });

  test('away from corners, the nearest point of a side', () => {
    const out = snap({ x: 700, y: 506 }, { grid: true });
    expect(out).toEqual({ point: { x: 700, y: 500 }, kind: 'edge' });
  });

  test('the grid applies when nothing else is near, and is optional', () => {
    expect(snap({ x: 1213, y: 1990 }, { grid: true })).toEqual({
      point: { x: 1200, y: 2000 },
      kind: 'grid',
    });
    expect(snap({ x: 1213, y: 1990 })).toEqual({ point: { x: 1213, y: 1990 }, kind: null });
  });

  test('the grid step is configurable', () => {
    const out = snap({ x: 1213, y: 1990 }, { grid: true, gridStepCm: 100 });
    expect(out.point).toEqual({ x: 1200, y: 2000 });
    expect(snap({ x: 1237, y: 1990 }, { grid: true, gridStepCm: 25 }).point.x).toBe(1225);
    expect(snap({ x: 1237, y: 1990 }, { grid: true, gridStepCm: 10 }).point.x).toBe(1240);
  });

  test('the reach is measured in screen px: 12 px is 24 cm at 0.5 px/cm', () => {
    const at = (dy, scalePxPerCm) => snap({ x: 700, y: 500 + dy }, {}, { scalePxPerCm }).kind;
    expect(at(20, 0.5)).toBe('edge');
    expect(at(30, 0.5)).toBe(null);
    // Zoomed in to 4 px/cm the same 12 px is only 3 cm.
    expect(at(2, 4)).toBe('edge');
    expect(at(5, 4)).toBe(null);
  });

  test('the distance setting changes the reach', () => {
    expect(snap({ x: 700, y: 515 }, { distance: 'small' }).kind).toBe(null);
    expect(snap({ x: 700, y: 515 }, { distance: 'medium' }).kind).toBe(null);
    expect(snap({ x: 700, y: 515 }, { distance: 'large' }).kind).toBe('edge');
  });

  test('the shape being edited never snaps to itself', () => {
    expect(snap({ x: 903, y: 503 }, {}, { excludeId: 'zone:1' }).kind).toBe(null);
  });

  test('targets can be switched off', () => {
    expect(snap({ x: 905, y: 503 }, { vertices: false })).toEqual({
      point: { x: 900, y: 503 },
      kind: 'edge',
    });
    expect(snap({ x: 905, y: 503 }, { vertices: false, edges: false }).kind).toBe(null);
  });

  test('the garden border and its corners need the Bord toggle', () => {
    expect(snap({ x: 1000, y: 6 }).kind).toBe(null);
    expect(snap({ x: 1000, y: 6 }, { border: true })).toEqual({
      point: { x: 1000, y: 0 },
      kind: 'border',
    });
    expect(snap({ x: 1495, y: 4 }, { border: true })).toEqual({
      point: { x: 1500, y: 0 },
      kind: 'border',
    });
  });

  test('all targets off leaves the point as it is, kept in the garden', () => {
    const off = { grid: false, vertices: false, edges: false, border: false };
    expect(snap({ x: 903, y: 503 }, off)).toEqual({ point: { x: 903, y: 503 }, kind: null });
    expect(snap({ x: -20, y: 9999 }, off).point).toEqual({ x: 0, y: 2500 });
  });

  test('a point on a side of an angled shape lands exactly on it', () => {
    const tri = [
      {
        id: 'feature:2',
        polygon: [
          [0, 1000],
          [1000, 1000],
          [0, 2000],
        ],
      },
    ];
    const out = snapPoint(
      { x: 500, y: 1500 },
      { settings: base, shapes: tri, plan, scalePxPerCm: 1 }
    );
    expect(out.kind).toBe('edge');
    expect(out.point.x + out.point.y).toBe(2000);
  });
});

describe('snapShapes / settings', () => {
  test('zones and elements, invalid outlines dropped', () => {
    const out = snapShapes(
      [
        { id: 1, polygon: JSON.stringify(bed) },
        { id: 2, polygon: null },
      ],
      [{ id: 3, polygon: bed }]
    );
    expect(out.map((s) => s.id)).toEqual(['zone:1', 'feature:3']);
  });

  test('parseSnapSettings falls back to the defaults', () => {
    expect(parseSnapSettings(null)).toEqual(DEFAULT_SNAP_SETTINGS);
    expect(parseSnapSettings('nope')).toEqual(DEFAULT_SNAP_SETTINGS);
    expect(
      parseSnapSettings(JSON.stringify({ grid: false, gridStepCm: 100, distance: 'large', x: 1 }))
    ).toEqual({ ...DEFAULT_SNAP_SETTINGS, grid: false, gridStepCm: 100, distance: 'large' });
    expect(parseSnapSettings({ gridStepCm: 33, distance: 'huge' })).toEqual(DEFAULT_SNAP_SETTINGS);
  });

  test('makeSnapper is null with the magnet off', () => {
    const args = { settings: base, shapes, plan, scalePxPerCm: 1 };
    expect(makeSnapper({ ...args, enabled: false })).toBe(null);
    expect(makeSnapper({ ...args, enabled: true })({ x: 903, y: 503 }).kind).toBe('vertex');
  });
});

describe('the corner helpers use a snapper', () => {
  const snapper = makeSnapper({
    enabled: true,
    settings: DEFAULT_SNAP_SETTINGS,
    shapes,
    plan,
    scalePxPerCm: 1,
  });

  test('addCorner', () => {
    expect(addCorner([], { x: 905, y: 503 }, plan, { magnet: snapper })).toEqual([[900, 500]]);
  });

  test('dragFeatureCorner and dragFeatureShape', () => {
    const start = [
      [1000, 1000],
      [1200, 1000],
      [1200, 1100],
      [1000, 1100],
    ];
    const out = dragFeatureCorner(start, 0, { dx: -97, dy: -495 }, plan, snapper);
    expect(out[0]).toEqual([900, 500]);
    const shape = dragFeatureShape(start, { dx: -97, dy: -497 }, plan, snapper);
    expect(shape[0]).toEqual([900, 500]);
    expect(shape[2]).toEqual([1100, 600]);
  });

  test('resizePolygon snaps the resulting corners', () => {
    const rect = [
      [500, 1000],
      [700, 1000],
      [700, 1200],
      [500, 1200],
    ];
    const { polygon } = resizePolygon(rect, { widthCm: 400, lengthCm: 197 }, plan, {
      magnet: snapper,
    });
    expect(polygon[0]).toEqual([500, 1000]);
    expect(polygon[1][0]).toBe(900);
  });
});
