import type { AuthRequest } from '../middlewares/auth';
import { isSuperAdmin } from '../utils/rbac';
import { leaderDepartmentIds } from './accessService';

export type ReportScope = {
  isSuper: boolean;
  isLider: boolean;
  churchId: number | null;
  leaderDeptIds: number[];
};

export async function getReportScope(req: AuthRequest): Promise<ReportScope> {
  const u = req.user!;
  const isLider = u.role === 'lider';
  return {
    isSuper: isSuperAdmin(u.role),
    isLider,
    churchId: u.church_id ?? null,
    leaderDeptIds: isLider ? await leaderDepartmentIds(u.id) : [],
  };
}

/** Params: $1 isSuper, $2 churchId, $3 isLider, $4 leaderDeptIds */
export function scopeParams(scope: ReportScope): [
  boolean,
  number | null,
  boolean,
  number[],
] {
  return [scope.isSuper, scope.churchId, scope.isLider, scope.leaderDeptIds];
}
