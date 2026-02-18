import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetCollections = vi.fn();
const mockCreateCollection = vi.fn();
const mockDeleteCollection = vi.fn();
const mockCreatePayloadIndex = vi.fn();
const mockUpsert = vi.fn();
const mockSearch = vi.fn();
const mockDelete = vi.fn();
const mockScroll = vi.fn();

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class MockQdrantClient {
    getCollections = mockGetCollections;
    createCollection = mockCreateCollection;
    deleteCollection = mockDeleteCollection;
    createPayloadIndex = mockCreatePayloadIndex;
    upsert = mockUpsert;
    search = mockSearch;
    delete = mockDelete;
    scroll = mockScroll;
    constructor() {}
  },
}));

vi.mock('../../config/index.js', () => ({
  config: {
    qdrant: {
      url: 'http://localhost:6333',
      apiKey: undefined,
      collectionName: 'architecture_docs',
    },
    embedding: {
      dimensions: 1536,
    },
  },
}));

import { createQdrantStore } from '../qdrant.js';
import type { VectorRecord } from '../../types/index.js';

describe('QdrantStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('creates collection when it does not exist', async () => {
      mockGetCollections.mockResolvedValue({ collections: [] });
      mockCreateCollection.mockResolvedValue({});
      mockCreatePayloadIndex.mockResolvedValue({});

      const store = await createQdrantStore();
      await store.initialize();

      expect(mockCreateCollection).toHaveBeenCalledWith('architecture_docs', {
        vectors: { size: 1536, distance: 'Cosine' },
      });
      expect(mockCreatePayloadIndex).toHaveBeenCalledTimes(3);
    });

    it('skips creation when collection already exists', async () => {
      mockGetCollections.mockResolvedValue({
        collections: [{ name: 'architecture_docs' }],
      });

      const store = await createQdrantStore();
      await store.initialize();

      expect(mockCreateCollection).not.toHaveBeenCalled();
    });

    it('creates payload indexes for category, tags, and document_path', async () => {
      mockGetCollections.mockResolvedValue({ collections: [] });
      mockCreateCollection.mockResolvedValue({});
      mockCreatePayloadIndex.mockResolvedValue({});

      const store = await createQdrantStore();
      await store.initialize();

      expect(mockCreatePayloadIndex).toHaveBeenCalledWith('architecture_docs', {
        field_name: 'metadata.category',
        field_schema: 'keyword',
      });
      expect(mockCreatePayloadIndex).toHaveBeenCalledWith('architecture_docs', {
        field_name: 'metadata.tags',
        field_schema: 'keyword',
      });
      expect(mockCreatePayloadIndex).toHaveBeenCalledWith('architecture_docs', {
        field_name: 'document_path',
        field_schema: 'keyword',
      });
    });
  });

  describe('reset', () => {
    it('drops existing collection and reinitializes', async () => {
      mockGetCollections
        .mockResolvedValueOnce({ collections: [{ name: 'architecture_docs' }] })
        .mockResolvedValueOnce({ collections: [] });
      mockDeleteCollection.mockResolvedValue({});
      mockCreateCollection.mockResolvedValue({});
      mockCreatePayloadIndex.mockResolvedValue({});

      const store = await createQdrantStore();
      await store.reset();

      expect(mockDeleteCollection).toHaveBeenCalledWith('architecture_docs');
      expect(mockCreateCollection).toHaveBeenCalled();
    });

    it('skips drop when collection does not exist', async () => {
      mockGetCollections
        .mockResolvedValueOnce({ collections: [] })
        .mockResolvedValueOnce({ collections: [] });
      mockCreateCollection.mockResolvedValue({});
      mockCreatePayloadIndex.mockResolvedValue({});

      const store = await createQdrantStore();
      await store.reset();

      expect(mockDeleteCollection).not.toHaveBeenCalled();
      expect(mockCreateCollection).toHaveBeenCalled();
    });
  });

  describe('upsert', () => {
    it('maps records to points and upserts', async () => {
      const store = await createQdrantStore();

      const records: VectorRecord[] = [
        {
          id: 'doc.md#chunk-0',
          vector: [0.1, 0.2],
          payload: {
            chunk_id: 'doc.md#chunk-0',
            document_path: 'doc.md',
            document_title: 'Doc',
            section_headers: [],
            content: 'content',
            metadata: { category: 'adr', tags: [], last_modified: '', author: '' },
            full_content_hash: 'abc',
          },
        },
      ];

      await store.upsert(records);

      expect(mockUpsert).toHaveBeenCalledWith('architecture_docs', {
        wait: true,
        points: [
          {
            id: 'doc.md#chunk-0',
            vector: [0.1, 0.2],
            payload: records[0].payload,
          },
        ],
      });
    });

    it('handles empty records', async () => {
      const store = await createQdrantStore();
      await store.upsert([]);
      expect(mockUpsert).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('searches without filter', async () => {
      mockSearch.mockResolvedValue([
        {
          id: 'doc.md#chunk-0',
          score: 0.95,
          payload: { content: 'test', document_path: 'doc.md' },
        },
      ]);

      const store = await createQdrantStore();
      const results = await store.search([0.1, 0.2], 5);

      expect(mockSearch).toHaveBeenCalledWith('architecture_docs', {
        vector: [0.1, 0.2],
        limit: 5,
        filter: undefined,
        with_payload: true,
      });
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.95);
    });

    it('builds filter for category', async () => {
      mockSearch.mockResolvedValue([]);

      const store = await createQdrantStore();
      await store.search([0.1], 5, { category: 'adr' });

      const call = mockSearch.mock.calls[0][1];
      expect(call.filter.must).toContainEqual({
        key: 'metadata.category',
        match: { value: 'adr' },
      });
    });

    it('builds filter for tags', async () => {
      mockSearch.mockResolvedValue([]);

      const store = await createQdrantStore();
      await store.search([0.1], 5, { tags: ['auth', 'security'] });

      const call = mockSearch.mock.calls[0][1];
      expect(call.filter.must).toContainEqual({
        key: 'metadata.tags',
        match: { value: 'auth' },
      });
      expect(call.filter.must).toContainEqual({
        key: 'metadata.tags',
        match: { value: 'security' },
      });
    });

    it('builds filter for both category and tags', async () => {
      mockSearch.mockResolvedValue([]);

      const store = await createQdrantStore();
      await store.search([0.1], 5, { category: 'adr', tags: ['auth'] });

      const call = mockSearch.mock.calls[0][1];
      expect(call.filter.must).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('deletes by IDs', async () => {
      const store = await createQdrantStore();
      await store.delete(['id1', 'id2']);

      expect(mockDelete).toHaveBeenCalledWith('architecture_docs', {
        wait: true,
        points: ['id1', 'id2'],
      });
    });

    it('handles empty IDs', async () => {
      const store = await createQdrantStore();
      await store.delete([]);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('deleteByDocumentPath', () => {
    it('deletes with document_path filter', async () => {
      const store = await createQdrantStore();
      await store.deleteByDocumentPath('docs/old.md');

      expect(mockDelete).toHaveBeenCalledWith('architecture_docs', {
        wait: true,
        filter: {
          must: [{ key: 'document_path', match: { value: 'docs/old.md' } }],
        },
      });
    });
  });

  describe('getByDocumentPath', () => {
    it('scrolls with document_path filter', async () => {
      mockScroll.mockResolvedValue({
        points: [
          { id: 'doc.md#chunk-0', payload: { content: 'c', document_path: 'doc.md' } },
        ],
      });

      const store = await createQdrantStore();
      const results = await store.getByDocumentPath('doc.md');

      expect(mockScroll).toHaveBeenCalledWith('architecture_docs', {
        filter: {
          must: [{ key: 'document_path', match: { value: 'doc.md' } }],
        },
        with_payload: true,
        with_vector: false,
      });
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(1);
    });
  });

  describe('listDocuments', () => {
    it('groups chunks by document path', async () => {
      mockScroll.mockResolvedValue({
        points: [
          {
            id: 'a.md#chunk-0',
            payload: {
              document_path: 'a.md',
              document_title: 'A',
              metadata: { category: 'adr', tags: ['auth'], last_modified: '2024-01-01' },
            },
          },
          {
            id: 'a.md#chunk-1',
            payload: {
              document_path: 'a.md',
              document_title: 'A',
              metadata: { category: 'adr', tags: ['auth'], last_modified: '2024-01-01' },
            },
          },
          {
            id: 'b.md#chunk-0',
            payload: {
              document_path: 'b.md',
              document_title: 'B',
              metadata: { category: 'api', tags: [], last_modified: '2024-01-02' },
            },
          },
        ],
      });

      const store = await createQdrantStore();
      const docs = await store.listDocuments();

      expect(docs).toHaveLength(2);
      expect(docs[0].path).toBe('a.md');
      expect(docs[1].path).toBe('b.md');
    });

    it('filters by category when provided', async () => {
      mockScroll.mockResolvedValue({ points: [] });

      const store = await createQdrantStore();
      await store.listDocuments('adr');

      const call = mockScroll.mock.calls[0][1];
      expect(call.filter).toEqual({
        must: [{ key: 'metadata.category', match: { value: 'adr' } }],
      });
    });

    it('does not apply filter when no category', async () => {
      mockScroll.mockResolvedValue({ points: [] });

      const store = await createQdrantStore();
      await store.listDocuments();

      const call = mockScroll.mock.calls[0][1];
      expect(call.filter).toBeUndefined();
    });
  });
});
