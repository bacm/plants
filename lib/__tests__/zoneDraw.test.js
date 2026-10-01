import {
  addCorner,
  removeLastCorner,
  traceSubtitle,
  sideLengths,
  hitCorner,
  moveCorner,
  translatePolygon,
  inBounds,
  placeRectangle,
  resizeRectangle,
  zonesWithoutOutline,
  parseZoneName,
  polygonProblem,
} from '../zoneDraw';

const plan = { widthCm: 1500, lengthCm: 2500 };

describe('corners', () => {
  test('addCorner clamps into the garden and ignores a repeat', () => {
    let corners = addCorner([], { x: -40, y: 90.4 }, plan);
    expect(corners).toEqual([[0, 90]]);
    corners = addCorner(corners, { x: 0, y: 90 }, plan);
    expect(corners).toEqual([[0, 90]]);
    corners = addCorner(corners, { x: 9999, y: 9999 }, plan);
    expect(corners).toEqual([
      [0, 90],
      [1500, 2500],
    ]);
  });

  test('removeLastCorner drops the last one, and is fine on an empty list', () => {
    expect(
      removeLastCorner([
        [0, 0],
        [1, 1],
      ])
    ).toEqual([[0, 0]]);
    expect(removeLastCorner([])).toEqual([]);
  });

  test('traceSubtitle counts the corners', () => {
    expect(traceSubtitle(0)).toBe('Nouvelle zone');
    expect(traceSubtitle(1)).toBe('Nouvelle zone · 1 coin');
    expect(traceSubtitle(3)).toBe('Nouvelle zone · 3 coins');
  });
});

describe('sideLengths', () => {
  const triangle = [
    [0, 0],
    [150, 0],
    [150, 550],
  ];

  test('an open shape has no closing side; lengths are formatted in metres', () => {
    const sides = sideLengths(triangle, false);
    expect(sides.map((s) => s.text)).toEqual(['1,5 m', '5,5 m']);
  });

  test('a closed shape has every side', () => {
    expect(sideLengths(triangle, true)).toHaveLength(3);
  });

  test('the normal points away from the shape', () => {
    const [top, right] = sideLengths(triangle, false);
    expect(top.normal.y).toBeLessThan(0); // above the top side
    expect(right.normal.x).toBeGreaterThan(0); // right of the right side
  });

  test('one corner has no side; two corners have one', () => {
    expect(sideLengths([[0, 0]], false)).toEqual([]);
    expect(
      sideLengths(
        [
          [0, 0],
          [0, 100],
        ],
        false
      )
    ).toHaveLength(1);
  });
});

describe('hitCorner', () => {
  const view = { scale: 0.2, offsetX: 30, offsetY: 100 };
  const polygon = [
    [0, 0],
    [500, 0],
    [500, 500],
  ];

  test('finds the corner under the point, within the radius', () => {
    expect(hitCorner(polygon, { x: 130, y: 101 }, view, 22)).toBe(1);
    expect(hitCorner(polygon, { x: 31, y: 99 }, view, 22)).toBe(0);
  });

  test('is -1 away from every corner', () => {
    expect(hitCorner(polygon, { x: 300, y: 300 }, view, 22)).toBe(-1);
  });

  test('picks the nearest of two corners in range', () => {
    const close = [
      [0, 0],
      [50, 0],
    ];
    expect(hitCorner(close, { x: 41, y: 100 }, view, 22)).toBe(1);
  });
});

describe('moving', () => {
  const rect = [
    [100, 100],
    [300, 100],
    [300, 200],
    [100, 200],
  ];

  test('moveCorner moves one corner, rounded and kept inside the garden', () => {
    expect(moveCorner(rect, 2, { dx: 10.4, dy: -20 }, plan)[2]).toEqual([310, 180]);
    expect(moveCorner(rect, 0, { dx: -500, dy: 99999 }, plan)[0]).toEqual([0, 2500]);
    expect(moveCorner(rect, 0, { dx: 5, dy: 5 }, plan)[1]).toEqual([300, 100]);
  });

  test('translatePolygon moves the whole shape and stops at the edges', () => {
    expect(translatePolygon(rect, { dx: 50, dy: 10 }, plan)[0]).toEqual([150, 110]);
    const stopped = translatePolygon(rect, { dx: -999, dy: 99999 }, plan);
    expect(stopped[0]).toEqual([0, 2400]);
    expect(stopped[2]).toEqual([200, 2500]);
  });

  test('inBounds tests the bounding box', () => {
    expect(inBounds(rect, { x: 200, y: 150 })).toBe(true);
    expect(inBounds(rect, { x: 301, y: 150 })).toBe(false);
  });
});

describe('rectangles', () => {
  const view = { scale: 0.2, offsetX: 30, offsetY: 118 };
  const viewport = { width: 390, height: 844 };

  test('placeRectangle puts it at the bottom-left of the visible area', () => {
    const polygon = placeRectangle(
      { widthCm: 400, lengthCm: 150 },
      { view, viewport, plan, bottomPx: 300 }
    );
    expect(polygon).toHaveLength(4);
    // Left margin 24 px is left of the plan's own edge: clamped to 0.
    expect(polygon[0][0]).toBe(0);
    // Bottom edge sits 24 px above the sheet: (844 - 300 - 24 - 118) / 0.2 = 2010 cm.
    expect(polygon[2][1]).toBe(2010);
    expect(polygon[2][0] - polygon[0][0]).toBe(400);
    expect(polygon[2][1] - polygon[0][1]).toBe(150);
  });

  test('placeRectangle stays inside the garden when the visible area overflows it', () => {
    const polygon = placeRectangle(
      { widthCm: 400, lengthCm: 150 },
      { view: { scale: 0.1, offsetX: -500, offsetY: -9000 }, viewport, plan }
    );
    for (const [x, y] of polygon) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(2500);
    }
  });

  test('placeRectangle refuses one larger than the garden', () => {
    expect(placeRectangle({ widthCm: 1600, lengthCm: 100 }, { view, viewport, plan })).toBeNull();
  });

  test('resizeRectangle keeps the top-left corner when it still fits', () => {
    const rect = [
      [100, 100],
      [500, 100],
      [500, 250],
      [100, 250],
    ];
    expect(resizeRectangle(rect, { widthCm: 200, lengthCm: 300 }, plan)).toEqual([
      [100, 100],
      [300, 100],
      [300, 400],
      [100, 400],
    ]);
    expect(resizeRectangle(rect, { widthCm: 1450, lengthCm: 100 }, plan)[0]).toEqual([50, 100]);
    expect(resizeRectangle(rect, { widthCm: 1501, lengthCm: 100 }, plan)).toBeNull();
  });
});

describe('zone choice', () => {
  test('zonesWithoutOutline keeps only the zones with no polygon', () => {
    const zones = [
      { id: 'a', polygon: null },
      { id: 'b', polygon: '[[0,0],[1,0],[1,1]]' },
      { id: 'c' },
      { id: 'd', polygon: '' },
    ];
    expect(zonesWithoutOutline(zones).map((z) => z.id)).toEqual(['a', 'c', 'd']);
  });

  test('parseZoneName trims and refuses an empty name', () => {
    expect(parseZoneName('  Potager ')).toEqual({ name: 'Potager' });
    expect(parseZoneName('   ').error).toBeTruthy();
    expect(parseZoneName(undefined).error).toBeTruthy();
  });

  test('polygonProblem explains an invalid shape', () => {
    expect(
      polygonProblem([
        [0, 0],
        [100, 0],
        [100, 100],
      ])
    ).toBeNull();
    expect(
      polygonProblem([
        [0, 0],
        [100, 0],
      ])
    ).toMatch(/invalide/);
    expect(
      polygonProblem([
        [0, 0],
        [100, 0],
        [200, 0],
      ])
    ).toMatch(/invalide/);
  });
});
