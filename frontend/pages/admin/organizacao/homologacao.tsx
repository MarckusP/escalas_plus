import React, { useEffect, useState } from 'react';
import AppLayout from '../../../components/AppLayout';
import api from '../../../utils/api';
import toast from 'react-hot-toast';
import { Database, RefreshCw, AlertTriangle } from 'lucide-react';
import { getAppMode, isProdMode } from '../../../utils/appMode';

type EnvInfo = {
  app_mode: string;
  can_sync_hml: boolean;
  db_name?: string;
  db_prod: string;
  db_hml: string;
  db_teste: string;
};

export default function HomologacaoAdminPage() {
  const [info, setInfo] = useState<EnvInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  const mode = getAppMode();

  useEffect(() => {
    api
      .get('/admin/environments/info')
      .then(({ data }) => setInfo(data))
      .catch(() => toast.error('Não foi possível carregar informações do ambiente'));
  }, []);

  const syncFromProd = async () => {
    const ok = confirm(
      'Isso vai APAGAR todo o banco de homologação e substituir pela cópia atual de produção.\n\nDeseja continuar?'
    );
    if (!ok) return;

    setSyncing(true);
    try {
      const { data } = await api.post('/admin/environments/sync-hml-from-prod');
      toast.success(data.message || 'Homologação atualizada');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Falha na sincronização');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppLayout title="Homologação">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Database className="text-amber-400" />
          Homologação
        </h1>

        <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm text-gray-300 space-y-2">
          <p>
            <span className="text-gray-500">Modo do frontend:</span>{' '}
            <strong className="text-white uppercase">{mode}</strong>
          </p>
          {info && (
            <>
              <p>
                <span className="text-gray-500">Banco atual (API):</span> {info.db_name}
              </p>
              <p>
                <span className="text-gray-500">Produção:</span> {info.db_prod} —{' '}
                <span className="text-gray-500">Homologação:</span> {info.db_hml}
              </p>
            </>
          )}
        </div>

        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-4 flex gap-3">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-amber-100/90">
            <p className="font-medium text-amber-200">Três ambientes</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-amber-100/80">
              <li>
                <strong>teste</strong> — dados fictícios, faixa vermelha
              </li>
              <li>
                <strong>hml</strong> — igual produção, começa vazio; faixa âmbar (não é oficial)
              </li>
              <li>
                <strong>prod</strong> — versão oficial, sem faixa
              </li>
            </ul>
          </div>
        </div>

        {isProdMode() && info?.can_sync_hml ? (
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-5 space-y-4">
            <h2 className="text-lg font-semibold text-white">Copiar produção → homologação</h2>
            <p className="text-sm text-gray-400">
              Remove completamente o banco <code className="text-amber-300">{info.db_hml}</code> e
              recria com o conteúdo atual de{' '}
              <code className="text-green-300">{info.db_prod}</code>. Use antes de validar mudanças
              em homologação.
            </p>
            <button
              type="button"
              disabled={syncing}
              onClick={syncFromProd}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium"
            >
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Copiando…' : 'Substituir homologação pela produção'}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-700 bg-gray-800/80 p-4 text-sm text-gray-400">
            O botão de cópia só aparece com{' '}
            <code className="text-gray-300">NEXT_PUBLIC_APP_MODE=prod</code> e o backend em{' '}
            <code className="text-gray-300">APP_MODE=prod</code> conectado a{' '}
            <code className="text-gray-300">escalas_prod</code>.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
