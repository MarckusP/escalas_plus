import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import AppLayout from '../../../../components/AppLayout';
import api from '../../../../utils/api';
import { toast } from 'react-hot-toast';
import { Trash2, Plus, Calendar, Save, ArrowLeft, Clock, AlertCircle } from 'lucide-react';

const DEPT_COLORS: { [key: string]: string } = {
  'Música': 'text-cyan-400',
  'Mídia': 'text-purple-400',
  'Intercessão': 'text-rose-400',
  'Recepção': 'text-emerald-400',
  'Infantil': 'text-amber-400',
  'Teatro': 'text-pink-400',
  'Som': 'text-blue-400',
  'Limpeza': 'text-orange-400',
};

function getDeptColor(name: string) {
  if (!name) return 'text-gray-400';
  return DEPT_COLORS[name] || 'text-indigo-400';
}

export default function ManterEvento() {
  const router = useRouter();
  const { id } = router.query;
  const isEditing = id && id !== 'novo';

  const [activeTab, setActiveTab] = useState<'evento' | 'funcoes'>('evento');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [churches, setChurches] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [showRecurrenceModal, setShowRecurrenceModal] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    event_date: '',
    event_time: '',
    address: '',
    church_id: '',
    is_recurring: false,
    recurrence_type: 'weekly',
    recurrence_interval: 1,
    recurrence_count: 12,
    parent_event_id: null
  });

  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const u = JSON.parse(userData);
      setUser(u);
      if (u.role === 'super_admin') {
        fetchChurches();
        fetchRoles(String(u.church_id || ''));
      } else {
        setFormData(prev => ({ ...prev, church_id: String(u.church_id) }));
        fetchRoles();
      }
    }
    fetchVolunteers();

    if (isEditing) {
      fetchEventData(Number(id));
    }
  }, [id, isEditing]);

  useEffect(() => {
    if (user?.role === 'super_admin' && formData.church_id) {
      fetchRoles(formData.church_id);
    }
  }, [user?.role, formData.church_id]);

  const fetchChurches = async () => {
    try {
      const { data } = await api.get('/churches');
      setChurches(data);
    } catch (e) {
      toast.error('Erro carregar igrejas');
    }
  };

  const fetchRoles = async (churchId?: string) => {
    try {
      if (user?.role === 'super_admin' && !churchId) {
        setRoles([]);
        return;
      }
      const query = user?.role === 'super_admin' && churchId ? `?church_id=${churchId}` : '';
      const { data } = await api.get(`/roles${query}`);
      setRoles(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchVolunteers = async () => {
    try {
      const { data } = await api.get('/volunteers');
      let list = Array.isArray(data) ? data : [];
      let sessionUser: { id?: number; role?: string } | null = null;
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
        if (raw) sessionUser = JSON.parse(raw);
      } catch {
        sessionUser = null;
      }
      // Líder: incluir o próprio utilizador na lista se a API o omitir, para poder autoinscrever-se quando a função na escala coincide com a cadastrada
      if (
        sessionUser?.role === 'lider' &&
        sessionUser?.id &&
        !list.some((v: any) => Number(v.id) === Number(sessionUser!.id))
      ) {
        try {
          const { data: self } = await api.get(`/volunteers/${sessionUser.id}`);
          if (self) {
            const role_ids =
              (self as any).role_ids ??
              ((self as any).roles?.map((r: { id: number }) => r.id) as number[] | undefined) ??
              [];
            list = [...list, { ...self, role_ids }].sort((a: any, b: any) =>
              String(a.name).localeCompare(String(b.name), 'pt')
            );
          }
        } catch {
          /* ignora */
        }
      }
      setVolunteers(list);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchEventData = async (eventId: number) => {
    try {
      const { data: events } = await api.get('/events');
      const found = events.find((e: any) => e.id === eventId);
      if (found) {
        setFormData({
          ...found,
          event_date: found.event_date.split('T')[0],
          church_id: String(found.church_id || '')
        });
      }
      
      const { data: currentSchedule } = await api.get(`/schedule/event/${eventId}`);
      setAssignments(currentSchedule.map((s: any) => ({
        id: s.id,
        role_id: String(s.role_id),
        volunteer_id: s.volunteer_id ? String(s.volunteer_id) : '',
        status: s.status,
        department_name: s.department_name
      })));
    } catch (e) {
      toast.error('Erro carregar dados do evento');
    }
  };

  const groupedAssignments = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    assignments.forEach((ass, index) => {
      const dept = ass.department_name || 'Sem Departamento';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push({ ...ass, originalIndex: index });
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [assignments]);

  const handleAddField = () => {
    setAssignments([...assignments, { role_id: '', volunteer_id: '', status: 'pendente', department_name: '' }]);
  };

  const handleRemoveField = (index: number) => {
    const updated = [...assignments];
    updated.splice(index, 1);
    setAssignments(updated);
  };

  const handleUpdateAssignment = (index: number, field: string, value: any) => {
    const updated = [...assignments];
    updated[index][field] = value;
    
    if (field === 'role_id') {
      const selectedRole = roles.find(r => String(r.id) === value);
      if (selectedRole) {
        updated[index].department_name = selectedRole.department_name;
      }
    }
    setAssignments(updated);
  };

  const handleSave = async (scope: 'single' | 'following' = 'single') => {
    if (!formData.name || !formData.event_date) {
      toast.error('Preencha os campos obrigatórios');
      setActiveTab('evento');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        update_scope: scope,
        assignments: assignments.filter(a => a.role_id)
      };

      if (isEditing) {
        await api.put(`/events/${id}`, payload);
        toast.success('Alterações salvas!');
      } else {
        await api.post('/events', payload);
        toast.success('Agendamento criado com sucesso!');
      }
      router.push('/admin/organizacao/eventos');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao salvar');
    } finally {
      setLoading(false);
      setShowRecurrenceModal(false);
    }
  };

  const onSaveClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && (formData.is_recurring || formData.parent_event_id)) {
      setShowRecurrenceModal(true);
    } else {
      handleSave('single');
    }
  };

  return (
    <AppLayout title={isEditing ? 'Editar Evento' : 'Novo Evento'}>
      <div className="max-w-6xl mx-auto pb-20">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white flex items-center transition-colors">
            <ArrowLeft className="w-5 h-5 mr-2" /> Voltar
          </button>
          <div className="flex bg-gray-800/50 p-1 rounded-2xl border border-gray-700">
            <button 
              onClick={() => setActiveTab('evento')}
              className={`px-8 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'evento' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Evento
            </button>
            <button 
              onClick={() => setActiveTab('funcoes')}
              className={`px-8 py-2 rounded-xl text-xs font-black uppercase transition-all ${activeTab === 'funcoes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Funções
            </button>
          </div>
          <button 
            form="eventForm"
            type="submit" 
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-2xl font-black flex items-center gap-2 active:scale-95 transition-all shadow-xl shadow-indigo-500/20"
          >
            {loading ? <Clock className="w-5 h-5 animate-spin"/> : <Save className="w-5 h-5" />}
            {isEditing ? 'Atualizar' : 'Salvar Agendamento'}
          </button>
        </div>

        <form id="eventForm" onSubmit={onSaveClick} className="space-y-8">
          {activeTab === 'evento' ? (
            <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-gray-800/60 p-8 rounded-[32px] border border-gray-700 shadow-2xl space-y-6">
                <h3 className="text-xs font-black uppercase text-indigo-400 tracking-widest border-b border-gray-700 pb-4">Configuração Inicial</h3>
                
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 ml-2">Título do Evento</label>
                  <input
                    required
                    className="w-full bg-gray-900/50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-5 py-4 text-white outline-none transition-all"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 ml-2">Data</label>
                    <input
                      type="date"
                      required
                      className="w-full bg-gray-900/50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-5 py-4 text-white outline-none transition-all"
                      value={formData.event_date}
                      onChange={e => setFormData({ ...formData, event_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 ml-2">Hora</label>
                    <input
                      type="time"
                      required
                      className="w-full bg-gray-900/50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-5 py-4 text-white outline-none transition-all"
                      value={formData.event_time}
                      onChange={e => setFormData({ ...formData, event_time: e.target.value })}
                    />
                  </div>
                </div>

                {user?.role === 'super_admin' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-gray-500 ml-2">Igreja</label>
                    <select
                      required
                      className="w-full bg-gray-900/50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-5 py-4 text-white outline-none transition-all appearance-none"
                      value={formData.church_id}
                      onChange={e => setFormData({ ...formData, church_id: e.target.value })}
                    >
                      <option value="">Selecione...</option>
                      {churches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-gray-500 ml-2">Local / Endereço</label>
                  <input
                    className="w-full bg-gray-900/50 border-2 border-transparent focus:border-indigo-500 rounded-2xl px-5 py-4 text-white outline-none transition-all"
                    value={formData.address || ''}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>

                <div className="space-y-2 pt-4 border-t border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-gray-300">Este evento se repete?</span>
                    <input
                      type="checkbox"
                      disabled={!!isEditing}
                      className="w-6 h-6 rounded accent-indigo-500 cursor-pointer disabled:opacity-20"
                      checked={formData.is_recurring}
                      onChange={e => setFormData({ ...formData, is_recurring: e.target.checked })}
                    />
                  </div>

                  {formData.is_recurring && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-200">
                      <select
                        disabled={!!isEditing}
                        className="w-full bg-gray-900 rounded-xl px-4 py-3 text-xs text-white outline-none border border-gray-700 disabled:opacity-50"
                        value={formData.recurrence_type}
                        onChange={e => setFormData({ ...formData, recurrence_type: e.target.value as any })}
                      >
                        <option value="daily">Diário</option>
                        <option value="weekly">Semanal</option>
                        <option value="monthly">Mensal</option>
                        <option value="custom">Personalizado (Dias)</option>
                      </select>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <input
                          type="number"
                          disabled={!!isEditing}
                          placeholder="Vezes"
                          className="w-full bg-gray-900 rounded-xl px-4 py-3 text-xs text-white border border-gray-700 disabled:opacity-50"
                          value={formData.recurrence_count}
                          onChange={e => setFormData({ ...formData, recurrence_count: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-gray-800/60 rounded-[32px] border border-gray-700 shadow-2xl overflow-hidden flex flex-col h-full">
                <div className="px-8 py-6 border-b border-gray-700 flex justify-between items-center bg-gray-900/30">
                  <div>
                    <h3 className="text-xs font-black uppercase text-indigo-400 tracking-widest">Escalas e Funções</h3>
                    <p className="text-[10px] text-gray-500 font-bold mt-1 uppercase">Defina as funções para este evento</p>
                  </div>
                </div>

                <div className="p-0 overflow-x-auto min-h-[400px] custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-700/50 bg-gray-900/10">
                        <th className="px-8 py-5 text-[10px] font-black uppercase text-gray-500 tracking-tighter">Função</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-500 tracking-tighter">Departamento</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-500 tracking-tighter">Voluntário</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase text-gray-500 tracking-tighter text-center">Confirmação</th>
                        <th className="px-8 py-5 text-right w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/30">
                      {assignments.map((ass, index) => (
                        <tr key={index} className="hover:bg-gray-700/20 transition-colors">
                          <td className="px-8 py-4">
                            <select
                              className="bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-indigo-500 transition-all w-full min-w-[150px]"
                              value={ass.role_id}
                              onChange={e => handleUpdateAssignment(index, 'role_id', e.target.value)}
                            >
                              <option value="">Selecione...</option>
                              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`text-xs font-black uppercase tracking-tighter bg-gray-900/40 px-3 py-1.5 rounded-lg border border-gray-700/50 ${getDeptColor(ass.department_name)}`}>
                              {ass.department_name || '--'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {isEditing ? (
                              <select
                                className="bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-indigo-500 transition-all w-full min-w-[180px]"
                                value={ass.volunteer_id}
                                onChange={e => handleUpdateAssignment(index, 'volunteer_id', e.target.value)}
                              >
                                <option value="">Selecione...</option>
                                {volunteers
                                  .filter(v => {
                                    // 1. FILTRO DE IGREJA: Deve ser da mesma igreja do evento
                                    const eventChurchId = String(formData.church_id || '');
                                    const volChurchId = String(v.church_id || '');
                                    if (eventChurchId && volChurchId && eventChurchId !== volChurchId) {
                                      return false;
                                    }

                                    // 2. FILTRO DE FUNÇÃO: Se uma função foi selecionada, o voluntário DEVE possuí-la
                                    if (!ass.role_id) return true;
                                    
                                    const selectedRoleId = String(ass.role_id);
                                    
                                    // Verificar em role_ids (array de IDs)
                                    if (v.role_ids && Array.isArray(v.role_ids)) {
                                      return v.role_ids.some((rid: any) => String(rid) === selectedRoleId);
                                    }
                                    
                                    // Backup: Verificar em v.roles (cada objeto deve ter .id)
                                    if (v.roles && Array.isArray(v.roles)) {
                                      return v.roles.some((r: any) => String(r.id) === selectedRoleId);
                                    }
                                    
                                    return false; // Rígido: se não achou a função, não mostra
                                  })
                                  .map(v => <option key={v.id} value={v.id}>{v.name}</option>)
                                }
                              </select>
                            ) : (
                              <span className="text-[10px] font-black uppercase text-gray-600 italic">Disponível após salvar</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <select
                              className={`bg-gray-900/50 border rounded-xl px-3 py-2 text-xs outline-none transition-all
                                ${ass.status === 'confirmado' ? 'border-emerald-500/50 text-emerald-400' :
                                  ass.status === 'recusado' ? 'border-red-500/50 text-red-400' :
                                  'border-yellow-500/50 text-yellow-400'}`}
                              value={ass.status || 'pendente'}
                              onChange={e => handleUpdateAssignment(index, 'status', e.target.value)}
                            >
                              <option value="pendente">Pendente confirmação</option>
                              <option value="confirmado">Confirmou que vai</option>
                              <option value="recusado">Recusou</option>
                            </select>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveField(index)}
                              className="text-gray-500 hover:text-rose-500 p-2 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {assignments.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-8 py-20 text-center">
                            <div className="flex flex-col items-center text-gray-600">
                              <Calendar className="w-10 h-10 mb-2 opacity-20" />
                              <p className="text-sm font-bold uppercase tracking-widest">Nenhuma função definida</p>
                              <button type="button" onClick={handleAddField} className="mt-4 text-indigo-400 text-xs font-black underline underline-offset-4">Clique para adicionar</button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {assignments.length > 0 && (
                        <tr>
                          <td colSpan={5} className="p-4 border-t border-gray-700/50 bg-gray-900/20 hover:bg-gray-800/50 transition-colors">
                            <button
                              type="button"
                              onClick={handleAddField}
                              className="w-full flex items-center justify-center gap-2 text-indigo-400 font-black uppercase text-[10px] tracking-widest py-3 rounded-xl border border-dashed border-indigo-500/30 hover:bg-indigo-500/10 hover:border-indigo-500/50 transition-all"
                            >
                              <Plus className="w-4 h-4" /> Adicionar Função
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Modal de Confirmação de Recorrência */}
      {showRecurrenceModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-gray-700 p-8 rounded-[32px] max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-indigo-500/10 w-16 h-16 rounded-3xl flex items-center justify-center mb-6 border border-indigo-500/20">
              <AlertCircle className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2">Evento Recorrente</h3>
            <p className="text-gray-400 text-sm font-medium mb-8 leading-relaxed">
              Deseja salvar as alterações apenas para este evento ou para todos os eventos da série?
            </p>
            <div className="space-y-3">
              <button
                onClick={() => handleSave('single')}
                className="w-full bg-gray-900 hover:bg-gray-700 text-white py-4 rounded-2xl font-black uppercase text-xs border border-gray-700 transition-all hover:scale-[1.02] active:scale-95"
              >
                Apenas este evento
              </button>
              <button
                onClick={() => handleSave('following')}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-indigo-500/20 transition-all hover:scale-[1.02] active:scale-95"
              >
                Todos da série
              </button>
              <button
                onClick={() => setShowRecurrenceModal(false)}
                className="w-full text-gray-500 hover:text-white py-2 font-bold text-center text-[10px] uppercase mt-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
