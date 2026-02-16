import { z } from 'zod';
import { createVectorStore } from '../../vectorstore/interface.js';
import { createEmbeddingClient } from '../../indexer/embedding/client.js';
import { config } from '../../config/index.js';
import type { SearchResponse, SearchFilter } from '../../types/index.js';

export const searchSchema = z.object({
  query: z.string().describe('Natural language search query describing what you\'re looking for'),
  limit: z.number().min(1).max(20).default(5).describe('Maximum number of results to return (default: 5, max: 20)'),
  filter: z.object({
    category: z.string().optional().describe('Filter by document category (e.g., \'adr\', \'api\', \'integration\', \'security\')'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
  }).optional().describe('Optional filters to narrow results'),
});

export type SearchInput = z.infer<typeof searchSchema>;

export async function searchArchitectureDocs(input: SearchInput): Promise<SearchResponse> {
  const vectorStore = await createVectorStore(config.vectorStore);
  const embeddingClient = createEmbeddingClient();

  // Generate embedding for the query
  const queryVector = await embeddingClient.embed(input.query);

  // Build filter
  const filter: SearchFilter | undefined = input.filter
    ? {
        category: input.filter.category,
        tags: input.filter.tags,
      }
    : undefined;

  // Search vector store
  const results = await vectorStore.search(queryVector, input.limit, filter);

  // Transform results
  const searchResults = results.map(result => ({
    content: result.payload.content,
    document_path: result.payload.document_path,
    document_title: result.payload.document_title,
    section_header: result.payload.section_headers[result.payload.section_headers.length - 1] || '',
    relevance_score: result.score,
    metadata: result.payload.metadata,
  }));

  return {
    results: searchResults,
    total_results: searchResults.length,
  };
}
