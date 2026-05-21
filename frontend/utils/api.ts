import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { isDevLogEnabled, pushDevLogPhase, safeStringify } from './devLogger';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
});

const PUBLIC_PAGE_PATHS = ['/login', '/voluntario-cadastro', '/auth/entrar'];
const PUBLIC_API_PATHS = [
  '/auth/login',
  '/auth/login/verify',
  '/auth/google',
  '/auth/magic',
  '/auth/register-public',
  '/auth/register/send-code',
  '/auth/register/verify-code',
  '/churches',
  '/public/signup-options',
];

function isPublicPage(): boolean {
  if (typeof window === 'undefined') return false;
  return PUBLIC_PAGE_PATHS.some(p => window.location.pathname === p);
}

function isPublicApiRequest(url?: string): boolean {
  if (!url) return false;
  const path = url.split('?')[0];
  return PUBLIC_API_PATHS.some(p => path === p || path.endsWith(p));
}

function redactHeaders(h: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!h || typeof h !== 'object') return h;
  const out = { ...h };
  if (out.Authorization) out.Authorization = '[redacted]';
  return out;
}

function logAxiosRequest(config: InternalAxiosRequestConfig) {
  if (!isDevLogEnabled()) return;
  const traceId = `http-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  (config as InternalAxiosRequestConfig & { __devTraceId?: string; __devStart?: number }).__devTraceId =
    traceId;
  (config as InternalAxiosRequestConfig & { __devTraceId?: string; __devStart?: number }).__devStart =
    typeof performance !== 'undefined' ? performance.now() : 0;

  const mod = typeof window !== 'undefined' ? window.location.pathname : '—';
  const endpoint = `${(config.method || 'get').toUpperCase()} ${config.baseURL || ''}${config.url || ''}`;
  const input = {
    params: config.params,
    data: config.data,
    headers: redactHeaders(config.headers as Record<string, unknown>),
  };

  pushDevLogPhase({
    traceId,
    module: mod,
    functionOrEndpoint: endpoint,
    position: 1,
    positionLabel: 'Entrada · pedido HTTP',
    inputText: safeStringify(input),
    outputText: '—',
    kind: 'http',
  });
}

function logAxiosResponseSuccess(res: AxiosResponse) {
  const cfg = res.config as InternalAxiosRequestConfig & { __devTraceId?: string; __devStart?: number };
  if (!isDevLogEnabled() || !cfg.__devTraceId) return;

  const ms =
    cfg.__devStart != null && typeof performance !== 'undefined'
      ? Math.round(performance.now() - cfg.__devStart)
      : undefined;
  const mod = typeof window !== 'undefined' ? window.location.pathname : '—';
  const endpoint = `${(res.config.method || 'get').toUpperCase()} ${res.config.baseURL || ''}${res.config.url || ''}`;

  pushDevLogPhase({
    traceId: cfg.__devTraceId,
    module: mod,
    functionOrEndpoint: endpoint,
    position: 2,
    positionLabel: ms != null ? `Saída · resposta HTTP (${ms} ms)` : 'Saída · resposta HTTP',
    inputText: `status ${res.status}`,
    outputText: safeStringify(res.data),
    kind: 'http',
  });
}

function logAxiosResponseError(err: {
  config?: InternalAxiosRequestConfig & { __devTraceId?: string; __devStart?: number };
  response?: { status?: number; data?: unknown };
  message?: string;
}) {
  const cfg = err.config;
  if (!isDevLogEnabled() || !cfg?.__devTraceId) return;

  const ms =
    cfg.__devStart != null && typeof performance !== 'undefined'
      ? Math.round(performance.now() - cfg.__devStart)
      : undefined;
  const mod = typeof window !== 'undefined' ? window.location.pathname : '—';
  const endpoint = `${(cfg.method || 'get').toUpperCase()} ${cfg.baseURL || ''}${cfg.url || ''}`;
  const out = {
    status: err.response?.status,
    data: err.response?.data,
    message: err.message,
  };

  pushDevLogPhase({
    traceId: cfg.__devTraceId,
    module: mod,
    functionOrEndpoint: endpoint,
    position: 2,
    positionLabel: ms != null ? `Saída · erro (${ms} ms)` : 'Saída · erro HTTP',
    inputText: err.response ? `HTTP ${err.response.status ?? '?'}` : 'Sem resposta',
    outputText: safeStringify(out),
    kind: 'http',
  });
}

api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  logAxiosRequest(config);
  return config;
});

api.interceptors.response.use(
  res => {
    logAxiosResponseSuccess(res);
    return res;
  },
  err => {
    logAxiosResponseError(err);
    const skipRedirect = (err.config as InternalAxiosRequestConfig & { skipAuthRedirect?: boolean })
      ?.skipAuthRedirect;
    if (
      err.response?.status === 401 &&
      typeof window !== 'undefined' &&
      !skipRedirect &&
      !isPublicPage() &&
      !isPublicApiRequest(err.config?.url)
    ) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
