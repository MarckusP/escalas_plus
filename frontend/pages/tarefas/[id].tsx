import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AppLayout from '../../components/AppLayout';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';

export default function TarefaDetalhe() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'media',
    status: 'novo',
    due_date: '',
    assigned_to: '',
  });
  const isStaff = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'lider';

  useEffect(() => {
    if (!id) return;
    async function loadTask() {
      try {
        const { data } = await api.get(`/tasks/${id}`);
        setTask(data);
        setForm({
          title: data.title || '',
          description: data.description || '',
          priority: data.priority || 'media',
          status: data.status || 'novo',
          due_date: data.due_date ? String(data.due_date).split('T')[0] : '',
          assigned_to: data.assigned_to ? String(data.assigned_to) : '',
        });
      } catch {
        toast.error('Erro ao carregar tarefa');
      } finally {
        setLoading(false);
      }
    }
    loadTask();
  }, [id]);

  useEffect(() => {
    if (!isStaff) return;
    async function loadVolunteers() {
      try {
        const { data } = await api.get('/volunteers');
        setVolunteers(data);
      } catch {
        toast.error('Erro ao carregar voluntários');
      }
    }
    loadVolunteers();
  }, [isStaff]);

  const statusLabel: Record<string, string> = {
    novo: 'Novo',
    fazendo: 'Fazendo',
    entregue: 'Entregue',
  };

  const statusColors: Record<string, string> = {
    novo: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    fazendo: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    entregue: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  };

  const priorityColors: Record<string, string> = {
    alta: 'bg-red-500/10 text-red-400 border-red-500/30',
    media: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    baixa: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  };

  const saveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        due_date: form.due_date || null,
      };
      const { data } = await api.put(`/tasks/${id}`, payload);
      setTask((prev: any) => ({
        ...prev,
        ...data,
        assigned_name: volunteers.find(v => String(v.id) === String(payload.assigned_to))?.name || data.assigned_name,
      }));
      toast.success('Tarefa atualizada');
    } catch {
      toast.error('Erro ao atualizar tarefa');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout title="Detalhe da Tarefa">
      <div className="max-w-4xl mx-auto space-y-6">
        <button onClick={() => router.push('/tarefas')} className="text-sm text-indigo-400 hover:text-indigo-300">
          ← Voltar para tarefas
        </button>

        {loading ? (
          <p className="text-gray-400">Carregando chamado...</p>
        ) : !task ? (
          <p className="text-gray-400">Tarefa não encontrada.</p>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
            <h1 className="text-2xl font-bold text-white">{task.title}</h1>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="text-gray-300">
                <span className="text-gray-400">Responsável:</span> {task.assigned_name || 'Em aberto'}
              </div>
              <div className="text-gray-300">
                <span className="text-gray-400">Criado por:</span> {task.created_by_name || '--'}
              </div>
              <div className="text-gray-300">
                <span className="text-gray-400">Data de criação:</span> {String(task.created_at).split('T')[0]}
              </div>
              <div className="text-gray-300">
                <span className="text-gray-400">Data de entrega:</span> {task.due_date ? String(task.due_date).split('T')[0] : '--'}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Status:</span>
                <span className={`text-xs px-2 py-1 rounded border uppercase ${statusColors[task.status] || 'border-gray-500 text-gray-300'}`}>
                  {statusLabel[task.status] || task.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Urgência:</span>
                <span className={`text-xs px-2 py-1 rounded border uppercase ${priorityColors[task.priority] || 'border-gray-500 text-gray-300'}`}>
                  {task.priority}
                </span>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-700 pt-6">
              <h2 className="text-lg font-semibold text-white mb-2">Descrição</h2>
              <p className="text-gray-300 whitespace-pre-wrap">{task.description || 'Sem descrição informada.'}</p>
            </div>

            {isStaff && (
              <form onSubmit={saveTask} className="mt-8 border-t border-gray-700 pt-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Editar tarefa</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Titulo</label>
                    <input className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Data de entrega</label>
                    <input type="date" className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Urgencia</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                      <option value="baixa">Baixa</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Status</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                      <option value="novo">Novo</option>
                      <option value="fazendo">Fazendo</option>
                      <option value="entregue">Entregue</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Responsavel</label>
                    <select className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
                      <option value="">Em aberto</option>
                      {volunteers.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Descricao</label>
                  <textarea className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white min-h-[120px]" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded">
                    {saving ? 'Salvando...' : 'Salvar alteracoes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
