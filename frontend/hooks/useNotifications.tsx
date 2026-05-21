import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import api from '../utils/api';
import { useAuth } from './useAuth';

export type AppNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

type Ctx = {
  items: AppNotification[];
  unread: number;
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  toastCard: AppNotification | null;
};

const NotificationContext = createContext<Ctx | null>(null);

const TYPE_COLORS: Record<string, string> = {
  event_created: 'border-l-blue-500',
  schedule_assigned: 'border-l-cyan-500',
  schedule_pending: 'border-l-amber-500',
  swap: 'border-l-purple-500',
  registration_pending: 'border-l-rose-500',
  task_pending: 'border-l-pink-500',
  task_due_soon: 'border-l-red-500',
};

export function notificationAccent(type: string) {
  return TYPE_COLORS[type] || 'border-l-gray-500';
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toastCard, setToastCard] = useState<AppNotification | null>(null);
  const toastQueueRef = useRef<AppNotification[]>([]);
  const toastBusyRef = useRef(false);

  const drainToastQueue = useCallback(() => {
    if (toastBusyRef.current) return;
    const next = toastQueueRef.current.shift();
    if (!next) {
      setToastCard(null);
      return;
    }
    toastBusyRef.current = true;
    setToastCard(next);
    api.post(`/notifications/${next.id}/toast-shown`).catch(() => {});
    setTimeout(() => {
      toastBusyRef.current = false;
      setToastCard(null);
      setTimeout(drainToastQueue, 80);
    }, 500);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/notifications/sync');
      setItems(data.items || []);
      setUnread(data.unread ?? 0);
      const toasts: AppNotification[] = data.toasts || [];
      if (toasts.length > 0) {
        toastQueueRef.current.push(...toasts);
        drainToastQueue();
      }
    } catch {
      /* ignore */
    }
  }, [user, drainToastQueue]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }
    refresh();
    const t = setInterval(refresh, 45000);
    return () => clearInterval(t);
  }, [user?.id, refresh]);

  const markRead = useCallback(
    async (id: number) => {
      const { data } = await api.post(`/notifications/${id}/read`);
      setUnread(data.unread ?? 0);
      setItems(prev =>
        prev.map(n => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    },
    []
  );

  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all');
    setUnread(0);
    setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  }, []);

  const openNotification = useCallback(
    async (n: AppNotification) => {
      if (!n.read_at) await markRead(n.id);
      setPanelOpen(false);
      if (n.link_path) router.push(n.link_path);
    },
    [markRead, router]
  );

  return (
    <NotificationContext.Provider
      value={{
        items,
        unread,
        panelOpen,
        setPanelOpen,
        refresh,
        markRead,
        markAllRead,
        toastCard,
      }}
    >
      {children}
      {/* Popup estilo Windows */}
      {toastCard && (
        <button
          type="button"
          onClick={() => openNotification(toastCard)}
          className={`fixed bottom-24 md:bottom-8 right-4 z-[100060] max-w-sm w-[calc(100vw-2rem)] text-left bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-4 border-l-4 transition-all ${notificationAccent(toastCard.type)}`}
        >
          <p className="text-sm font-bold text-white">{toastCard.title}</p>
          {toastCard.body && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{toastCard.body}</p>
          )}
        </button>
      )}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}

export function useNotificationsOptional() {
  return useContext(NotificationContext);
}
