import React from 'react';
import AppLayout from '../components/AppLayout';
import DashboardView from '../components/DashboardView';

export default function AdminDashboard() {
  return (
    <AppLayout title="Dashboard">
      <div className="mb-6">
        <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-indigo-500 tracking-tight">
          Dashboard
        </h1>
        <p className="text-gray-400 text-sm mt-1">Visão geral, métricas e análises em um só lugar</p>
      </div>
      <DashboardView />
    </AppLayout>
  );
}
