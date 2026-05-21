import { PASSWORD_POLICY_HINT } from '../utils/passwordPolicy';

export default function PasswordPolicyHint() {
  return (
    <p className="text-[11px] text-gray-500 leading-snug">{PASSWORD_POLICY_HINT}</p>
  );
}
