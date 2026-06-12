import { clampQualityScore } from "@/lib/score-display";

/**
 * Tiny inline-SVG sparkline of a quality-score series (oldest -> newest).
 * No dependencies; colors come from design tokens so it themes automatically.
 */
export function ScoreSparkline({
  points,
  width = 168,
  height = 40
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  const values = points.map(clampQualityScore);

  if (values.length < 2) {
    return null;
  }

  const pad = 3;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const stepX = innerW / (values.length - 1);
  const toY = (value: number) => pad + innerH - (value / 100) * innerH;

  const coords = values.map((value, index) => ({ x: pad + index * stepX, y: toY(value) }));
  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)},${(pad + innerH).toFixed(1)} L${coords[0].x.toFixed(1)},${(pad + innerH).toFixed(1)} Z`;
  const last = coords[coords.length - 1];

  return (
    <svg
      className="score-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Динамика балла: ${values.length} последних проверок`}
      preserveAspectRatio="none"
    >
      <path className="score-sparkline__area" d={area} />
      <path className="score-sparkline__line" d={line} fill="none" />
      <circle className="score-sparkline__dot" cx={last.x} cy={last.y} r={2.6} />
    </svg>
  );
}
