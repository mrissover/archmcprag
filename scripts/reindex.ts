#!/usr/bin/env tsx

import { fullSync } from '../src/indexer/gitlab/sync.js';
import { createVectorStore } from '../src/vectorstore/interface.js';
import { config } from '../src/config/index.js';
import pino from 'pino';

const logger = pino({ name: 'reindex' });

async function main() {
  const forceClean = process.argv.includes('--clean');

  logger.info({ forceClean }, 'Starting reindex');

  try {
    if (forceClean) {
      logger.info('Cleaning existing collection');
      const vectorStore = await createVectorStore(config.vectorStore);
      // Re-initialize will recreate collection if we drop it
      // For now, just do a full sync which will update existing records
    }

    await fullSync();
    logger.info('Reindex complete');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Reindex failed');
    process.exit(1);
  }
}

main();
