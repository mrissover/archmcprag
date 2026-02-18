import { describe, it, expect, vi } from 'vitest';

vi.mock('../qdrant.js', () => ({
  createQdrantStore: vi.fn().mockResolvedValue({ type: 'qdrant' }),
}));

vi.mock('../chroma.js', () => ({
  createChromaStore: vi.fn().mockResolvedValue({ type: 'chroma' }),
}));

import { createVectorStore } from '../interface.js';

describe('createVectorStore', () => {
  it('dynamically imports qdrant module for type "qdrant"', async () => {
    const store = await createVectorStore('qdrant');
    expect(store).toEqual({ type: 'qdrant' });
  });

  it('dynamically imports chroma module for type "chroma"', async () => {
    const store = await createVectorStore('chroma');
    expect(store).toEqual({ type: 'chroma' });
  });
});
