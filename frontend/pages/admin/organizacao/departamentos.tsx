import React, { useEffect, useState } from 'react';
import AppLayout from '../../../components/AppLayout';
import { useAuth } from '../../../hooks/useAuth';
import api from '../../../utils/api';
import toast from 'react-hot-toast';

function renderIcon(icon: string, name: string, size: string = 'w-6 h-6') {
  if (!icon) return null;
  if (icon.startsWith('http://') || icon.startsWith('https://')) {
    return <img src={icon} alt={name} className={`${size} object-contain mr-2`} />;
  }
  return <span className={`${size === 'w-6 h-6' ? 'text-xl' : 'text-5xl'} mr-2`}>{icon}</span>;
}

export default function Departamentos() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<any[]>([]);
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState<any>(null);
  const [newDept, setNewDept] = useState({ name: '', icon: '', church_id: '' });
  const [selectedLeaderId, setSelectedLeaderId] = useState('');
  const [deptLeaders, setDeptLeaders] = useState<any[]>([]);
  const [deptRoles, setDeptRoles] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'capa' | 'funcoes'>('capa');
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [newRole, setNewRole] = useState({ name: '' });

  const isSuper = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const isLider = user?.role === 'lider';

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [{ data: depts }, { data: vols }, { data: roles }] = await Promise.all([
        api.get('/departments'),
        api.get('/volunteers'),
        api.get('/roles'),
      ]);
      setDepartments(depts);
      setVolunteers(vols);
      setDeptRoles(roles);
    } catch (err: any) {
      const status = err?.response?.status;
      const message = status ? `Erro ${status}: ${err?.response?.data?.error || 'recurso não encontrado'}` : 'Erro ao conectar com o servidor';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const openDeptModal = async (dept: any = null) => {
    if (dept) {
      setEditingDept(dept);
      setNewDept({ name: dept.name, icon: dept.icon || '', church_id: dept.church_id || '' });
      setSelectedLeaderId('');
      try {
        const [{ data: leaders }, { data: roles }] = await Promise.all([
          api.get(`/departments/${dept.id}/leaders`),
          api.get('/roles'),
        ]);
        setDeptLeaders(leaders || []);
        setDeptRoles(roles.filter((r: any) => r.department_id === dept.id));
      } catch {
        toast.error('Erro ao carregar dados do departamento');
      }
    } else {
      setEditingDept(null);
      setNewDept({ name: '', icon: '', church_id: isSuper ? '' : user?.church_id ? String(user.church_id) : '' });
      setDeptLeaders([]);
      setDeptRoles([]);
    }
    setActiveTab('capa');
    setShowDeptModal(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDept.name) {
      toast.error('Nome é obrigatório');
      return;
    }
    try {
      if (editingDept) {
        await api.put(`/departments/${editingDept.id}`, { name: newDept.name, icon: newDept.icon });
        toast.success('Departamento atualizado!');
      } else {
        const data: any = { name: newDept.name, icon: newDept.icon };
        if (isSuper) data.church_id = newDept.church_id;
        await api.post('/departments', data);
        toast.success('Departamento criado!');
      }
      setShowDeptModal(false);
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao salvar');
    }
  };

  const handleDeleteDept = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este departamento?')) return;
    try {
      await api.delete(`/departments/${id}`);
      toast.success('Departamento deletado!');
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao deletar');
    }
  };

  const handleAssignLeader = async () => {
    if (!editingDept || !selectedLeaderId) {
      toast.error('Selecione um líder');
      return;
    }
    try {
      await api.post(`/departments/${editingDept.id}/leaders`, { volunteer_id: Number(selectedLeaderId) });
      toast.success('Líder atribuído!');
      setSelectedLeaderId('');
      const { data } = await api.get(`/departments/${editingDept.id}/leaders`);
      setDeptLeaders(data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao atribuir');
    }
  };

  const handleRemoveLeader = async (leaderId: number) => {
    try {
      await api.delete(`/departments/${editingDept!.id}/leaders/${leaderId}`);
      toast.success('Líder removido!');
      const { data } = await api.get(`/departments/${editingDept!.id}/leaders`);
      setDeptLeaders(data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao remover');
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole.name.trim()) {
      toast.error('Nome da função é obrigatório');
      return;
    }
    try {
      if (editingRole) {
        await api.patch(`/roles/${editingRole.id}`, { name: newRole.name });
        toast.success('Função atualizada!');
      } else {
        await api.post('/roles', { name: newRole.name, department_id: editingDept!.id });
        toast.success('Função criada!');
      }
      setShowRoleForm(false);
      setNewRole({ name: '' });
      setEditingRole(null);
      const { data } = await api.get('/roles');
      setDeptRoles(data.filter((r: any) => r.department_id === editingDept!.id));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao salvar função');
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!confirm('Tem certeza que deseja deletar esta função?')) return;
    try {
      await api.delete(`/roles/${roleId}`);
      toast.success('Função deletada!');
      const { data } = await api.get('/roles');
      setDeptRoles(data.filter((r: any) => r.department_id === editingDept!.id));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao deletar função');
    }
  };

  const openRoleForm = (role: any = null) => {
    if (role) {
      setEditingRole(role);
      setNewRole({ name: role.name });
    } else {
      setEditingRole(null);
      setNewRole({ name: '' });
    }
    setShowRoleForm(true);
  };

  return (
    <AppLayout title="Departamentos">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">Departamentos</h1>
          <p className="text-sm text-gray-400 mt-1">Organize ministérios e áreas de atuação.</p>
        </div>
        {(isSuper || isAdmin) && (
          <button onClick={() => openDeptModal()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors">Novo</button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : error ? (
        <div className="bg-red-900/20 rounded-xl border border-red-700 p-8 text-center">
          <p className="text-red-200">{error}</p>
          <button onClick={load} className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-white">Recarregar</button>
        </div>
      ) : departments.length === 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
          <p className="text-gray-400">Nenhum departamento cadastrado. Crie um para começar!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {departments.map((d: any) => (
            <div key={d.id} className="bg-gray-800 rounded-xl border border-gray-700 p-6 hover:border-gray-500 transition-colors relative">
              {/* Botões de ação no canto superior direito */}
              {(isSuper || isAdmin) && (
                <div className="absolute top-3 right-3 flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); openDeptModal(d); }} className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors" title="Editar">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteDept(d.id); }} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors" title="Deletar">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      <line x1="10" y1="11" x2="10" y2="17"/>
                      <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                  </button>
                </div>
              )}
              {/* Ícone + nome alinhados */}
              <div className="flex items-center justify-center mb-3">
                {renderIcon(d.icon, d.name)}
                <h3 className="text-lg font-bold text-white">{d.name}</h3>
              </div>
              {/* Info do líder */}
              <div className="text-center mb-3">
                {isAdmin && (
                  d.leader_name ? (
                    <p className="text-sm text-gray-400 mt-1">Líder: {d.leader_name}</p>
                  ) : (
                    <p className="text-xs text-red-400 mt-1">Não possui Liderança cadastrada</p>
                  )
                )}
                {isSuper && (
                  <div className="text-xs text-gray-500 mt-1">
                    <p>{d.church_name || 'Sem igreja vinculada'}</p>
                    {d.leader_name ? (
                      <p className="text-gray-400 mt-0.5">Líder: {d.leader_name}</p>
                    ) : (
                      <p className="text-red-400 mt-0.5">Não possui Liderança cadastrada</p>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">{Number(d.member_count) || 0} membros</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Editar Departamento */}
      {showDeptModal && editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl p-6 shadow-2xl my-8">
            <div className="mb-6">
              <div className="flex items-center mb-4">
                {renderIcon(newDept.icon, newDept.name || editingDept.name, 'w-16 h-16')}
                <h2 className="text-2xl font-bold text-white">{editingDept.name}</h2>
              </div>
              <div className="flex gap-0 border-b border-gray-700">
                <button onClick={() => setActiveTab('capa')} className={`px-6 py-3 font-medium border-b-2 transition-colors ${activeTab === 'capa' ? 'text-blue-400 border-blue-500' : 'text-gray-400 border-transparent hover:text-gray-200'}`}>Capa</button>
                <button onClick={() => setActiveTab('funcoes')} className={`px-6 py-3 font-medium border-b-2 transition-colors ${activeTab === 'funcoes' ? 'text-blue-400 border-blue-500' : 'text-gray-400 border-transparent hover:text-gray-200'}`}>Funções</button>
              </div>
            </div>

            {activeTab === 'capa' && (
              <form onSubmit={handleSaveDept} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Nome do Departamento</label>
                  <input required placeholder="Ex: Adoração, Jovens, Crianças" className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newDept.name} onChange={e => setNewDept({ ...newDept, name: e.target.value })} />
                </div>

                {/* URL do Ícone */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">URL do Ícone</label>
                  <input type="url" placeholder="https://exemplo.com/icone.png" className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newDept.icon} onChange={e => setNewDept({ ...newDept, icon: e.target.value })} />
                  <p className="text-xs text-gray-500 mt-1">Cole o link da imagem (suporta PNG, GIF, SVG). Suporta ícones estáticos e animados.</p>
                  <p className="text-xs text-gray-500 mt-0.5">Buscar ícones gratuitos: <a href="https://noticon.tammolo.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">https://noticon.tammolo.com/</a></p>
                </div>

                {/* Líderes */}
                <div className="bg-gray-900 p-4 rounded-lg space-y-3">
                  <h3 className="text-sm font-semibold text-white">Gerenciar Líderes</h3>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Atribuir Líder</label>
                    <select className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={selectedLeaderId} onChange={e => setSelectedLeaderId(e.target.value)}>
                      <option value="">Selecione um voluntário</option>
                      {volunteers.filter((v: any) => 
                        (v.role === 'lider' || v.role === 'admin') && 
                        Number(v.church_id) === Number(editingDept.church_id)
                      ).map((v: any) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={handleAssignLeader} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm">Adicionar Líder</button>
                  <div className="space-y-2">
                    {deptLeaders.length === 0 ? (
                      <p className="text-xs text-gray-500">Nenhum líder atribuído</p>
                    ) : (
                      deptLeaders.map((leader: any) => (
                        <div key={leader.id} className="flex justify-between items-center bg-gray-800 p-2 rounded">
                          <span className="text-sm text-gray-200">{leader.name}</span>
                          <button type="button" onClick={() => handleRemoveLeader(leader.id)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
                  <button type="button" onClick={() => setShowDeptModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Fechar</button>
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium">Salvar Alterações</button>
                </div>
              </form>
            )}

            {activeTab === 'funcoes' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white">Funções do Departamento</h3>
                  <button onClick={() => openRoleForm()} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-medium">Nova Função</button>
                </div>

                {showRoleForm && (
                  <div className="bg-gray-900 p-4 rounded-lg space-y-3 border border-gray-700">
                    <form onSubmit={handleSaveRole} className="space-y-3">
                      <input required type="text" placeholder="Ex: Músico, Técnico de Som, Pregador" className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newRole.name} onChange={e => setNewRole({ ...newRole, name: e.target.value })} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setShowRoleForm(false); setEditingRole(null); setNewRole({ name: '' }); }} className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm">Cancelar</button>
                        <button type="submit" className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium">{editingRole ? 'Atualizar' : 'Criar'}</button>
                      </div>
                    </form>
                  </div>
                )}

                {deptRoles.length === 0 ? (
                  <div className="bg-gray-900 p-4 rounded-lg text-center">
                    <p className="text-gray-500">Nenhuma função cadastrada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {deptRoles.map((role: any) => (
                      <div key={role.id} className="flex justify-between items-center bg-gray-900 p-3 rounded border border-gray-700 hover:border-gray-500 transition-colors">
                        <span className="text-white font-medium">{role.name}</span>
                        <div className="flex gap-2">
                          <button onClick={() => openRoleForm(role)} className="text-blue-400 hover:text-blue-300 text-xs font-medium">Editar</button>
                          <button onClick={() => handleDeleteRole(role.id)} className="text-red-400 hover:text-red-300 text-xs font-medium">Deletar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                  <button onClick={() => setShowDeptModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Fechar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Criar Novo Departamento */}
      {showDeptModal && !editingDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6 shadow-2xl my-8">
            <h2 className="text-xl font-bold text-white mb-4">Novo Departamento</h2>
            <form onSubmit={handleSaveDept} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Nome</label>
                <input required placeholder="Ex: Adoração, Jovens, Crianças" className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newDept.name} onChange={e => setNewDept({ ...newDept, name: e.target.value })} />
              </div>

              {/* URL do Ícone */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">URL do Ícone</label>
                <input type="url" placeholder="https://exemplo.com/icone.png" className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newDept.icon} onChange={e => setNewDept({ ...newDept, icon: e.target.value })} />
                <p className="text-xs text-gray-500 mt-1">Cole o link da imagem (suporta PNG, GIF, SVG). Suporta ícones estáticos e animados.</p>
                <p className="text-xs text-gray-500 mt-0.5">Buscar ícones gratuitos: <a href="https://noticon.tammolo.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">https://noticon.tammolo.com/</a></p>
                {newDept.icon && (
                  <div className="mt-3 flex justify-center items-center bg-gray-900 rounded-lg p-4">
                    {renderIcon(newDept.icon, 'Preview', 'w-16 h-16')}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
                <button type="button" onClick={() => setShowDeptModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
