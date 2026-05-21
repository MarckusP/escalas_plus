import { useState, FormEvent, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { homePathForRole } from '../utils/roles';
import AuthLayout from '../components/AuthLayout';
import toast from 'react-hot-toast';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Script from 'next/script';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [sessionId, setSessionId] = useState('');
  const [otpChannel, setOtpChannel] = useState<'email' | 'whatsapp'>('email');
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, loginVerify, loginWithGoogle, user } = useAuth();
  const router = useRouter();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (user) router.push(homePathForRole(user.role));
  }, [user, router]);

  const handleCredentials = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(identifier, password);
      toast.success('Login efetuado!');
    } catch (error: any) {
      if (error?.requires2fa) {
        setSessionId(error.sessionId);
        setOtpChannel(error.channel || 'email');
        setStep('otp');
        toast.success(
          error.channel === 'whatsapp'
            ? 'Código enviado no WhatsApp'
            : 'Código enviado (verifique o console em desenvolvimento)'
        );
      } else {
        toast.error(error.response?.data?.error || error.message || 'Erro ao entrar');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtp = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await loginVerify(sessionId, code);
      toast.success('Login confirmado!');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Código inválido');
    } finally {
      setIsLoading(false);
    }
  };

  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!googleClientId || step !== 'credentials') return;
    const g = (window as any).google;
    if (!g?.accounts?.id || !googleBtnRef.current) return;
    g.accounts.id.initialize({
      client_id: googleClientId,
      callback: (res: { credential: string }) => {
        loginWithGoogle(res.credential)
          .then(() => toast.success('Login com Google OK'))
          .catch((err: any) =>
            toast.error(err.response?.data?.error || 'Erro no login Google')
          );
      },
    });
    g.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline',
      size: 'large',
      width: 320,
    });
  }, [googleClientId, step, loginWithGoogle]);

  return (
    <AuthLayout title="Escalas Plus - Login">
      {googleClientId && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      )}

      {step === 'credentials' ? (
        <form className="mt-8 space-y-6" onSubmit={handleCredentials}>
          <div className="rounded-md shadow-sm space-y-4">
            <input
              required
              className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded sm:text-sm"
              placeholder="E-mail ou telefone (DDD + número)"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
            />
            <input
              required
              type="password"
              className="w-full px-3 py-2 border border-gray-600 bg-gray-700 text-white rounded sm:text-sm"
              placeholder="Senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Entrando...' : 'Continuar'}
          </button>
          {googleClientId && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <span className="text-xs text-gray-500">ou</span>
              <div ref={googleBtnRef} />
            </div>
          )}
          <p className="text-center text-xs text-gray-500">
            Após a senha, enviamos um código no canal escolhido no cadastro (e-mail ou WhatsApp).
          </p>
        </form>
      ) : (
        <form className="mt-8 space-y-6" onSubmit={handleOtp}>
          <p className="text-sm text-gray-400 text-center">
            Digite o código enviado por{' '}
            <strong>{otpChannel === 'whatsapp' ? 'WhatsApp' : 'e-mail'}</strong>
          </p>
          <input
            required
            maxLength={6}
            className="w-full px-3 py-2 text-center text-lg tracking-widest border border-gray-600 bg-gray-700 text-white rounded"
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Validando...' : 'Confirmar código'}
          </button>
          <button
            type="button"
            className="w-full text-sm text-gray-400 hover:text-white"
            onClick={() => setStep('credentials')}
          >
            Voltar
          </button>
        </form>
      )}

      <div className="text-center mt-6">
        <Link href="/voluntario-cadastro" className="text-blue-400 hover:text-blue-300 text-sm">
          Ainda não tem conta? Cadastre-se
        </Link>
      </div>
    </AuthLayout>
  );
}
