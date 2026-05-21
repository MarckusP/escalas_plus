import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '../components/AppLayout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import PendingSameDayModal, { type SameDayPendingItem } from '../components/PendingSameDayModal';
import ScheduleRoleActions, { ScheduleRolesList } from '../components/ScheduleRoleActions';
import {
  groupSchedulesByEvent,
  normalizeScheduleStatus,
  type ScheduleAssignment,
  type ScheduleStatus,
} from '../utils/scheduleDisplay';

export default function MinhasEscalas() {
  const [schedule, setSchedule] = useState<ScheduleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingModal, setPendingModal] = useState<{
    scheduleId: number;
    eventDate: string;
    items: SameDayPendingItem[];
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const grouped = useMemo(() => groupSchedulesByEvent(schedule), [schedule]);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/schedule/my');
        setSchedule(Array.isArray(data) ? data : []);
      } catch {
        toast.error('Erro ao buscar escalas');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const loadMySchedule = async () => {
    try {
      const { data } = await api.get('/schedule/my');
      setSchedule(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao atualizar escalas');
    }
  };

  const applyStatus = async (scheduleId: number, status: ScheduleStatus) => {
    await api.put(`/schedule/${scheduleId}/status`, { status });
    toast.success(status === 'confirmado' ? 'Presença confirmada' : 'Escala recusada');
    await loadMySchedule();
  };

  const requestStatus = async (scheduleId: number, status: 'confirmado' | 'recusado') => {
    if (status === 'recusado') {
      try {
        await applyStatus(scheduleId, status);
      } catch (e: any) {
        toast.error(e.response?.data?.error || 'Erro ao responder escala');
      }
      return;
    }
    try {
      const { data } = await api.get(`/schedule/${scheduleId}/same-day-pending`);
      if (Array.isArray(data.items) && data.items.length > 0) {
        setPendingModal({
          scheduleId,
          eventDate: data.event_date,
          items: data.items,
        });
        return;
      }
      await applyStatus(scheduleId, status);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao verificar pendências do dia');
    }
  };

  const handleConfirmAnyway = async () => {
    if (!pendingModal) return;
    setConfirming(true);
    try {
      await applyStatus(pendingModal.scheduleId, 'confirmado');
      setPendingModal(null);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao confirmar');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <AppLayout title="Minhas Escalas">
      <h1 className="text-2xl font-bold mb-6">Minhas Escalas</h1>

      <PendingSameDayModal
        open={!!pendingModal}
        eventDate={pendingModal?.eventDate ?? ''}
        items={pendingModal?.items ?? []}
        confirming={confirming}
        onCancel={() => setPendingModal(null)}
        onConfirmAnyway={handleConfirmAnyway}
      />

      {loading ? (
        <div className="animate-pulse">Carregando...</div>
      ) : grouped.length === 0 ? (
        <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 text-center">
          Você não possui escalas programadas.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {grouped.map(group => {
            const st = group.aggregateStatus;
            const needsAnswer = st === 'pendente';
            const hasPending = group.assignments.some(
              a => normalizeScheduleStatus(a.status) === 'pendente'
            );

            return (
              <div
                key={group.event_id}
                className={`bg-gray-800 p-5 rounded-xl border shadow-md ${
                  needsAnswer ? 'border-amber-500/55 ring-1 ring-amber-500/20' : 'border-gray-700'
                }`}
              >
                <div className="flex justify-between items-start mb-4 gap-2">
                  <h3 className="font-bold text-lg text-white leading-tight">{group.event_name}</h3>
                  <div className="flex items-center gap-2 shrink-0">
                    {needsAnswer && (
                      <span
                        className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0"
                        title="Resposta pendente"
                      />
                    )}
                    <span
                      className={`px-2 py-1 text-xs rounded-full font-medium whitespace-nowrap ${
                        st === 'confirmado'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : st === 'recusado'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      }`}
                    >
                      {st === 'confirmado' ? 'CONFIRMADO' : st === 'recusado' ? 'RECUSADO' : 'PENDENTE'}
                    </span>
                  </div>
                </div>
                <div className="text-sm text-gray-400 space-y-2">
                  <p>
                    <strong>Data:</strong>{' '}
                    {new Date(group.event_date).toLocaleDateString('pt-BR')}
                  </p>
                  <p>
                    <strong>Igreja:</strong> {group.church_name} — {group.address}
                  </p>
                  <div>
                    <strong className="block mb-1">Funções:</strong>
                    <ScheduleRolesList assignments={group.assignments} />
                  </div>
                </div>
                {hasPending && (
                  <div className="mt-3 space-y-2 border-t border-gray-700/60 pt-3">
                    {group.assignments.map(pa => {
                      const st = normalizeScheduleStatus(pa.status);
                      if (st !== 'pendente') return null;
                      return (
                        <ScheduleRoleActions
                          key={pa.id}
                          roleName={pa.role_name || 'Função'}
                          status={pa.status}
                          onConfirm={() => requestStatus(pa.id, 'confirmado')}
                          onReject={() => requestStatus(pa.id, 'recusado')}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
