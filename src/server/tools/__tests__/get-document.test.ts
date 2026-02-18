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

vi.mock('../../../shared.js', () => ({
  getVectorStore: () => Promise.resolve(mockVectorStore),
  getEmbeddingClient: vi.fn(),
}));

import { getDocument, getDocumentSchema } from '../get-document.js';

describe('getDocumentSchema', () => {
  it('requires path string', () => {
    expect(getDocumentSchema.safeParse({ path: 'doc.md' }).success).toBe(true);
    expect(getDocumentSchema.safeParse({}).success).toBe(false);
  });
});

describe('getDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error for missing document', async () => {
    mockVectorStore.getByDocumentPath.mockResolvedValue([]);

    const result = await getDocument({ path: 'nonexistent.md' });
    expect(result).toEqual({ error: 'Document not found: nonexistent.md' });
  });

  it('reconstructs content from sorted chunks', async () => {
    mockVectorStore.getByDocumentPath.mockResolvedValue([
      {
        id: 'doc.md#chunk-2',
        score: 1,
        payload: {
          content: 'Third chunk',
          document_path: 'doc.md',
          document_title: 'Test Doc',
          section_headers: [],
          metadata: { category: 'adr', tags: ['auth'], last_modified: '2024-01-01', author: 'alice' },
          full_content_hash: 'c',
        },
      },
      {
        id: 'doc.md#chunk-0',
        score: 1,
        payload: {
          content: 'First chunk',
          document_path: 'doc.md',
          document_title: 'Test Doc',
          section_headers: [],
          metadata: { category: 'adr', tags: ['auth'], last_modified: '2024-01-01', author: 'alice' },
          full_content_hash: 'a',
        },
      },
      {
        id: 'doc.md#chunk-1',
        score: 1,
        payload: {
          content: 'Second chunk',
          document_path: 'doc.md',
          document_title: 'Test Doc',
          section_headers: [],
          metadata: { category: 'adr', tags: ['auth'], last_modified: '2024-01-01', author: 'alice' },
          full_content_hash: 'b',
        },
      },
    ]);

    const result = await getDocument({ path: 'doc.md' });
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.content).toBe('First chunk\n\nSecond chunk\n\nThird chunk');
      expect(result.path).toBe('doc.md');
      expect(result.title).toBe('Test Doc');
      expect(result.metadata.category).toBe('adr');
      expect(result.metadata.word_count).toBe(6);
    }
  });

  it('handles single-chunk document', async () => {
    mockVectorStore.getByDocumentPath.mockResolvedValue([
      {
        id: 'doc.md#chunk-0',
        score: 1,
        payload: {
          content: 'Only chunk',
          document_path: 'doc.md',
          document_title: 'Solo',
          section_headers: ['Intro'],
          metadata: { category: 'general', tags: [], last_modified: '', author: '' },
          full_content_hash: 'x',
        },
      },
    ]);

    const result = await getDocument({ path: 'doc.md' });
    if (!('error' in result)) {
      expect(result.content).toBe('Only chunk');
      expect(result.title).toBe('Solo');
    }
  });
});
