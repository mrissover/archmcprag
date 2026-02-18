import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      embeddings = { create: mockCreate };
      constructor() {}
    },
  };
});

vi.mock('../../../config/index.js', () => ({
  config: {
    embedding: {
      provider: 'openai' as 'openai' | 'azure' | 'ollama',
      openai: {
        apiKey: 'test-openai-key',
        model: 'text-embedding-3-small',
      },
      azure: {
        endpoint: 'https://azure.test.com',
        apiKey: 'test-azure-key',
        deployment: 'my-deployment',
      },
      ollama: {
        url: 'http://localhost:11434',
        model: 'mxbai-embed-large',
      },
      dimensions: 1536,
    },
  },
}));

import { createEmbeddingClient } from '../client.js';
import { config } from '../../../config/index.js';

describe('createEmbeddingClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config.embedding as { provider: string }).provider = 'openai';
  });

  describe('OpenAI client', () => {
    it('embed() returns embedding for single text', async () => {
      mockCreate.mockResolvedValue({
        data: [{ embedding: [0.1, 0.2, 0.3] }],
      });

      const client = createEmbeddingClient();
      const result = await client.embed('hello');

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'hello',
      });
      expect(result).toEqual([0.1, 0.2, 0.3]);
    });

    it('embedBatch() returns empty array for empty input', async () => {
      const client = createEmbeddingClient();
      const result = await client.embedBatch([]);
      expect(result).toEqual([]);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('embedBatch() batches items in groups of 100', async () => {
      const texts = Array.from({ length: 150 }, (_, i) => `text-${i}`);

      mockCreate
        .mockResolvedValueOnce({
          data: Array.from({ length: 100 }, () => ({ embedding: [0.1] })),
        })
        .mockResolvedValueOnce({
          data: Array.from({ length: 50 }, () => ({ embedding: [0.2] })),
        });

      const client = createEmbeddingClient();
      const result = await client.embedBatch(texts);

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(150);
      expect(result[0]).toEqual([0.1]);
      expect(result[100]).toEqual([0.2]);
    });
  });

  describe('Ollama client', () => {
    it('embed() returns embedding', async () => {
      (config.embedding as { provider: string }).provider = 'ollama';

      mockCreate.mockResolvedValue({
        data: [{ embedding: [0.3, 0.4] }],
      });

      const client = createEmbeddingClient();
      const result = await client.embed('test');

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'mxbai-embed-large',
        input: 'test',
      });
      expect(result).toEqual([0.3, 0.4]);
    });

    it('embedBatch() works with batching', async () => {
      (config.embedding as { provider: string }).provider = 'ollama';

      mockCreate.mockResolvedValue({
        data: [{ embedding: [0.1] }, { embedding: [0.2] }],
      });

      const client = createEmbeddingClient();
      const result = await client.embedBatch(['a', 'b']);

      expect(result).toEqual([[0.1], [0.2]]);
    });
  });

  describe('Azure client', () => {
    it('creates Azure client with correct configuration', async () => {
      (config.embedding as { provider: string }).provider = 'azure';

      mockCreate.mockResolvedValue({
        data: [{ embedding: [0.5, 0.6] }],
      });

      const client = createEmbeddingClient();
      const result = await client.embed('test');

      expect(result).toEqual([0.5, 0.6]);
    });

    it('Azure embedBatch() works with batching', async () => {
      (config.embedding as { provider: string }).provider = 'azure';

      mockCreate.mockResolvedValue({
        data: [{ embedding: [0.1] }, { embedding: [0.2] }],
      });

      const client = createEmbeddingClient();
      const result = await client.embedBatch(['a', 'b']);

      expect(result).toEqual([[0.1], [0.2]]);
    });

    it('Azure embedBatch() returns empty for empty input', async () => {
      (config.embedding as { provider: string }).provider = 'azure';

      const client = createEmbeddingClient();
      const result = await client.embedBatch([]);
      expect(result).toEqual([]);
    });
  });
});
