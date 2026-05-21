/** Papéis com maior privilégio primeiro (para exibição / comparações). */
export const ROLES = ['super_admin', 'admin', 'lider', 'voluntario'] as const;
export type AppRole = (typeof ROLES)[number];

/** super_admin satisfaz qualquer rota que liste admin, lider, etc. (exceto fluxos exclusivos de voluntário). */
export function canAccessRole(userRole: string, allowed: string[]): boolean {
  if (userRole === 'super_admin') {
    if (allowed.length === 0) return false;
    if (allowed.includes('voluntario') && allowed.length === 1) return false;
    return true;
  }
  return allowed.includes(userRole);
}

export function isSuperAdmin(role: string): boolean {
  return role === 'super_admin';
}

export function isStaff(role: string): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'lider';
}
