import { ChromaClient } from 'chromadb';
import { config } from '../config/index.js';
import type { VectorStore, VectorRecord, VectorSearchResult, SearchFilter, DocumentListItem, DocumentChunk } from '../types/index.js';
import pino from 'pino';

const logger = pino({ name: 'chroma' });

export async function createChromaStore(): Promise<VectorStore> {
  const client = new ChromaClient({
    path: config.chroma.url,
  });

  const collectionName = config.chroma.collectionName;
  let collection: Awaited<ReturnType<typeof client.getOrCreateCollection>>;

  const store: VectorStore = {
    async initialize(): Promise<void> {
      collection = await client.getOrCreateCollection({
        name: collectionName,
        metadata: { 'hnsw:space': 'cosine' },
      });
      logger.info(`Collection ${collectionName} ready`);
    },

    async reset(): Promise<void> {
      logger.info(`Deleting collection: ${collectionName}`);
      await client.deleteCollection({ name: collectionName });
      await store.initialize();
    },

    async upsert(records: VectorRecord[]): Promise<void> {
      if (records.length === 0) return;

      await collection.upsert({
        ids: records.map(r => r.id),
        embeddings: records.map(r => r.vector),
        metadatas: records.map(r => ({
          document_path: r.payload.document_path,
          document_title: r.payload.document_title,
          section_headers: JSON.stringify(r.payload.section_headers),
          content: r.payload.content,
          category: r.payload.metadata.category,
          tags: JSON.stringify(r.payload.metadata.tags),
          last_modified: r.payload.metadata.last_modified,
          author: r.payload.metadata.author,
          full_content_hash: r.payload.full_content_hash,
        })),
      });

      logger.info(`Upserted ${records.length} records`);
    },

    async search(vector: number[], limit: number, filter?: SearchFilter): Promise<VectorSearchResult[]> {
      const whereClause = filter?.category ? { category: filter.category } : undefined;

      const results = await collection.query({
        queryEmbeddings: [vector],
        nResults: limit,
        where: whereClause as Record<string, unknown> as import('chromadb').Where | undefined,
      });

      if (!results.ids[0]) return [];

      return results.ids[0].map((id, i) => {
        const meta = results.metadatas?.[0]?.[i] as Record<string, unknown> | undefined;
        return {
          id,
          score: results.distances?.[0]?.[i] ? 1 - (results.distances[0][i] as number) : 0,
          payload: {
            chunk_id: id,
            document_path: (meta?.document_path as string) || '',
            document_title: (meta?.document_title as string) || '',
            section_headers: JSON.parse((meta?.section_headers as string) || '[]'),
            content: (meta?.content as string) || '',
            metadata: {
              category: (meta?.category as string) || '',
              tags: JSON.parse((meta?.tags as string) || '[]'),
              last_modified: (meta?.last_modified as string) || '',
              author: (meta?.author as string) || '',
            },
            full_content_hash: (meta?.full_content_hash as string) || '',
          } as DocumentChunk,
        };
      });
    },

    async delete(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await collection.delete({ ids });
      logger.info(`Deleted ${ids.length} records`);
    },

    async deleteByDocumentPath(path: string): Promise<void> {
      await collection.delete({
        where: { document_path: path },
      });
      logger.info(`Deleted all records for document: ${path}`);
    },

    async getByDocumentPath(path: string): Promise<VectorSearchResult[]> {
      const results = await collection.get({
        where: { document_path: path },
      });

      return results.ids.map((id, i) => {
        const meta = results.metadatas?.[i] as Record<string, unknown> | undefined;
        return {
          id,
          score: 1,
          payload: {
            chunk_id: id,
            document_path: (meta?.document_path as string) || '',
            document_title: (meta?.document_title as string) || '',
            section_headers: JSON.parse((meta?.section_headers as string) || '[]'),
            content: (meta?.content as string) || '',
            metadata: {
              category: (meta?.category as string) || '',
              tags: JSON.parse((meta?.tags as string) || '[]'),
              last_modified: (meta?.last_modified as string) || '',
              author: (meta?.author as string) || '',
            },
            full_content_hash: (meta?.full_content_hash as string) || '',
          } as DocumentChunk,
        };
      });
    },

    async listDocuments(category?: string): Promise<DocumentListItem[]> {
      const results = await collection.get({
        where: category ? { category } : undefined,
      });

      const documentsMap = new Map<string, DocumentListItem>();

      for (let i = 0; i < results.ids.length; i++) {
        const meta = results.metadatas?.[i] as Record<string, unknown> | undefined;
        const path = (meta?.document_path as string) || '';
        if (!documentsMap.has(path)) {
          documentsMap.set(path, {
            path,
            title: (meta?.document_title as string) || '',
            category: (meta?.category as string) || '',
            tags: JSON.parse((meta?.tags as string) || '[]'),
            last_modified: (meta?.last_modified as string) || '',
          });
        }
      }

      return Array.from(documentsMap.values());
    },
  };

  return store;
}
