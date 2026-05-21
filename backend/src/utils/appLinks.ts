const FRONTEND =
  process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export function appPath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${FRONTEND.replace(/\/$/, '')}${p}`;
}

export function magicLoginUrl(token: string, redirectPath: string): string {
  const base = FRONTEND.replace(/\/$/, '');
  return `${base}/auth/entrar?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirectPath)}`;
}
