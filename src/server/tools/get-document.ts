import { z } from 'zod';
import { createVectorStore } from '../../vectorstore/interface.js';
import { config } from '../../config/index.js';
import type { GetDocumentResponse } from '../../types/index.js';
import { countWords } from '../../indexer/chunking/strategies.js';

export const getDocumentSchema = z.object({
  path: z.string().describe('Path to the document in the repository (e.g., \'adrs/0001-authentication-pattern.md\')'),
});

export type GetDocumentInput = z.infer<typeof getDocumentSchema>;

export async function getDocument(input: GetDocumentInput): Promise<GetDocumentResponse | { error: string }> {
  const vectorStore = await createVectorStore(config.vectorStore);

  // Get all chunks for this document
  const chunks = await vectorStore.getByDocumentPath(input.path);

  if (chunks.length === 0) {
    return { error: `Document not found: ${input.path}` };
  }

  // Reconstruct document from chunks (they're ordered by chunk_id)
  const sortedChunks = chunks.sort((a, b) => {
    const aIndex = parseInt(a.id.split('#chunk-')[1] || '0');
    const bIndex = parseInt(b.id.split('#chunk-')[1] || '0');
    return aIndex - bIndex;
  });

  const content = sortedChunks.map(chunk => chunk.payload.content).join('\n\n');
  const firstChunk = sortedChunks[0].payload;

  return {
    content,
    path: input.path,
    title: firstChunk.document_title,
    metadata: {
      ...firstChunk.metadata,
      word_count: countWords(content),
    },
  };
}
