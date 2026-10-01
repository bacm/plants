import {
  fitView,
  clampView,
  zoomAround,
  clampNumber,
  clampToPlan,
  snapToGrid,
  isInsidePlan,
  gridLines,
  polygonLabelPoint,
  planSummary,
  shortPlantName,
  plantSubtitle,
  moveMessage,
  parsePlanMetres,
  nextPlanSize,
  parsePlanSizeInput,
  planExtent,
  checkPlanResize,
  PLAN_INSETS,
  MIN_VISIBLE_PX,
} from '../planView';
import { toScreen, toPlan } from '../gardenPlan';

const PLAN = { widthCm: 1500, lengthCm: 2500 };
const VIEWPORT = { width: 390, height: 844 };

describe('fitView', () => {
  it('reproduces the Plan artboard: 22 px per metre at (30, 118)', () => {
    const view = fitView(PLAN, VIEWPORT);
    expect(view.scale).toBeCloseTo(0.22, 5);
    expect(view.offsetX).toBeCloseTo(30, 5);
    expect(view.offsetY).toBeCloseTo(118, 5);
  });

  it('centres a plan that is limited by the other side', () => {
    const view = fitView({ widthCm: 500, lengthCm: 500 }, VIEWPORT);
    expect(view.scale).toBeCloseTo(330 / 500, 5);
    const topLeft = toScreen({ x: 0, y: 0 }, view);
    const bottomRight = toScreen({ x: 500, y: 500 }, view);
    expect(topLeft.x).toBeCloseTo(PLAN_INSETS.left, 5);
    expect(bottomRight.x).toBeCloseTo(VIEWPORT.width - PLAN_INSETS.right, 5);
    const free = VIEWPORT.height - PLAN_INSETS.top - PLAN_INSETS.bottom;
    expect(topLeft.y + bottomRight.y).toBeCloseTo(2 * PLAN_INSETS.top + free, 5);
  });
});

describe('clampView', () => {
  it('leaves a visible view alone', () => {
    const view = fitView(PLAN, VIEWPORT);
    expect(clampView(view, PLAN, VIEWPORT)).toEqual(view);
  });

  it('keeps at least MIN_VISIBLE_PX of the plan on screen', () => {
    const view = { scale: 0.22, offsetX: -5000, offsetY: 5000 };
    const clamped = clampView(view, PLAN, VIEWPORT);
    expect(clamped.offsetX).toBeCloseTo(MIN_VISIBLE_PX - 1500 * 0.22, 5);
    expect(clamped.offsetY).toBe(VIEWPORT.height - MIN_VISIBLE_PX);
    const farRight = clampView({ ...view, offsetX: 5000 }, PLAN, VIEWPORT);
    expect(farRight.offsetX).toBe(VIEWPORT.width - MIN_VISIBLE_PX);
  });

  it('lets a tiny plan stay fully visible', () => {
    const view = { scale: 0.01, offsetX: 380, offsetY: 0 };
    const clamped = clampView(view, { widthCm: 1000, lengthCm: 1000 }, VIEWPORT);
    expect(clamped.offsetX).toBe(VIEWPORT.width - 10);
  });
});

describe('zoomAround', () => {
  it('keeps the plan point under the focal point fixed', () => {
    const view = { scale: 0.22, offsetX: 30, offsetY: 118 };
    const focal = { x: 200, y: 400 };
    const before = toPlan(focal, view);
    const next = zoomAround(view, 0.66, focal);
    const after = toPlan(focal, next);
    expect(next.scale).toBe(0.66);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });

  it('is the identity for the same scale', () => {
    const view = { scale: 0.5, offsetX: 10, offsetY: 20 };
    expect(zoomAround(view, 0.5, { x: 99, y: 3 })).toEqual(view);
  });
});

describe('clampNumber, clampToPlan, isInsidePlan', () => {
  it('clamps numbers', () => {
    expect(clampNumber(5, 1, 3)).toBe(3);
    expect(clampNumber(-5, 1, 3)).toBe(1);
    expect(clampNumber(2, 1, 3)).toBe(2);
  });

  it('keeps a dropped point inside the garden', () => {
    expect(clampToPlan({ x: -20, y: 9999 }, PLAN)).toEqual({ x: 0, y: 2500 });
    expect(clampToPlan({ x: 300, y: 400 }, PLAN)).toEqual({ x: 300, y: 400 });
  });

  it('tells inside from outside', () => {
    expect(isInsidePlan({ x: 0, y: 2500 }, PLAN)).toBe(true);
    expect(isInsidePlan({ x: -1, y: 10 }, PLAN)).toBe(false);
    expect(isInsidePlan({ x: 10, y: 2501 }, PLAN)).toBe(false);
  });
});

describe('gridLines', () => {
  it('has a line every metre and a stronger one every 5 m, without the borders', () => {
    const { minor, major } = gridLines(1500, 0.22);
    expect(major).toEqual([500, 1000]);
    expect(minor).toHaveLength(12);
    expect(minor).not.toContain(500);
    expect(minor[0]).toBe(100);
  });

  it('drops lines that would be too close on screen', () => {
    expect(gridLines(1500, 0.01).minor).toEqual([]);
    expect(gridLines(1500, 0.01).major).toEqual([]);
    expect(gridLines(100000, 0.02).minor).toEqual([]);
    expect(gridLines(100000, 0.02).major.length).toBeGreaterThan(0);
  });
});

describe('polygonLabelPoint', () => {
  it('is the centroid of a rectangle', () => {
    expect(
      polygonLabelPoint([
        [0, 0],
        [200, 0],
        [200, 100],
        [0, 100],
      ])
    ).toEqual({ x: 100, y: 50 });
  });

  it('stays inside a concave L when the centroid falls outside', () => {
    const l = [
      [0, 0],
      [1000, 0],
      [1000, 100],
      [100, 100],
      [100, 1000],
      [0, 1000],
    ];
    const p = polygonLabelPoint(l);
    // The centroid (about 280, 280) is outside the L: falls back to the bbox centre.
    expect(p).toEqual({ x: 500, y: 500 });
  });
});

describe('texts', () => {
  it('summarises the plan with French plurals', () => {
    expect(planSummary(PLAN, 3, 10)).toBe('15 × 25 m · 3 zones · 10 plantes placées');
    expect(planSummary(PLAN, 1, 1)).toBe('15 × 25 m · 1 zone · 1 plante placée');
    expect(planSummary(PLAN, 0, 0)).toBe('15 × 25 m · 0 zone · 0 plante placée');
  });

  it('shortens a plant name at the first quote', () => {
    expect(shortPlantName('Rosier ‘Pierre de Ronsard’')).toBe('Rosier');
    expect(shortPlantName("Lavande 'Hidcote'")).toBe('Lavande');
    expect(shortPlantName('Lavande')).toBe('Lavande');
    expect(shortPlantName("'Seul'")).toBe("'Seul'");
    expect(shortPlantName(null)).toBe('');
  });

  it('writes the bubble subtitle', () => {
    expect(plantSubtitle('Massif sud')).toBe('Massif sud');
    expect(plantSubtitle(null)).toBe('Sans zone');
  });

  it('writes the banner after a move', () => {
    expect(moveMessage({ plantName: "Lavande 'Hidcote'", zoneName: 'Bordure ombre' })).toEqual({
      text: 'Lavande déplacée vers ',
      strong: 'Bordure ombre',
    });
    expect(moveMessage({ plantName: 'Lavande', zoneName: null, previousZoneId: 'z1' })).toEqual({
      text: 'Lavande retirée de sa zone',
      strong: null,
    });
    expect(moveMessage({ plantName: 'Lavande', zoneName: null, previousZoneId: null })).toEqual({
      text: 'Lavande posée hors zone',
      strong: null,
    });
  });
});

describe('parsePlanMetres', () => {
  it('accepts whole numbers and a decimal comma or point', () => {
    expect(parsePlanMetres('15')).toEqual({ cm: 1500 });
    expect(parsePlanMetres(' 12,5 ')).toEqual({ cm: 1250 });
    expect(parsePlanMetres('12.25')).toEqual({ cm: 1225 });
    expect(parsePlanMetres('1000')).toEqual({ cm: 100000 });
  });

  it('refuses empty, non numeric, zero and too large values', () => {
    expect(parsePlanMetres('').error).toMatch(/Indiquez/);
    expect(parsePlanMetres('abc').error).toMatch(/invalide/);
    expect(parsePlanMetres('-3').error).toMatch(/invalide/);
    expect(parsePlanMetres('1,2,3').error).toMatch(/invalide/);
    expect(parsePlanMetres('0').error).toMatch(/supérieur à 0/);
    expect(parsePlanMetres('0,001').error).toMatch(/supérieur à 0/);
    expect(parsePlanMetres('1000,5').error).toBe('Maximum 1000 m.');
  });
});

describe('planExtent and checkPlanResize', () => {
  const zones = [
    {
      polygon: JSON.stringify([
        [0, 0],
        [800, 0],
        [800, 1200],
        [0, 1200],
      ]),
    },
    { polygon: null },
  ];
  const plants = [
    { planX: 900, planY: 300 },
    { planX: null, planY: null },
  ];

  it('is the farthest drawn point on each axis', () => {
    expect(planExtent(zones, plants)).toEqual({ widthCm: 900, lengthCm: 1200 });
    expect(planExtent([], [])).toEqual({ widthCm: 0, lengthCm: 0 });
  });

  it('allows enlarging and refuses cutting a zone or a plant', () => {
    expect(checkPlanResize({ widthCm: 1500, lengthCm: 2500 }, zones, plants)).toEqual({ ok: true });
    expect(checkPlanResize({ widthCm: 900, lengthCm: 1200 }, zones, plants)).toEqual({ ok: true });
    const refused = checkPlanResize({ widthCm: 850, lengthCm: 2500 }, zones, plants);
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain('au moins 9 × 25 m');
  });
});

describe('nextPlanSize', () => {
  it('steps by 5 cm below 50 cm, 10 cm up to 2 m, 25 cm above', () => {
    expect(nextPlanSize(30, 1)).toBe(35);
    expect(nextPlanSize(45, 1)).toBe(50);
    expect(nextPlanSize(50, 1)).toBe(60);
    expect(nextPlanSize(190, 1)).toBe(200);
    expect(nextPlanSize(200, 1)).toBe(225);
    expect(nextPlanSize(225, -1)).toBe(200);
    expect(nextPlanSize(200, -1)).toBe(190);
    expect(nextPlanSize(60, -1)).toBe(50);
    expect(nextPlanSize(50, -1)).toBe(45);
  });
  it('snaps an off-grid value to the grid', () => {
    expect(nextPlanSize(53, 1)).toBe(60);
    expect(nextPlanSize(53, -1)).toBe(50);
  });
  it('starts from the 50 cm fallback when unset', () => {
    expect(nextPlanSize(null, 1)).toBe(60);
    expect(nextPlanSize(null, -1)).toBe(45);
  });
  it('stays within 5 cm and 50 m', () => {
    expect(nextPlanSize(5, -1)).toBe(5);
    expect(nextPlanSize(5000, 1)).toBe(5000);
  });
});

describe('parsePlanSizeInput', () => {
  it('reads metres with a French decimal comma', () => {
    expect(parsePlanSizeInput('0,3')).toEqual({ cm: 30 });
    expect(parsePlanSizeInput('1.5')).toEqual({ cm: 150 });
    expect(parsePlanSizeInput('2')).toEqual({ cm: 200 });
  });
  it('returns French errors', () => {
    expect(parsePlanSizeInput('')).toHaveProperty('error');
    expect(parsePlanSizeInput('abc')).toHaveProperty('error');
    expect(parsePlanSizeInput('0')).toHaveProperty('error');
    expect(parsePlanSizeInput('0,01')).toEqual({ error: 'Minimum 0,05 m.' });
    expect(parsePlanSizeInput('51')).toEqual({ error: 'Maximum 50 m.' });
  });
});

describe('snapToGrid', () => {
  it('keeps exact multiples', () => {
    expect(snapToGrid({ x: 100, y: 450 }, PLAN)).toEqual({ x: 100, y: 450 });
  });
  it('rounds to the nearest multiple, halves up', () => {
    expect(snapToGrid({ x: 124, y: 126 }, PLAN)).toEqual({ x: 100, y: 150 });
    expect(snapToGrid({ x: 125, y: 175 }, PLAN)).toEqual({ x: 150, y: 200 });
  });
  it('handles negatives and the edges', () => {
    expect(snapToGrid({ x: -20, y: -30 }, PLAN)).toEqual({ x: 0, y: 0 });
    expect(snapToGrid({ x: 0, y: 0 }, PLAN)).toEqual({ x: 0, y: 0 });
  });
  it('clamps inside the garden', () => {
    expect(snapToGrid({ x: 99999, y: 99999 }, PLAN)).toEqual({
      x: PLAN.widthCm,
      y: PLAN.lengthCm,
    });
    expect(snapToGrid({ x: 1490, y: 2490 }, { widthCm: 1480, lengthCm: 2480 })).toEqual({
      x: 1480,
      y: 2480,
    });
  });
  it('accepts another step', () => {
    expect(snapToGrid({ x: 33, y: 71 }, PLAN, 10)).toEqual({ x: 30, y: 70 });
  });
});

describe('plan extent with garden elements (ticket 110)', () => {
  const { planExtent, checkPlanResize } = require('../planView');
  const feature = {
    polygon: [
      [0, 0],
      [900, 0],
      [900, 700],
      [0, 700],
    ],
  };

  it('counts the outline of an element', () => {
    expect(planExtent([], [], [feature])).toEqual({ widthCm: 900, lengthCm: 700 });
  });

  it('refuses a plan smaller than an element', () => {
    expect(checkPlanResize({ widthCm: 800, lengthCm: 800 }, [], [], [feature]).ok).toBe(false);
    expect(checkPlanResize({ widthCm: 900, lengthCm: 700 }, [], [], [feature]).ok).toBe(true);
  });
});
