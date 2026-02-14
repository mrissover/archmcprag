import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/index.js';
import type { VectorStore, VectorRecord, VectorSearchResult, SearchFilter, DocumentListItem, DocumentChunk } from '../types/index.js';
import pino from 'pino';

const logger = pino({ name: 'qdrant' });

export async function createQdrantStore(): Promise<VectorStore> {
  const client = new QdrantClient({
    url: config.qdrant.url,
    apiKey: config.qdrant.apiKey,
  });

  const collectionName = config.qdrant.collectionName;

  const store: VectorStore = {
    async initialize(): Promise<void> {
      const collections = await client.getCollections();
      const exists = collections.collections.some(c => c.name === collectionName);

      if (!exists) {
        logger.info(`Creating collection: ${collectionName}`);
        await client.createCollection(collectionName, {
          vectors: {
            size: config.embedding.dimensions,
            distance: 'Cosine',
          },
        });

        // Create payload indexes for filtering
        await client.createPayloadIndex(collectionName, {
          field_name: 'metadata.category',
          field_schema: 'keyword',
        });
        await client.createPayloadIndex(collectionName, {
          field_name: 'metadata.tags',
          field_schema: 'keyword',
        });
        await client.createPayloadIndex(collectionName, {
          field_name: 'document_path',
          field_schema: 'keyword',
        });

        logger.info('Collection created with indexes');
      } else {
        logger.info(`Collection ${collectionName} already exists`);
      }
    },

    async upsert(records: VectorRecord[]): Promise<void> {
      if (records.length === 0) return;

      const points = records.map(record => ({
        id: record.id,
        vector: record.vector,
        payload: record.payload as Record<string, unknown>,
      }));

      await client.upsert(collectionName, {
        wait: true,
        points,
      });

      logger.info(`Upserted ${records.length} records`);
    },

    async search(vector: number[], limit: number, filter?: SearchFilter): Promise<VectorSearchResult[]> {
      const qdrantFilter: Record<string, unknown> = { must: [] };
      const must = qdrantFilter.must as Array<Record<string, unknown>>;

      if (filter?.category) {
        must.push({
          key: 'metadata.category',
          match: { value: filter.category },
        });
      }

      if (filter?.tags && filter.tags.length > 0) {
        for (const tag of filter.tags) {
          must.push({
            key: 'metadata.tags',
            match: { value: tag },
          });
        }
      }

      const results = await client.search(collectionName, {
        vector,
        limit,
        filter: must.length > 0 ? qdrantFilter : undefined,
        with_payload: true,
      });

      return results.map(result => ({
        id: result.id as string,
        score: result.score,
        payload: result.payload as unknown as DocumentChunk,
      }));
    },

    async delete(ids: string[]): Promise<void> {
      if (ids.length === 0) return;

      await client.delete(collectionName, {
        wait: true,
        points: ids,
      });

      logger.info(`Deleted ${ids.length} records`);
    },

    async deleteByDocumentPath(path: string): Promise<void> {
      await client.delete(collectionName, {
        wait: true,
        filter: {
          must: [
            {
              key: 'document_path',
              match: { value: path },
            },
          ],
        },
      });

      logger.info(`Deleted all records for document: ${path}`);
    },

    async getByDocumentPath(path: string): Promise<VectorSearchResult[]> {
      const results = await client.scroll(collectionName, {
        filter: {
          must: [
            {
              key: 'document_path',
              match: { value: path },
            },
          ],
        },
        with_payload: true,
        with_vector: false,
      });

      return results.points.map(point => ({
        id: point.id as string,
        score: 1,
        payload: point.payload as unknown as DocumentChunk,
      }));
    },

    async listDocuments(category?: string): Promise<DocumentListItem[]> {
      const filter = category
        ? {
            must: [
              {
                key: 'metadata.category',
                match: { value: category },
              },
            ],
          }
        : undefined;

      const results = await client.scroll(collectionName, {
        filter,
        with_payload: true,
        with_vector: false,
        limit: 1000,
      });

      // Group by document path to get unique documents
      const documentsMap = new Map<string, DocumentListItem>();

      for (const point of results.points) {
        const payload = point.payload as unknown as DocumentChunk;
        if (!documentsMap.has(payload.document_path)) {
          documentsMap.set(payload.document_path, {
            path: payload.document_path,
            title: payload.document_title,
            category: payload.metadata.category,
            tags: payload.metadata.tags,
            last_modified: payload.metadata.last_modified,
          });
        }
      }

      return Array.from(documentsMap.values());
    },
  };

  return store;
}
