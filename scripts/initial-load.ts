#!/usr/bin/env tsx

import { fullSync } from '../src/indexer/gitlab/sync.js';
import pino from 'pino';

const logger = pino({ name: 'initial-load' });

async function main() {
  logger.info('Starting initial document load');

  try {
    await fullSync();
    logger.info('Initial load complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Initial load failed');
    process.exit(1);
  }
}

main();
