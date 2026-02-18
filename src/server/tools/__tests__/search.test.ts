import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVectorStore = {
  initialize: vi.fn(),
  reset: vi.fn(),
  upsert: vi.fn(),
  search: vi.fn(),
  delete: vi.fn(),
  deleteByDocumentPath: vi.fn(),
  getByDocumentPath: vi.fn(),
  listDocuments: vi.fn(),
};

const mockEmbeddingClient = {
  embed: vi.fn(),
  embedBatch: vi.fn(),
};

vi.mock('../../../shared.js', () => ({
  getVectorStore: () => Promise.resolve(mockVectorStore),
  getEmbeddingClient: () => mockEmbeddingClient,
}));

import { searchArchitectureDocs, searchSchema } from '../search.js';

describe('searchSchema', () => {
  it('requires query string', () => {
    const result = searchSchema.safeParse({ query: 'test' });
    expect(result.success).toBe(true);
  });

  it('defaults limit to 5', () => {
    const result = searchSchema.parse({ query: 'test' });
    expect(result.limit).toBe(5);
  });

  it('enforces limit bounds 1-20', () => {
    expect(searchSchema.safeParse({ query: 'test', limit: 0 }).success).toBe(false);
    expect(searchSchema.safeParse({ query: 'test', limit: 21 }).success).toBe(false);
    expect(searchSchema.safeParse({ query: 'test', limit: 1 }).success).toBe(true);
    expect(searchSchema.safeParse({ query: 'test', limit: 20 }).success).toBe(true);
  });

  it('allows optional filter', () => {
    const result = searchSchema.parse({
      query: 'test',
      filter: { category: 'adr', tags: ['auth'] },
    });
    expect(result.filter?.category).toBe('adr');
    expect(result.filter?.tags).toEqual(['auth']);
  });
});

describe('searchArchitectureDocs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('embeds query and searches vector store', async () => {
    mockEmbeddingClient.embed.mockResolvedValue([0.1, 0.2, 0.3]);
    mockVectorStore.search.mockResolvedValue([
      {
        id: 'doc.md#chunk-0',
        score: 0.95,
        payload: {
          content: 'test content',
          document_path: 'doc.md',
          document_title: 'Test Doc',
          section_headers: ['Section'],
          metadata: { category: 'adr', tags: ['auth'], last_modified: '2024-01-01', author: 'alice' },
        },
      },
    ]);

    const result = await searchArchitectureDocs({ query: 'test', limit: 5 });

    expect(mockEmbeddingClient.embed).toHaveBeenCalledWith('test');
    expect(mockVectorStore.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, undefined);
    expect(result.total_results).toBe(1);
    expect(result.results[0].content).toBe('test content');
    expect(result.results[0].document_path).toBe('doc.md');
    expect(result.results[0].section_header).toBe('Section');
    expect(result.results[0].relevance_score).toBe(0.95);
  });

  it('passes filter to vector store search', async () => {
    mockEmbeddingClient.embed.mockResolvedValue([0.1]);
    mockVectorStore.search.mockResolvedValue([]);

    await searchArchitectureDocs({
      query: 'test',
      limit: 5,
      filter: { category: 'api', tags: ['rest'] },
    });

    expect(mockVectorStore.search).toHaveBeenCalledWith(
      [0.1],
      5,
      { category: 'api', tags: ['rest'] }
    );
  });

  it('handles empty results', async () => {
    mockEmbeddingClient.embed.mockResolvedValue([0.1]);
    mockVectorStore.search.mockResolvedValue([]);

    const result = await searchArchitectureDocs({ query: 'nonexistent', limit: 5 });

    expect(result.results).toEqual([]);
    expect(result.total_results).toBe(0);
  });

  it('uses last section header', async () => {
    mockEmbeddingClient.embed.mockResolvedValue([0.1]);
    mockVectorStore.search.mockResolvedValue([
      {
        id: 'doc.md#chunk-0',
        score: 0.9,
        payload: {
          content: 'c',
          document_path: 'doc.md',
          document_title: 'Doc',
          section_headers: ['H1', 'H2', 'H3'],
          metadata: { category: '', tags: [], last_modified: '', author: '' },
        },
      },
    ]);

    const result = await searchArchitectureDocs({ query: 'test', limit: 5 });
    expect(result.results[0].section_header).toBe('H3');
  });

  it('handles empty section headers', async () => {
    mockEmbeddingClient.embed.mockResolvedValue([0.1]);
    mockVectorStore.search.mockResolvedValue([
      {
        id: 'doc.md#chunk-0',
        score: 0.9,
        payload: {
          content: 'c',
          document_path: 'doc.md',
          document_title: 'Doc',
          section_headers: [],
          metadata: { category: '', tags: [], last_modified: '', author: '' },
        },
      },
    ]);

    const result = await searchArchitectureDocs({ query: 'test', limit: 5 });
    expect(result.results[0].section_header).toBe('');
  });
});
