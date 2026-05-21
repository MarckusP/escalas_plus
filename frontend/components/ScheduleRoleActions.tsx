import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { normalizeScheduleStatus } from '../utils/scheduleDisplay';

type Props = {
  roleName: string;
  status?: string;
  onConfirm: () => void;
  onReject: () => void;
  /** Estilo compacto (Minhas Escalas) ou cartão de eventos (Agenda) */
  variant?: 'compact' | 'card';
};

export default function ScheduleRoleActions({
  roleName,
  status,
  onConfirm,
  onReject,
  variant = 'compact',
}: Props) {
  const st = normalizeScheduleStatus(status);
  const label = roleName || 'Função';

  if (st !== 'pendente') {
    const statusLabel =
      st === 'confirmado' ? 'Confirmado' : st === 'recusado' ? 'Recusado' : 'Pendente';
    const statusClass =
      st === 'confirmado'
        ? 'text-emerald-400'
        : st === 'recusado'
          ? 'text-red-400'
          : 'text-amber-400';

    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-200 font-medium">{label}</span>
        <span className={`text-xs uppercase font-bold ${statusClass}`}>{statusLabel}</span>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onConfirm}
            className="py-2.5 px-3 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-emerald-600/25 text-emerald-200 border border-emerald-600/40 hover:bg-emerald-600/40"
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Confirmar
          </button>
          <button
            type="button"
            onClick={onReject}
            className="py-2.5 px-3 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-red-600/25 text-red-200 border border-red-600/40 hover:bg-red-600/40"
          >
            <XCircle className="w-3.5 h-3.5 shrink-0" /> Recusar
          </button>
        </div>
        <span className="text-[10px] font-bold text-gray-300 uppercase truncate min-w-0 flex-1">
          {label}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={onConfirm}
          className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors bg-emerald-600/25 text-emerald-200 border border-emerald-600/45 hover:bg-emerald-600/40"
        >
          Confirmar
        </button>
        <button
          type="button"
          onClick={onReject}
          className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors bg-red-600/25 text-red-200 border border-red-600/45 hover:bg-red-600/40"
        >
          Recusar
        </button>
      </div>
      <span className="text-sm text-gray-200 font-medium">{label}</span>
    </div>
  );
}

export function ScheduleRolesList({
  assignments,
  showStatus = true,
}: {
  assignments: { id?: number; role_name?: string | null; status?: string }[];
  showStatus?: boolean;
}) {
  if (assignments.length === 0) {
    return <span className="text-gray-500">—</span>;
  }

  return (
    <ul className="list-none space-y-1 text-gray-200">
      {assignments.map((a, i) => {
        const st = normalizeScheduleStatus(a.status);
        const suffix =
          showStatus && st !== 'pendente'
            ? st === 'confirmado'
              ? ' · confirmado'
              : ' · recusado'
            : showStatus && st === 'pendente'
              ? ' · pendente'
              : '';
        return (
          <li key={a.id ?? i} className="leading-snug">
            {a.role_name || 'Função'}
            {suffix ? <span className="text-gray-500 text-xs">{suffix}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
