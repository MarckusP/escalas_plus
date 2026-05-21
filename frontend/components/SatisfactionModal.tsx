import React, { useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export function satisfactionColor(score: number): string {
  const t = (Math.max(1, Math.min(10, score)) - 1) / 9;
  const r = Math.round(239 + (34 - 239) * t);
  const g = Math.round(68 + (197 - 68) * t);
  const b = Math.round(68 + (94 - 68) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

type Props = {
  open: boolean;
  onSubmitted: () => void;
};

export default function SatisfactionModal({ open, onSubmitted }: Props) {
  const [score, setScore] = useState(8);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post('/me/satisfaction', { score });
      toast.success('Obrigado pelo seu feedback!');
      onSubmitted();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Erro ao enviar resposta');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-white mb-2">Como você se sente servindo?</h2>
        <p className="text-sm text-gray-400 mb-6">
          Pesquisa mensal de satisfação. Sua resposta ajuda a melhorar as escalas (nota de 1 a 10).
        </p>

        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Insatisfeito</span>
            <span>Muito satisfeito</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={score}
            onChange={e => setScore(Number(e.target.value))}
            className="w-full accent-current"
            style={{ accentColor: satisfactionColor(score) }}
          />
          <div
            className="mt-4 text-center text-4xl font-black rounded-xl py-4 border"
            style={{
              color: satisfactionColor(score),
              borderColor: satisfactionColor(score),
              backgroundColor: `${satisfactionColor(score)}22`,
            }}
          >
            {score}
          </div>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="w-full py-3 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? 'Enviando...' : 'Enviar resposta'}
        </button>
      </div>
    </div>
  );
}
