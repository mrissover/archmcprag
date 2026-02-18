import { createHmac } from 'crypto';
import { GitLabClient } from './client.js';
import { syncFile, deleteFile } from './sync.js';
import type { SyncDeps } from './sync.js';
import { config } from '../../config/index.js';
import type { GitLabWebhookPayload } from '../../types/index.js';
import pino from 'pino';

const logger = pino({ name: 'webhook' });

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!config.gitlab.webhookSecret) {
    logger.warn('Webhook secret not configured, skipping verification');
    return true;
  }

  const expected = createHmac('sha256', config.gitlab.webhookSecret)
    .update(payload)
    .digest('hex');

  return signature === expected;
}

export async function handleWebhook(payload: GitLabWebhookPayload, deps?: SyncDeps): Promise<void> {
  const gitlab = new GitLabClient();

  // Collect all changed markdown files
  const added = new Set<string>();
  const modified = new Set<string>();
  const removed = new Set<string>();

  for (const commit of payload.commits) {
    for (const file of commit.added) {
      if (file.endsWith('.md')) added.add(file);
    }
    for (const file of commit.modified) {
      if (file.endsWith('.md')) modified.add(file);
    }
    for (const file of commit.removed) {
      if (file.endsWith('.md')) removed.add(file);
    }
  }

  logger.info({
    added: added.size,
    modified: modified.size,
    removed: removed.size,
  }, 'Processing webhook changes');

  // Process removals
  for (const path of removed) {
    await deleteFile(path, deps);
  }

  // Process additions and modifications
  const toSync = [...added, ...modified];
  for (const path of toSync) {
    try {
      const file = await gitlab.getFile(path);
      await syncFile(file, deps);
    } catch (error) {
      logger.error({ path, error }, 'Failed to sync file');
    }
  }

  logger.info('Webhook processing complete');
}
