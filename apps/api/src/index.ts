import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { v1Router } from './routes/v1';
import { startPharmacyWorker } from './jobs/workers/pharmacy-worker';
import { startReminderWorker } from './jobs/workers/reminder-worker';
import { startSriWorker } from './jobs/workers/sri-worker';
import { startSocialWorker } from './jobs/workers/social-worker';
import { startWhatsappWorker } from './jobs/workers/whatsapp-worker';
import { startEtlWorker } from './jobs/workers/etl-worker';
import { registerCronJobs } from './jobs/schedulers/cron';

const app = express();

// -------------------------------------------------------
// Security middleware
// -------------------------------------------------------
app.use(helmet());

app.use(cors({
  origin: env.API_CORS_ORIGINS.split(',').map((o) => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Rate limiting global — 200 req/min por IP
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta en un minuto' },
}));

// -------------------------------------------------------
// Body parsing
// -------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------
// Health check
// -------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] ?? '0.1.0',
  });
});

// -------------------------------------------------------
// API Routes
// -------------------------------------------------------
app.use('/api/v1', v1Router);

// -------------------------------------------------------
// Error handling (siempre al final)
// -------------------------------------------------------
app.use(notFoundHandler);
app.use(errorHandler);

// -------------------------------------------------------
// Start server
// -------------------------------------------------------
const server = app.listen(env.PORT, () => {
  if (env.NODE_ENV !== 'test') {
    console.warn(`MediCore API running on port ${env.PORT} [${env.NODE_ENV}]`);
  }
});

// -------------------------------------------------------
// BullMQ Workers + Cron (only in non-test env, requires Redis)
// -------------------------------------------------------
if (env.NODE_ENV !== 'test') {
  // Delay worker startup to allow Redis connection to establish
  setTimeout(() => {
    import('./config/redis').then(({ redis }) => {
      redis.ping()
        .then(() => {
          console.warn('[workers] Redis connected — starting background workers');
          startPharmacyWorker();
          startReminderWorker();
          startSriWorker();
          startSocialWorker();
          startWhatsappWorker();
          startEtlWorker();
          return registerCronJobs();
        })
        .catch((err: unknown) => {
          console.warn('[workers] Redis not available — running without background workers:', (err as Error).message);
        });
    }).catch((err: unknown) => {
      console.error('[workers] Failed to load redis config:', err);
    });
  }, 5000);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

export { app };
