import OpenAI from 'openai';
import { config } from '../../config/index.js';
import type { EmbeddingClient } from '../../types/index.js';
import pino from 'pino';

const logger = pino({ name: 'embedding' });

export function createEmbeddingClient(): EmbeddingClient {
  if (config.embedding.provider === 'azure') {
    return createAzureClient();
  }
  if (config.embedding.provider === 'ollama') {
    return createOllamaClient();
  }
  return createOpenAIClient();
}

function createOllamaClient(): EmbeddingClient {
  const client = new OpenAI({
    apiKey: 'ollama',
    baseURL: `${config.embedding.ollama.url}/v1`,
  });
  const model = config.embedding.ollama.model;

  return {
    async embed(text: string): Promise<number[]> {
      const response = await client.embeddings.create({ model, input: text });
      return response.data[0].embedding;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const batchSize = 100;
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        logger.info(`Embedding batch ${i / batchSize + 1}/${Math.ceil(texts.length / batchSize)}`);

        const response = await client.embeddings.create({ model, input: batch });
        results.push(...response.data.map(d => d.embedding));
      }

      return results;
    },
  };
}

function createOpenAIClient(): EmbeddingClient {
  const client = new OpenAI({
    apiKey: config.embedding.openai.apiKey,
    ...(config.embedding.openai.baseUrl ? { baseURL: config.embedding.openai.baseUrl } : {}),
  });

  return {
    async embed(text: string): Promise<number[]> {
      const response = await client.embeddings.create({
        model: config.embedding.openai.model,
        input: text,
      });
      return response.data[0].embedding;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      // OpenAI supports batches up to 2048 inputs
      const batchSize = 100;
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        logger.info(`Embedding batch ${i / batchSize + 1}/${Math.ceil(texts.length / batchSize)}`);

        const response = await client.embeddings.create({
          model: config.embedding.openai.model,
          input: batch,
        });

        results.push(...response.data.map(d => d.embedding));
      }

      return results;
    },
  };
}

function createAzureClient(): EmbeddingClient {
  const client = new OpenAI({
    apiKey: config.embedding.azure.apiKey,
    baseURL: `${config.embedding.azure.endpoint}/openai/deployments/${config.embedding.azure.deployment}`,
    defaultQuery: { 'api-version': '2024-02-01' },
    defaultHeaders: { 'api-key': config.embedding.azure.apiKey },
  });

  return {
    async embed(text: string): Promise<number[]> {
      const response = await client.embeddings.create({
        model: config.embedding.azure.deployment || 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const batchSize = 100;
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        logger.info(`Embedding batch ${i / batchSize + 1}/${Math.ceil(texts.length / batchSize)}`);

        const response = await client.embeddings.create({
          model: config.embedding.azure.deployment || 'text-embedding-3-small',
          input: batch,
        });

        results.push(...response.data.map(d => d.embedding));
      }

      return results;
    },
  };
}
