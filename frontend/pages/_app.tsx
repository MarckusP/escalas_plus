import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { AuthProvider } from '../hooks/useAuth';
import { NotificationProvider } from '../hooks/useNotifications';
import { Toaster } from 'react-hot-toast';
import TestModeBanner from '../components/TestModeBanner';
import { showsEnvironmentBanner } from '../utils/appMode';
import '../styles/globals.css';

const DevLogPanel =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('../components/DevLogPanel'), { ssr: false })
    : () => null;

export default function App({ Component, pageProps }: AppProps) {
  const testPadding = showsEnvironmentBanner() ? 'pt-6' : '';

  return (
    <AuthProvider>
      <NotificationProvider>
      <TestModeBanner />
      <Toaster
        position="top-right"
        containerStyle={showsEnvironmentBanner() ? { top: 28 } : undefined}
        toastOptions={{
          style: {
            background: '#333',
            color: '#fff',
          },
        }}
      />
      <div className={testPadding}>
        <Component {...pageProps} />
      </div>
      <DevLogPanel />
      </NotificationProvider>
    </AuthProvider>
  );
}
