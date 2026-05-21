import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import SearchableSelect from './SearchableSelect';
import { satisfactionColor } from './SatisfactionModal';
import { Heart } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

type SatMode = 'geral' | 'ministerio' | 'individual';

const VIEW_OPTIONS = [
  { id: 'geral', label: 'Média geral' },
  { id: 'ministerio', label: 'Por ministério/departamento' },
  { id: 'individual', label: 'Individual por pessoa' },
];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-800 border border-gray-600 p-3 rounded-lg shadow-xl text-xs">
      <p className="font-bold text-white mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-semibold">
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function SatisfactionDashboardPanel() {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';

  const [satMode, setSatMode] = useState<SatMode>('geral');
  const [satChurchId, setSatChurchId] = useState('');
  const [satDeptId, setSatDeptId] = useState('');
  const [satVolunteerId, setSatVolunteerId] = useState('');
  const [satFilters, setSatFilters] = useState<{
    churches: { id: number; name: string }[];
    departments: { id: number; name: string }[];
    volunteers: { id: number; name: string }[];
  }>({ churches: [], departments: [], volunteers: [] });
  const [satSeries, setSatSeries] = useState<any[]>([]);
  const [satLoading, setSatLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (isSuper && satFilters.churches.length > 0 && !satChurchId) {
      setSatChurchId(String(satFilters.churches[0].id));
    } else if (!isSuper && user.church_id) {
      setSatChurchId(String(user.church_id));
    }
  }, [isSuper, user, satFilters.churches, satChurchId]);

  useEffect(() => {
    if (!user) return;
    const cid = isSuper ? satChurchId : String(user.church_id || '');
    if (!cid) return;
    api
      .get(`/reports/satisfaction-filters?church_id=${cid}`)
      .then(({ data }) => {
        setSatFilters({
          churches: data.churches || [],
          departments: data.departments || [],
          volunteers: data.volunteers || [],
        });
      })
      .catch(() => {});
  }, [user, isSuper, satChurchId]);

  useEffect(() => {
    if (!user) return;
    const cid = isSuper ? satChurchId : String(user.church_id || '');
    if (!cid) return;
    if (satMode === 'individual' && !satVolunteerId) {
      setSatSeries([]);
      return;
    }
    setSatLoading(true);
    const params = new URLSearchParams({ church_id: cid, mode: satMode });
    if (satMode === 'ministerio' && satDeptId) params.set('department_id', satDeptId);
    if (satMode === 'individual') params.set('volunteer_id', satVolunteerId);
    api
      .get(`/reports/satisfaction-evolution?${params}`)
      .then(({ data }) => setSatSeries(data.series || []))
      .catch(() => setSatSeries([]))
      .finally(() => setSatLoading(false));
  }, [user, isSuper, satChurchId, satMode, satDeptId, satVolunteerId]);

  const satChartData = useMemo(() => {
    if (satMode === 'geral') {
      return satSeries.map((r: any) => ({
        period: r.period,
        media: Number(r.avg_score),
      }));
    }
    if (satMode === 'individual') {
      return satSeries.map((r: any) => ({
        period: r.period?.slice(0, 10) || r.period,
        nota: Number(r.avg_score),
      }));
    }
    const periods = [...new Set(satSeries.map((r: any) => r.period))];
    return periods.map(period => {
      const row: Record<string, string | number> = { period };
      satSeries
        .filter((r: any) => r.period === period)
        .forEach((r: any) => {
          row[r.label] = Number(r.avg_score);
        });
      return row;
    });
  }, [satMode, satSeries]);

  const satLineKeys = useMemo(() => {
    if (satMode !== 'ministerio' || satChartData.length === 0) return [];
    return Object.keys(satChartData[0]).filter(k => k !== 'period');
  }, [satMode, satChartData]);

  const showChart =
    satMode !== 'individual' || Boolean(satVolunteerId);

  return (
    <div className="bg-gray-900/60 rounded-3xl border border-gray-700 p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
        <Heart className="w-6 h-6 text-rose-400" />
        <div>
          <h2 className="text-lg font-black text-white">Satisfação ao servir</h2>
          <p className="text-xs text-gray-400 font-medium">
            Evolução das notas mensais (1 a 10)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isSuper && (
          <SearchableSelect
            label="Igreja"
            options={satFilters.churches.map(c => ({ id: c.id, label: c.name }))}
            value={satChurchId}
            onChange={setSatChurchId}
            required
          />
        )}
        <SearchableSelect
          label="Visualização"
          options={VIEW_OPTIONS}
          value={satMode}
          onChange={v => setSatMode(v as SatMode)}
          required
        />
        {satMode === 'ministerio' && (
          <SearchableSelect
            label="Ministério"
            options={satFilters.departments.map(d => ({ id: d.id, label: d.name }))}
            value={satDeptId}
            onChange={setSatDeptId}
            placeholder="Todos os ministérios"
          />
        )}
        {satMode === 'individual' && (
          <SearchableSelect
            label="Voluntário"
            options={satFilters.volunteers.map(v => ({ id: v.id, label: v.name }))}
            value={satVolunteerId}
            onChange={setSatVolunteerId}
            required
            placeholder="Selecione o voluntário"
          />
        )}
      </div>

      <div className="h-[320px] w-full">
        {!showChart ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Selecione um voluntário para ver a evolução individual
          </div>
        ) : satLoading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Carregando...
          </div>
        ) : satChartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Sem respostas de satisfação no período
          </div>
        ) : satMode === 'geral' ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={satChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="period" stroke="#9ca3af" fontSize={11} />
              <YAxis domain={[1, 10]} stroke="#9ca3af" fontSize={11} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="media"
                name="Média"
                stroke="#f43f5e"
                strokeWidth={3}
                dot={{ fill: '#f43f5e' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : satMode === 'individual' ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={satChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="period" stroke="#9ca3af" fontSize={11} />
              <YAxis domain={[1, 10]} stroke="#9ca3af" fontSize={11} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="nota"
                name="Nota"
                stroke="#22c55e"
                strokeWidth={3}
                dot={(props: any) => {
                  const v = props.payload?.nota ?? 5;
                  return (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={5}
                      fill={satisfactionColor(v)}
                      stroke="#111"
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={satChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="period" stroke="#9ca3af" fontSize={11} />
              <YAxis domain={[1, 10]} stroke="#9ca3af" fontSize={11} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              {satLineKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={
                    ['#f43f5e', '#22c55e', '#3b82f6', '#eab308', '#a855f7'][i % 5]
                  }
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
