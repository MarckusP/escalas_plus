/**
 * Registo de desenvolvimento (apenas em `next dev` / NODE_ENV=development no cliente).
 */

export type DevLogEntry = {
  id: string;
  ts: number;
  /** Módulo / ecrã (ex.: pathname) */
  module: string;
  /** Nome lógico ou método + URL */
  functionOrEndpoint: string;
  /** Pedaço/etapa da operação (1=entrada, 2=saída, …) */
  position: number;
  positionLabel: string;
  /** Parâmetros / texto de entrada */
  inputText: string;
  /** Saída da função / resposta */
  outputText: string;
  /** Agrupa pares requisição/resposta do mesmo pedido */
  traceId: string;
  kind: 'http' | 'manual' | 'system';
};

const MAX_ENTRIES = 400;
const listeners = new Set<() => void>();
let buffer: DevLogEntry[] = [];

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function isDevLogEnabled(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
}

export function safeStringify(value: unknown, maxLen = 14000): string {
  try {
    const s =
      typeof value === 'string'
        ? value
        : JSON.stringify(value, (_, v) => {
            if (typeof v === 'bigint') return String(v);
            return v;
          }, 2);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}\n… [truncado ${s.length - maxLen} caracteres]`;
  } catch {
    return String(value).slice(0, maxLen);
  }
}

export function pushDevLogPhase(entry: Omit<DevLogEntry, 'id' | 'ts' | 'kind'> & { kind?: DevLogEntry['kind'] }) {
  if (!isDevLogEnabled()) return;
  const row: DevLogEntry = {
    id: randomId(),
    ts: Date.now(),
    kind: entry.kind ?? 'http',
    module: entry.module,
    functionOrEndpoint: entry.functionOrEndpoint,
    position: entry.position,
    positionLabel: entry.positionLabel,
    inputText: entry.inputText,
    outputText: entry.outputText,
    traceId: entry.traceId,
  };
  buffer.unshift(row);
  while (buffer.length > MAX_ENTRIES) buffer.pop();
  listeners.forEach(fn => fn());
}

/** Log manual (por exemplo dentro de uma página): uma linha com entrada/saída e posição configurável. */
export function devLogManual(opts: {
  module: string;
  functionName: string;
  position?: number;
  positionLabel?: string;
  input?: unknown;
  output?: unknown;
}) {
  if (!isDevLogEnabled()) return;
  const pos = opts.position ?? 1;
  pushDevLogPhase({
    traceId: `m-${randomId()}`,
    module: opts.module,
    functionOrEndpoint: opts.functionName,
    position: pos,
    positionLabel: opts.positionLabel ?? `Etapa ${pos}`,
    inputText: opts.input !== undefined ? safeStringify(opts.input) : '—',
    outputText: opts.output !== undefined ? safeStringify(opts.output) : '—',
    kind: 'manual',
  });
}

export type DevLogManualOpts = Parameters<typeof devLogManual>[0];

/** Atalho para `devLogManual`. */
export function devLog(opts: DevLogManualOpts) {
  devLogManual(opts);
}

export function subscribeDevLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDevLogs(): DevLogEntry[] {
  return [...buffer];
}

export function clearDevLogs() {
  buffer = [];
  listeners.forEach(fn => fn());
}

export function pushSystemLog(module: string, message: string, detail?: unknown) {
  if (!isDevLogEnabled()) return;
  pushDevLogPhase({
    traceId: `sys-${randomId()}`,
    module,
    functionOrEndpoint: 'system',
    position: 1,
    positionLabel: 'Sistema',
    inputText: message,
    outputText: detail !== undefined ? safeStringify(detail) : '—',
    kind: 'system',
  });
}
