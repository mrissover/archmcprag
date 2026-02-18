import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVectorStore = {
  initialize: vi.fn(),
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

import { listDocuments, listDocumentsSchema } from '../list-documents.js';

describe('listDocumentsSchema', () => {
  it('allows empty input', () => {
    expect(listDocumentsSchema.safeParse({}).success).toBe(true);
  });

  it('allows optional category filter', () => {
    const result = listDocumentsSchema.parse({ category: 'adr' });
    expect(result.category).toBe('adr');
  });

  it('defaults include_summaries to false', () => {
    const result = listDocumentsSchema.parse({});
    expect(result.include_summaries).toBe(false);
  });
});

describe('listDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns documents list', async () => {
    mockVectorStore.listDocuments.mockResolvedValue([
      { path: 'a.md', title: 'A', category: 'adr', tags: ['auth'], last_modified: '2024-01-01' },
      { path: 'b.md', title: 'B', category: 'api', tags: [], last_modified: '2024-01-02' },
    ]);

    const result = await listDocuments({ include_summaries: false });

    expect(mockVectorStore.listDocuments).toHaveBeenCalledWith(undefined);
    expect(result.total_count).toBe(2);
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].path).toBe('a.md');
  });

  it('passes category filter', async () => {
    mockVectorStore.listDocuments.mockResolvedValue([]);

    await listDocuments({ category: 'adr', include_summaries: false });

    expect(mockVectorStore.listDocuments).toHaveBeenCalledWith('adr');
  });

  it('handles empty document list', async () => {
    mockVectorStore.listDocuments.mockResolvedValue([]);

    const result = await listDocuments({ include_summaries: false });

    expect(result.total_count).toBe(0);
    expect(result.documents).toEqual([]);
  });

  it('returns undefined for summaries (TODO)', async () => {
    mockVectorStore.listDocuments.mockResolvedValue([
      { path: 'a.md', title: 'A', category: 'adr', tags: [], last_modified: '' },
    ]);

    const result = await listDocuments({ include_summaries: true });

    expect(result.documents[0].summary).toBeUndefined();
  });
});
