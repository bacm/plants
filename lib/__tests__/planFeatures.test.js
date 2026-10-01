import { PLAN_FEATURE_KINDS } from '../enums';
import { colors } from '../theme';
import { rectanglePolygon } from '../gardenPlan';
import {
  DEFAULT_FEATURE_KIND,
  MAX_FEATURE_LABEL,
  dragFeatureCorner,
  dragFeatureShape,
  featureAt,
  featureKindLabel,
  featureLabel,
  featureLook,
  featureRefusalMessage,
  isFeatureDraft,
  normalizeFeatureInput,
  parseFeatures,
} from '../planFeatures';

const PLAN = { widthCm: 1500, lengthCm: 2500 };
const rect = (x, y, w, h) => rectanglePolygon({ x, y, widthCm: w, lengthCm: h });

describe('kinds and looks', () => {
  it('has the seven kinds with French labels and no lawn', () => {
    expect(PLAN_FEATURE_KINDS.map((k) => k.label)).toEqual([
      'Maison',
      'Abri',
      'Terrasse',
      'Allée',
      'Bassin',
      'Clôture',
      'Autre',
    ]);
    expect(PLAN_FEATURE_KINDS.map((k) => k.value)).not.toContain('lawn');
    expect(DEFAULT_FEATURE_KIND).toBe('house');
  });

  it('gives every kind its own look, hatching only the house', () => {
    const fills = PLAN_FEATURE_KINDS.map((k) => featureLook(k.value).fill);
    for (const kind of PLAN_FEATURE_KINDS) {
      const look = featureLook(kind.value);
      expect(look.fill).toMatch(/^#/);
      expect(look.stroke).toMatch(/^#/);
      expect(Boolean(look.hatch)).toBe(kind.value === 'house');
    }
    expect(new Set(fills).size).toBeGreaterThan(5);
    expect(featureLook('nope')).toBe(colors.planFeatures.other);
  });
});

describe('labels', () => {
  it('writes the name when set, else the kind label', () => {
    expect(featureLabel({ kind: 'terrace', label: 'Terrasse sud' })).toBe('Terrasse sud');
    expect(featureLabel({ kind: 'terrace', label: '  ' })).toBe('Terrasse');
    expect(featureLabel({ kind: 'pond', label: null })).toBe('Bassin');
    expect(featureKindLabel('path')).toBe('Allée');
  });

  it('builds the refusal banner around the label', () => {
    const m = featureRefusalMessage({ kind: 'terrace', label: null });
    expect(m.text + m.strong + m.after).toBe(
      'Impossible de poser une plante sur Terrasse : la plante reprend sa place.'
    );
    expect(m.strong).toBe('Terrasse');
  });
});

describe('normalizeFeatureInput', () => {
  it('validates only the keys present', () => {
    expect(normalizeFeatureInput({ kind: 'pond' })).toEqual({ kind: 'pond' });
    expect(normalizeFeatureInput({ label: ' Mare ' })).toEqual({ label: 'Mare' });
    expect(normalizeFeatureInput({ label: '' })).toEqual({ label: null });
    expect(normalizeFeatureInput({ polygon: rect(0, 0, 100, 100) })).toEqual({
      polygon: rect(0, 0, 100, 100),
    });
  });

  it('accepts a stored JSON polygon', () => {
    const out = normalizeFeatureInput({ polygon: JSON.stringify(rect(0, 0, 100, 100)) });
    expect(out.polygon).toEqual(rect(0, 0, 100, 100));
  });

  it('throws French errors', () => {
    expect(() => normalizeFeatureInput({ kind: 'lawn' })).toThrow("Type d'élément invalide.");
    expect(() => normalizeFeatureInput({ label: 'x'.repeat(MAX_FEATURE_LABEL + 1) })).toThrow(
      /trop long/
    );
    expect(() => normalizeFeatureInput({ polygon: [[0, 0]] })).toThrow(/Contour invalide/);
    expect(() => normalizeFeatureInput({ polygon: 'x' })).toThrow(/Contour invalide/);
  });
});

describe('featureAt and parseFeatures', () => {
  const big = { id: 'big', kind: 'house', polygon: rect(0, 0, 1000, 1000) };
  const small = { id: 'small', kind: 'terrace', polygon: rect(100, 100, 200, 200) };

  it('finds the feature under a point, the smallest when they overlap', () => {
    expect(featureAt({ x: 150, y: 150 }, [big, small]).id).toBe('small');
    expect(featureAt({ x: 150, y: 150 }, [small, big]).id).toBe('small');
    expect(featureAt({ x: 900, y: 900 }, [big, small]).id).toBe('big');
    expect(featureAt({ x: 1200, y: 1200 }, [big, small])).toBeNull();
    expect(featureAt({ x: 1, y: 1 }, [])).toBeNull();
  });

  it('counts the border as inside', () => {
    expect(featureAt({ x: 1000, y: 500 }, [big]).id).toBe('big');
  });

  it('parses stored polygons and drops invalid rows', () => {
    const rows = [
      { id: 'a', kind: 'house', polygon: JSON.stringify(rect(0, 0, 10, 10)) },
      { id: 'b', kind: 'house', polygon: 'bad' },
    ];
    expect(parseFeatures(rows).map((f) => f.id)).toEqual(['a']);
    expect(parseFeatures(rows)[0].polygon).toEqual(rect(0, 0, 10, 10));
  });

  it('knows an element draft', () => {
    expect(isFeatureDraft({ kind: 'element' })).toBe(true);
    expect(isFeatureDraft({ kind: 'feature' })).toBe(true);
    expect(isFeatureDraft({ kind: 'edit' })).toBe(false);
    expect(isFeatureDraft(null)).toBe(false);
  });
});

describe('snapping an element', () => {
  it('snaps the dragged corner to 50 cm with the magnet, not without', () => {
    const start = rect(100, 100, 500, 400);
    const free = dragFeatureCorner(start, 2, { dx: 23, dy: -31 }, PLAN, false);
    expect(free[2]).toEqual([623, 469]);
    const snapped = dragFeatureCorner(start, 2, { dx: 23, dy: -31 }, PLAN, true);
    expect(snapped[2]).toEqual([600, 450]);
    expect(snapped[0]).toEqual([100, 100]);
    expect(snapped[1]).toEqual([600, 100]);
  });

  it('keeps a snapped corner inside the garden', () => {
    const out = dragFeatureCorner(rect(1000, 100, 500, 400), 1, { dx: 900, dy: 0 }, PLAN, true);
    expect(out[1][0]).toBe(1500);
  });

  it('snaps the top-left corner of a dragged rectangle, keeping its size', () => {
    const start = rect(100, 100, 530, 410);
    const out = dragFeatureShape(start, { dx: 22, dy: 31 }, PLAN, true);
    expect(out[0]).toEqual([100, 150]);
    expect(out[2][0] - out[0][0]).toBe(530);
    expect(out[2][1] - out[0][1]).toBe(410);
    const free = dragFeatureShape(start, { dx: 22, dy: 31 }, PLAN, false);
    expect(free[0]).toEqual([122, 131]);
  });

  it('stops a dragged rectangle at the garden edge even when snapping', () => {
    const out = dragFeatureShape(rect(900, 100, 530, 410), { dx: 400, dy: 0 }, PLAN, true);
    expect(Math.max(...out.map((p) => p[0]))).toBeLessThanOrEqual(1500);
  });
});
