'use client';

type PieDataPoint = {
  name: string;
  value: number;
};

export function CustomPieChart({
  data,
  title,
}: {
  data: PieDataPoint[];
  title: string;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  // Generate SVG arcs for Pie
  let accumulatedAngle = 0;
  const colors = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#e11d48'];

  const arcs = data.map((item, index) => {
    const percentage = total > 0 ? item.value / total : 0;
    const angle = percentage * 360;
    const startAngle = accumulatedAngle;
    accumulatedAngle += angle;

    // Convert polar coordinates to Cartesian
    const radius = 70;
    const center = 100;
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = (((startAngle + angle) - 90) * Math.PI) / 180;

    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);

    const largeArcFlag = angle > 180 ? 1 : 0;

    const pathData = total > 0 && percentage < 1.0
      ? `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`
      : `M ${center} ${center} m 0 -${radius} a ${radius} ${radius} 0 1 1 0 ${2 * radius} a ${radius} ${radius} 0 1 1 0 -${2 * radius}`;

    return {
      path: pathData,
      color: colors[index % colors.length],
      label: item.name,
      percentage: (percentage * 100).toFixed(1),
      value: item.value,
    };
  });

  return (
    <div className="card border border-[var(--border)] bg-[var(--panel)] p-6 flex flex-col justify-between">
      <h3 className="text-sm font-bold tracking-tight text-[var(--text)] mb-4">{title}</h3>
      {total === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-[var(--muted)]">
          Tidak ada distribusi data.
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
          <svg className="w-52 h-52 drop-shadow-md" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="70" fill="transparent" />
            {arcs.map((arc, idx) => (
              <path
                key={idx}
                d={arc.path}
                fill={arc.color}
                className="transition-opacity hover:opacity-85"
              />
            ))}
            {/* Center cutout for donut style */}
            <circle cx="100" cy="100" r="45" fill="#18181b" className="dark:fill-[#1e1e24] fill-white" />
          </svg>
          <div className="space-y-2 flex-1">
            {arcs.map((arc, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: arc.color }} />
                <div className="flex-1 flex justify-between text-xs font-semibold text-[var(--text-secondary)]">
                  <span>{arc.label}</span>
                  <span>
                    {arc.value} ({arc.percentage}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
