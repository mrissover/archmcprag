import type { EmbeddingClient, DocumentChunk, VectorRecord } from '../../types/index.js';
import { createHash } from 'crypto';

export async function embedChunks(
  client: EmbeddingClient,
  chunks: DocumentChunk[]
): Promise<VectorRecord[]> {
  const texts = chunks.map(chunk => chunk.content);
  const embeddings = await client.embedBatch(texts);

  return chunks.map((chunk, i) => ({
    id: chunkIdToUuid(chunk.chunk_id),
    vector: embeddings[i],
    payload: chunk,
  }));
}

export function generateChunkId(documentPath: string, chunkIndex: number): string {
  return `${documentPath}#chunk-${chunkIndex}`;
}

export function chunkIdToUuid(chunkId: string): string {
  const hex = createHash('sha256').update(chunkId).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function generateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
