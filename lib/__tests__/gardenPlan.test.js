const {
  GARDEN_PLAN_ID,
  pointInPolygon,
  polygonAreaM2,
  zoneAt,
  rectanglePolygon,
  isValidPolygon,
  parsePolygon,
  serializePolygon,
  toScreen,
  toPlan,
  dotDiameterPx,
  markerDiameterPx,
  formatArea,
  formatLength,
  edgeDistances,
  formatDistance,
  formatSize,
  assertValidPlanSize,
  assertValidPosition,
  assertValidPlanSizeCm,
} = require('../gardenPlan');

// 4 m x 3 m rectangle at the origin.
const RECT = rectanglePolygon({ x: 0, y: 0, widthCm: 400, lengthCm: 300 });
// A "U" shape: the notch is the box x 100..200, y 0..100.
const U = [
  [0, 0],
  [100, 0],
  [100, 100],
  [200, 100],
  [200, 0],
  [300, 0],
  [300, 200],
  [0, 200],
];

describe('constants', () => {
  it('uses main as the single plan id', () => {
    expect(GARDEN_PLAN_ID).toBe('main');
  });
});

describe('rectanglePolygon', () => {
  it('lists the four corners clockwise from the top-left', () => {
    expect(rectanglePolygon({ x: 10, y: 20, widthCm: 100, lengthCm: 50 })).toEqual([
      [10, 20],
      [110, 20],
      [110, 70],
      [10, 70],
    ]);
  });
});

describe('polygonAreaM2', () => {
  it('computes a rectangle in m2', () => {
    expect(polygonAreaM2(RECT)).toBe(12);
  });
  it('is positive whatever the winding order', () => {
    expect(polygonAreaM2([...RECT].reverse())).toBe(12);
  });
  it('handles a concave polygon', () => {
    // 300x200 minus the 100x100 notch = 5 m2
    expect(polygonAreaM2(U)).toBe(5);
  });
  it('computes a triangle', () => {
    expect(
      polygonAreaM2([
        [0, 0],
        [200, 0],
        [0, 200],
      ])
    ).toBe(2);
  });
  it('is 0 for fewer than 3 points or nothing', () => {
    expect(
      polygonAreaM2([
        [0, 0],
        [1, 1],
      ])
    ).toBe(0);
    expect(polygonAreaM2(null)).toBe(0);
  });
});

describe('pointInPolygon', () => {
  it('detects inside and outside a rectangle', () => {
    expect(pointInPolygon([200, 150], RECT)).toBe(true);
    expect(pointInPolygon([500, 150], RECT)).toBe(false);
    expect(pointInPolygon([-1, 150], RECT)).toBe(false);
    expect(pointInPolygon([200, 301], RECT)).toBe(false);
  });
  it('accepts {x, y} points', () => {
    expect(pointInPolygon({ x: 200, y: 150 }, RECT)).toBe(true);
  });
  it('counts edge and corner points as inside', () => {
    expect(pointInPolygon([0, 150], RECT)).toBe(true);
    expect(pointInPolygon([400, 300], RECT)).toBe(true);
    expect(pointInPolygon([200, 0], RECT)).toBe(true);
  });
  it('handles a concave polygon (the notch is outside)', () => {
    expect(pointInPolygon([150, 50], U)).toBe(false);
    expect(pointInPolygon([50, 50], U)).toBe(true);
    expect(pointInPolygon([250, 50], U)).toBe(true);
    expect(pointInPolygon([150, 150], U)).toBe(true);
    // on the notch edge
    expect(pointInPolygon([150, 100], U)).toBe(true);
  });
  it('is false for a degenerate polygon', () => {
    expect(
      pointInPolygon(
        [0, 0],
        [
          [0, 0],
          [1, 1],
        ]
      )
    ).toBe(false);
    expect(pointInPolygon([0, 0], null)).toBe(false);
  });
});

describe('zoneAt', () => {
  const lawn = { id: 'lawn', polygon: RECT };
  const bed = {
    id: 'bed',
    polygon: rectanglePolygon({ x: 100, y: 100, widthCm: 100, lengthCm: 100 }),
  };
  it('returns the zone containing the point', () => {
    expect(zoneAt([10, 10], [lawn, bed]).id).toBe('lawn');
  });
  it('prefers the smallest zone when zones overlap, whatever the order', () => {
    expect(zoneAt([150, 150], [lawn, bed]).id).toBe('bed');
    expect(zoneAt([150, 150], [bed, lawn]).id).toBe('bed');
  });
  it('returns null outside every zone', () => {
    expect(zoneAt([900, 900], [lawn, bed])).toBeNull();
    expect(zoneAt([0, 0], [])).toBeNull();
    expect(zoneAt([0, 0], undefined)).toBeNull();
  });
  it('ignores zones with no or invalid polygon, and accepts stored strings', () => {
    expect(
      zoneAt(
        [10, 10],
        [
          { id: 'a', polygon: null },
          { id: 'b', polygon: 'nope' },
        ]
      )
    ).toBeNull();
    expect(zoneAt([10, 10], [{ id: 'c', polygon: JSON.stringify(RECT) }]).id).toBe('c');
  });
});

describe('isValidPolygon', () => {
  it('accepts a rectangle and a concave polygon', () => {
    expect(isValidPolygon(RECT)).toBe(true);
    expect(isValidPolygon(U)).toBe(true);
  });
  it('rejects fewer than 3 points and non-arrays', () => {
    expect(
      isValidPolygon([
        [0, 0],
        [1, 1],
      ])
    ).toBe(false);
    expect(isValidPolygon(null)).toBe(false);
    expect(isValidPolygon('x')).toBe(false);
  });
  it('rejects zero area (collinear points)', () => {
    expect(
      isValidPolygon([
        [0, 0],
        [100, 0],
        [200, 0],
      ])
    ).toBe(false);
  });
  it('rejects repeated consecutive points, including last and first', () => {
    expect(
      isValidPolygon([
        [0, 0],
        [0, 0],
        [100, 0],
        [0, 100],
      ])
    ).toBe(false);
    expect(
      isValidPolygon([
        [0, 0],
        [100, 0],
        [0, 100],
        [0, 0],
      ])
    ).toBe(false);
  });
  it('rejects non-integer, non-finite and malformed points', () => {
    expect(
      isValidPolygon([
        [0, 0],
        [100.5, 0],
        [0, 100],
      ])
    ).toBe(false);
    expect(
      isValidPolygon([
        [0, 0],
        [Infinity, 0],
        [0, 100],
      ])
    ).toBe(false);
    expect(
      isValidPolygon([
        [0, 0],
        [NaN, 0],
        [0, 100],
      ])
    ).toBe(false);
    expect(
      isValidPolygon([
        [0, 0],
        ['1', 0],
        [0, 100],
      ])
    ).toBe(false);
    expect(isValidPolygon([[0, 0], [1], [0, 100]])).toBe(false);
  });
});

describe('parsePolygon / serializePolygon', () => {
  it('round-trips a polygon', () => {
    expect(parsePolygon(serializePolygon(RECT))).toEqual(RECT);
  });
  it('tolerates null, empty, bad JSON and invalid polygons', () => {
    expect(parsePolygon(null)).toBeNull();
    expect(parsePolygon(undefined)).toBeNull();
    expect(parsePolygon('')).toBeNull();
    expect(parsePolygon('{oops')).toBeNull();
    expect(parsePolygon('[[0,0],[1,1]]')).toBeNull();
    expect(parsePolygon('{"a":1}')).toBeNull();
  });
  it('serializes null to null and throws on an invalid polygon', () => {
    expect(serializePolygon(null)).toBeNull();
    expect(() =>
      serializePolygon([
        [0, 0],
        [1, 1],
      ])
    ).toThrow();
  });
});

describe('toScreen / toPlan', () => {
  const view = { scale: 0.5, offsetX: 20, offsetY: -10 };
  it('converts plan cm to screen px', () => {
    expect(toScreen({ x: 100, y: 200 }, view)).toEqual({ x: 70, y: 90 });
  });
  it('converts back, rounding to whole cm', () => {
    expect(toPlan({ x: 70, y: 90 }, view)).toEqual({ x: 100, y: 200 });
    expect(toPlan({ x: 71, y: 90 }, view)).toEqual({ x: 102, y: 200 });
  });
  it('round-trips for several zooms', () => {
    for (const scale of [0.1, 0.37, 1, 2.5]) {
      const v = { scale, offsetX: 13, offsetY: 7 };
      expect(toPlan(toScreen({ x: 1234, y: 567 }, v), v)).toEqual({ x: 1234, y: 567 });
    }
  });
});

describe('markerDiameterPx', () => {
  test('a canopy under the cap is the marker', () => {
    expect(markerDiameterPx(12)).toBe(12);
    expect(markerDiameterPx(20)).toBe(20);
  });
  test('a bigger canopy is capped at 28 px', () => {
    expect(markerDiameterPx(110)).toBe(28);
    expect(markerDiameterPx(28)).toBe(28);
  });
  test('the cap can be set', () => {
    expect(markerDiameterPx(50, { maxPx: 40 })).toBe(40);
  });
});

describe('dotDiameterPx', () => {
  it('draws the plan size at the current scale', () => {
    expect(dotDiameterPx(200, 0.5)).toBe(100);
  });
  it('never goes under the touchable minimum', () => {
    expect(dotDiameterPx(20, 0.1)).toBe(12);
    expect(dotDiameterPx(20, 0.1, { minPx: 20 })).toBe(20);
  });
  it('falls back to 50 cm when the plan size is missing or invalid', () => {
    expect(dotDiameterPx(null, 1)).toBe(50);
    expect(dotDiameterPx(undefined, 1)).toBe(50);
    expect(dotDiameterPx(0, 1)).toBe(50);
    expect(dotDiameterPx(-5, 1)).toBe(50);
    expect(dotDiameterPx(null, 1, { fallbackCm: 80 })).toBe(80);
  });
});

describe('formatArea', () => {
  it('uses a French decimal comma with one decimal', () => {
    expect(formatArea(39.2)).toBe('39,2 m²');
    expect(formatArea(4.2)).toBe('4,2 m²');
    expect(formatArea(12)).toBe('12 m²');
  });
  it('rounds to 0.1', () => {
    expect(formatArea(4.24)).toBe('4,2 m²');
    expect(formatArea(4.26)).toBe('4,3 m²');
    expect(formatArea(0.06)).toBe('0,1 m²');
  });
  it('shows "< 0,1 m²" for a tiny positive area and 0 for none', () => {
    expect(formatArea(0.04)).toBe('< 0,1 m²');
    expect(formatArea(0.0001)).toBe('< 0,1 m²');
    expect(formatArea(0)).toBe('0 m²');
  });
});

describe('formatLength / formatSize', () => {
  it('formats metres with a French comma', () => {
    expect(formatLength(150)).toBe('1,5 m');
    expect(formatLength(1500)).toBe('15 m');
    expect(formatLength(5)).toBe('0,05 m');
  });
  it('formats a size as width × length', () => {
    expect(formatSize(1500, 2500)).toBe('15 × 25 m');
    expect(formatSize(1250, 800)).toBe('12,5 × 8 m');
  });
});

describe('assertValidPlanSize / assertValidPosition', () => {
  it('accepts positive ints up to the limit', () => {
    expect(() => assertValidPlanSize({ widthCm: 1500, lengthCm: 2500 })).not.toThrow();
    expect(() => assertValidPlanSize({ widthCm: 100000, lengthCm: 1 })).not.toThrow();
  });
  it('throws a French error otherwise', () => {
    for (const bad of [
      { widthCm: 0, lengthCm: 100 },
      { widthCm: -5, lengthCm: 100 },
      { widthCm: 100.5, lengthCm: 100 },
      { widthCm: 100, lengthCm: 100001 },
      { widthCm: '100', lengthCm: 100 },
      { widthCm: 100, lengthCm: NaN },
    ]) {
      expect(() => assertValidPlanSize(bad)).toThrow(/Dimensions du plan invalides/);
    }
  });
  it('accepts two ints or two nulls, nothing else', () => {
    expect(() => assertValidPosition({ x: 10, y: -5 })).not.toThrow();
    expect(() => assertValidPosition({ x: null, y: null })).not.toThrow();
    expect(() => assertValidPosition({ x: 10, y: null })).toThrow(/Position invalide/);
    expect(() => assertValidPosition({ x: 1.5, y: 2 })).toThrow();
    expect(() => assertValidPosition({ x: undefined, y: undefined })).toThrow();
  });
});

describe('assertValidPlanSizeCm', () => {
  it('accepts null and integers from 5 to 5000', () => {
    for (const cm of [null, 5, 150, 5000]) expect(() => assertValidPlanSizeCm(cm)).not.toThrow();
  });
  it('rejects the rest with a French message', () => {
    for (const cm of [0, 4, 5001, 1.5, '30', undefined, NaN]) {
      expect(() => assertValidPlanSizeCm(cm)).toThrow(/Taille invalide/);
    }
  });
});

describe('edgeDistances (ticket 122)', () => {
  const by = (list) => Object.fromEntries(list.map((d) => [d.dir, d.cm]));

  test('measures to the four sides of a rectangle', () => {
    const list = edgeDistances({ x: 100, y: 100 }, RECT);
    expect(by(list)).toEqual({ left: 100, right: 300, up: 100, down: 200 });
    expect(list.find((d) => d.dir === 'right').to).toEqual({ x: 400, y: 100 });
  });

  test('a concave zone stops at the nearest side', () => {
    expect(by(edgeDistances({ x: 150, y: 150 }, U)).up).toBe(50);
    expect(by(edgeDistances({ x: 50, y: 50 }, U)).right).toBe(50);
  });

  test('a point on a vertex line still hits the sides', () => {
    const list = by(edgeDistances({ x: 100, y: 50 }, RECT));
    expect(list).toEqual({ left: 100, right: 300, up: 50, down: 250 });
  });

  test('a point outside has no hit in directions away from the polygon', () => {
    const list = by(edgeDistances({ x: 500, y: 100 }, RECT));
    expect(list.right).toBeUndefined();
    expect(list.left).toBe(100);
  });

  test('an invalid polygon gives nothing', () => {
    expect(edgeDistances({ x: 0, y: 0 }, null)).toEqual([]);
  });
});

describe('formatDistance (ticket 122)', () => {
  test('centimetres under a metre, metres from one', () => {
    expect(formatDistance(45)).toBe('45 cm');
    expect(formatDistance(99.6)).toBe('1 m');
    expect(formatDistance(125)).toBe('1,25 m');
    expect(formatDistance(300)).toBe('3 m');
  });
});
