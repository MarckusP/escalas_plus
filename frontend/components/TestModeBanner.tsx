import { getAppMode, showsEnvironmentBanner } from '../utils/appMode';

const BANNERS = {
  teste: {
    className: 'bg-red-600',
    text: 'AMBIENTE DE TESTES — dados e fluxos podem ser fictícios',
  },
  hml: {
    className: 'bg-amber-600',
    text: 'AMBIENTE DE HOMOLOGAÇÃO — ainda não é a versão oficial de produção',
  },
} as const;

export default function TestModeBanner() {
  if (!showsEnvironmentBanner()) return null;

  const mode = getAppMode();
  const cfg = mode === 'hml' ? BANNERS.hml : BANNERS.teste;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-[100002] h-6 flex items-center justify-center text-white text-[11px] font-semibold tracking-wide shadow-md ${cfg.className}`}
    >
      {cfg.text}
    </div>
  );
}
