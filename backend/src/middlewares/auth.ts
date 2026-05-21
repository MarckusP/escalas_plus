import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../database';
import { canAccessRole } from '../utils/rbac';

export interface AuthRequest extends Request {
  user?: { id: number; role: string; email: string; church_id: number | null };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Token não fornecido' });
    return;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: number };
    const { rows } = await pool.query(
      'SELECT id, email, role, church_id FROM volunteers WHERE id = $1 AND active = true',
      [decoded.id]
    );
    if (!rows[0]) {
      res.status(401).json({ error: 'Sessão inválida' });
      return;
    }
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !canAccessRole(req.user.role, roles)) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    next();
  };
}
