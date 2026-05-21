import React, { ReactNode, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import SatisfactionModal from './SatisfactionModal';
import NotificationCenter from './NotificationCenter';
import MobileBottomNav from './MobileBottomNav';
import {
  Calendar,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  CheckSquare,
  Activity,
  Building2,
  MessageCircle,
  Database,
} from 'lucide-react';
import { isNavItemActive } from '../utils/nav';

export default function AppLayout({ children, title = 'Escalas Plus' }: { children: ReactNode, title?: string }) {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [satisfactionOpen, setSatisfactionOpen] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'voluntario') return;
    api
      .get('/me/satisfaction-status')
      .then(({ data }) => {
        if (data.needs_response) setSatisfactionOpen(true);
      })
      .catch(() => {});
  }, [user?.id, user?.role]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    if (typeof window !== 'undefined') router.push('/login');
    return null;
  }

  const adminNav = [
    { label: 'Dashboard', path: '/admin', icon: Activity },
    { label: 'Eventos', path: '/admin/organizacao/eventos', icon: Calendar },
    { label: 'Voluntários', path: '/admin/pessoas/voluntarios', icon: Users },
    { label: 'Check-in', path: '/admin/pessoas/checkin', icon: CheckSquare },
    { label: 'Departamentos', path: '/admin/organizacao/departamentos', icon: Settings },
    { label: 'Trocas', path: '/trocas', icon: Activity },
    { label: 'Tarefas', path: '/tarefas', icon: CheckSquare },
  ];

  const navItems: Record<string, typeof adminNav> = {
    admin: adminNav,
    super_admin: [
      ...adminNav,
      { label: 'Igrejas', path: '/admin/organizacao/igrejas', icon: Building2 },
      { label: 'WhatsApp', path: '/admin/organizacao/whatsapp', icon: MessageCircle },
      { label: 'Homologação', path: '/admin/organizacao/homologacao', icon: Database },
    ],
    lider: [
      { label: 'Dashboard', path: '/lider', icon: Activity },
      { label: 'Eventos', path: '/admin/organizacao/eventos', icon: Calendar },
      { label: 'Voluntários', path: '/admin/pessoas/voluntarios', icon: Users },
      { label: 'Check-in', path: '/admin/pessoas/checkin', icon: CheckSquare },
      { label: 'Tarefas', path: '/tarefas', icon: CheckSquare },
      { label: 'Trocas', path: '/trocas', icon: Activity },
      { label: 'Disponibilidade', path: '/disponibilidade', icon: Calendar },
    ],
    voluntario: [
      { label: 'Escalas', path: '/escalas', icon: Calendar },
      { label: 'Disponib.', path: '/disponibilidade', icon: Calendar },
      { label: 'Trocas', path: '/trocas', icon: Activity },
      { label: 'Tarefas', path: '/tarefas', icon: CheckSquare },
      { label: 'Perfil', path: '/perfil', icon: Settings },
    ],
  };

  const menu = navItems[user.role] || navItems.voluntario;

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <SatisfactionModal
        open={satisfactionOpen}
        onSubmitted={() => setSatisfactionOpen(false)}
      />
      <NotificationCenter />
      <div className="flex bg-gray-900 min-h-screen text-gray-100">
        <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col hidden md:flex">
          <div className="p-4 flex items-center space-x-2 border-b border-gray-700">
            <ClipboardList className="h-6 w-6 text-blue-500" />
            <span className="text-xl font-bold">Escalas Plus</span>
          </div>

          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {menu.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(router.pathname, item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-700 bg-gray-800/50 flex items-center justify-between">
            <div className="flex flex-col truncate pr-2">
              <span className="text-sm font-medium text-white truncate">{user.name}</span>
              <span className="text-xs text-gray-400 capitalize">{user.role}</span>
            </div>
            <button
              onClick={logout}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md"
              title="Sair"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
          <div className="p-4 md:p-6">{children}</div>
        </main>
      </div>
      <MobileBottomNav menu={menu} />
    </>
  );
}
