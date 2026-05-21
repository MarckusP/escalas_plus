/** Dashboards usam prefixo curto (/admin, /lider) — não devem ficar ativos em sub-rotas. */
const EXACT_MATCH_ONLY = new Set(['/admin', '/lider']);

export function isNavItemActive(pathname: string, itemPath: string): boolean {
  if (pathname === itemPath) return true;
  if (EXACT_MATCH_ONLY.has(itemPath)) return false;
  return pathname.startsWith(`${itemPath}/`);
}
