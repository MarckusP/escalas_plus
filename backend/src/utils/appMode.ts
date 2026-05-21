export type AppMode = 'teste' | 'hml' | 'prod';

function normalizeMode(raw: string): AppMode {
  const m = raw.toLowerCase().trim();
  if (m === 'hml' || m === 'homolog' || m === 'homologacao' || m === 'staging') return 'hml';
  if (m === 'prod' || m === 'producao' || m === 'production') return 'prod';
  return 'teste';
}

export function getAppMode(): AppMode {
  return normalizeMode(process.env.APP_MODE || 'teste');
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

/** Produção e homologação: sem seed fictício nem usuários demo. */
export function isProductionLikeMode(): boolean {
  return isProdMode() || isHomologMode();
}

export function defaultDatabaseName(mode: AppMode = getAppMode()): string {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  if (mode === 'teste') return 'escalas_teste';
  if (mode === 'hml') return 'escalas_hml';
  return 'escalas_prod';
}

export function getProdDatabaseName(): string {
  return process.env.DB_NAME_PROD || 'escalas_prod';
}

export function getHmlDatabaseName(): string {
  return process.env.DB_NAME_HML || 'escalas_hml';
}
