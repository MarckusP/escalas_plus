export type AppMode = 'teste' | 'hml' | 'prod';

function normalizeMode(raw: string): AppMode {
  const m = raw.toLowerCase().trim();
  if (m === 'hml' || m === 'homolog' || m === 'homologacao' || m === 'staging') return 'hml';
  if (m === 'prod' || m === 'producao' || m === 'production') return 'prod';
  return 'teste';
}

export function getAppMode(): AppMode {
  return normalizeMode(process.env.NEXT_PUBLIC_APP_MODE || 'teste');
}

export function isTestMode(): boolean {
  return getAppMode() === 'teste';
}

export function isHomologMode(): boolean {
  return getAppMode() === 'hml';
}

export function isProdMode(): boolean {
  return getAppMode() === 'prod';
}

/** Exibe faixa no topo (teste ou homologação — não é produção oficial). */
export function showsEnvironmentBanner(): boolean {
  return isTestMode() || isHomologMode();
}
