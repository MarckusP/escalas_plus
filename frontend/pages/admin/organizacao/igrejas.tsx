import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AppLayout from '../../../components/AppLayout';
import { useAuth } from '../../../hooks/useAuth';
import api from '../../../utils/api';
import toast from 'react-hot-toast';

export default function IgrejasPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [churches, setChurches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'super_admin') {
      router.replace('/admin');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/churches');
        setChurches(data);
      } catch {
        toast.error('Erro ao carregar igrejas');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/churches', { name, address });
      toast.success('Igreja criada');
      setName('');
      setAddress('');
      const { data } = await api.get('/churches');
      setChurches(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao criar igreja');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <AppLayout title="Igrejas">
      <div className="mb-6">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-400">
          Igrejas
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Cadastro de novas igrejas no sistema. Apenas super administrador pode criar igrejas; depois atribua um administrador por igreja em Voluntários.
        </p>
      </div>

      <form onSubmit={handleCreate} className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-8 space-y-4 max-w-xl">
        <h2 className="text-lg font-semibold text-white">Nova igreja</h2>
        <input
          required
          placeholder="Nome"
          className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Endereço (opcional)"
          className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-white"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button
          type="submit"
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Criar igreja'}
        </button>
      </form>

      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <h2 className="p-4 border-b border-gray-700 text-white font-semibold">Igrejas cadastradas</h2>
        {loading ? (
          <p className="p-4 text-gray-400">Carregando...</p>
        ) : (
          <ul className="divide-y divide-gray-700">
            {churches.map((c) => (
              <li key={c.id} className="p-4 flex flex-col sm:flex-row sm:justify-between gap-1">
                <span className="text-white font-medium">{c.name}</span>
                <span className="text-gray-400 text-sm">{c.address || '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}
