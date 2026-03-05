import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const RES_COLORS: Record<string, string> = {
  '2160p': '#a855f7',
  '1080p': '#3b82f6',
  '720p': '#22c55e',
  '480p': '#eab308',
  other: '#6b7280',
  unknown: '#374151',
};

const CODEC_COLORS: Record<string, string> = {
  h264: '#0ea5e9',
  hevc: '#14b8a6',
  av1: '#10b981',
  mpeg4: '#f97316',
  unknown: '#6b7280',
};

interface DistChartProps {
  data: Record<string, number>;
}

export function ResolutionPieChart({ data }: DistChartProps) {
  const entries = Object.entries(data)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const total = entries.reduce((s, e) => s + e.value, 0);

  if (entries.length === 0 || total === 0) {
    return <div className="text-sm text-[#6b6888] py-6">No resolution data yet.</div>;
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-5">
      <div className="w-full sm:w-[220px] h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={entries}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={92}
              paddingAngle={2}
              stroke="#16161f"
              strokeWidth={2}
            >
              {entries.map((e) => (
                <Cell key={e.name} fill={RES_COLORS[e.name] ?? '#6b7280'} />
              ))}
            </Pie>
            <text x="50%" y="46%" textAnchor="middle" fill="#f0eeff" style={{ fontSize: 22, fontWeight: 700 }}>
              {total}
            </text>
            <text x="50%" y="58%" textAnchor="middle" fill="#8b87aa" style={{ fontSize: 11 }}>
              files
            </text>
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#e5e7eb' }}
              itemStyle={{ color: '#d1d5db' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 flex flex-col gap-2">
        {entries.map((e) => {
          const pct = Math.round((e.value / total) * 100);
          return (
            <div key={e.name} className="text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    style={{ background: RES_COLORS[e.name] ?? '#6b7280' }}
                    className="w-2.5 h-2.5 rounded-[2px] inline-block shrink-0"
                  />
                  <span className="text-[#9f9abf]">{e.name}</span>
                </div>
                <span className="text-[#f0eeff] tabular-nums">
                  {e.value} <span className="text-[#6b6888]">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[#1f2030] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: RES_COLORS[e.name] ?? '#6b7280',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CodecBarChart({ data }: DistChartProps) {
  const entries = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, count: value }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={entries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 6 }}
          labelStyle={{ color: '#e5e7eb' }}
          itemStyle={{ color: '#d1d5db' }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {entries.map((e) => (
            <Cell key={e.name} fill={CODEC_COLORS[e.name] ?? '#6366f1'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
