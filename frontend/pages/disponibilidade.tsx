import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '../components/AppLayout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { Trash2, X } from 'lucide-react';

const PERIOD_LABEL: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  todos: 'Dia inteiro (todos os períodos)',
};

export default function Disponibilidade() {
  const { user } = useAuth();
  const [unavailability, setUnavailability] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [submittingUnavail, setSubmittingUnavail] = useState(false);

  const [unavailForm, setUnavailForm] = useState({
    start_date: '',
    period: 'noite' as 'manha' | 'tarde' | 'noite' | 'todos',
    is_recurring: false,
    recurrence_type: 'weekly' as 'daily' | 'weekly' | 'monthly' | 'custom',
    recurrence_interval: 1,
    recurrence_count: 12,
  });

  const loadUnavailability = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await api.get(`/availability/${user.id}/unavailability`);
      setUnavailability(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao carregar indisponibilidades');
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    loadUnavailability();
  }, [user, loadUnavailability]);

  const submitUnavailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unavailForm.start_date.trim()) {
      toast.error('Informe a data inicial');
      return;
    }
    setSubmittingUnavail(true);
    try {
      await api.post('/availability/unavailability', {
        start_date: unavailForm.start_date,
        period: unavailForm.period,
        is_recurring: unavailForm.is_recurring,
        recurrence_type: unavailForm.recurrence_type,
        recurrence_interval: unavailForm.recurrence_interval,
        recurrence_count: unavailForm.recurrence_count,
      });
      toast.success('Indisponibilidade registrada');
      setModalOpen(false);
      setUnavailForm(prev => ({
        ...prev,
        start_date: '',
        is_recurring: false,
      }));
      loadUnavailability();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao salvar indisponibilidade');
    } finally {
      setSubmittingUnavail(false);
    }
  };

  const removeOne = async (id: number) => {
    if (!confirm('Remover esta indisponibilidade?')) return;
    try {
      await api.delete(`/availability/unavailability/${id}`);
      toast.success('Removido');
      loadUnavailability();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao remover');
    }
  };

  const removeSeries = async (seriesId: string) => {
    if (!confirm('Remover todas as datas desta série de recorrência?')) return;
    try {
      await api.delete(`/availability/unavailability-series/${seriesId}`);
      toast.success('Série removida');
      loadUnavailability();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao remover série');
    }
  };

  const formatDatePt = (raw: string) => {
    const s = String(raw).split('T')[0];
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return raw;
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
  };

  return (
    <AppLayout title="Minha Disponibilidade">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            Indisponibilidade por datas
          </h1>
          <p className="text-sm text-gray-400 mt-2 max-w-2xl">
            Por defeito considera-se que pode servir em qualquer dia. Registe aqui as <strong className="text-gray-300">datas em que não pode</strong>
            (uma data ou uma série, como nos eventos).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="shrink-0 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-md transition-colors text-sm font-medium"
        >
          Cadastrar indisponibilidade
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 md:p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-white mb-2">Suas indisponibilidades</h2>
        <p className="text-xs text-gray-500 mb-4">
          Estas datas afiltam trocas e sugestões de escala no período indicado.
        </p>
        {unavailability.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma indisponibilidade cadastrada.</p>
        ) : (
          <ul className="space-y-2">
            {(() => {
              const seriesSeen = new Set<string>();
              return unavailability.map(row => {
                const sid = row.series_id != null ? String(row.series_id) : '';
                const showSeriesBtn = Boolean(sid) && !seriesSeen.has(sid);
                if (sid) seriesSeen.add(sid);
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-gray-900/60 border border-gray-700 rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="text-gray-200">
                      <span className="text-white font-medium">{formatDatePt(row.exception_date)}</span>
                      {' · '}
                      <span className="text-gray-400">{PERIOD_LABEL[row.period] || row.period}</span>
                      {row.series_id ? (
                        <span className="ml-2 text-[10px] uppercase text-indigo-400">recorrente</span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {showSeriesBtn ? (
                        <button
                          type="button"
                          onClick={() => removeSeries(sid)}
                          className="text-xs text-rose-400 hover:text-rose-300 underline"
                        >
                          Remover série
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeOne(row.id)}
                        className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-rose-400"
                        title="Remover esta data"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </span>
                  </li>
                );
              });
            })()}
          </ul>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          role="presentation"
          onClick={() => setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl max-w-lg w-full p-5 md:p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-white font-bold text-lg">Nova indisponibilidade</h3>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitUnavailability} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Data</label>
                <input
                  type="date"
                  required
                  value={unavailForm.start_date}
                  onChange={e => setUnavailForm({ ...unavailForm, start_date: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Período indisponível</label>
                <select
                  value={unavailForm.period}
                  onChange={e =>
                    setUnavailForm({
                      ...unavailForm,
                      period: e.target.value as typeof unavailForm.period,
                    })
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="manha">{PERIOD_LABEL.manha}</option>
                  <option value="tarde">{PERIOD_LABEL.tarde}</option>
                  <option value="noite">{PERIOD_LABEL.noite}</option>
                  <option value="todos">{PERIOD_LABEL.todos}</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-700">
                <span className="text-sm text-gray-300">Repetir em série?</span>
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded accent-rose-500"
                  checked={unavailForm.is_recurring}
                  onChange={e => setUnavailForm({ ...unavailForm, is_recurring: e.target.checked })}
                />
              </div>

              {unavailForm.is_recurring && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Tipo</label>
                    <select
                      value={unavailForm.recurrence_type}
                      onChange={e =>
                        setUnavailForm({
                          ...unavailForm,
                          recurrence_type: e.target.value as typeof unavailForm.recurrence_type,
                        })
                      }
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      <option value="daily">Diário</option>
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                      <option value="custom">Personalizado (intervalo em dias)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Intervalo</label>
                    <input
                      type="number"
                      min={1}
                      value={unavailForm.recurrence_interval}
                      onChange={e =>
                        setUnavailForm({
                          ...unavailForm,
                          recurrence_interval: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Número de ocorrências (máx. 52)</label>
                    <input
                      type="number"
                      min={2}
                      max={52}
                      value={unavailForm.recurrence_count}
                      onChange={e =>
                        setUnavailForm({
                          ...unavailForm,
                          recurrence_count: Math.min(
                            52,
                            Math.max(2, Number(e.target.value) || 2)
                          ),
                        })
                      }
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingUnavail}
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium disabled:opacity-60"
                >
                  {submittingUnavail ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
