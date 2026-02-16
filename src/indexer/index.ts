import express from 'express';
import { config } from '../config/index.js';
import { handleWebhook, verifyWebhookSignature } from './gitlab/webhook.js';
import type { GitLabWebhookPayload } from '../types/index.js';
import pino from 'pino';

const logger = pino({ name: 'indexer' });

const app = express();

// Parse raw body for webhook signature verification
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as unknown as { rawBody: Buffer }).rawBody = buf;
  },
}));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// GitLab webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-gitlab-token'] as string || '';
    const rawBody = (req as unknown as { rawBody: Buffer }).rawBody?.toString() || '';

    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Invalid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = req.body as GitLabWebhookPayload;

    if (payload.event !== 'push') {
      logger.info({ event: payload.event }, 'Ignoring non-push event');
      res.json({ status: 'ignored' });
      return;
    }

    // Process webhook asynchronously
    handleWebhook(payload).catch(error => {
      logger.error({ error }, 'Webhook processing failed');
    });

    res.json({ status: 'accepted' });
  } catch (error) {
    logger.error({ error }, 'Webhook handler error');
    res.status(500).json({ error: 'Internal server error' });
  }
});

const port = config.port + 1; // Use different port than MCP server

app.listen(port, config.host, () => {
  logger.info(`Indexer webhook server listening on ${config.host}:${port}`);
});
