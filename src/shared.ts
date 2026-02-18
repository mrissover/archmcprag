import { createVectorStore } from './vectorstore/interface.js';
import { createEmbeddingClient } from './indexer/embedding/client.js';
import { config } from './config/index.js';
import type { VectorStore, EmbeddingClient } from './types/index.js';

let vectorStoreInstance: VectorStore | null = null;
let embeddingClientInstance: EmbeddingClient | null = null;

export async function getVectorStore(): Promise<VectorStore> {
  if (!vectorStoreInstance) {
    vectorStoreInstance = await createVectorStore(config.vectorStore);
  }
  return vectorStoreInstance;
}

export function getEmbeddingClient(): EmbeddingClient {
  if (!embeddingClientInstance) {
    embeddingClientInstance = createEmbeddingClient();
  }
  return embeddingClientInstance;
}
