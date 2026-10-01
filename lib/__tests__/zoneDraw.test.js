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
  polygonBounds,
  resizePolygon,
  stretchSide,
  typedSide,
  sideLabel,
  squareCorner,
  squareDraggedCorner,
  hitSide,
  sideMidpoints,
  hitMidpoint,
  insertCorner,
  removeCorner,
  PILL_OFFSET_EDIT_PX,
} from '../zoneDraw';

const plan = { widthCm: 1500, lengthCm: 2500 };

describe('corners', () => {
  test('addCorner snaps to the 50 cm grid with the magnet, and ignores a repeat', () => {
    let corners = addCorner([], { x: 413, y: 1017 }, plan, { magnet: true });
    expect(corners).toEqual([[400, 1000]]);
    corners = addCorner(corners, { x: 390, y: 1024 }, plan, { magnet: true });
    expect(corners).toEqual([[400, 1000]]);
    expect(addCorner([], { x: 413, y: 1017 }, plan)).toEqual([[413, 1017]]);
  });

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

describe('resizePolygon', () => {
  const box = [
    [100, 200],
    [500, 200],
    [500, 600],
    [100, 600],
  ];

  it('reads the bounding box', () => {
    expect(polygonBounds(box)).toEqual({ x: 100, y: 200, widthCm: 400, lengthCm: 400 });
  });

  it('resizes a rectangle exactly from its top-left corner', () => {
    expect(resizePolygon(box, { widthCm: 600, lengthCm: 250 }, plan)).toEqual({
      polygon: [
        [100, 200],
        [700, 200],
        [700, 450],
        [100, 450],
      ],
    });
  });

  it('scales a concave shape proportionally per axis', () => {
    const ell = [
      [0, 0],
      [400, 0],
      [400, 200],
      [200, 200],
      [200, 400],
      [0, 400],
    ];
    const { polygon } = resizePolygon(ell, { widthCm: 800, lengthCm: 200 }, plan);
    expect(polygon).toEqual([
      [0, 0],
      [800, 0],
      [800, 100],
      [400, 100],
      [400, 200],
      [0, 200],
    ]);
  });

  it('rounds to integer cm', () => {
    const tri = [
      [0, 0],
      [300, 0],
      [0, 300],
    ];
    const { polygon } = resizePolygon(tri, { widthCm: 100, lengthCm: 100 }, plan);
    expect(polygon.flat().every(Number.isInteger)).toBe(true);
    expect(polygon).toEqual([
      [0, 0],
      [100, 0],
      [0, 100],
    ]);
    const odd = resizePolygon(box, { widthCm: 101, lengthCm: 333 }, plan);
    expect(odd.polygon[1]).toEqual([201, 200]);
    expect(odd.polygon[2]).toEqual([201, 533]);
  });

  it('refuses a shape that leaves the garden', () => {
    expect(resizePolygon(box, { widthCm: 1500, lengthCm: 400 }, plan)).toEqual({
      error: 'Trop grand pour le plan.',
    });
    expect(resizePolygon(box, { widthCm: 400, lengthCm: 2400 }, plan).error).toBe(
      'Trop grand pour le plan.'
    );
  });

  it('snaps corners to 50 cm only with the magnet on', () => {
    const size = { widthCm: 430, lengthCm: 380 };
    const free = resizePolygon(box, size, plan).polygon;
    expect(free[2]).toEqual([530, 580]);
    const snapped = resizePolygon(box, size, plan, { magnet: true }).polygon;
    expect(snapped).toEqual([
      [100, 200],
      [550, 200],
      [550, 600],
      [100, 600],
    ]);
  });

  it('refuses a shape the grid would flatten', () => {
    expect(resizePolygon(box, { widthCm: 10, lengthCm: 400 }, plan, { magnet: true }).error).toBe(
      'Dimensions invalides.'
    );
  });
});

describe('typing a side length (ticket 113)', () => {
  const rect7x6 = [
    [100, 200],
    [800, 200],
    [800, 800],
    [100, 800],
  ];

  test('the top side 7 -> 8,5 m gives an 8,5 x 6 m rectangle, left corners kept', () => {
    const { polygon } = stretchSide(rect7x6, 0, 850, plan);
    expect(polygon).toEqual([
      [100, 200],
      [950, 200],
      [950, 800],
      [100, 800],
    ]);
  });

  test('shrinking, and the right side stretching the height', () => {
    expect(stretchSide(rect7x6, 0, 500, plan).polygon[1]).toEqual([600, 200]);
    expect(stretchSide(rect7x6, 1, 800, plan).polygon).toEqual([
      [100, 200],
      [800, 200],
      [800, 1000],
      [100, 1000],
    ]);
    // The bottom side runs right to left: the left corners move.
    expect(stretchSide(rect7x6, 2, 800, plan).polygon[3]).toEqual([0, 800]);
  });

  test('a rotated rectangle stays a rectangle', () => {
    // Sides of 3-4-5: (300, 400) and (-80, 60) are perpendicular, 500 and 100 long.
    const rotated = [
      [300, 100],
      [600, 500],
      [520, 560],
      [220, 160],
    ];
    const { polygon } = stretchSide(rotated, 0, 600, plan);
    const [a, b, c, d] = polygon;
    expect(b).toEqual([660, 580]);
    expect(c).toEqual([580, 640]);
    expect([a, d]).toEqual([rotated[0], rotated[3]]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    expect(dot).toBe(0);
  });

  test('an irregular pentagon: corners past the midpoint move, the others stay', () => {
    const pentagon = [
      [0, 0],
      [400, 0],
      [500, 300],
      [200, 500],
      [0, 300],
    ];
    const { polygon } = stretchSide(pentagon, 0, 500, plan);
    expect(polygon).toEqual([
      [0, 0],
      [500, 0],
      [600, 300],
      [200, 500],
      [0, 300],
    ]);
  });

  test('refuses zero, negative, invalid, degenerate and out-of-plan lengths', () => {
    expect(stretchSide(rect7x6, 0, 0, plan).error).toBeTruthy();
    expect(stretchSide(rect7x6, 0, -50, plan).error).toBeTruthy();
    expect(stretchSide(rect7x6, 0, NaN, plan).error).toBeTruthy();
    expect(stretchSide(rect7x6, 9, 500, plan).error).toBeTruthy();
    expect(stretchSide(rect7x6, 0, 1500, plan).error).toBe('Trop grand pour le plan.');
    // Shrinking a triangle's base to nothing is refused as a shape.
    const triangle = [
      [0, 0],
      [100, 0],
      [0, 100],
    ];
    expect(stretchSide(triangle, 0, 0.2, plan).error).toBeTruthy();
  });

  test('open (tracing): only the last corner moves, along the last side', () => {
    const trace = [
      [0, 0],
      [300, 0],
      [300, 200],
    ];
    expect(stretchSide(trace, 1, 500, plan, { open: true }).polygon).toEqual([
      [0, 0],
      [300, 0],
      [300, 500],
    ]);
    expect(stretchSide(trace, 1, 500, plan, { open: true }).polygon[0]).toEqual([0, 0]);
    const two = [
      [100, 100],
      [400, 100],
    ];
    expect(stretchSide(two, 0, 300, plan, { open: true }).polygon).toEqual([
      [100, 100],
      [400, 100],
    ]);
    expect(stretchSide(two, 0, 600, plan, { open: true }).polygon[1]).toEqual([700, 100]);
  });

  test('typedSide reads metres with a comma and refuses bad text in French', () => {
    expect(typedSide(rect7x6, 0, '8,5', plan).polygon[1]).toEqual([950, 200]);
    expect(typedSide(rect7x6, 0, '0', plan).error).toBe('Doit être supérieur à 0.');
    expect(typedSide(rect7x6, 0, 'abc', plan).error).toBeTruthy();
    expect(typedSide(rect7x6, 0, '', plan).error).toBe('Indiquez une valeur.');
    expect(typedSide(rect7x6, 0, '20', plan).error).toBe('Trop grand pour le plan.');
  });

  test('sideLabel names the sides of a rectangle, "sélectionné" for a diagonal', () => {
    expect(sideLabel(rect7x6, 0)).toBe('du haut');
    expect(sideLabel(rect7x6, 1)).toBe('de droite');
    expect(sideLabel(rect7x6, 2)).toBe('du bas');
    expect(sideLabel(rect7x6, 3)).toBe('de gauche');
    const diamond = [
      [200, 0],
      [400, 200],
      [200, 400],
      [0, 200],
    ];
    expect(sideLabel(diamond, 0)).toBe('sélectionné');
  });

  test('hitSide finds the pill under a screen point', () => {
    const view = { scale: 0.5, offsetX: 0, offsetY: 0 };
    // Top side's middle is (450, 200) cm -> (225, 100) px; the pill sits 16 px above.
    expect(hitSide(rect7x6, true, { x: 225, y: 100 - 16 }, view)).toBe(0);
    expect(hitSide(rect7x6, true, { x: 225, y: 100 - 16 + 21 }, view)).toBe(0);
    expect(hitSide(rect7x6, true, { x: 225, y: 100 + 100 }, view)).toBe(-1);
    // Open outline: the closing side has no pill.
    expect(hitSide(rect7x6, false, { x: 50 + 0, y: 250 + 16 }, view)).toBe(-1);
  });
});

describe('right-angle help (ticket 113)', () => {
  test('squareCorner squares a side within 8 degrees of perpendicular, keeping its length', () => {
    // Previous side horizontal; the new side is ~86 degrees from it.
    const next = [1000 + 70, 1000 + 1000];
    const squared = squareCorner([0, 1000], [1000, 1000], next);
    expect(squared[0]).toBe(1000);
    expect(squared[1]).toBe(1000 + Math.round(Math.hypot(70, 1000)));
    const up = squareCorner([0, 1000], [1000, 1000], [1060, 0]);
    expect(up[0]).toBe(1000);
    expect(up[1]).toBeLessThan(1000);
  });

  test('squareCorner leaves other angles, an exact right angle and degenerate input alone', () => {
    const next = [1000 + 300, 1000 + 1000];
    expect(squareCorner([0, 1000], [1000, 1000], next)).toBe(next);
    const exact = [1000, 1500];
    expect(squareCorner([0, 1000], [1000, 1000], exact)).toBe(exact);
    const same = [1000, 1000];
    expect(squareCorner([0, 1000], [1000, 1000], same)).toBe(same);
    expect(squareCorner([1000, 1000], [1000, 1000], next)).toBe(next);
    // A wider tolerance catches more.
    expect(squareCorner([0, 1000], [1000, 1000], next, 20)[0]).toBe(1000);
  });

  test('addCorner squares the third corner with the magnet off, not with it on', () => {
    const base = [
      [100, 100],
      [900, 100],
    ];
    expect(addCorner(base, { x: 960, y: 900 }, plan)[2]).toEqual([900, 902]);
    expect(addCorner(base, { x: 960, y: 900 }, plan, { magnet: true })[2]).toEqual([950, 900]);
    expect(addCorner(base, { x: 1300, y: 900 }, plan)[2]).toEqual([1300, 900]);
  });

  test('squareDraggedCorner squares a dragged rectangle corner back, or leaves it', () => {
    const rectangle = [
      [0, 0],
      [600, 0],
      [600, 800],
      [0, 800],
    ];
    // Corner 2 dragged to x = 640: its side to corner 1 is ~4 degrees off vertical.
    const dragged = rectangle.map((p, i) => (i === 2 ? [640, 800] : p));
    expect(squareDraggedCorner(dragged, 2, plan)[2]).toEqual([600, 801]);
    const far = rectangle.map((p, i) => (i === 2 ? [800, 800] : p));
    expect(squareDraggedCorner(far, 2, plan)).toBe(far);
  });
});

describe('adding and removing corners (ticket 117)', () => {
  const square = [
    [100, 100],
    [500, 100],
    [500, 500],
    [100, 500],
  ];

  test('sideMidpoints lists every side, closing side included', () => {
    expect(sideMidpoints(square)).toEqual([
      { index: 0, x: 300, y: 100 },
      { index: 1, x: 500, y: 300 },
      { index: 2, x: 300, y: 500 },
      { index: 3, x: 100, y: 300 },
    ]);
    expect(sideMidpoints([[1, 1]])).toEqual([]);
  });

  test('hitMidpoint finds a midpoint within the radius on screen', () => {
    const view = { scale: 0.5, offsetX: 10, offsetY: 20 };
    // Side 1's midpoint (500, 300) cm -> (260, 170) px.
    expect(hitMidpoint(square, { x: 260, y: 170 }, view, 16)).toBe(1);
    expect(hitMidpoint(square, { x: 260 + 15, y: 170 }, view, 16)).toBe(1);
    expect(hitMidpoint(square, { x: 260 + 17, y: 170 }, view, 16)).toBe(-1);
    // The closing side.
    expect(hitMidpoint(square, { x: 60, y: 170 }, view, 16)).toBe(3);
  });

  test('insertCorner puts the point after the side start, closing side included', () => {
    expect(insertCorner(square, 0, { x: 300, y: 100 }, plan)).toEqual([
      [100, 100],
      [300, 100],
      [500, 100],
      [500, 500],
      [100, 500],
    ]);
    expect(insertCorner(square, 3, { x: 100, y: 300 }, plan)).toEqual([
      [100, 100],
      [500, 100],
      [500, 500],
      [100, 500],
      [100, 300],
    ]);
  });

  test('insertCorner rounds, clamps into the plan, and does not mutate', () => {
    const copy = JSON.stringify(square);
    const next = insertCorner(square, 1, { x: 1600.4, y: -20 }, plan);
    expect(next[2]).toEqual([1500, 0]);
    expect(insertCorner(square, 1, { x: 300.6, y: 200.4 }, plan)[2]).toEqual([301, 200]);
    expect(JSON.stringify(square)).toBe(copy);
  });

  test('removeCorner drops a corner and refuses at 3', () => {
    expect(removeCorner(square, 1)).toEqual([
      [100, 100],
      [500, 500],
      [100, 500],
    ]);
    const triangle = square.slice(0, 3);
    expect(removeCorner(triangle, 0)).toBe(triangle);
    expect(removeCorner(square, 9)).toBe(square);
  });

  test('an edited shape pill sits further out than the "+" handle radius', () => {
    expect(PILL_OFFSET_EDIT_PX).toBeGreaterThan(8 + 8);
    const view = { scale: 0.5, offsetX: 0, offsetY: 0 };
    expect(
      hitSide(
        rect7x6Like(),
        true,
        { x: 225, y: 100 - PILL_OFFSET_EDIT_PX },
        view,
        PILL_OFFSET_EDIT_PX
      )
    ).toBe(0);
  });
});

function rect7x6Like() {
  return [
    [200, 200],
    [700, 200],
    [700, 500],
    [200, 500],
  ];
}
