import React from 'react';
import AppLayout from '../components/AppLayout';
import DashboardView from '../components/DashboardView';
import { useAuth } from '../hooks/useAuth';

export default function LiderDashboard() {
  const { user } = useAuth();

  return (
    <AppLayout title="Dashboard Líder">
      <div className="mb-6">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">
          Bem-vindo, {user?.name}
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Métricas da sua igreja e dos ministérios que você lidera
        </p>
      </div>
      <DashboardView scopeHint="Os números e gráficos abaixo consideram apenas voluntários e eventos dos seus ministérios." />
    </AppLayout>
  );
}
