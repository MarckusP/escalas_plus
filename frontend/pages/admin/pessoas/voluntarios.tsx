import React, { useEffect, useRef, useState } from 'react';
import AppLayout from '../../../components/AppLayout';
import { useAuth } from '../../../hooks/useAuth';
import api from '../../../utils/api';
import toast from 'react-hot-toast';
import { Trash2, Plus } from 'lucide-react';
import ChurchSearchSelect from '../../../components/ChurchSearchSelect';
import PasswordPolicyHint from '../../../components/PasswordPolicyHint';
import { validatePassword } from '../../../utils/passwordPolicy';

const CSV_HEADERS = 'nome,email,ddd,telefone';
const MAX_VISIBLE_ROLES = 2;

export default function Voluntarios() {
  const { user } = useAuth();
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [churches, setChurches] = useState<any[]>([]);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [allDepts, setAllDepts] = useState<any[]>([]);
  const [myDepts, setMyDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedVolunteerRoles, setSelectedVolunteerRoles] = useState<any[]>([]);
  const [selectedVolunteerDeptIds, setSelectedVolunteerDeptIds] = useState<number[]>([]);
  const selectedVolunteerDeptIdsRef = useRef<number[]>([]);
  const selectedVolunteerRolesRef = useRef<any[]>([]);
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState('');
  const [showApproveModal, setShowApproveModal] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState<any>(null);
  const [editTab, setEditTab] = useState<'perfil' | 'funcoes'>('perfil');
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone_ddd: '',
    phone_number: '',
    active: true,
    status: 'active',
    church_id: '',
    role: 'voluntario',
  });
  const [newVolDepts, setNewVolDepts] = useState<number[]>([]);
  const [newVol, setNewVol] = useState({
    name: '',
    email: '',
    password: '',
    role: 'voluntario',
    church_id: '',
    phone_ddd: '',
    phone_number: '',
  });
  const [importModal, setImportModal] = useState(false);
  const csvInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLider = user?.role === 'lider';
  const isSuper = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';

  async function syncVolunteerDepartments(
    volunteerId: number,
    selectedIds: number[],
    currentIds: number[]
  ) {
    for (const deptId of currentIds) {
      if (!selectedIds.includes(deptId)) {
        try {
          await api.delete(`/volunteers/${volunteerId}/departments/${deptId}`);
        } catch {
          /* ignora */
        }
      }
    }
    for (const deptId of selectedIds) {
      if (!currentIds.includes(deptId)) {
        try {
          await api.post(`/volunteers/${volunteerId}/departments`, { department_id: deptId });
        } catch {
          /* ignora */
        }
      }
    }
  }

  async function load() {
    try {
      setLoading(true);
      const { data } = await api.get('/volunteers');
      setVolunteers(data);
      const { data: cData } = await api.get('/churches');
      setChurches(cData);
      const { data: rData } = await api.get('/roles');
      setAllRoles(rData);
      const { data: dData } = await api.get('/departments');
      setAllDepts(dData);
      if (isLider) {
        const { data: myData } = await api.get('/me/departments');
        setMyDepts(myData);
      }
    } catch {
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  /* ---- add volunteer ---- */
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const pwdCheck = validatePassword(newVol.password);
    if (!pwdCheck.ok) {
      toast.error(pwdCheck.errors[0]);
      return;
    }
    try {
      const churchId =
        newVol.role === 'super_admin'
          ? undefined
          : newVol.church_id
            ? Number(newVol.church_id)
            : user?.role === 'admin'
              ? user.church_id ?? undefined
              : undefined;
      const { data: createdUser } = await api.post('/auth/register', {
        name: newVol.name,
        email: newVol.email,
        password: newVol.password,
        role: newVol.role,
        church_id: churchId,
        phone_ddd: newVol.phone_ddd,
        phone_number: newVol.phone_number,
      });

      // Link ministries (auto for lider, manual for admin/super)
      const deptIds = isLider ? myDepts.map((d: any) => d.id) : newVolDepts;
      for (const deptId of deptIds) {
        await api
          .post(`/volunteers/${createdUser.id}/departments`, { department_id: deptId })
          .catch(() => {});
      }

      toast.success('Voluntário adicionado com sucesso!');
      setShowModal(false);
      setNewVol({ name: '', email: '', password: '', role: 'voluntario', church_id: '', phone_ddd: '', phone_number: '' });
      setNewVolDepts([]);
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao adicionar');
    }
  };

  /* ---- edit modal open ---- */
  const openEditModal = async (volunteer: any) => {
    setShowEditModal(volunteer);
    setEditTab('perfil');
    setSelectedRoleToAdd('');
    setEditForm({
      name: volunteer.name || '',
      email: volunteer.email || '',
      phone_ddd: volunteer.phone_ddd || '',
      phone_number: volunteer.phone_number || '',
      active: volunteer.active !== false,
      status: volunteer.status || 'active',
      church_id: volunteer.church_id || '',
      role: volunteer.role || 'voluntario',
    });

    // Fetch full volunteer detail (departments + roles)
    try {
      const { data } = await api.get(`/volunteers/${volunteer.id}`);
      const depts = data.departments || [];
      const deptIds: number[] = depts.map((n: string) => allDepts.find((d: any) => d.name === n)?.id).filter(Boolean);
      setSelectedVolunteerDeptIds(deptIds);
      selectedVolunteerDeptIdsRef.current = deptIds;
      const roles = (data.roles || []).filter((r: any) => r !== null);
      setSelectedVolunteerRoles(roles);
      selectedVolunteerRolesRef.current = roles;
    } catch {
      setSelectedVolunteerDeptIds([]);
      selectedVolunteerDeptIdsRef.current = [];
      setSelectedVolunteerRoles([]);
      selectedVolunteerRolesRef.current = [];
    }
  };

  /* ---- save edit (perfil) ---- */
  const handleSaveEdit = async () => {
    if (!showEditModal) return;
    const isNotAdmin = showEditModal.role !== 'admin' && showEditModal.role !== 'super_admin';
    if (isNotAdmin) {
      try {
        const { data: currentDetail } = await api.get(`/volunteers/${showEditModal.id}`);
        const currentDepts = (currentDetail.departments || [])
          .map((n: string) => allDepts.find((d: any) => d.name === n)?.id)
          .filter(Boolean) as number[];
        let selected = selectedVolunteerDeptIdsRef.current;
        if (isLider) {
          const allowed = new Set(myDepts.map((d: any) => d.id));
          selected = selected.filter(id => allowed.has(id));
        }
        await syncVolunteerDepartments(showEditModal.id, selected, currentDepts);
      } catch {
        /* ignora falha de sync de ministérios */
      }
    }
    
    // Sync roles
    const currentRoles = selectedVolunteerRolesRef.current;
    const newRoles = selectedVolunteerRoles.filter((r: any) => r.id);
    
    for (const r of currentRoles) {
      if (!newRoles.find((nr: any) => nr.id === r.id)) {
        try { await api.delete(`/volunteers/${showEditModal.id}/roles/${r.id}`); } catch {}
      }
    }
    for (const r of newRoles) {
      if (!currentRoles.find((cr: any) => cr.id === r.id)) {
        try { await api.post(`/volunteers/${showEditModal.id}/roles`, { role_id: r.id }); } catch {}
      }
    }

    // Then save profile
    try {
      const updateData: any = {
        name: editForm.name,
        email: editForm.email,
        active: editForm.active,
        status: editForm.status,
        phone_ddd: editForm.phone_ddd || null,
        phone_number: editForm.phone_number || null,
      };
      if (isSuper) {
        updateData.church_id = editForm.church_id ? Number(editForm.church_id) : null;
        updateData.role = editForm.role;
      }
      await api.put(`/volunteers/${showEditModal.id}`, updateData);
      toast.success('Voluntário atualizado com sucesso!');
      setShowEditModal(null);
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao atualizar');
    }
  };

  /* ---- approve ---- */
  const handleApprove = async (id: number, status: string, churchId?: number | null) => {
    try {
      await api.patch(`/volunteers/${id}/status`, { status, church_id: churchId });
      toast.success(status === 'active' ? 'Aprovado com sucesso!' : 'Recusado com sucesso!');
      setShowApproveModal(null);
      await load();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleApproveAndComplete = async (volunteer: any) => {
    if (isSuper && !volunteer.church_id) {
      setShowApproveModal(volunteer);
      return;
    }
    try {
      await api.patch(`/volunteers/${volunteer.id}/status`, {
        status: 'active',
        church_id: volunteer.church_id ? Number(volunteer.church_id) : null,
      });
      toast.success('Aprovado! Revise o cadastro se necessário.');
      setShowApproveModal(null);
      const { data: detail } = await api.get(`/volunteers/${volunteer.id}`);
      const hasRoles = Array.isArray(detail.roles) && detail.roles.length > 0;
      await openEditModal({ ...volunteer, ...detail, status: 'active' });
      setEditTab(hasRoles ? 'funcoes' : 'perfil');
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao aprovar');
    }
  };

  /* ---- roles (funções) ---- */
  const handleAssignRole = async () => {
    if (!showEditModal || !selectedRoleToAdd) {
      toast.error('Selecione uma função para atribuir');
      return;
    }
    try {
      await api.post(`/volunteers/${showEditModal.id}/roles`, { role_id: Number(selectedRoleToAdd) });
      toast.success('Função atribuída com sucesso');
      setSelectedRoleToAdd('');
      openEditModal(showEditModal);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao atribuir função');
    }
  };

  const handleRemoveRole = async (volunteerId: number, roleId: number) => {
    try {
      await api.delete(`/volunteers/${volunteerId}/roles/${roleId}`);
      toast.success('Função removida com sucesso');
      openEditModal(showEditModal);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Erro ao remover função');
    }
  };

  /* ---- toggle status ---- */
  const handleToggleStatus = async (volunteer: any) => {
    const newStatus = volunteer.status === 'active' ? 'rejected' : 'active';
    try {
      await api.patch(`/volunteers/${volunteer.id}/status`, {
        status: newStatus,
        church_id: volunteer.church_id,
      });
      toast.success(`Status alterado para ${newStatus === 'active' ? 'ativo' : 'rejeitado'}`);
      load();
    } catch {
      toast.error('Erro ao alterar status');
    }
  };

  /* ---- CSV download ---- */
  const downloadCsvTemplate = () => {
    const content = `${CSV_HEADERS}\nJoão Silva,joao@email.com,11,99999-0001\nMaria Santos,maria@email.com,21,98888-0002`;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_voluntarios.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ---- CSV import ---- */
  const handleCsvImport = async () => {
    const text = csvInputRef.current?.value?.trim();
    if (!text) {
      toast.error('Nenhum dado informado');
      return;
    }
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    // skip header
    const dataLines = lines[0].trim().toLowerCase().startsWith(CSV_HEADERS)
      ? lines.slice(1)
      : lines;

    if (dataLines.length === 0) {
      toast.error('Nenhum dado válido encontrado');
      return;
    }

    const targetChurchId = (isSuper || isAdmin)
      ? (user?.role === 'admin' ? user.church_id : null)
      : user?.church_id;

    let successCount = 0;
    let failCount = 0;

    for (const line of dataLines) {
      const cols = line.split(',').map(c => c.trim());
      if (cols.length < 4) {
        failCount++;
        continue;
      }
      const [name, email, phone_ddd, phone_number] = cols;
      try {
        const { data: created } = await api.post('/auth/register', {
          name,
          email,
          password: 'Test@123456',
          role: 'voluntario',
          church_id: targetChurchId ?? 1,
          phone_ddd,
          phone_number,
          status: 'active',
        });
        // link default church's departments if auto-dept is set
        successCount++;
      } catch {
        failCount++;
      }
    }

    toast.success(`${successCount} importado(s) com sucesso!${failCount > 0 ? ` ${failCount} falha(s).` : ''}`);
    setImportModal(false);
    load();
  };

  const handleFileImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (csvInputRef.current) {
      csvInputRef.current.value = text;
    }
    toast.success(`Arquivo "${file.name}" carregado. Revise os dados e clique em Importar.`);
    e.target.value = '';
  };

  /* ---- derived ---- */
  const availableRoles = allRoles.filter((r: any) =>
    selectedVolunteerDeptIdsRef.current.includes(r.department_id)
  );

  const sortVolunteersList = (list: any[]) =>
    [...list].sort((a, b) => {
      const rank = (s: string) => (s === 'pending' ? 0 : 1);
      const byStatus = rank(String(a.status)) - rank(String(b.status));
      if (byStatus !== 0) return byStatus;
      return String(a.name).localeCompare(String(b.name), 'pt');
    });

  const filtered = sortVolunteersList(
    volunteers.filter(
      (v: any) =>
        v.name.toLowerCase().includes(search.toLowerCase()) ||
        v.email.toLowerCase().includes(search.toLowerCase())
    )
  );

  const pendingCount = volunteers.filter((v: any) => v.status === 'pending').length;
  const isNotAdminInEdit = showEditModal?.role !== 'admin' && showEditModal?.role !== 'super_admin';

  return (
    <AppLayout title="Gestão de Voluntários">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">Voluntários</h1>
          <p className="text-sm text-gray-400 mt-1">
            Gerencie os membros da equipe e aprovações.
            {pendingCount > 0 && (
              <span className="ml-2 text-amber-400 font-medium">
                {pendingCount} aguardando aprovação
                {isSuper ? ' (todas as igrejas)' : ''}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <input type="text" placeholder="Buscar..." className="p-2 flex-1 md:w-64 bg-gray-800 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500" value={search} onChange={e => setSearch(e.target.value)} />
          <button onClick={() => { setShowModal(true); setNewVolDepts([]); if (user?.role === 'admin' && user.church_id != null) { setNewVol((prev) => ({ ...prev, church_id: String(user.church_id!) })); } }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors">+ Novo</button>
        </div>
      </div>

      {/* ===== TABELA ===== */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="p-4 text-gray-400 font-semibold">Nome</th>
                <th className="p-4 text-gray-400 font-semibold">E-mail</th>
                <th className="p-4 text-gray-400 font-semibold">Igreja</th>
                <th className="p-4 text-gray-400 font-semibold">Ministérios</th>
                <th className="p-4 text-gray-400 font-semibold text-center">Papel</th>
                <th className="p-4 text-gray-400 font-semibold text-center">Funções</th>
                <th className="p-4 text-gray-400 font-semibold text-center">Status</th>
                <th className="p-4 text-gray-400 font-semibold text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading ? (
                <tr><td colSpan={8} className="p-4 text-center text-gray-400">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-4 text-center text-gray-500">Nenhum voluntário encontrado.</td></tr>
              ) : filtered.map((v: any) => (
                <tr
                  key={v.id}
                  className={`hover:bg-gray-700/50 ${
                    v.status === 'pending' ? 'bg-amber-500/10 border-l-2 border-l-amber-500' : ''
                  }`}
                >
                  <td className="p-4 font-medium text-white">
                    {v.name}
                    {v.status === 'pending' && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-amber-400">
                        Pendente
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-gray-300">{v.email}</td>
                  <td className="p-4 text-gray-300">{v.church_name || '-'}</td>
                  <td className="p-4 text-gray-300">
                    {v.departments && v.departments.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {v.departments.slice(0, 3).map((dept: string, idx: number) => (
                          <span key={`${v.id}-dept-${idx}`} className="inline-block px-2 py-0.5 bg-purple-600/20 text-purple-300 rounded text-xs border border-purple-500/30">{dept}</span>
                        ))}
                        {v.departments.length > 3 && (
                          <span className="text-gray-500 text-xs">+{v.departments.length - 3}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">-</span>
                    )}
                  </td>
                  <td className="p-4 text-center text-gray-300 text-xs">
                    <span className="px-2 py-1 bg-gray-700 rounded-full capitalize">{v.role || 'voluntario'}</span>
                  </td>
                  <td className="p-4 text-center text-gray-300">
                    {v.assigned_roles && v.assigned_roles.length > 0 ? (
                      <div className="text-xs leading-relaxed">
                        {v.assigned_roles.slice(0, MAX_VISIBLE_ROLES).map((role: string, idx: number) => (
                          <span key={`${v.id}-role-${idx}`} className="inline-block px-2 py-1 bg-blue-600/20 text-blue-300 rounded text-xs mr-1">{role}</span>
                        ))}
                        {v.assigned_roles.length > MAX_VISIBLE_ROLES && (
                          <span className="text-gray-500 text-xs">+{v.assigned_roles.length - MAX_VISIBLE_ROLES}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">-</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {v.status === 'active' ? (
                      <span className="inline-block w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]" title="Ativo" />
                    ) : v.status === 'pending' ? (
                      <span className="inline-block w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.4)]" title="Pendente" />
                    ) : (
                      <span className="inline-block w-3 h-3 rounded-full bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.4)]" title="Recusado" />
                    )}
                  </td>
                  <td className="p-4 text-center space-x-2">
                    <button className="text-amber-400 hover:text-amber-200 font-medium text-xs" onClick={() => openEditModal(v)}>Editar</button>
                    {v.status === 'pending' && (
                      <>
                        <button onClick={() => handleApproveAndComplete(v)} className="text-emerald-400 hover:text-emerald-300 font-medium text-xs">Aprovar</button>
                        <button onClick={() => handleApprove(v.id, 'rejected')} className="text-red-400 hover:text-red-300 font-medium text-xs">Recusar</button>
                      </>
                    )}
                    {v.status === 'active' && (
                      <button onClick={() => handleToggleStatus(v)} className="text-red-400 hover:text-red-300 font-medium text-xs" title="Desativar">Desativar</button>
                    )}
                    {v.status === 'rejected' && (
                      <button onClick={() => handleToggleStatus(v)} className="text-emerald-400 hover:text-emerald-300 font-medium text-xs" title="Reativar">Reativar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== CSV BUTTONS ===== */}
      {!isLider && (
      <div className="flex flex-wrap gap-3 mt-4">
        <button onClick={downloadCsvTemplate} className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-600 rounded text-gray-300 hover:text-white hover:border-gray-500 text-sm transition-colors">
          <span className="text-lg">↓</span> Download CSV modelo
        </button>
        <button onClick={() => { setImportModal(true); setTimeout(() => { if (csvInputRef.current) csvInputRef.current.value = ''; }, 100); }} className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-600 rounded text-gray-300 hover:text-white hover:border-gray-500 text-sm transition-colors">
          <span className="text-lg">↑</span> Importar CSV
        </button>
      </div>
      )}

      {/* ===== MODAL NOVO VOLUNTÁRIO ===== */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6 shadow-2xl my-8">
            <h2 className="text-xl font-bold text-white mb-4">Novo Voluntário</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Nome *</label>
                <input required placeholder="Nome completo" className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newVol.name} onChange={e=>setNewVol({...newVol, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">E-mail *</label>
                <input required type="email" placeholder="E-mail" className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newVol.email} onChange={e=>setNewVol({...newVol, email: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Senha *</label>
                <input
                  required
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Senha"
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  value={newVol.password}
                  onChange={e => setNewVol({ ...newVol, password: e.target.value })}
                />
                <div className="mt-1">
                  <PasswordPolicyHint />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">Telefone WhatsApp *</label>
                <div className="grid grid-cols-3 gap-2">
                  <input required={newVol.role !== 'super_admin'} placeholder="DDD" maxLength={3} className="p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newVol.phone_ddd} onChange={e=>setNewVol({...newVol, phone_ddd: e.target.value})} />
                  <input required={newVol.role !== 'super_admin'} placeholder="Celular" className="col-span-2 p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newVol.phone_number} onChange={e=>setNewVol({...newVol, phone_number: e.target.value})} />
                </div>
              </div>
              {/* Ministérios — hidden for lider (auto-assigned), manual for admin */}
              {allDepts.length > 0 && newVol.role === 'voluntario' && !isLider && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">Ministérios</label>
                  <div className="space-y-1 max-h-32 overflow-y-auto bg-gray-900 p-2 rounded">
                    {allDepts.map((dept: any) => {
                      const checked = newVolDepts.includes(dept.id);
                      return (
                        <label key={dept.id} className="flex items-center gap-2 cursor-pointer py-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setNewVolDepts(checked ? newVolDepts.filter((d: number) => d !== dept.id) : [...newVolDepts, dept.id]);
                            }}
                            className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <span className="text-xs text-gray-300">{dept.icon} {dept.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {isLider && myDepts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">Ministérios (selecionado automaticamente)</label>
                  <div className="flex flex-wrap gap-1">
                    {myDepts.map((d: any) => <span key={d.id} className="px-2 py-0.5 bg-blue-600/20 text-blue-300 rounded text-xs border border-blue-500/30">{d.name}</span>)}
                  </div>
                </div>
              )}
              {(isSuper || isAdmin) && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Nível</label>
                    <select className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={newVol.role} onChange={(e) => { const role = e.target.value; setNewVol({...newVol, role, church_id: role === 'super_admin' ? '' : newVol.church_id}); }}>
                      <option value="voluntario">Voluntário</option>
                      <option value="lider">Líder</option>
                      {isSuper && <><option value="admin">Administrador</option><option value="super_admin">Super Admin</option></>}
                    </select>
                  </div>
                  {isSuper && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Igreja</label>
                      <select required={newVol.role !== 'super_admin'} disabled={newVol.role === 'super_admin'} className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white disabled:opacity-50" value={newVol.church_id} onChange={e=>setNewVol({...newVol, church_id: e.target.value})}>
                        <option value="">Selecione</option>
                        {churches.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL EDITAR (ABAS) ===== */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg p-0 shadow-2xl my-8">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">Editar Voluntário</h2>
              <p className="text-sm text-gray-400 mt-1">{showEditModal.name}</p>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-gray-700">
              <button onClick={() => setEditTab('perfil')} className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${editTab === 'perfil' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700/50' : 'text-gray-500 hover:text-gray-300'}`}>Perfil</button>
              <button onClick={() => setEditTab('funcoes')} className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${editTab === 'funcoes' ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700/50' : 'text-gray-500 hover:text-gray-300'}`}>Funções</button>
            </div>
            {/* Content */}
            <div className="p-6 max-h-96 overflow-y-auto">
              {editTab === 'perfil' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Nome</label>
                    <input className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">E-mail</label>
                    <input type="email" className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
                  </div>
                  {!isNotAdminInEdit && !isLider ? (
                    <p className="text-xs text-gray-400">Administradores podem editar todos os campos.</p>
                  ) : null}
                  {isNotAdminInEdit && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">Telefone WhatsApp</label>
                      <div className="grid grid-cols-3 gap-2">
                        <input placeholder="DDD" maxLength={3} className="p-2 bg-gray-700 border border-gray-600 rounded text-white" value={editForm.phone_ddd} onChange={e => setEditForm({ ...editForm, phone_ddd: e.target.value })} />
                        <input placeholder="Número" className="col-span-2 p-2 bg-gray-700 border border-gray-600 rounded text-white" value={editForm.phone_number} onChange={e => setEditForm({ ...editForm, phone_number: e.target.value })} />
                      </div>
                    </div>
                  )}
                  {/* Ministérios — read-only for lider, editable for admin/super */}
                  {!isLider && isNotAdminInEdit && allDepts.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">Ministérios</label>
                      <div className="space-y-1 max-h-32 overflow-y-auto bg-gray-900 p-2 rounded mb-2">
                        {allDepts.map((dept: any) => {
                          const checked = selectedVolunteerDeptIds.includes(dept.id);
                          return (
                            <label key={dept.id} className="flex items-center gap-2 cursor-pointer py-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? selectedVolunteerDeptIds.filter((d: number) => d !== dept.id)
                                    : [...selectedVolunteerDeptIds, dept.id];
                                  setSelectedVolunteerDeptIds(next);
                                  selectedVolunteerDeptIdsRef.current = next;
                                }}
                                className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                              />
                              <span className="text-xs text-gray-300">{dept.icon} {dept.name}</span>
                            </label>
                          );
                        })}
                      </div>
                      {selectedVolunteerDeptIds.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {selectedVolunteerDeptIds.map((did: number) => {
                            const dept = allDepts.find((d: any) => d.id === did);
                            return dept ? <span key={did} className="px-2 py-0.5 bg-purple-600/20 text-purple-300 rounded text-xs border border-purple-500/30">{dept.name}</span> : null;
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {isLider && isNotAdminInEdit && myDepts.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
                        Ministérios (seus)
                      </label>
                      <div className="space-y-1 max-h-32 overflow-y-auto bg-gray-900 p-2 rounded mb-2">
                        {myDepts.map((dept: any) => {
                          const checked = selectedVolunteerDeptIds.includes(dept.id);
                          return (
                            <label key={dept.id} className="flex items-center gap-2 cursor-pointer py-1">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? selectedVolunteerDeptIds.filter((d: number) => d !== dept.id)
                                    : [...selectedVolunteerDeptIds, dept.id];
                                  setSelectedVolunteerDeptIds(next);
                                  selectedVolunteerDeptIdsRef.current = next;
                                }}
                                className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                              />
                              <span className="text-xs text-gray-300">{dept.icon} {dept.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Active toggle */}
                  <div className="flex items-center justify-between py-2">
                    <label className="text-xs font-semibold text-gray-400 uppercase">Ativo</label>
                    <button onClick={() => setEditForm({ ...editForm, active: !editForm.active })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.active ? 'bg-emerald-500' : 'bg-gray-600'}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {/* Super admin fields */}
                  {isSuper && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Nível</label>
                        <select className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                          <option value="voluntario">Voluntário</option><option value="lider">Líder</option><option value="admin">Administrador</option><option value="super_admin">Super Admin</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Igreja</label>
                        <select className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={editForm.church_id} onChange={e => setEditForm({ ...editForm, church_id: e.target.value })} disabled={editForm.role === 'super_admin'}>
                          <option value="">Selecione</option>{churches.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Status</label>
                        <select className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                          <option value="active">Ativo</option><option value="pending">Pendente</option><option value="rejected">Recusado</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
              )}
              {editTab === 'funcoes' && (
                <div className="space-y-4">
                  {!isNotAdminInEdit ? (
                    <div className="text-center py-8"><p className="text-gray-400">Administradores não possuem funções.</p></div>
                  ) : selectedVolunteerDeptIds.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 text-sm mb-2">Nenhum ministério vinculado</p>
                      <p className="text-gray-600 text-xs">Vincule este voluntário a um ministério na aba Perfil para atribuir funções.</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-gray-900 p-0 rounded-xl overflow-hidden border border-gray-700/50">
                        <table className="w-full text-left">
                          <thead className="bg-gray-800/50 border-b border-gray-700/50">
                            <tr>
                              <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-500 tracking-wider">Função</th>
                              <th className="px-4 py-3 text-[10px] font-black uppercase text-gray-500 tracking-wider text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-700/30">
                            {selectedVolunteerRoles.map((roleObj: any, index: number) => (
                              <tr key={index} className="hover:bg-gray-800/30 transition-colors">
                                <td className="px-4 py-3">
                                  <select 
                                    className="bg-gray-900/50 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white outline-none w-full"
                                    value={roleObj.id || roleObj.role_id}
                                    onChange={e => {
                                      const newId = e.target.value;
                                      const r = availableRoles.find((r: any) => String(r.id) === newId);
                                      const updated = [...selectedVolunteerRoles];
                                      updated[index] = r ? { id: r.id, name: r.name, department_name: r.department_name } : { id: '', name: '' };
                                      setSelectedVolunteerRoles(updated);
                                    }}
                                  >
                                    <option value="">Selecione...</option>
                                    {availableRoles.map((role: any) => (
                                      <option key={role.id} value={role.id}>{role.name} ({role.department_name})</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-4 py-3 text-right cursor-pointer">
                                  <button type="button" onClick={() => {
                                      const updated = [...selectedVolunteerRoles];
                                      updated.splice(index, 1);
                                      setSelectedVolunteerRoles(updated);
                                  }} className="text-gray-500 hover:text-rose-400 p-2 transition-colors inline-block rounded hover:bg-rose-500/10"><Trash2 className="w-4 h-4" /></button>
                                </td>
                              </tr>
                            ))}
                            {selectedVolunteerRoles.length > 0 && (
                              <tr>
                                <td colSpan={2} className="p-3 border-t border-gray-700/50 bg-gray-900/20">
                                  <button type="button" onClick={() => {
                                    setSelectedVolunteerRoles([...selectedVolunteerRoles, { id: '' }]);
                                  }} className="w-full flex items-center justify-center gap-2 text-indigo-400 text-[10px] font-black uppercase tracking-widest py-2 hover:bg-indigo-500/10 transition-colors border border-dashed border-indigo-500/30 rounded-xl">
                                    <Plus className="w-3 h-3" /> Adicionar Função
                                  </button>
                                </td>
                              </tr>
                            )}
                            {selectedVolunteerRoles.length === 0 && (
                              <tr>
                                <td colSpan={2} className="px-4 py-10 text-center">
                                  <div className="flex flex-col items-center text-gray-600">
                                    <p className="text-sm font-bold uppercase tracking-widest mb-3">Nenhuma função atribuída</p>
                                    <button type="button" onClick={() => {
                                      setSelectedVolunteerRoles([{ id: '' }]);
                                    }} className="text-indigo-400 text-xs font-black underline underline-offset-4 flex items-center gap-1">
                                      <Plus className="w-3 h-3" /> Clique para adicionar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button type="button" onClick={() => setShowEditModal(null)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
              <button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium transition-colors">Salvar alterações</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL IMPORTAR CSV ===== */}
      {importModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg p-6 shadow-2xl my-8">
            <h2 className="text-xl font-bold text-white mb-2">Importar Voluntários (CSV)</h2>
            <p className="text-sm text-gray-400 mb-4">Cole os dados ou carregue um arquivo CSV com o formato: <code className="bg-gray-700 px-1 rounded text-xs">{CSV_HEADERS}</code></p>
            {/* File upload */}
            <div className="mb-4">
              <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
              <button onClick={handleFileImport} className="w-full py-2 px-4 bg-gray-700 border border-gray-600 rounded text-gray-300 hover:text-white hover:border-gray-500 text-sm transition-colors">
                Carregar arquivo...
              </button>
            </div>
            {/* Text area */}
            <textarea
              ref={csvInputRef}
              rows={8}
              className="w-full p-3 bg-gray-900 border border-gray-600 rounded text-white font-mono text-xs focus:outline-none focus:border-blue-500"
              placeholder={`${CSV_HEADERS}\nJoão Silva,joao@email.com,11,99999-0001\nMaria Santos,maria@email.com,21,98888-0002`}
            />
            <p className="text-xs text-gray-500 mt-2">Senhas padrão serão definidas como <code className="bg-gray-700 px-1 rounded">123456</code>.</p>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
              <button onClick={() => setImportModal(false)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
              <button onClick={handleCsvImport} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-medium">Importar</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL APROVAÇÃO ===== */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-2">Aprovar Voluntário</h2>
            <p className="text-gray-400 mb-4 text-sm">
              Confirme a igreja de <strong>{showApproveModal.name}</strong> e conclua ministérios e funções em seguida.
            </p>
            <div className="space-y-4">
              <ChurchSearchSelect
                churches={churches}
                value={String(showApproveModal.church_id || '')}
                onChange={church_id => setShowApproveModal({ ...showApproveModal, church_id })}
                required
              />
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setShowApproveModal(null)} className="px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                <button
                  type="button"
                  disabled={!showApproveModal.church_id}
                  onClick={() => handleApproveAndComplete(showApproveModal)}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-2 rounded font-medium"
                >
                  Aprovar e concluir cadastro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
