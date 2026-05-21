import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/auth';
import * as authExtended from '../services/authExtendedService';

const router = Router();

router.post('/auth/login', async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const id = identifier || email;
    const data = await authExtended.loginStart(id, password);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/login/verify', async (req, res) => {
  try {
    const { sessionId, code } = req.body;
    const data = await authExtended.loginVerify(sessionId, code);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/google', async (req, res) => {
  try {
    const data = await authExtended.loginWithGoogle(req.body.credential);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/auth/magic', async (req, res) => {
  try {
    const token = String(req.query.token || '');
    const data = await authExtended.magicLogin(token);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/register/send-code', async (req, res) => {
  try {
    const { channel, email, phone_ddd, phone_number } = req.body;
    const data = await authExtended.sendRegisterCode({
      channel: channel === 'whatsapp' ? 'whatsapp' : 'email',
      email,
      phone_ddd,
      phone_number,
    });
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/register/verify-code', async (req, res) => {
  try {
    const data = await authExtended.verifyRegisterCode(req.body);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/google/link', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await authExtended.linkGoogle(req.user!.id, req.body.credential);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
