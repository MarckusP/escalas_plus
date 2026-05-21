import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runMigrations } from './database/runMigrations';
import { ensureEnvironmentDatabasesExist } from './database/ensureEnvironmentDatabases';
import { createInitialUsers } from './database/createInitialUsers';
import { seedDesenvFicticio } from './database/seedDesenvFicticio';
import { seedClosedTestCycle } from './database/seedClosedTestCycle';
import routes from './routes';
import { scheduleMonthlySatisfactionReset } from './services/satisfactionService';
import { scheduleNotificationPurge } from './services/notificationService';
import { initWhatsApp } from './services/whatsappBaileysService';
import { getAppMode, isTestMode } from './utils/appMode';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', routes);

const PORT = process.env.PORT || 3001;
const appMode = getAppMode();

ensureEnvironmentDatabasesExist()
  .then(() => runMigrations())
  .then(() => createInitialUsers())
  .then(() => (isTestMode() ? seedDesenvFicticio() : Promise.resolve()))
  .then(() => (isTestMode() ? seedClosedTestCycle() : Promise.resolve()))
  .then(() => {
    scheduleMonthlySatisfactionReset();
    scheduleNotificationPurge();
    initWhatsApp();
    app.listen(PORT, () => console.log(`✅ Backend rodando na porta ${PORT} (${appMode})`));
  })
  .catch(err => {
    console.error('Erro na inicialização:', err);
    process.exit(1);
  });
