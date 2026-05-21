import React, { useEffect, useState } from 'react';
import AppLayout from '../../../components/AppLayout';
import api from '../../../utils/api';
import toast from 'react-hot-toast';
import { MessageCircle, RefreshCw, LogOut, Wifi, WifiOff } from 'lucide-react';
type Group = { jid: string; name: string; notify_general: boolean };

export default function WhatsAppAdminPage() {
  const [status, setStatus] = useState<any>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [st, gr] = await Promise.all([
        api.get('/whatsapp/status'),
        api.get('/whatsapp/groups'),
      ]);
      setStatus(st.data);
      setGroups(gr.data || []);
      if (st.data.qr) {
        setQrDataUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(st.data.qr)}`
        );
      } else {
        setQrDataUrl(null);
      }
    } catch {
      toast.error('Erro ao carregar WhatsApp');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const syncGroups = async () => {
    try {
      const { data } = await api.post('/whatsapp/sync-groups');
      setGroups(data || []);
      toast.success('Grupos sincronizados');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Falha ao sincronizar');
    }
  };

  const toggleGroup = async (jid: string, notify: boolean) => {
    try {
      await api.patch(`/whatsapp/groups/${encodeURIComponent(jid)}`, {
        notify_general: notify,
      });
      setGroups(prev => prev.map(g => (g.jid === jid ? { ...g, notify_general: notify } : g)));
    } catch {
      toast.error('Erro ao atualizar grupo');
    }
  };

  const logoutWa = async () => {
    if (!confirm('Desconectar WhatsApp?')) return;
    await api.post('/whatsapp/logout');
    toast.success('Sessão encerrada');
    load();
  };

  const connected = status.status === 'connected' || status.live === 'connected';

  return (
    <AppLayout title="WhatsApp">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <MessageCircle className="text-green-400" />
          WhatsApp — Admin Escalas
        </h1>
        <p className="text-sm text-gray-400">
          Conexão exclusiva do administrador geral. Notificações gerais vão para os grupos
          selecionados; individuais vão para o WhatsApp de cada voluntário verificado.
        </p>

        {loading ? (
          <p className="text-gray-500">Carregando...</p>
        ) : (
          <>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 flex flex-wrap items-center gap-4">
              {connected ? (
                <Wifi className="w-10 h-10 text-green-400" />
              ) : (
                <WifiOff className="w-10 h-10 text-red-400" />
              )}
              <div className="flex-1 min-w-[200px]">
                <p className="text-white font-semibold capitalize">
                  Status: {status.status || status.live || 'desconectado'}
                </p>
                {status.phone_number && (
                  <p className="text-sm text-gray-400">Número: {status.phone_number}</p>
                )}
              </div>
              <button
                type="button"
                onClick={load}
                className="p-2 rounded-lg bg-gray-700 text-gray-300 hover:text-white"
                title="Atualizar"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={logoutWa}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-600/20 text-red-300 hover:bg-red-600/40 text-sm"
              >
                <LogOut className="w-4 h-4" />
                Desconectar
              </button>
            </div>

            {qrDataUrl && !connected && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 text-center">
                <p className="text-white font-medium mb-4">Escaneie o QR Code no WhatsApp</p>
                <img src={qrDataUrl} alt="QR Code WhatsApp" className="mx-auto rounded-lg" />
              </div>
            )}

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white">Grupos para notificações gerais</h2>
                <button
                  type="button"
                  onClick={syncGroups}
                  disabled={!connected}
                  className="text-sm px-3 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-40"
                >
                  Sincronizar grupos
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {groups.length === 0 ? (
                  <p className="text-gray-500 text-sm">Nenhum grupo. Conecte e sincronize.</p>
                ) : (
                  groups.map(g => (
                    <label
                      key={g.jid}
                      className="flex items-center gap-3 p-3 rounded-lg bg-gray-900/60 border border-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={g.notify_general}
                        onChange={e => toggleGroup(g.jid, e.target.checked)}
                      />
                      <span className="text-sm text-white flex-1">{g.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
