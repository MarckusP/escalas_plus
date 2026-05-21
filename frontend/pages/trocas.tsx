import React, { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

/** Evita chamadas com NaN/undefined — Postgres rejeita integer "NaN". */
function candidateOptionLabel(c: { name: string; blocked_by_unavailability?: boolean }) {
  return c.blocked_by_unavailability ? `${c.name} (indisponível)` : c.name;
}

function swapTargetValidationError(
  picked: { blocked_by_unavailability?: boolean } | undefined,
  canRequestNow?: boolean
): string | null {
  if (!picked) return 'Selecione uma pessoa alvo';
  if (picked.blocked_by_unavailability) {
    return 'Pessoa indisponível nesta data (cadastro na tela de disponibilidade)';
  }
  if (canRequestNow === false) {
    return 'Troca indisponível: faltam menos de 12 horas para o evento';
  }
  return null;
}

function parsePositiveInt(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

export default function Trocas() {
  const [swaps, setSwaps] = useState<any[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState<'pendentes' | 'todas'>('pendentes');
  const [editingTargetSwapId, setEditingTargetSwapId] = useState<number | null>(null);
  const [editingTargetValue, setEditingTargetValue] = useState<string>('');
  const [editingCandidates, setEditingCandidates] = useState<any[]>([]);
  const [editingCanRequest, setEditingCanRequest] = useState(true);
  const [changingTarget, setChangingTarget] = useState(false);
  const [swapFormOpen, setSwapFormOpen] = useState(false);
  const [swapContext, setSwapContext] = useState<{
    can_request_now: boolean;
    schedule_role_name?: string | null;
    department_name?: string | null;
  } | null>(null);
  const [form, setForm] = useState({
    requester_id: '',
    schedule_id: '',
    target_id: '',
    message: '',
  });

  const isAdminOrLider = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'lider';
  const isVolunteer = user?.role === 'voluntario';

  const loadSwaps = async () => {
    try {
      const { data } = await api.get('/swaps');
      setSwaps(data);
    } catch {
      toast.error('Erro ao carregar trocas');
    } finally {
      setLoading(false);
    }
  };

  const loadVolunteers = async () => {
    if (!isAdminOrLider) return;
    try {
      const { data } = await api.get('/volunteers');
      setVolunteers(data);
    } catch {
      toast.error('Erro ao carregar voluntários');
    }
  };

  /** Usa `schedule.id` (linha da escala), não `event_id`. Lista só escalas com participação confirmada — endpoint dedicado. */
  const loadSchedules = async (volunteerId: string) => {
    try {
      const vid = parsePositiveInt(volunteerId);
      if (vid === null) {
        setSchedules([]);
        return;
      }
      const { data } = await api.get(`/schedule/for-swap/${vid}`);
      setSchedules(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao carregar escalas do solicitante');
      setSchedules([]);
    }
  };

  const loadCandidates = async (scheduleId: string, requesterId: string) => {
    const sid = parsePositiveInt(scheduleId);
    const rid = parsePositiveInt(requesterId);
    if (sid === null || rid === null) {
      setCandidates([]);
      setSwapContext(null);
      return;
    }
    try {
      const { data } = await api.get(`/swaps/candidates?schedule_id=${sid}&requester_id=${rid}`);
      setCandidates(data.candidates || []);
      setSwapContext({
        can_request_now: !!data.can_request_now,
        schedule_role_name: data.schedule_role_name ?? null,
        department_name: data.department_name ?? null,
      });
      if (!data.can_request_now) {
        toast.error('Troca indisponível: faltam menos de 12h para o evento');
      }
    } catch (e: any) {
      setCandidates([]);
      setSwapContext(null);
      toast.error(e.response?.data?.error || 'Erro ao carregar candidatos');
    }
  };

  useEffect(() => {
    loadSwaps();
    loadVolunteers();
    const rid = parsePositiveInt(user?.id);
    if (rid !== null) {
      const requesterId = String(rid);
      setForm(prev => ({ ...prev, requester_id: requesterId }));
      loadSchedules(requesterId);
    }
  }, [user?.id, isAdminOrLider]);

  useEffect(() => {
    if (!form.requester_id.trim()) {
      if (!isVolunteer) setSchedules([]);
      return;
    }
    loadSchedules(form.requester_id);
    setForm(prev => ({ ...prev, schedule_id: '', target_id: '' }));
    setCandidates([]);
    setSwapContext(null);
  }, [form.requester_id]);

  useEffect(() => {
    if (!form.schedule_id || !form.requester_id) return;
    if (parsePositiveInt(form.schedule_id) === null || parsePositiveInt(form.requester_id) === null) return;
    loadCandidates(form.schedule_id, form.requester_id);
    setForm(prev => ({ ...prev, target_id: '' }));
  }, [form.schedule_id]);

  useEffect(() => {
    if (!swapFormOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSwapFormOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [swapFormOpen]);

  useEffect(() => {
    if (swapFormOpen && isAdminOrLider) loadVolunteers();
  }, [swapFormOpen]);

  const reviewSwap = async (id: number, status: string) => {
    try {
      await api.patch(`/swaps/${id}`, { status });
      toast.success(`Troca ${status}`);
      loadSwaps();
    } catch {
      toast.error('Erro ao aprovar troca');
    }
  };

  const createSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    const reqId = parsePositiveInt(form.requester_id);
    const schId = parsePositiveInt(form.schedule_id);
    const tgtId = parsePositiveInt(form.target_id);
    if (reqId === null || schId === null || tgtId === null) {
      toast.error('Selecione solicitante, escala e pessoa alvo');
      return;
    }
    const picked = candidates.find(c => Number(c.id) === tgtId);
    const targetErr = swapTargetValidationError(picked, swapContext?.can_request_now);
    if (targetErr) {
      toast.error(targetErr);
      return;
    }
    try {
      await api.post('/swaps', {
        requester_id: reqId,
        schedule_id: schId,
        target_id: tgtId,
        message: form.message || null,
      });
      toast.success('Solicitação de troca criada');
      setForm(prev => ({ ...prev, schedule_id: '', target_id: '', message: '' }));
      setCandidates([]);
      setSwapFormOpen(false);
      loadSwaps();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao criar solicitação');
    }
  };

  const cancelSwap = async (id: number) => {
    try {
      await api.delete(`/swaps/${id}`);
      toast.success('Solicitação cancelada');
      loadSwaps();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao cancelar');
    }
  };

  const canEditTarget = (sw: any) => {
    if (sw.status !== 'aguardando_aprovacao') return false;
    if (user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'lider') return true;
    return user?.id === sw.requester_id;
  };

  const startEditTarget = async (sw: any) => {
    const sid = parsePositiveInt(sw.schedule_id);
    const rid = parsePositiveInt(sw.requester_id);
    if (sid === null || rid === null) {
      toast.error('Dados da troca incompletos');
      return;
    }
    setEditingTargetSwapId(sw.id);
    setEditingTargetValue(String(sw.target_id ?? ''));
    try {
      const { data } = await api.get(`/swaps/candidates?schedule_id=${sid}&requester_id=${rid}`);
      setEditingCandidates(data.candidates || []);
      setEditingCanRequest(data.can_request_now !== false);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao carregar elegíveis para troca');
      setEditingTargetSwapId(null);
      setEditingCandidates([]);
      setEditingCanRequest(true);
    }
  };

  const applyTargetChange = async () => {
    if (!editingTargetSwapId || !editingTargetValue) {
      toast.error('Selecione uma pessoa alvo');
      return;
    }
    const newTarget = parsePositiveInt(editingTargetValue);
    if (newTarget === null) {
      toast.error('Selecione uma pessoa alvo');
      return;
    }
    const picked = editingCandidates.find(c => Number(c.id) === newTarget);
    const targetErr = swapTargetValidationError(picked, editingCanRequest);
    if (targetErr) {
      toast.error(targetErr);
      return;
    }
    setChangingTarget(true);
    try {
      await api.patch(`/swaps/${editingTargetSwapId}/target`, { target_id: newTarget });
      toast.success('Pessoa alvo alterada');
      setEditingTargetSwapId(null);
      setEditingCandidates([]);
      setEditingTargetValue('');
      loadSwaps();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao alterar pessoa alvo');
    } finally {
      setChangingTarget(false);
    }
  };

  const filteredSwaps = swaps.filter(sw => activeFilter === 'todas' || sw.status === 'aguardando_aprovacao');

  return (
    <AppLayout title="Trocas de Escala">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-orange-400">Trocas de Escala</h1>
            <p className="text-sm text-gray-400 mt-1">Solicite e acompanhe trocas de escala.</p>
          </div>
          <button
            type="button"
            onClick={() => setSwapFormOpen(true)}
            className="shrink-0 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-medium shadow-lg shadow-indigo-900/30 transition-colors"
          >
            Solicitar troca
          </button>
        </div>

        {swapFormOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px]"
            role="presentation"
            onClick={() => setSwapFormOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="swap-form-title"
              className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 md:p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center gap-3 mb-4">
                <h2 id="swap-form-title" className="text-white font-bold text-lg">Nova solicitação</h2>
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={() => setSwapFormOpen(false)}
                  className="text-gray-400 hover:text-white text-2xl leading-none p-1 rounded hover:bg-gray-700/80"
                >
                  ×
                </button>
              </div>

              <form onSubmit={createSwap} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Solicitante</label>
                  {isVolunteer ? (
                    <input value={user?.name || ''} disabled className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" />
                  ) : (
                    <select
                      value={form.requester_id}
                      onChange={e => setForm({ ...form, requester_id: e.target.value })}
                      className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                    >
                      <option value="">Selecione...</option>
                      {volunteers.map(v => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Escala do solicitante</label>
                  <select
                    value={form.schedule_id}
                    onChange={e => setForm({ ...form, schedule_id: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                  >
                    <option value="">Selecione...</option>
                    {schedules
                      .filter((s: any) => parsePositiveInt(s.id) != null)
                      .map((s: any) => (
                      <option key={String(s.id)} value={String(parsePositiveInt(s.id))}>
                        {s.event_name} - {String(s.event_date).split('T')[0]} - {s.department_name} / {s.role_name}
                      </option>
                    ))}
                  </select>
                  {form.requester_id.trim() && schedules.length === 0 && (
                    <p className="text-[11px] text-amber-500/90 mt-1">Sem escalas confirmadas futuras para este solicitante.</p>
                  )}
                  {swapContext && form.schedule_id && (
                    <p className="text-[11px] text-gray-500 mt-1 truncate" title={`${swapContext.schedule_role_name || ''} · ${swapContext.department_name || ''}`}>
                      Função na escala: <span className="text-gray-300">{swapContext.schedule_role_name || '—'}</span>
                      {swapContext.department_name ? <span className="text-gray-500"> · {swapContext.department_name}</span> : null}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Pessoa alvo</label>
                  <select
                    value={form.target_id}
                    onChange={e => setForm({ ...form, target_id: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white"
                  >
                    <option value="">Selecione...</option>
                    {candidates.map((c: any) => (
                      <option key={c.id} value={String(c.id)} disabled={!!c.blocked_by_unavailability}>
                        {candidateOptionLabel(c)}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const sel = candidates.find(c => String(c.id) === form.target_id);
                    if (!sel?.blocked_by_unavailability) return null;
                    return (
                      <p className="text-[11px] text-amber-400/95 mt-1">
                        Indisponível nesta data — cadastro na tela de disponibilidade.
                      </p>
                    );
                  })()}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Mensagem (opcional)</label>
                  <textarea
                    value={form.message}
                    onChange={e => setForm({ ...form, message: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white min-h-[80px]"
                  />
                </div>
                <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSwapFormOpen(false)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white font-medium"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white font-medium">
                    Enviar solicitação
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={() => setActiveFilter('pendentes')} className={`px-3 py-1 rounded text-sm ${activeFilter === 'pendentes' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300'}`}>Pendentes</button>
          <button onClick={() => setActiveFilter('todas')} className={`px-3 py-1 rounded text-sm ${activeFilter === 'todas' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300'}`}>Todas</button>
        </div>

        {loading ? <p>Carregando...</p> : (
          <div className="space-y-4">
            {filteredSwaps.map((sw: any) => (
              <div key={sw.id} className="bg-gray-800 p-5 rounded-xl border border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div className="space-y-1">
                  <p className="text-lg font-bold text-white">{sw.requester_name} ➔ {sw.target_name}</p>
                  <p className="text-sm text-gray-400">Evento: <span className="text-white">{sw.event_name}</span> ({new Date(sw.event_date).toLocaleDateString()})</p>
                  {sw.message && <p className="text-sm mt-2 p-2 bg-gray-900 rounded border border-gray-700 italic text-gray-400">"{sw.message}"</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      sw.status === 'aprovado' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      sw.status === 'aguardando_aprovacao' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                      'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                    {sw.status}
                  </span>

                  <div className="text-[11px] text-gray-400 text-right">
                    <div>Gestão: {sw.staff_approved_by ? 'ok' : 'pendente'}</div>
                    <div>Alvo: {sw.target_approved_by ? 'ok' : 'pendente'}</div>
                  </div>

                  {isAdminOrLider && sw.status === 'aguardando_aprovacao' && !sw.staff_approved_by && (
                    <div className="flex gap-2">
                      <button onClick={() => reviewSwap(sw.id, 'aprovado')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium transition-colors">Aprovar (Gestão)</button>
                      <button onClick={() => reviewSwap(sw.id, 'recusado')} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors">Recusar</button>
                    </div>
                  )}

                  {user?.id === sw.target_id && sw.status === 'aguardando_aprovacao' && !sw.target_approved_by && (
                    <div className="flex gap-2">
                      <button onClick={() => reviewSwap(sw.id, 'aprovado')} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors">Aprovar (Alvo)</button>
                      <button onClick={() => reviewSwap(sw.id, 'recusado')} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors">Recusar</button>
                    </div>
                  )}

                  {(isAdminOrLider || user?.id === sw.requester_id) && sw.status === 'aguardando_aprovacao' && (
                    <button onClick={() => cancelSwap(sw.id)} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm font-medium transition-colors">
                      Cancelar solicitação
                    </button>
                  )}

                  {canEditTarget(sw) && (
                    <>
                      {editingTargetSwapId !== sw.id ? (
                        <button
                          onClick={() => startEditTarget(sw)}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded text-sm font-medium transition-colors"
                        >
                          Alterar alvo
                        </button>
                      ) : (
                        <div className="flex flex-col gap-2 bg-gray-900/80 border border-gray-700 rounded p-2 min-w-[280px]">
                          <select
                            value={editingTargetValue}
                            onChange={e => setEditingTargetValue(e.target.value)}
                            className="bg-gray-900 border border-gray-700 rounded p-2 text-white text-sm"
                          >
                            <option value="">Selecione o novo alvo...</option>
                            {editingCandidates.map((c: any) => (
                              <option key={c.id} value={String(c.id)} disabled={!!c.blocked_by_unavailability}>
                                {candidateOptionLabel(c)}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setEditingTargetSwapId(null);
                                setEditingCandidates([]);
                                setEditingTargetValue('');
                                setEditingCanRequest(true);
                              }}
                              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={applyTargetChange}
                              disabled={changingTarget}
                              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs disabled:opacity-60"
                            >
                              {changingTarget ? 'Salvando...' : 'Salvar alvo'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {filteredSwaps.length === 0 && (
              <div className="p-8 text-center text-gray-500 bg-gray-800 rounded-xl border border-gray-700">Nenhuma solicitação para o filtro selecionado.</div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
