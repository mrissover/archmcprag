import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

function optionalInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  return value ? parseInt(value, 10) : defaultValue;
}

export const config = {
  // Server
  port: optionalInt('PORT', 3000),
  host: optional('HOST', '0.0.0.0'),
  // Vector Store
  vectorStore: optional('VECTOR_STORE', 'qdrant') as 'qdrant' | 'chroma',
  qdrant: {
    url: optional('QDRANT_URL', 'http://localhost:6333'),
    apiKey: process.env.QDRANT_API_KEY,
    collectionName: 'architecture_docs',
  },
  chroma: {
    url: optional('CHROMA_URL', 'http://localhost:8000'),
    collectionName: 'architecture_docs',
  },

  // Embeddings
  embedding: {
    provider: optional('EMBEDDING_PROVIDER', 'openai') as 'openai' | 'azure',
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: optional('EMBEDDING_MODEL', 'text-embedding-3-small'),
    },
    azure: {
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      deployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    },
    dimensions: optionalInt('EMBEDDING_DIMENSIONS', 1536),
  },

  // GitLab
  gitlab: {
    url: optional('GITLAB_URL', 'https://gitlab.com'),
    projectId: process.env.GITLAB_PROJECT_ID || '',
    accessToken: process.env.GITLAB_ACCESS_TOKEN || '',
    branch: optional('GITLAB_BRANCH', 'main'),
    webhookSecret: process.env.GITLAB_WEBHOOK_SECRET,
  },

  // Indexer
  chunking: {
    maxTokens: optionalInt('CHUNK_SIZE', 1500),
    overlapTokens: optionalInt('CHUNK_OVERLAP', 100),
    minTokens: 200,
  },
};

export type Config = typeof config;
