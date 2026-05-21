import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export type SameDayPendingItem = {
  kind: 'escala' | 'troca_alvo';
  schedule_id: number | null;
  swap_id: number | null;
  event_name: string;
  role_name: string | null;
  event_time: string | null;
  origin_label: string;
  detail: string | null;
};

function formatDatePt(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(t: string | null) {
  if (!t) return null;
  return String(t).slice(0, 5);
}

type Props = {
  open: boolean;
  eventDate: string;
  items: SameDayPendingItem[];
  confirming: boolean;
  onCancel: () => void;
  onConfirmAnyway: () => void;
};

export default function PendingSameDayModal({
  open,
  eventDate,
  items,
  confirming,
  onCancel,
  onConfirmAnyway,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100002] flex items-center justify-center p-4 bg-black/65"
      role="dialog"
      aria-modal="true"
      aria-labelledby="same-day-pending-title"
      onClick={onCancel}
    >
      <div
        className="bg-gray-800 border border-amber-500/40 rounded-xl shadow-2xl max-w-md w-full p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 id="same-day-pending-title" className="text-white font-bold text-lg leading-tight">
              Outras pendências neste dia
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {formatDatePt(eventDate)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-400 hover:text-white p-1"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-3">
          Você já tem confirmação pendente no mesmo dia. Pode continuar, mas verifique se consegue cumprir todas as escalas.
        </p>

        <ul className="space-y-2 max-h-52 overflow-y-auto mb-5">
          {items.map((item, i) => (
            <li
              key={`${item.kind}-${item.schedule_id ?? item.swap_id ?? i}`}
              className="bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            >
              <p className="font-medium text-white">{item.event_name}</p>
              <p className="text-xs text-amber-200/90 mt-0.5">{item.origin_label}</p>
              <p className="text-xs text-gray-400 mt-1">
                {item.role_name ? `Função: ${item.role_name}` : 'Função: —'}
                {formatTime(item.event_time) ? ` · ${formatTime(item.event_time)}` : ''}
              </p>
              {item.detail ? <p className="text-xs text-gray-500 mt-0.5">{item.detail}</p> : null}
            </li>
          ))}
        </ul>

        <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={onConfirmAnyway}
            disabled={confirming}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {confirming ? 'Confirmando…' : 'Confirmar mesmo assim'}
          </button>
        </div>
      </div>
    </div>
  );
}
