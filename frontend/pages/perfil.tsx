import React, { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import toast from 'react-hot-toast';
import PasswordPolicyHint from '../components/PasswordPolicyHint';
import { validatePassword } from '../utils/passwordPolicy';

export default function Perfil() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone_ddd: '',
    phone_number: '',
    password: '',
    passwordConfirm: '',
  });

  const isVolunteer = user?.role === 'voluntario';

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/me/profile');
        setForm({
          name: data.name || '',
          email: data.email || '',
          phone_ddd: data.phone_ddd || '',
          phone_number: data.phone_number || '',
          password: '',
          passwordConfirm: '',
        });
        setDepartments(Array.isArray(data.departments) ? data.departments : []);
      } catch {
        toast.error('Erro ao carregar perfil');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password) {
      if (form.password !== form.passwordConfirm) {
        toast.error('As senhas não coincidem');
        return;
      }
      const pwdCheck = validatePassword(form.password);
      if (!pwdCheck.ok) {
        toast.error(pwdCheck.errors[0]);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone_ddd: form.phone_ddd,
        phone_number: form.phone_number,
      };
      if (form.password) payload.password = form.password;
      await api.put('/me/profile', payload);
      toast.success('Perfil atualizado');
      setForm(f => ({ ...f, password: '', passwordConfirm: '' }));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (!isVolunteer) {
    return (
      <AppLayout title="Meu Perfil">
        <p className="text-gray-400">Edição completa de perfil disponível para voluntários.</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Meu Perfil">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 mb-6">
          Meu Perfil
        </h1>

        {loading ? (
          <p className="text-gray-400">Carregando...</p>
        ) : (
          <form
            onSubmit={handleSave}
            className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden"
          >
            <div className="p-8 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                  Nome completo
                </label>
                <input
                  required
                  className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
                  E-mail
                </label>
                <input
                  required
                  type="email"
                  className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
                  Telefone WhatsApp
                </label>
                <div className="flex gap-2">
                  <input
                    required
                    maxLength={3}
                    placeholder="DDD"
                    className="w-20 p-3 bg-gray-900 border border-gray-600 rounded-lg text-white"
                    value={form.phone_ddd}
                    onChange={e => setForm({ ...form, phone_ddd: e.target.value })}
                  />
                  <input
                    required
                    placeholder="Celular"
                    className="flex-1 p-3 bg-gray-900 border border-gray-600 rounded-lg text-white"
                    value={form.phone_number}
                    onChange={e => setForm({ ...form, phone_number: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">
                  Ministérios
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Ministérios são definidos na aprovação do cadastro. Para alterar, fale com o líder
                  ou administrador.
                </p>
                <div className="flex flex-wrap gap-2">
                  {departments.length > 0 ? (
                    departments.map(name => (
                      <span
                        key={name}
                        className="px-3 py-1 rounded-full text-xs bg-purple-600/20 text-purple-300 border border-purple-500/30"
                      >
                        {name}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-500">Nenhum ministério vinculado</span>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-700 pt-5">
                <p className="text-xs text-gray-500 mb-2">Alterar senha (opcional)</p>
                <PasswordPolicyHint />
                <div className="space-y-3 mt-3">
                  <input
                    type="password"
                    placeholder="Nova senha"
                    className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                  />
                  <input
                    type="password"
                    placeholder="Confirmar nova senha"
                    className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white"
                    value={form.passwordConfirm}
                    onChange={e => setForm({ ...form, passwordConfirm: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="bg-gray-900 border-t border-gray-700 p-6 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
