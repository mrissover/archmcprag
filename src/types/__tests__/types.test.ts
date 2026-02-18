import { describe, it, expect } from 'vitest';
import type {
  DocumentMetadata,
  DocumentChunk,
  Document,
  SearchFilter,
  SearchResult,
  SearchResponse,
  DocumentListItem,
  ListDocumentsResponse,
  GetDocumentResponse,
  VectorRecord,
  VectorSearchResult,
  GitLabFile,
  GitLabWebhookPayload,
  EmbeddingClient,
  VectorStore,
} from '../index.js';

describe('types', () => {
  it('exports all type interfaces', () => {
    // Compile-time type check: create objects conforming to each interface
    const metadata: DocumentMetadata = {
      category: 'adr',
      tags: ['auth'],
      last_modified: '2024-01-01',
      author: 'test',
    };

    const chunk: DocumentChunk = {
      chunk_id: 'test#chunk-0',
      document_path: 'test.md',
      document_title: 'Test',
      section_headers: [],
      content: 'content',
      metadata,
      full_content_hash: 'abc',
    };

    const doc: Document = {
      path: 'test.md',
      title: 'Test',
      content: 'content',
      metadata: { ...metadata, word_count: 1 },
    };

    const filter: SearchFilter = { category: 'adr', tags: ['auth'] };

    const searchResult: SearchResult = {
      content: 'c',
      document_path: 'p',
      document_title: 't',
      section_header: 'h',
      relevance_score: 0.9,
      metadata,
    };

    const searchResponse: SearchResponse = { results: [searchResult], total_results: 1 };

    const listItem: DocumentListItem = {
      path: 'p',
      title: 't',
      category: 'adr',
      tags: [],
      last_modified: '',
    };

    const listResponse: ListDocumentsResponse = { documents: [listItem], total_count: 1 };

    const getDocResponse: GetDocumentResponse = {
      content: 'c',
      path: 'p',
      title: 't',
      metadata: { ...metadata, word_count: 10 },
    };

    const vectorRecord: VectorRecord = { id: 'id', vector: [0.1], payload: chunk };

    const vectorSearchResult: VectorSearchResult = { id: 'id', score: 0.9, payload: chunk };

    const file: GitLabFile = { path: 'f.md', content: 'c', last_modified: '', author: '' };

    const webhookPayload: GitLabWebhookPayload = {
      event: 'push',
      commits: [{ added: [], modified: [], removed: [] }],
    };

    // Verify objects were created (runtime check)
    expect(metadata).toBeDefined();
    expect(chunk).toBeDefined();
    expect(doc).toBeDefined();
    expect(filter).toBeDefined();
    expect(searchResponse).toBeDefined();
    expect(listResponse).toBeDefined();
    expect(getDocResponse).toBeDefined();
    expect(vectorRecord).toBeDefined();
    expect(vectorSearchResult).toBeDefined();
    expect(file).toBeDefined();
    expect(webhookPayload).toBeDefined();
  });
});
