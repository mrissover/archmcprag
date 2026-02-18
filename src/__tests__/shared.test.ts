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

vi.mock('../vectorstore/interface.js', () => ({
  createVectorStore: vi.fn().mockResolvedValue(mockVectorStore),
}));

vi.mock('../indexer/embedding/client.js', () => ({
  createEmbeddingClient: vi.fn().mockReturnValue(mockEmbeddingClient),
}));

vi.mock('../config/index.js', () => ({
  config: {
    vectorStore: 'qdrant' as const,
  },
}));

describe('shared singletons', () => {
  beforeEach(async () => {
    vi.resetModules();
    // Re-setup mocks after resetModules
    vi.doMock('../vectorstore/interface.js', () => ({
      createVectorStore: vi.fn().mockResolvedValue(mockVectorStore),
    }));
    vi.doMock('../indexer/embedding/client.js', () => ({
      createEmbeddingClient: vi.fn().mockReturnValue(mockEmbeddingClient),
    }));
    vi.doMock('../config/index.js', () => ({
      config: {
        vectorStore: 'qdrant' as const,
      },
    }));
  });

  it('getVectorStore returns same instance on repeated calls', async () => {
    const { getVectorStore } = await import('../shared.js');

    const first = await getVectorStore();
    const second = await getVectorStore();

    expect(first).toBe(second);
  });

  it('getEmbeddingClient returns same instance on repeated calls', async () => {
    const { getEmbeddingClient } = await import('../shared.js');

    const first = getEmbeddingClient();
    const second = getEmbeddingClient();

    expect(first).toBe(second);
  });

  it('initialization happens only once for vectorStore', async () => {
    const { createVectorStore } = await import('../vectorstore/interface.js');
    const { getVectorStore } = await import('../shared.js');

    await getVectorStore();
    await getVectorStore();

    expect(createVectorStore).toHaveBeenCalledTimes(1);
  });

  it('initialization happens only once for embeddingClient', async () => {
    const { createEmbeddingClient } = await import('../indexer/embedding/client.js');
    const { getEmbeddingClient } = await import('../shared.js');

    getEmbeddingClient();
    getEmbeddingClient();

    expect(createEmbeddingClient).toHaveBeenCalledTimes(1);
  });
});
