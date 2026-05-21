import React, { useEffect, useState } from 'react';
import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function Funcoes() {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [newRole, setNewRole] = useState({ name: '', department_id: '' });

  const isSuper = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const isLider = user?.role === 'lider';

  async function load() {
    try {
      setLoading(true);
      const [{ data: rolesData }, { data: deptsData }] = await Promise.all([
        api.get('/roles'),
        api.get('/departments'),
      ]);
      setRoles(rolesData);
      setDepartments(deptsData);
    } catch {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const openModal = (role: any = null) => {
    if (role) {
      setEditingRole(role);
      setNewRole({ name: role.name, department_id: String(role.department_id) });
    } else {
      setEditingRole(null);
      setNewRole({ name: '', department_id: '' });
    }
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole.name || !newRole.department_id) {
      toast.error('Preencha todos os campos');
      return;
    }
    try {
      if (editingRole) {
        await api.patch(`/roles/${editingRole.id}`, { 
          name: newRole.name, 
          department_id: Number(newRole.department_id) 
        });
        toast.success('Função atualizada!');
      } else {
        await api.post('/roles', { 
          name: newRole.name, 
          department_id: Number(newRole.department_id) 
        });
        toast.success('Função criada!');
      }
      setShowModal(false);
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao salvar');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar esta função?')) return;
    try {
      await api.delete(`/roles/${id}`);
      toast.success('Função deletada!');
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao deletar');
    }
  };

  const canManage = isSuper || isAdmin || isLider;

  return (
    <AppLayout title="Gerenciar Funções">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-400">Funções & Papéis</h1>
          <p className="text-sm text-gray-400 mt-1">Organize as funções dos voluntários nos departamentos.</p>
        </div>
        {canManage && (
          <button
            onClick={() => openModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors"
          >
            + Nova Função
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : (
        <div className="space-y-4">
          {departments.length === 0 ? (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-8 text-center">
              <p className="text-gray-400">Crie departamentos primeiro para adicionar funções.</p>
            </div>
          ) : (
            departments.map((dept: any) => {
              const deptRoles = roles.filter((r: any) => r.department_id === dept.id);
              return (
                <div key={dept.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="bg-gray-900 p-4 border-b border-gray-700">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <span className="text-2xl">{dept.icon || '🏢'}</span>
                      {dept.name}
                    </h3>
                  </div>

                  {deptRoles.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      <p>Nenhuma função para este departamento</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-900/50">
                          <tr>
                            <th className="p-4 text-gray-400 font-semibold">Nome da Função</th>
                            <th className="p-4 text-gray-400 font-semibold text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {deptRoles.map((r: any) => (
                            <tr key={r.id} className="hover:bg-gray-700/30">
                              <td className="p-4 font-medium text-white">{r.name}</td>
                              <td className="p-4 text-right space-x-2">
                                {canManage && (
                                  <>
                                    <button
                                      onClick={() => openModal(r)}
                                      className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                                    >
                                      Editar
                                    </button>
                                    <button
                                      onClick={() => handleDelete(r.id)}
                                      className="text-red-400 hover:text-red-300 text-xs font-medium"
                                    >
                                      Deletar
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Modal Novo/Editar Função */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6 shadow-2xl my-8">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingRole ? 'Editar Função' : 'Nova Função'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Nome da Função *</label>
                <input
                  required
                  placeholder="Ex: Músico, Técnico de Som, Pregador"
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                  value={newRole.name}
                  onChange={e => setNewRole({...newRole, name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Departamento *</label>
                <select
                  required
                  disabled={!!editingRole}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  value={newRole.department_id}
                  onChange={e => setNewRole({...newRole, department_id: e.target.value})}
                >
                  <option value="">Selecione um departamento</option>
                  {departments.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium"
                >
                  {editingRole ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
