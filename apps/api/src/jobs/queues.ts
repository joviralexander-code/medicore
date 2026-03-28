/**
 * Definición de colas BullMQ
 * Importar desde aquí en workers y schedulers
 */

import { Queue } from 'bullmq';
import { redis } from '../config/redis';

const connection = redis;

export const queues = {
  pharmacy: new Queue('pharmacy-scrape', { connection }),
  pdf:      new Queue('pdf-generate', { connection }),
  sri:      new Queue('sri-transmit', { connection }),
  social:   new Queue('social-post', { connection }),
  whatsapp: new Queue('whatsapp-send', { connection }),
  reminder: new Queue('appointment-reminder', { connection }),
  etl:      new Queue('data-etl', { connection }),
} as const;

export type QueueName = keyof typeof queues;
