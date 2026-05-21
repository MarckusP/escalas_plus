import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import {
  clearDevLogs,
  getDevLogs,
  isDevLogEnabled,
  subscribeDevLog,
  type DevLogEntry,
} from '../utils/devLogger';
import { X, Trash2, ClipboardCopy } from 'lucide-react';

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour12: false }) + '.' + String(ts % 1000).padStart(3, '0');
}

export default function DevLogPanel() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DevLogEntry[]>(() => getDevLogs());

  const canShowLog = isDevLogEnabled() && user?.role === 'super_admin';

  useEffect(() => {
    if (!canShowLog) return;
    setRows(getDevLogs());
    return subscribeDevLog(() => setRows(getDevLogs()));
  }, [canShowLog]);

  if (!canShowLog) return null;

  const meta = typeof navigator !== 'undefined' ? navigator.userAgent : '';

  const copyAll = async () => {
    const text = JSON.stringify(rows, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Fechar log de desenvolvimento' : 'Abrir log de desenvolvimento'}
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-36 md:bottom-6 left-4 md:left-auto md:right-6 z-[100001] rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/40 transition-colors ${
          open ? 'bg-gray-700 hover:bg-gray-600' : 'bg-indigo-600 hover:bg-indigo-500'
        }`}
      >
        Log
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100000] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-label="Log de desenvolvimento"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-[min(96vw,1200px)] max-h-[88vh] flex flex-col"
            onClick={e => e.stopPropagation()}
            role="document"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-700 shrink-0">
              <div>
                <h2 className="text-white font-bold text-sm">Log de desenvolvimento</h2>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Rota atual: <span className="text-gray-400">{router.pathname || '—'}</span> · {rows.length} registo
                  {rows.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={copyAll}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
                  title="Copiar JSON"
                >
                  <ClipboardCopy className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => clearDevLogs()}
                  className="p-2 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-gray-800"
                  title="Limpar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="overflow-auto flex-1 min-h-0 p-2">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="sticky top-0 bg-gray-950 z-10">
                  <tr className="border-b border-gray-700 text-gray-400 uppercase tracking-tight">
                    <th className="p-2 font-semibold whitespace-nowrap">Hora</th>
                    <th className="p-2 font-semibold">1 · Módulo / ecrã</th>
                    <th className="p-2 font-semibold">2 · Função / endpoint</th>
                    <th className="p-2 font-semibold whitespace-nowrap">3 · Posição (etapa)</th>
                    <th className="p-2 font-semibold min-w-[140px]">4 · Parâmetros / entrada</th>
                    <th className="p-2 font-semibold min-w-[140px]">5 · Saída</th>
                    <th className="p-2 font-semibold text-gray-500">Extra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500">
                        Sem registos ainda. Navegue ou chame a API para gerar entradas.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r: DevLogEntry) => (
                      <tr key={r.id} className="hover:bg-gray-800/50 align-top">
                        <td className="p-2 text-gray-500 whitespace-nowrap tabular-nums">{fmtTime(r.ts)}</td>
                        <td className="p-2 text-gray-300 max-w-[140px] break-all">{r.module}</td>
                        <td className="p-2 text-indigo-300 max-w-[220px] break-all">{r.functionOrEndpoint}</td>
                        <td className="p-2 text-amber-200/90 whitespace-nowrap">
                          <span title={r.traceId}>
                            {r.positionLabel}
                            <span className="text-gray-600 ml-1">#{r.position}</span>
                          </span>
                        </td>
                        <td className="p-2 font-mono text-gray-400 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                          {r.inputText}
                        </td>
                        <td className="p-2 font-mono text-emerald-200/90 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                          {r.outputText}
                        </td>
                        <td className="p-2 text-gray-500">
                          <span className="capitalize">{r.kind}</span>
                          <div className="text-[9px] text-gray-600 mt-0.5 truncate max-w-[72px]" title={r.traceId}>
                            {r.traceId}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-700 px-4 py-2 text-[10px] text-gray-500 shrink-0 space-y-1">
              <p>
                <strong className="text-gray-400">Trace:</strong> linhas com o mesmo fluxo HTTP partilham o mesmo{' '}
                <code className="text-gray-400">traceId</code> (posição 1 = entrada, 2 = saída).
              </p>
              {meta ? (
                <p className="truncate" title={meta}>
                  <strong className="text-gray-400">User-Agent:</strong> {meta}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
