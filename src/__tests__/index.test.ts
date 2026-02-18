import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';

const { mockVectorStore } = vi.hoisted(() => ({
  mockVectorStore: {
    initialize: vi.fn(),
    reset: vi.fn(),
    upsert: vi.fn(),
    search: vi.fn(),
    delete: vi.fn(),
    deleteByDocumentPath: vi.fn(),
    getByDocumentPath: vi.fn(),
    listDocuments: vi.fn(),
  },
}));

vi.mock('../shared.js', () => ({
  getVectorStore: () => Promise.resolve(mockVectorStore),
  getEmbeddingClient: () => ({ embed: vi.fn(), embedBatch: vi.fn() }),
}));

vi.mock('../config/index.js', () => ({
  config: {
    port: 0,
    host: '0.0.0.0',
    vectorStore: 'qdrant' as const,
    gitlab: {
      webhookSecret: undefined,
    },
  },
}));

vi.mock('../indexer/gitlab/sync.js', () => ({
  fullSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../indexer/gitlab/webhook.js', () => ({
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  handleWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../server/tools/search.js', () => ({
  searchArchitectureDocs: vi.fn().mockResolvedValue({ results: [], total_results: 0 }),
  searchSchema: z.object({
    query: z.string(),
    limit: z.number().default(5),
    filter: z.object({
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }).optional(),
  }),
}));

vi.mock('../server/tools/get-document.js', () => ({
  getDocument: vi.fn().mockResolvedValue({ content: '', path: '', title: '', metadata: {} }),
  getDocumentSchema: z.object({
    path: z.string(),
  }),
}));

vi.mock('../server/tools/list-documents.js', () => ({
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total_count: 0 }),
  listDocumentsSchema: z.object({
    category: z.string().optional(),
    include_summaries: z.boolean().default(false),
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class MockMcpServer {
    tool = vi.fn();
    connect = vi.fn();
    constructor() {}
  },
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class MockTransport {
    handleRequest = vi.fn();
    constructor() {}
  },
}));

import { startServer } from '../index.js';
import type { Server } from 'http';

function getPort(server: Server): number {
  const address = server.address();
  return typeof address === 'object' && address ? address.port : 0;
}

function waitForListening(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (getPort(server) > 0) {
      resolve();
    } else {
      server.once('listening', () => resolve());
    }
  });
}

describe('startServer', () => {
  let server: Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('starts Express server with health endpoint', async () => {
    server = await startServer();
    await waitForListening(server);
    const port = getPort(server);

    const res = await fetch(`http://localhost:${port}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok', service: 'arch-docs-mcp' });
  });

  it('initializes vector store', async () => {
    server = await startServer();
    expect(mockVectorStore.initialize).toHaveBeenCalled();
  });

  it('webhook endpoint accepts push events', async () => {
    server = await startServer();
    await waitForListening(server);
    const port = getPort(server);

    const res = await fetch(`http://localhost:${port}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'push', commits: [] }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('accepted');
  });

  it('webhook endpoint ignores non-push events', async () => {
    server = await startServer();
    await waitForListening(server);
    const port = getPort(server);

    const res = await fetch(`http://localhost:${port}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'tag_push', commits: [] }),
    });
    const body = await res.json();

    expect(body.status).toBe('ignored');
  });

  it('webhook endpoint rejects invalid signature', async () => {
    const { verifyWebhookSignature } = await import('../indexer/gitlab/webhook.js');
    vi.mocked(verifyWebhookSignature).mockReturnValueOnce(false);

    server = await startServer();
    await waitForListening(server);
    const port = getPort(server);

    const res = await fetch(`http://localhost:${port}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'push', commits: [] }),
    });

    expect(res.status).toBe(401);
  });
});
