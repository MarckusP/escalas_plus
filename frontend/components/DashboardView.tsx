import React, { useEffect, useState } from 'react';
import SatisfactionDashboardPanel from './SatisfactionDashboardPanel';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { Users, Calendar, CheckCircle, TrendingUp, Award, Activity, CheckSquare } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

type Props = {
  scopeHint?: string;
};

export default function DashboardView({ scopeHint }: Props) {
  const [stats, setStats] = useState<any>({});
  const [timeline, setTimeline] = useState<any[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [participation, setParticipation] = useState<any[]>([]);
  const [tasksOverview, setTasksOverview] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsRes, timelineRes, rankingRes, partRes, swapsRes, tasksOverviewRes] =
          await Promise.all([
            api.get('/reports/dashboard-stats'),
            api.get('/reports/checkin-timeline'),
            api.get('/reports/volunteer-ranking'),
            api.get('/reports/participation'),
            api.get('/swaps'),
            api.get('/tasks/overview'),
          ]);

        const overview = tasksOverviewRes.data || {};
        setStats({
          ...statsRes.data,
          pendingSwaps: (swapsRes.data || []).filter((s: any) => s.status === 'pendente')
            .length,
          openTasks:
            (overview.novo || 0) +
            (overview.fazendo || 0) +
            (overview.pendentes_aprovacao || 0),
        });
        setTasksOverview(overview);
        setTimeline(timelineRes.data);
        setRanking(rankingRes.data);
        setParticipation(
          partRes.data.map((r: any) => ({
            name: r.department,
            Confirmados: Number(r.confirmed),
            Escalados: Number(r.total_scheduled),
            Taxa: Number(r.participation_rate),
          }))
        );
      } catch {
        toast.error('Erro ao carregar dashboard');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-indigo-400">
        <Activity className="w-10 h-10 animate-pulse mb-4" />
        <p className="font-bold uppercase tracking-widest text-sm">Carregando painel...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <SatisfactionDashboardPanel />
      {scopeHint && (
        <p className="text-xs text-gray-500 -mt-4">{scopeHint}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          title="Voluntários Ativos"
          value={stats.totalVolunteers || 0}
          icon={Users}
          color="text-cyan-400"
        />
        <StatCard
          title="Eventos no Mês"
          value={stats.eventsInMonth || 0}
          icon={Calendar}
          color="text-indigo-400"
        />
        <StatCard
          title="Escalas Totais"
          value={stats.totalSchedules || 0}
          icon={Activity}
          color="text-purple-400"
        />
        <StatCard
          title="Taxa Check-in"
          value={`${stats.globalAttendanceRate || 0}%`}
          icon={CheckCircle}
          color="text-emerald-400"
        />
        <StatCard
          title="Trocas Pendentes"
          value={stats.pendingSwaps || 0}
          icon={TrendingUp}
          color="text-amber-400"
        />
        <StatCard
          title="Tarefas Abertas"
          value={stats.openTasks || 0}
          icon={CheckSquare}
          color="text-pink-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="col-span-1 lg:col-span-2 bg-gray-900/60 rounded-3xl border border-gray-700 p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-8 border-b border-gray-800 pb-4">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
            <div>
              <h2 className="text-lg font-black text-white">Historico de Presencas</h2>
              <p className="text-xs text-gray-400 font-medium">
                Confirmacoes nos ultimos 10 eventos
              </p>
            </div>
          </div>
          <div className="h-[300px] w-full">
            {timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorConfirmed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorScheduled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis
                    dataKey="event_date_formatted"
                    stroke="#9ca3af"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: '12px', paddingTop: '20px' }}
                  />
                  <Area
                    type="monotone"
                    name="Escalados"
                    dataKey="scheduled"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorScheduled)"
                  />
                  <Area
                    type="monotone"
                    name="Confirmados"
                    dataKey="confirmed"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorConfirmed)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-600 font-semibold text-sm">
                Dados insuficientes
              </div>
            )}
          </div>
        </div>

        <div className="col-span-1 bg-gray-900/60 rounded-3xl border border-gray-700 p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
            <Award className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-lg font-black text-white">Top Engajamento</h2>
              <p className="text-xs text-gray-400 font-medium">Voluntarios mais flexiveis</p>
            </div>
          </div>
          <div className="space-y-4">
            {ranking.length > 0 ? (
              ranking.map((r: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-2xl bg-gray-800/50 hover:bg-gray-800 transition-colors border border-gray-700/30"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                        idx === 0
                          ? 'bg-amber-400/20 text-amber-400'
                          : idx === 1
                            ? 'bg-gray-400/20 text-gray-400'
                            : idx === 2
                              ? 'bg-orange-400/20 text-orange-400'
                              : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white leading-tight">{r.name}</p>
                      <p className="text-[10px] text-gray-400 font-medium">
                        {r.confirmed} presencas
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-indigo-400">
                      {r.participation_rate}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-gray-600 font-semibold text-sm">
                Dados insuficientes
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-900/60 rounded-3xl border border-gray-700 p-6 shadow-xl w-full">
        <div className="flex items-center gap-3 mb-8 border-b border-gray-800 pb-4">
          <Users className="w-6 h-6 text-emerald-400" />
          <div>
            <h2 className="text-lg font-black text-white">Esforco por Ministerio</h2>
            <p className="text-xs text-gray-400 font-medium">
              Comparativo de total escalado vs presencas
            </p>
          </div>
        </div>
        <div className="h-[350px] w-full">
          {participation.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={participation} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#374151', opacity: 0.2 }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Bar name="Escalados" dataKey="Escalados" fill="#4b5563" radius={[4, 4, 0, 0]} />
                <Bar name="Confirmados" dataKey="Confirmados" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-600 font-semibold text-sm">
              Dados insuficientes
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-900/60 rounded-3xl border border-gray-700 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-6 border-b border-gray-800 pb-4">
          <CheckSquare className="w-6 h-6 text-pink-400" />
          <div>
            <h2 className="text-lg font-black text-white">Acompanhamento de Tarefas</h2>
            <p className="text-xs text-gray-400 font-medium">Visão de execução por status</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <StatCard title="Total" value={tasksOverview.total || 0} icon={CheckSquare} color="text-gray-300" />
          <StatCard title="Novo" value={tasksOverview.novo || 0} icon={CheckSquare} color="text-blue-400" />
          <StatCard title="Fazendo" value={tasksOverview.fazendo || 0} icon={Activity} color="text-amber-400" />
          <StatCard title="Entregue" value={tasksOverview.entregue || 0} icon={CheckCircle} color="text-emerald-400" />
          <StatCard
            title="Pendente Aprovação"
            value={tasksOverview.pendentes_aprovacao || 0}
            icon={TrendingUp}
            color="text-indigo-400"
          />
        </div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-xl">
        <p className="text-white font-bold mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm font-medium">
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

function StatCard({ title, value, icon: Icon, color }: any) {
  return (
    <div className="bg-gray-800/80 backdrop-blur rounded-2xl p-6 border border-gray-700/50 shadow-lg relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase text-gray-500 tracking-widest mb-1">{title}</p>
          <p className="text-4xl font-black text-white">{value}</p>
        </div>
        <div className={`p-3 rounded-full bg-gray-900 border border-gray-700 ${color}`}>
          <Icon className="h-7 w-7" />
        </div>
      </div>
    </div>
  );
}
