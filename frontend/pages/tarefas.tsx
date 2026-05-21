import React, { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { useRouter } from 'next/router';

export default function Tarefas() {
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'media',
    due_date: '',
    assigned_to: '',
  });

  const isStaff = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'lider';
  const isVolunteer = user?.role === 'voluntario';

  async function loadTasks() {
    try {
      const { data } = await api.get('/tasks');
      setTasks(data);
    } catch {
      toast.error('Erro ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }

  async function loadVolunteers() {
    if (!isStaff) return;
    try {
      const { data } = await api.get('/volunteers');
      setVolunteers(data);
    } catch {
      toast.error('Erro ao carregar voluntários');
    }
  }

  useEffect(() => {
    loadTasks();
    loadVolunteers();
  }, [isStaff]);

  const claimTask = async (id: number) => {
    try {
      await api.patch(`/tasks/${id}/assign-to-me`);
      loadTasks();
    } catch {
      toast.error('Erro ao se atribuir na tarefa');
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await api.patch(`/tasks/${id}/status`, { status });
      loadTasks();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const requestStatus = async (id: number, status: string) => {
    try {
      await api.patch(`/tasks/${id}/request-status`, { status });
      toast.success('Solicitação enviada');
      loadTasks();
    } catch {
      toast.error('Erro ao solicitar mudança');
    }
  };

  const approveStatus = async (id: number) => {
    try {
      await api.patch(`/tasks/${id}/approve-status`);
      toast.success('Solicitação aprovada');
      loadTasks();
    } catch {
      toast.error('Erro ao aprovar solicitação');
    }
  };

  const rejectStatus = async (id: number) => {
    try {
      await api.patch(`/tasks/${id}/reject-status`);
      toast.success('Solicitação recusada');
      loadTasks();
    } catch {
      toast.error('Erro ao recusar solicitação');
    }
  };

  const createTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/tasks', {
        ...form,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        due_date: form.due_date || null,
      });
      toast.success('Tarefa criada!');
      loadTasks();
      setShowModal(false);
      setForm({ title: '', description: '', priority: 'media', due_date: '', assigned_to: '' });
    } catch {
      toast.error('Erro ao criar tarefa');
    }
  };

  const PriorityBadge = ({ p }: { p: string }) => {
    const colors: any = {
      alta: 'bg-red-500/10 text-red-500 border-red-500/20',
      media: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      baixa: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    };
    return <span className={`text-xs px-2 py-0.5 rounded border uppercase ${colors[p]}`}>{p}</span>;
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      novo: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      fazendo: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      entregue: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    };
    return <span className={`text-xs px-2 py-0.5 rounded border uppercase ${colors[status] || 'border-gray-500 text-gray-300'}`}>{statusLabel[status] || status}</span>;
  };

  const statusLabel: Record<string, string> = {
    novo: 'Novo',
    fazendo: 'Fazendo',
    entregue: 'Entregue',
  };

  const statusOptionsByCurrent: Record<string, string[]> = {
    novo: ['fazendo'],
    fazendo: ['entregue'],
    entregue: [],
  };

  return (
    <AppLayout title="Tarefas">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gerenciador de Tarefas</h1>
        {isStaff && (
          <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white">
            + Nova Tarefa
          </button>
        )}
      </div>

      {loading ? (
        <p>Carregando...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-12 gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-700">
            <div className="col-span-4">Titulo</div>
            <div className="col-span-2">Data criacao</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Urgencia</div>
            <div className="col-span-2">Responsavel</div>
          </div>
          {tasks.map((t: any) => (
            <div key={t.id} className="p-3 rounded-xl border bg-gray-800 border-gray-700">
              <button
                onClick={() => router.push(`/tarefas/${t.id}`)}
                className="w-full text-left grid grid-cols-12 gap-3 items-center hover:bg-gray-700/30 rounded-lg p-2 transition-colors"
              >
                <div className="col-span-4">
                  <p className="font-semibold text-white truncate">{t.title}</p>
                  <p className="text-xs text-gray-400 line-clamp-1">{t.description || 'Sem descrição'}</p>
                </div>
                <div className="col-span-2 text-sm text-gray-300">{String(t.created_at).split('T')[0]}</div>
                <div className="col-span-2"><StatusBadge status={t.status} /></div>
                <div className="col-span-2"><PriorityBadge p={t.priority} /></div>
                <div className="col-span-2 text-sm text-gray-300 truncate">{t.assigned_name || 'Em aberto'}</div>
              </button>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-700 pt-3">
                {t.requested_status && (
                  <span className="px-2 py-1 rounded border border-amber-500/40 text-amber-300 text-xs">
                    Solicitação: {statusLabel[t.requested_status]} ({t.requested_status_by_name || 'voluntário'})
                  </span>
                )}
                {t.due_date && <span className="px-2 py-1 rounded border border-gray-600 text-gray-300 text-xs">Entrega: {String(t.due_date).split('T')[0]}</span>}

                <div className="flex flex-wrap gap-2 ml-auto">
                  {isVolunteer && !t.assigned_to && (
                    <button onClick={() => claimTask(t.id)} className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs">
                      Assumir tarefa
                    </button>
                  )}

                  {isVolunteer && t.assigned_to === user?.id && (statusOptionsByCurrent[t.status] || []).map((nextStatus) => (
                    <button
                      key={nextStatus}
                      onClick={() => requestStatus(t.id, nextStatus)}
                      className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                    >
                      Solicitar {statusLabel[nextStatus]}
                    </button>
                  ))}

                  {isStaff && (
                    <>
                      <select
                        value={t.status}
                        onChange={e => updateStatus(t.id, e.target.value)}
                        className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                      >
                        <option value="novo">Novo</option>
                        <option value="fazendo">Fazendo</option>
                        <option value="entregue">Entregue</option>
                      </select>
                      {t.requested_status && (
                        <>
                          <button onClick={() => approveStatus(t.id)} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                            Aprovar solicitação
                          </button>
                          <button onClick={() => rejectStatus(t.id)} className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs">
                            Recusar solicitação
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-gray-400">Nenhuma tarefa encontrada.</p>}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md border border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-white">Nova Tarefa</h2>
            <form onSubmit={createTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Título</label>
                <input required className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Descrição</label>
                <textarea className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Data de entrega</label>
                <input type="date" className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.due_date} onChange={e => setForm({...form, due_date: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Prioridade</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Responsável (opcional)</label>
                <select className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.assigned_to} onChange={e => setForm({...form, assigned_to: e.target.value})}>
                  <option value="">Em aberto (autoatribuição)</option>
                  {volunteers.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end space-x-2 mt-6">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-medium">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
