export type AppRole = 'super_admin' | 'admin' | 'lider' | 'voluntario';

export function isStaffRole(role: string | undefined): boolean {
  return role === 'super_admin' || role === 'admin' || role === 'lider';
}

/** Rota inicial após login. */
export function homePathForRole(role: string): string {
  if (role === 'lider') return '/lider';
  if (role === 'super_admin' || role === 'admin') return '/admin';
  return '/escalas';
}
