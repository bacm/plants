// The garden's paper, 1 m grid (stronger every 5 m) and border, drawn with
// react-native-svg (ticket 106). `pxPerCm` is the drawing scale; `unit` is the
// size of one screen pixel in drawing units (1 / zoom), so hairlines keep their
// thickness while the canvas is scaled. `children` are drawn above the grid
// (the zones).
import Svg, { Rect, Path } from 'react-native-svg';
import { colors } from '../../lib/theme';
import { gridLines } from '../../lib/planView';

function linesPath(positions, pxPerCm, lengthPx, vertical) {
  return positions
    .map((cm) => {
      const at = cm * pxPerCm;
      return vertical ? `M${at} 0V${lengthPx}` : `M0 ${at}H${lengthPx}`;
    })
    .join('');
}

export function PlanGrid({ plan, pxPerCm, unit = 1, accessibilityLabel, children }) {
  const width = plan.widthCm * pxPerCm;
  const height = plan.lengthCm * pxPerCm;
  // Measured at the on-screen scale, not the drawing one, so zooming in
  // reveals the metre lines of a large garden.
  const cols = gridLines(plan.widthCm, pxPerCm / unit);
  const rows = gridLines(plan.lengthCm, pxPerCm / unit);
  const minor =
    linesPath(cols.minor, pxPerCm, height, true) + linesPath(rows.minor, pxPerCm, width, false);
  const major =
    linesPath(cols.major, pxPerCm, height, true) + linesPath(rows.major, pxPerCm, width, false);
  const border = 1.5 * unit;

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      accessibilityLabel={accessibilityLabel}
      aria-label={accessibilityLabel}>
      <Rect x={0} y={0} width={width} height={height} fill={colors.planPaper} />
      {minor ? <Path d={minor} stroke={colors.planGrid} strokeWidth={unit} fill="none" /> : null}
      {major ? (
        <Path d={major} stroke={colors.planGridMajor} strokeWidth={unit} fill="none" />
      ) : null}
      {children}
      <Rect
        x={border / 2}
        y={border / 2}
        width={width - border}
        height={height - border}
        fill="none"
        stroke={colors.planOutline}
        strokeWidth={border}
      />
    </Svg>
  );
}
