import React from 'react';
import { useRouter } from 'next/router';
import { Bell, X, CheckCheck } from 'lucide-react';
import {
  useNotifications,
  notificationAccent,
  type AppNotification,
} from '../hooks/useNotifications';

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function NotificationListItem({
  n,
  onOpen,
}: {
  n: AppNotification;
  onOpen: (n: AppNotification) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={`w-full text-left p-3 rounded-lg border border-gray-700/80 hover:bg-gray-700/50 transition-colors border-l-4 ${notificationAccent(n.type)} ${
        !n.read_at ? 'bg-gray-800/80' : 'bg-gray-900/40 opacity-80'
      }`}
    >
      <p className="text-sm font-semibold text-white">{n.title}</p>
      {n.body && <p className="text-xs text-gray-400 mt-0.5">{n.body}</p>}
      <p className="text-[10px] text-gray-500 mt-1">{formatWhen(n.created_at)}</p>
    </button>
  );
}

export default function NotificationCenter() {
  const router = useRouter();
  const {
    items,
    unread,
    panelOpen,
    setPanelOpen,
    markRead,
    markAllRead,
  } = useNotifications();

  const openItem = async (n: AppNotification) => {
    if (!n.read_at) await markRead(n.id);
    setPanelOpen(false);
    if (n.link_path) router.push(n.link_path);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setPanelOpen(!panelOpen)}
        className="fixed bottom-20 md:bottom-6 right-4 z-[100055] w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-black/50 flex items-center justify-center transition-transform active:scale-95"
      >
        <Bell className="w-6 h-6" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {panelOpen && (
        <>
          <div
            className="fixed inset-0 z-[100054] bg-black/40 md:bg-transparent"
            onClick={() => setPanelOpen(false)}
            aria-hidden
          />
          <div
            className="fixed z-[100056] bottom-36 md:bottom-24 right-4 w-[calc(100vw-2rem)] max-w-md max-h-[min(70vh,520px)] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
            role="dialog"
            aria-label="Notificações"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
              <h2 className="font-bold text-white">Notificações</h2>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="p-2 text-gray-400 hover:text-white rounded-lg"
                    title="Marcar todas como lidas"
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="p-2 text-gray-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {items.length === 0 ? (
                <p className="text-center text-gray-500 text-sm py-8">Nenhuma notificação</p>
              ) : (
                items.map(n => (
                  <NotificationListItem key={n.id} n={n} onOpen={openItem} />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
