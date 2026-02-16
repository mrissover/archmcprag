import { GitLabClient } from './client.js';
import { chunkMarkdown } from '../chunking/markdown.js';
import { createEmbeddingClient } from '../embedding/client.js';
import { embedChunks } from '../embedding/batch.js';
import { createVectorStore } from '../../vectorstore/interface.js';
import { config } from '../../config/index.js';
import type { GitLabFile, DocumentChunk } from '../../types/index.js';
import pino from 'pino';

const logger = pino({ name: 'sync' });

export async function fullSync(): Promise<void> {
  logger.info('Starting full sync');

  const gitlab = new GitLabClient();
  const vectorStore = await createVectorStore(config.vectorStore);
  const embeddingClient = createEmbeddingClient();

  await vectorStore.initialize();

  // Get all markdown files
  const filePaths = await gitlab.listMarkdownFiles();
  logger.info(`Found ${filePaths.length} files to process`);

  // Process files in batches
  const batchSize = 10;
  let totalChunks = 0;

  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    logger.info(`Processing batch ${i / batchSize + 1}/${Math.ceil(filePaths.length / batchSize)}`);

    const files = await gitlab.getFiles(batch);
    const allChunks: DocumentChunk[] = [];

    for (const file of files) {
      const chunks = chunkMarkdown(file);
      allChunks.push(...chunks);
    }

    if (allChunks.length > 0) {
      const records = await embedChunks(embeddingClient, allChunks);
      await vectorStore.upsert(records);
      totalChunks += allChunks.length;
    }
  }

  logger.info(`Full sync complete. Indexed ${totalChunks} chunks from ${filePaths.length} files`);
}

export async function syncFile(file: GitLabFile): Promise<void> {
  const vectorStore = await createVectorStore(config.vectorStore);
  const embeddingClient = createEmbeddingClient();

  // Delete existing chunks for this file
  await vectorStore.deleteByDocumentPath(file.path);

  // Chunk and embed
  const chunks = chunkMarkdown(file);
  if (chunks.length > 0) {
    const records = await embedChunks(embeddingClient, chunks);
    await vectorStore.upsert(records);
  }

  logger.info(`Synced file: ${file.path} (${chunks.length} chunks)`);
}

export async function deleteFile(path: string): Promise<void> {
  const vectorStore = await createVectorStore(config.vectorStore);
  await vectorStore.deleteByDocumentPath(path);
  logger.info(`Deleted file from index: ${path}`);
}
