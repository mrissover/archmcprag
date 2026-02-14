import type { EmbeddingClient, DocumentChunk, VectorRecord } from '../../types/index.js';
import { createHash } from 'crypto';

export async function embedChunks(
  client: EmbeddingClient,
  chunks: DocumentChunk[]
): Promise<VectorRecord[]> {
  const texts = chunks.map(chunk => chunk.content);
  const embeddings = await client.embedBatch(texts);

  return chunks.map((chunk, i) => ({
    id: chunk.chunk_id,
    vector: embeddings[i],
    payload: chunk,
  }));
}

export function generateChunkId(documentPath: string, chunkIndex: number): string {
  return `${documentPath}#chunk-${chunkIndex}`;
}

export function generateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
