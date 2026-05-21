import React, { useEffect, useState } from 'react';
import AppLayout from '../../../components/AppLayout';
import api from '../../../utils/api';
import toast from 'react-hot-toast';

export default function CheckIn() {
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [schedule, setSchedule] = useState([]);

  useEffect(() => {
    async function loadEvents() {
      const { data } = await api.get('/events');
      setEvents(data);
    }
    loadEvents();
  }, []);

  const loadCheckin = async (id: string) => {
    setSelectedEventId(id);
    if (!id) return;
    try {
      const { data } = await api.get(`/checkin/${id}`);
      setSchedule(data);
    } catch {
      toast.error('Erro ao carregar lista de presença');
    }
  };

  const markCheckin = async (scheduleId: number, status: string) => {
    try {
      await api.patch(`/checkin/${scheduleId}`, { status });
      toast.success(status === 'confirmado' ? 'Presença confirmada' : 'Marcado como recusado');
      loadCheckin(selectedEventId);
    } catch {
      toast.error('Erro ao marcar presença');
    }
  };

  return (
    <AppLayout title="Check-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-400">Confirmação de Escalas</h1>
      </div>

      <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 mb-6">
        <label className="block text-gray-400 mb-2 font-medium">Evento</label>
        <select 
          className="w-full lg:w-1/2 p-3 bg-gray-900 border border-gray-600 rounded text-white"
          value={selectedEventId} 
          onChange={e => loadCheckin(e.target.value)}
        >
          <option value="">Selecione...</option>
          {events.map((e: any) => <option key={e.id} value={e.id}>{e.name} - {new Date(e.event_date).toLocaleDateString()}</option>)}
        </select>
      </div>

      {selectedEventId && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden text-sm shadow-xl">
          <table className="w-full text-left">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="p-4 text-gray-400">Nome</th>
                <th className="p-4 text-gray-400">Função</th>
                <th className="p-4 text-gray-400">Confirmação de ida</th>
                <th className="p-4 text-gray-400 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {schedule.length === 0 ? (
                <tr><td colSpan={4} className="p-4 text-center text-gray-500">Sem voluntários escalados.</td></tr>
              ) : schedule.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-700/50">
                  <td className="p-4 text-white font-medium">{s.volunteer_name}</td>
                  <td className="p-4 text-gray-300">{s.role_name}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs rounded border capitalize ${
                      s.status === 'confirmado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      s.status === 'pendente' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                      'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {s.status === 'confirmado' ? 'Confirmou que vai' : s.status === 'recusado' ? 'Recusou' : 'Pendente'}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {s.status !== 'confirmado' && (
                      <button onClick={() => markCheckin(s.id, 'confirmado')} className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-600/50 px-3 py-1.5 rounded transition-colors font-medium">
                        ✓ Confirmou
                      </button>
                    )}
                    {s.status !== 'recusado' && (
                      <button onClick={() => markCheckin(s.id, 'recusado')} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/50 px-3 py-1.5 rounded transition-colors font-medium">
                        ✕ Recusou
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
