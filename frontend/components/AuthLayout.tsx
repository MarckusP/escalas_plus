import React, { ReactNode } from 'react';
import Head from 'next/head';
import { useAuth } from '../hooks/useAuth';

export default function AuthLayout({ children, title = 'Escalas Plus - Login' }: { children: ReactNode, title?: string }) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-gray-800 p-8 rounded-xl shadow-2xl">
          <div className="text-center">
            <h2 className="mt-6 text-3xl font-extrabold text-white">Escalas Plus</h2>
            <p className="mt-2 text-sm text-gray-400">Gestão de voluntários</p>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
