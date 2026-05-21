import { useEffect } from 'react';
import { useRouter } from 'next/router';
import api from '../../utils/api';
import { useAuth } from '../../hooks/useAuth';
import { homePathForRole } from '../../utils/roles';
import toast from 'react-hot-toast';

export default function MagicEnterPage() {
  const router = useRouter();
  const { applySession } = useAuth();

  useEffect(() => {
    const token = router.query.token as string;
    const redirect = (router.query.redirect as string) || undefined;
    if (!token) return;

    api
      .get('/auth/magic', { params: { token } })
      .then(({ data }) => {
        applySession(data.token, data.user, data.redirect || redirect || homePathForRole(data.user.role));
        toast.success('Acesso liberado por 5 dias');
      })
      .catch((err: any) => {
        toast.error(err.response?.data?.error || 'Link expirado');
        router.replace('/login');
      });
  }, [router.query.token, applySession, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-300">
      Entrando...
    </div>
  );
}
