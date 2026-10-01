import {
  NUDGE_STEPS,
  DEFAULT_NUDGE_STEP,
  nextNudgeStep,
  parseNudgeStep,
  nudgeLabel,
  nudgeTarget,
} from '../planNudge';

const PLAN = { widthCm: 1000, lengthCm: 1000 };
const RECT_ZONE = {
  id: 1,
  polygon: [
    [100, 100],
    [500, 100],
    [500, 400],
    [100, 400],
  ],
};
// A "U" shape: the notch is the box x 600..700, y 0..100 (offset of gardenPlan.test.js).
const U_ZONE = {
  id: 2,
  polygon: [
    [600, 500],
    [700, 500],
    [700, 600],
    [800, 600],
    [800, 500],
    [900, 500],
    [900, 700],
    [600, 700],
  ],
};
const none = { zones: [], features: [], plan: PLAN };
const inRect = { zones: [RECT_ZONE], features: [], plan: PLAN };

describe('nudge step', () => {
  it('cycles 1 -> 5 -> 10 -> 1', () => {
    expect(NUDGE_STEPS).toEqual([1, 5, 10]);
    expect(nextNudgeStep(1)).toBe(5);
    expect(nextNudgeStep(5)).toBe(10);
    expect(nextNudgeStep(10)).toBe(1);
    expect(nextNudgeStep(7)).toBe(DEFAULT_NUDGE_STEP);
  });

  it('parses the stored setting', () => {
    expect(parseNudgeStep('10')).toBe(10);
    expect(parseNudgeStep('1')).toBe(1);
    expect(parseNudgeStep('3')).toBe(DEFAULT_NUDGE_STEP);
    expect(parseNudgeStep(null)).toBe(DEFAULT_NUDGE_STEP);
    expect(parseNudgeStep('abc')).toBe(DEFAULT_NUDGE_STEP);
  });

  it('labels each arrow in French', () => {
    expect(nudgeLabel('left', 5)).toBe('Déplacer de 5 cm vers la gauche');
    expect(nudgeLabel('up', 1)).toBe('Déplacer de 1 cm vers le haut');
    expect(nudgeLabel('down', 10)).toBe('Déplacer de 10 cm vers le bas');
    expect(nudgeLabel('right', 5)).toBe('Déplacer de 5 cm vers la droite');
  });
});

describe('nudgeTarget', () => {
  it('moves by the step inside a rectangle zone', () => {
    const p = { x: 300, y: 200 };
    expect(nudgeTarget(p, 'right', 5, inRect)).toEqual({ point: { x: 305, y: 200 } });
    expect(nudgeTarget(p, 'left', 5, inRect)).toEqual({ point: { x: 295, y: 200 } });
    expect(nudgeTarget(p, 'up', 5, inRect)).toEqual({ point: { x: 300, y: 195 } });
    expect(nudgeTarget(p, 'down', 5, inRect)).toEqual({ point: { x: 300, y: 205 } });
  });

  it('stops at the side when the step is longer than the room', () => {
    expect(nudgeTarget({ x: 103, y: 200 }, 'left', 5, inRect).point).toEqual({ x: 100, y: 200 });
    expect(nudgeTarget({ x: 300, y: 103 }, 'up', 5, inRect).point).toEqual({ x: 300, y: 100 });
  });

  it('is disabled at the side', () => {
    expect(nudgeTarget({ x: 100, y: 200 }, 'left', 5, inRect)).toBeNull();
    expect(nudgeTarget({ x: 300, y: 100 }, 'up', 1, inRect)).toBeNull();
    expect(nudgeTarget({ x: 497, y: 200 }, 'right', 5, inRect).point).toEqual({ x: 500, y: 200 });
    expect(nudgeTarget({ x: 500, y: 200 }, 'right', 5, inRect)).toBeNull();
    expect(nudgeTarget({ x: 300, y: 400 }, 'down', 5, inRect)).toBeNull();
  });

  it('stops at the notch of a concave zone', () => {
    const ctx = { zones: [U_ZONE], features: [], plan: PLAN };
    // Under the notch (x 700..800, y 500..600 is outside): moving up from y 650
    // at x 750 hits the notch's bottom side at y 600.
    expect(nudgeTarget({ x: 750, y: 604 }, 'up', 10, ctx).point).toEqual({ x: 750, y: 600 });
    expect(nudgeTarget({ x: 750, y: 600 }, 'up', 10, ctx)).toBeNull();
    // Beside the notch, the same press goes through to the outer side.
    expect(nudgeTarget({ x: 650, y: 604 }, 'up', 10, ctx).point).toEqual({ x: 650, y: 594 });
  });

  it('floors the distance to a slanted side', () => {
    const slanted = {
      id: 3,
      polygon: [
        [0, 0],
        [100, 0],
        [0, 100],
      ],
    };
    // Hypotenuse x + y = 100: moving right from (40.5, 49) it is hit at x 51,
    // 10.5 cm away, floored to 10.
    const ctx = { zones: [slanted], features: [], plan: PLAN };
    expect(nudgeTarget({ x: 40.5, y: 49 }, 'right', 20, ctx).point).toEqual({ x: 50.5, y: 49 });
    expect(nudgeTarget({ x: 40, y: 49 }, 'right', 20, ctx).point).toEqual({ x: 51, y: 49 });
  });

  it('never enters a zone from outside, and stays in the garden', () => {
    // Plant in no zone, 3 cm left of the rectangle zone.
    // It stops just before the zone's side rather than entering it.
    expect(nudgeTarget({ x: 97, y: 200 }, 'right', 5, inRect).point).toEqual({ x: 99, y: 200 });
    expect(nudgeTarget({ x: 99, y: 200 }, 'right', 5, inRect)).toBeNull();
    expect(nudgeTarget({ x: 90, y: 200 }, 'right', 5, inRect).point).toEqual({ x: 95, y: 200 });
    expect(nudgeTarget({ x: 3, y: 700 }, 'left', 5, inRect).point).toEqual({ x: 0, y: 700 });
    expect(nudgeTarget({ x: 0, y: 700 }, 'left', 5, inRect)).toBeNull();
    expect(nudgeTarget({ x: 998, y: 700 }, 'right', 5, none).point).toEqual({ x: 1000, y: 700 });
    expect(nudgeTarget({ x: 1000, y: 700 }, 'right', 5, none)).toBeNull();
  });

  it('refuses a landing on a garden element', () => {
    const feature = {
      id: 9,
      polygon: [
        [305, 150],
        [400, 150],
        [400, 250],
        [305, 250],
      ],
    };
    const ctx = { zones: [RECT_ZONE], features: [feature], plan: PLAN };
    const result = nudgeTarget({ x: 300, y: 200 }, 'right', 10, ctx);
    expect(result.point).toEqual({ x: 310, y: 200 });
    expect(result.refused).toBe(feature);
  });
});
