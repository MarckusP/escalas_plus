export type PasswordValidation = { ok: boolean; errors: string[] };

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];
  const p = String(password || '');

  if (p.length < 8) errors.push('Mínimo de 8 caracteres');
  if (!/[a-z]/.test(p)) errors.push('Pelo menos uma letra minúscula');
  if (!/[A-Z]/.test(p)) errors.push('Pelo menos uma letra maiúscula');
  if (!/[0-9]/.test(p)) errors.push('Pelo menos um número');
  if (!/[^A-Za-z0-9]/.test(p)) errors.push('Pelo menos um caractere especial');

  return { ok: errors.length === 0, errors };
}

export const PASSWORD_POLICY_HINT =
  'Mín. 8 caracteres, com maiúscula, minúscula, número e caractere especial.';
