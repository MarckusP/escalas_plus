import { Router } from 'express';
import { authMiddleware, requireRole, AuthRequest } from '../middlewares/auth';
import * as whatsapp from '../services/whatsappBaileysService';

const router = Router();

router.get('/whatsapp/status', authMiddleware, requireRole('super_admin'), async (_req, res) => {
  try {
    const data = await whatsapp.getStatusFromDb();
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/whatsapp/sync-groups', authMiddleware, requireRole('super_admin'), async (_req, res) => {
  try {
    const groups = await whatsapp.syncGroupsToDb();
    res.json(groups);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/whatsapp/groups', authMiddleware, requireRole('super_admin'), async (_req, res) => {
  try {
    const groups = await whatsapp.listGroups();
    res.json(groups);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/whatsapp/groups/:jid', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const jid = decodeURIComponent(req.params.jid);
    await whatsapp.setGroupNotify(jid, !!req.body.notify_general);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/whatsapp/logout', authMiddleware, requireRole('super_admin'), async (_req, res) => {
  try {
    await whatsapp.logoutWhatsApp();
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
