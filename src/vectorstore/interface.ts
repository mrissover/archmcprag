import type { VectorStore, SearchFilter, VectorRecord, VectorSearchResult, DocumentListItem } from '../types/index.js';

export type { VectorStore, SearchFilter, VectorRecord, VectorSearchResult, DocumentListItem };

export function createVectorStore(type: 'qdrant' | 'chroma'): Promise<VectorStore> {
  if (type === 'qdrant') {
    return import('./qdrant.js').then(m => m.createQdrantStore());
  } else {
    return import('./chroma.js').then(m => m.createChromaStore());
  }
}
