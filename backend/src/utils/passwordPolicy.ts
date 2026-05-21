export type PasswordValidation = { ok: boolean; errors: string[] };

export function validatePassword(password: string): PasswordValidation {
  const errors: string[] = [];
  const p = String(password || '');

  if (p.length < 8) errors.push('Mínimo de 8 caracteres');
  if (!/[a-z]/.test(p)) errors.push('Pelo menos uma letra minúscula');
  if (!/[A-Z]/.test(p)) errors.push('Pelo menos uma letra maiúscula');
  if (!/[0-9]/.test(p)) errors.push('Pelo menos um número');
  if (!/[^A-Za-z0-9]/.test(p)) errors.push('Pelo menos um caractere especial (!@#$%&* etc.)');

  return { ok: errors.length === 0, errors };
}

export function assertPassword(password: string): void {
  const { ok, errors } = validatePassword(password);
  if (!ok) {
    throw new Error(`Senha fraca: ${errors.join('; ')}`);
  }
}
