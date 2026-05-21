import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../database';
import { assertPassword } from '../utils/passwordPolicy';

export async function login(email: string, password: string) {
  const { rows } = await pool.query(
    'SELECT * FROM volunteers WHERE email = $1 AND active = true', [email]
  );
  const user = rows[0];
  if (!user) throw new Error('Usuário não encontrado');
  if (user.status === 'pending') throw new Error('Seu cadastro está pendente de aprovação');
  if (user.status === 'rejected') throw new Error('Seu cadastro foi recusado');
  
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Senha incorreta');
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
  return {
    token,
    user: publicUserFromRow(user),
  };
}

/** super_admin nunca expõe church_id — controle global, sem filial. */
export function publicUserFromRow(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  status?: string;
  church_id?: number | null;
  satisfacao_resp?: number | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    church_id: user.role === 'super_admin' ? null : user.church_id ?? null,
    satisfacao_resp:
      user.role === 'voluntario' ? Number(user.satisfacao_resp ?? 0) : undefined,
  };
}

export async function register(data: {
  name: string;
  email: string;
  password: string;
  role?: string;
  church_id?: number | null;
  status?: string;
  phone_ddd?: string;
  phone_number?: string;
}) {
  const role = data.role || 'voluntario';
  let churchId: number | null = data.church_id ?? null;

  if (role === 'super_admin') {
    churchId = null;
  } else if (churchId == null) {
    throw new Error('church_id é obrigatório para este papel');
  }

  // Validação de telefone: obrigatório para todos exceto super_admin
  if (role !== 'super_admin') {
    if (!data.phone_ddd || !data.phone_number) {
      throw new Error('Telefone (DDD e número) é obrigatório para este perfil');
    }
    // Validação de formato: DDD com 2-3 dígitos, número com até 20 caracteres
    if (!/^\d{2,3}$/.test(data.phone_ddd)) {
      throw new Error('DDD inválido. Use 2 ou 3 dígitos');
    }
    if (!/^\d{4,9}-?\d{4}$/.test(data.phone_number.replace(/\D/g, ''))) {
      throw new Error('Número de telefone inválido. Use formato: (9)9999-9999');
    }
  }

  let status = data.status || 'pending';
  if (role === 'super_admin' || role === 'admin') {
    status = 'active';
  }

  assertPassword(data.password);
  const hash = await bcrypt.hash(data.password, 10);
  const { rows } = await pool.query(
    'INSERT INTO volunteers (name, email, password_hash, role, church_id, phone_ddd, phone_number, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,email,role,status,church_id,phone_ddd,phone_number',
    [data.name, data.email, hash, role, churchId, data.phone_ddd || null, data.phone_number || null, status]
  );
  return rows[0];
}

export async function updateVolunteerStatus(id: number, status: 'active' | 'rejected', church_id?: number | null) {
  if (church_id !== undefined) {
    const { rows } = await pool.query(
      'UPDATE volunteers SET status = $1, church_id = $2 WHERE id = $3 RETURNING id, name, status',
      [status, church_id, id]
    );
    return rows[0];
  } else {
    const { rows } = await pool.query(
      'UPDATE volunteers SET status = $1 WHERE id = $2 RETURNING id, name, status',
      [status, id]
    );
    return rows[0];
  }
}

export async function approveAdminGeneral(volunteerId: number) {
  const { rows } = await pool.query('SELECT id, role, status FROM volunteers WHERE id = $1', [volunteerId]);
  const vol = rows[0];
  if (!vol) throw new Error('Voluntário não encontrado');
  if (vol.role !== 'admin' && vol.role !== 'super_admin') throw new Error('Apenas administradores podem ser aprovados por esta função');
  if (vol.status !== 'pending') throw new Error('Administrador não está pendente');

  const { rows: updatedRows } = await pool.query(
    'UPDATE volunteers SET status = $1 WHERE id = $2 RETURNING id, name, role, status, church_id',
    ['active', volunteerId]
  );
  return updatedRows[0];
}
