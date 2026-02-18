import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('GITLAB_URL', 'https://gitlab.test.com');
    vi.stubEnv('GITLAB_PROJECT_ID', 'test-project');
    vi.stubEnv('GITLAB_ACCESS_TOKEN', 'glpat-test');
  });

  async function loadConfig() {
    const mod = await import('../index.js');
    return mod.config;
  }

  it('uses default values when env vars are not set', async () => {
    const config = await loadConfig();
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.vectorStore).toBe('qdrant');
    expect(config.qdrant.url).toBe('http://localhost:6333');
    expect(config.embedding.provider).toBe('openai');
    expect(config.chunking.maxTokens).toBe(1500);
    expect(config.chunking.overlapTokens).toBe(100);
    expect(config.chunking.minTokens).toBe(200);
  });

  it('reads PORT as integer', async () => {
    vi.stubEnv('PORT', '8080');
    const config = await loadConfig();
    expect(config.port).toBe(8080);
  });

  it('splits AUTH_TOKENS by comma and filters empty', async () => {
    vi.stubEnv('AUTH_TOKENS', 'token1,token2,token3');
    const config = await loadConfig();
    expect(config.authTokens).toEqual(['token1', 'token2', 'token3']);
  });

  it('returns empty array when AUTH_TOKENS is empty', async () => {
    vi.stubEnv('AUTH_TOKENS', '');
    const config = await loadConfig();
    expect(config.authTokens).toEqual([]);
  });

  it('reads CHUNK_SIZE and CHUNK_OVERLAP as integers', async () => {
    vi.stubEnv('CHUNK_SIZE', '2000');
    vi.stubEnv('CHUNK_OVERLAP', '200');
    const config = await loadConfig();
    expect(config.chunking.maxTokens).toBe(2000);
    expect(config.chunking.overlapTokens).toBe(200);
  });

  it('reads vector store type from VECTOR_STORE', async () => {
    vi.stubEnv('VECTOR_STORE', 'chroma');
    const config = await loadConfig();
    expect(config.vectorStore).toBe('chroma');
  });

  it('reads embedding provider from EMBEDDING_PROVIDER', async () => {
    vi.stubEnv('EMBEDDING_PROVIDER', 'azure');
    const config = await loadConfig();
    expect(config.embedding.provider).toBe('azure');
  });

  it('reads GitLab configuration', async () => {
    vi.stubEnv('GITLAB_BRANCH', 'develop');
    vi.stubEnv('GITLAB_WEBHOOK_SECRET', 'secret123');
    const config = await loadConfig();
    expect(config.gitlab.url).toBe('https://gitlab.test.com');
    expect(config.gitlab.projectId).toBe('test-project');
    expect(config.gitlab.accessToken).toBe('glpat-test');
    expect(config.gitlab.branch).toBe('develop');
    expect(config.gitlab.webhookSecret).toBe('secret123');
  });

  it('reads Qdrant API key', async () => {
    vi.stubEnv('QDRANT_API_KEY', 'qdrant-key');
    const config = await loadConfig();
    expect(config.qdrant.apiKey).toBe('qdrant-key');
  });

  it('reads Azure OpenAI configuration', async () => {
    vi.stubEnv('AZURE_OPENAI_ENDPOINT', 'https://azure.test.com');
    vi.stubEnv('AZURE_OPENAI_API_KEY', 'azure-key');
    vi.stubEnv('AZURE_OPENAI_EMBEDDING_DEPLOYMENT', 'my-deployment');
    const config = await loadConfig();
    expect(config.embedding.azure.endpoint).toBe('https://azure.test.com');
    expect(config.embedding.azure.apiKey).toBe('azure-key');
    expect(config.embedding.azure.deployment).toBe('my-deployment');
  });
});
