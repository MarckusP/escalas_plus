import { Router } from 'express';
import { authMiddleware, requireRole } from '../middlewares/auth';
import { getAppMode, isProdMode } from '../utils/appMode';
import { syncProductionDatabaseToHomolog } from '../services/environmentSyncService';

const router = Router();

router.get('/admin/environments/info', authMiddleware, requireRole('super_admin'), (_req, res) => {
  res.json({
    app_mode: getAppMode(),
    can_sync_hml: isProdMode(),
    db_name: process.env.DB_NAME,
    db_prod: process.env.DB_NAME_PROD || 'escalas_prod',
    db_hml: process.env.DB_NAME_HML || 'escalas_hml',
    db_teste: process.env.DB_NAME_TESTE || 'escalas_teste',
  });
});

router.post(
  '/admin/environments/sync-hml-from-prod',
  authMiddleware,
  requireRole('super_admin'),
  async (_req, res) => {
    try {
      if (!isProdMode()) {
        return res.status(403).json({
          error:
            'Esta operação só está disponível no servidor de produção (APP_MODE=prod). Inicie o backend apontando para escalas_prod.',
        });
      }
      const result = await syncProductionDatabaseToHomolog();
      res.json({
        ok: true,
        message: 'Homologação substituída pela cópia atual de produção.',
        ...result,
      });
    } catch (e: any) {
      console.error('[sync-hml]', e);
      res.status(500).json({
        error: e.message || 'Falha ao copiar produção para homologação',
      });
    }
  }
);

export default router;
