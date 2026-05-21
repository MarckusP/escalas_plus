import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '../../../components/AppLayout';
import { useAuth } from '../../../hooks/useAuth';
import api from '../../../utils/api';
import toast from 'react-hot-toast';
import { useRouter } from 'next/router';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, Trash2, Edit2, Users, AlertTriangle } from 'lucide-react';
import PendingSameDayModal, { type SameDayPendingItem } from '../../../components/PendingSameDayModal';
import ScheduleRoleActions, { ScheduleRolesList } from '../../../components/ScheduleRoleActions';
import { normalizeScheduleStatus, type ScheduleStatus } from '../../../utils/scheduleDisplay';

export default function Eventos() {
  const router = useRouter();
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isLider = user?.role === 'lider';
  const canManage = isAdmin || isLider;

  const [mySchedules, setMySchedules] = useState<any[]>([]);
  const [pendingModal, setPendingModal] = useState<{
    scheduleId: number;
    eventDate: string;
    items: SameDayPendingItem[];
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const endOfWeek = new Date(currentWeekStart);
      endOfWeek.setDate(currentWeekStart.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      const startStr = currentWeekStart.toISOString().split('T')[0];
      const endStr = endOfWeek.toISOString().split('T')[0];
      
      const [{ data: evData }, { data: mySched }] = await Promise.all([
        api.get(`/events?start_date=${startStr}&end_date=${endStr}`),
        api.get('/schedule/my')
      ]);
      
      setEvents(evData);
      setMySchedules(mySched);
    } catch (err) {
      toast.error('Erro carregar eventos');
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handlePrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };

  const handleToday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  const applyScheduleStatus = async (scheduleId: number, status: ScheduleStatus) => {
    await api.put(`/schedule/${scheduleId}/status`, { status });
    toast.success(status === 'confirmado' ? 'Participação confirmada' : status === 'recusado' ? 'Participação recusada' : 'Atualizado');
    loadEvents();
  };

  const respondSchedule = async (scheduleId: number, status: ScheduleStatus) => {
    if (status !== 'confirmado') {
      try {
        await applyScheduleStatus(scheduleId, status);
      } catch (e: any) {
        toast.error(e.response?.data?.error || 'Erro ao atualizar sua escala');
      }
      return;
    }
    try {
      const { data } = await api.get(`/schedule/${scheduleId}/same-day-pending`);
      if (Array.isArray(data.items) && data.items.length > 0) {
        setPendingModal({ scheduleId, eventDate: data.event_date, items: data.items });
        return;
      }
      await applyScheduleStatus(scheduleId, status);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao verificar pendências do dia');
    }
  };

  const handleConfirmAnyway = async () => {
    if (!pendingModal) return;
    setConfirming(true);
    try {
      await applyScheduleStatus(pendingModal.scheduleId, 'confirmado');
      setPendingModal(null);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao confirmar');
    } finally {
      setConfirming(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Excluir este evento?')) return;
    try {
      await api.delete(`/events/${id}`);
      toast.success('Evento excluído');
      loadEvents();
    } catch {
      toast.error('Erro ao excluir');
    }
  };

  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

  return (
    <AppLayout title="Eventos e Escalas">
      <PendingSameDayModal
        open={!!pendingModal}
        eventDate={pendingModal?.eventDate ?? ''}
        items={pendingModal?.items ?? []}
        confirming={confirming}
        onCancel={() => setPendingModal(null)}
        onConfirmAnyway={handleConfirmAnyway}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-white">Agenda Semanal</h1>
          <p className="text-gray-500 font-bold uppercase text-[10px] tracking-widest mt-1">
            {currentWeekStart.toLocaleDateString('pt-BR')} — {currentWeekEnd.toLocaleDateString('pt-BR')}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="bg-gray-800/50 p-1 rounded-2xl border border-gray-700 flex items-center">
            <button onClick={handlePrevWeek} className="p-2 hover:bg-gray-700 rounded-xl text-gray-400 hover:text-white transition-all"><ChevronLeft className="w-5 h-5"/></button>
            <button onClick={handleToday} className="px-4 py-1 text-[10px] font-black uppercase text-gray-400 hover:text-white transition-all">Hoje</button>
            <button onClick={handleNextWeek} className="p-2 hover:bg-gray-700 rounded-xl text-gray-400 hover:text-white transition-all"><ChevronRight className="w-5 h-5"/></button>
          </div>
          
          {canManage && (
            <button 
              onClick={() => router.push('/admin/organizacao/eventos/manter?id=novo')}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5"/> Novo
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-20 animate-pulse text-indigo-500 font-bold">Carregando...</div>
      ) : events.length === 0 ? (
        <div className="bg-gray-800/50 rounded-3xl border border-dashed border-gray-700 p-20 text-center">
          <p className="text-gray-500 font-bold">Nenhum evento semanal</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map(event => {
            const myAssignments = mySchedules.filter(s => s.event_id === event.id);
            const priorityStatus = (): ScheduleStatus | null => {
              if (myAssignments.length === 0) return null;
              const sts = myAssignments.map(s => normalizeScheduleStatus(s.status));
              if (sts.some(x => x === 'pendente')) return 'pendente';
              if (sts.some(x => x === 'confirmado')) return 'confirmado';
              return 'recusado';
            };
            const assignmentStatus = priorityStatus();
            const needsConfirmation = assignmentStatus === 'pendente';
            const pendingAssignments = myAssignments.filter(s => normalizeScheduleStatus(s.status) === 'pendente');

            return (
              <div key={event.id} className="bg-gray-800/60 rounded-[32px] border border-gray-700 p-6 hover:border-indigo-500/50 transition-all group relative overflow-hidden flex flex-col justify-between h-full">
                {needsConfirmation && (
                  <div className="absolute top-0 left-0 w-full h-1 bg-amber-500 animate-pulse" />
                )}
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-tighter">
                          {(() => {
                            const [y, m, d] = event.event_date.split('T')[0].split('-').map(Number);
                            return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit' });
                          })()}
                        </span>
                        {assignmentStatus != null && (
                          <span className={`flex items-center gap-1 text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            assignmentStatus === 'pendente'
                              ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                              : assignmentStatus === 'confirmado'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                          }`}>
                            {assignmentStatus === 'pendente' && <AlertTriangle className="w-2 h-2" />}
                            {assignmentStatus === 'pendente' ? 'Pendente' : assignmentStatus === 'confirmado' ? 'Confirmado' : 'Recusado'}
                          </span>
                        )}
                      </div>
                      <h3 className="text-xl font-black text-white leading-tight mt-1 truncate pr-2">{event.name}</h3>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => router.push(`/admin/organizacao/eventos/manter?id=${event.id}`)} 
                          className="p-2 text-gray-400 hover:text-white bg-gray-900/50 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <Edit2 className="w-4 h-4"/>
                        </button>
                        <button 
                          onClick={() => handleDelete(event.id)}
                          className="p-2 text-gray-400 hover:text-rose-400 bg-gray-900/50 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 mb-6 text-gray-400 text-sm font-medium">
                    <div className="flex items-center"><Clock className="w-4 h-4 mr-2 text-indigo-500"/> {event.event_time?.slice(0, 5) || '--:--'}</div>
                    <div className="flex items-center"><MapPin className="w-4 h-4 mr-2 text-indigo-500"/> {event.address || 'Sem local'}</div>
                    {myAssignments.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="text-gray-500 shrink-0">Funções:</span>
                        <ScheduleRolesList assignments={myAssignments} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {pendingAssignments.length > 0 && (
                    <div className="flex flex-col gap-2 mb-2">
                      {myAssignments.map(pa => {
                        if (normalizeScheduleStatus(pa.status) !== 'pendente') return null;
                        return (
                          <ScheduleRoleActions
                            key={pa.id}
                            variant="card"
                            roleName={pa.role_name || 'Função'}
                            status={pa.status}
                            onConfirm={() => respondSchedule(pa.id, 'confirmado')}
                            onReject={() => respondSchedule(pa.id, 'recusado')}
                          />
                        );
                      })}
                    </div>
                  )}
                  <div className="pt-4 border-t border-gray-700 flex justify-between items-center text-[10px] font-black uppercase text-gray-500">
                    <span className="bg-gray-900/50 border border-gray-700 px-3 py-1 rounded-full">{event.church_name || 'Geral'}</span>
                    <Users className="w-5 h-5 opacity-30"/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
