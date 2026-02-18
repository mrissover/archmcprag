import { z } from 'zod';
import { getVectorStore } from '../../shared.js';
import type { ListDocumentsResponse } from '../../types/index.js';

export const listDocumentsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g., \'adr\', \'api\', \'integration\', \'security\')'),
  include_summaries: z.boolean().default(false).describe('Include brief summaries of each document (default: false)'),
});

export type ListDocumentsInput = z.infer<typeof listDocumentsSchema>;

export async function listDocuments(input: ListDocumentsInput): Promise<ListDocumentsResponse> {
  const vectorStore = await getVectorStore();

  const documents = await vectorStore.listDocuments(input.category);

  // If summaries requested, we could fetch first chunk of each document
  // For now, we don't include summaries to keep it simple
  const result: ListDocumentsResponse = {
    documents: documents.map(doc => ({
      ...doc,
      summary: input.include_summaries ? undefined : undefined, // TODO: Implement summaries
    })),
    total_count: documents.length,
  };

  return result;
}
