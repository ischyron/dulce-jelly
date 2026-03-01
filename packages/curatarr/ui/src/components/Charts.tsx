import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const RES_COLORS: Record<string, string> = {
  '2160p': '#a855f7',
  '1080p': '#3b82f6',
  '720p': '#22c55e',
  '480p': '#eab308',
  'other': '#6b7280',
  'unknown': '#374151',
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
  const entries = Object.entries(data).map(([name, value]) => ({ name, value }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={entries}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
          labelLine={false}
        >
          {entries.map(e => (
            <Cell key={e.name} fill={RES_COLORS[e.name] ?? '#6b7280'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 6 }}
          labelStyle={{ color: '#e5e7eb' }}
          itemStyle={{ color: '#d1d5db' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
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
          {entries.map(e => (
            <Cell key={e.name} fill={CODEC_COLORS[e.name] ?? '#6366f1'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
