import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpsert = vi.fn();
const mockQuery = vi.fn();
const mockDelete = vi.fn();
const mockGet = vi.fn();

const mockCollection = {
  upsert: mockUpsert,
  query: mockQuery,
  delete: mockDelete,
  get: mockGet,
};

const mockDeleteCollection = vi.fn();

vi.mock('chromadb', () => ({
  ChromaClient: class MockChromaClient {
    getOrCreateCollection = vi.fn().mockResolvedValue(mockCollection);
    deleteCollection = mockDeleteCollection;
    constructor() {}
  },
}));

vi.mock('../../config/index.js', () => ({
  config: {
    chroma: {
      url: 'http://localhost:8000',
      collectionName: 'architecture_docs',
    },
  },
}));

import { createChromaStore } from '../chroma.js';
import type { VectorRecord } from '../../types/index.js';

describe('ChromaStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('creates or gets collection', async () => {
      const store = await createChromaStore();
      await store.initialize();
      expect(store).toBeDefined();
    });
  });

  describe('reset', () => {
    it('deletes collection and reinitializes', async () => {
      const store = await createChromaStore();
      await store.initialize();
      await store.reset();

      expect(mockDeleteCollection).toHaveBeenCalledWith({ name: 'architecture_docs' });
    });
  });

  describe('upsert', () => {
    it('serializes metadata and upserts records', async () => {
      const store = await createChromaStore();
      await store.initialize();

      const records: VectorRecord[] = [
        {
          id: 'doc.md#chunk-0',
          vector: [0.1, 0.2],
          payload: {
            chunk_id: 'doc.md#chunk-0',
            document_path: 'doc.md',
            document_title: 'Doc',
            section_headers: ['Section 1'],
            content: 'content',
            metadata: { category: 'adr', tags: ['auth'], last_modified: '2024-01-01', author: 'alice' },
            full_content_hash: 'abc',
          },
        },
      ];

      await store.upsert(records);

      expect(mockUpsert).toHaveBeenCalledWith({
        ids: ['doc.md#chunk-0'],
        embeddings: [[0.1, 0.2]],
        metadatas: [{
          document_path: 'doc.md',
          document_title: 'Doc',
          section_headers: JSON.stringify(['Section 1']),
          content: 'content',
          category: 'adr',
          tags: JSON.stringify(['auth']),
          last_modified: '2024-01-01',
          author: 'alice',
          full_content_hash: 'abc',
        }],
      });
    });

    it('handles empty records', async () => {
      const store = await createChromaStore();
      await store.initialize();
      await store.upsert([]);
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('searches without filter', async () => {
      mockQuery.mockResolvedValue({
        ids: [['doc.md#chunk-0']],
        metadatas: [[{
          document_path: 'doc.md',
          document_title: 'Doc',
          section_headers: '["Section"]',
          content: 'result',
          category: 'adr',
          tags: '["auth"]',
          last_modified: '2024-01-01',
          author: 'alice',
          full_content_hash: 'abc',
        }]],
        distances: [[0.1]],
      });

      const store = await createChromaStore();
      await store.initialize();
      const results = await store.search([0.1], 5);

      expect(mockQuery).toHaveBeenCalledWith({
        queryEmbeddings: [[0.1]],
        nResults: 5,
        where: undefined,
      });
      expect(results).toHaveLength(1);
      expect(results[0].score).toBeCloseTo(0.9);
      expect(results[0].payload.document_path).toBe('doc.md');
    });

    it('applies category filter as where clause', async () => {
      mockQuery.mockResolvedValue({ ids: [[]], metadatas: [[]], distances: [[]] });

      const store = await createChromaStore();
      await store.initialize();
      await store.search([0.1], 5, { category: 'adr' });

      expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
        where: { category: 'adr' },
      }));
    });

    it('handles empty results', async () => {
      mockQuery.mockResolvedValue({ ids: [[]], metadatas: [[]], distances: [[]] });

      const store = await createChromaStore();
      await store.initialize();
      const results = await store.search([0.1], 5);

      expect(results).toEqual([]);
    });

    it('handles missing distances (score defaults to 0)', async () => {
      mockQuery.mockResolvedValue({
        ids: [['id1']],
        metadatas: [[{ document_path: 'a', document_title: 'A', section_headers: '[]', content: '', category: '', tags: '[]', last_modified: '', author: '', full_content_hash: '' }]],
        distances: [[]],
      });

      const store = await createChromaStore();
      await store.initialize();
      const results = await store.search([0.1], 5);

      expect(results[0].score).toBe(0);
    });

    it('handles null ids[0]', async () => {
      mockQuery.mockResolvedValue({ ids: [null], metadatas: [[]], distances: [[]] });

      const store = await createChromaStore();
      await store.initialize();
      const results = await store.search([0.1], 5);

      expect(results).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deletes by IDs', async () => {
      const store = await createChromaStore();
      await store.initialize();
      await store.delete(['id1', 'id2']);

      expect(mockDelete).toHaveBeenCalledWith({ ids: ['id1', 'id2'] });
    });

    it('handles empty IDs', async () => {
      const store = await createChromaStore();
      await store.initialize();
      await store.delete([]);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('deleteByDocumentPath', () => {
    it('deletes with where clause', async () => {
      const store = await createChromaStore();
      await store.initialize();
      await store.deleteByDocumentPath('docs/old.md');

      expect(mockDelete).toHaveBeenCalledWith({ where: { document_path: 'docs/old.md' } });
    });
  });

  describe('getByDocumentPath', () => {
    it('fetches chunks by document path', async () => {
      mockGet.mockResolvedValue({
        ids: ['doc.md#chunk-0'],
        metadatas: [{
          document_path: 'doc.md',
          document_title: 'Doc',
          section_headers: '["H1"]',
          content: 'content',
          category: 'adr',
          tags: '["auth"]',
          last_modified: '2024-01-01',
          author: 'alice',
          full_content_hash: 'abc',
        }],
      });

      const store = await createChromaStore();
      await store.initialize();
      const results = await store.getByDocumentPath('doc.md');

      expect(mockGet).toHaveBeenCalledWith({ where: { document_path: 'doc.md' } });
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(1);
      expect(results[0].payload.section_headers).toEqual(['H1']);
    });
  });

  describe('listDocuments', () => {
    it('groups by document path', async () => {
      mockGet.mockResolvedValue({
        ids: ['a.md#chunk-0', 'a.md#chunk-1', 'b.md#chunk-0'],
        metadatas: [
          { document_path: 'a.md', document_title: 'A', category: 'adr', tags: '["auth"]', last_modified: '2024-01-01' },
          { document_path: 'a.md', document_title: 'A', category: 'adr', tags: '["auth"]', last_modified: '2024-01-01' },
          { document_path: 'b.md', document_title: 'B', category: 'api', tags: '[]', last_modified: '2024-01-02' },
        ],
      });

      const store = await createChromaStore();
      await store.initialize();
      const docs = await store.listDocuments();

      expect(docs).toHaveLength(2);
      expect(docs[0].path).toBe('a.md');
      expect(docs[1].path).toBe('b.md');
    });

    it('filters by category', async () => {
      mockGet.mockResolvedValue({ ids: [], metadatas: [] });

      const store = await createChromaStore();
      await store.initialize();
      await store.listDocuments('adr');

      expect(mockGet).toHaveBeenCalledWith({ where: { category: 'adr' } });
    });

    it('does not apply filter when no category', async () => {
      mockGet.mockResolvedValue({ ids: [], metadatas: [] });

      const store = await createChromaStore();
      await store.initialize();
      await store.listDocuments();

      expect(mockGet).toHaveBeenCalledWith({ where: undefined });
    });
  });
});
