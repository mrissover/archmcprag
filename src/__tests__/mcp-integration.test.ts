import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'http';

// --- Mocks (must be before imports) ---

const mockVectorStore = {
  initialize: vi.fn(),
  reset: vi.fn(),
  upsert: vi.fn(),
  search: vi.fn().mockResolvedValue([]),
  delete: vi.fn(),
  deleteByDocumentPath: vi.fn(),
  getByDocumentPath: vi.fn().mockResolvedValue([]),
  listDocuments: vi.fn().mockResolvedValue([]),
};

const mockEmbeddingClient = {
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  embedBatch: vi.fn().mockResolvedValue([]),
};

vi.mock('../shared.js', () => ({
  getVectorStore: () => Promise.resolve(mockVectorStore),
  getEmbeddingClient: () => mockEmbeddingClient,
}));

vi.mock('../config/index.js', () => ({
  config: {
    port: 0, // random available port
    host: '127.0.0.1',
    vectorStore: 'qdrant' as const,
    gitlab: { webhookSecret: undefined },
  },
}));

vi.mock('../indexer/gitlab/sync.js', () => ({
  fullSync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../indexer/gitlab/webhook.js', () => ({
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  handleWebhook: vi.fn().mockResolvedValue(undefined),
}));

// --- Real imports (MCP SDK is NOT mocked) ---

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startServer } from '../index.js';

// --- Helpers ---

function getPort(server: Server): number {
  const address = server.address();
  return typeof address === 'object' && address ? address.port : 0;
}

function waitForListening(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (getPort(server) > 0) resolve();
    else server.once('listening', () => resolve());
  });
}

async function createMcpClient(port: number): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`)
  );
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// --- Tests ---

describe('MCP Integration', () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = await startServer();
    await waitForListening(server);
    port = getPort(server);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set default mock return values
    mockVectorStore.search.mockResolvedValue([]);
    mockVectorStore.getByDocumentPath.mockResolvedValue([]);
    mockVectorStore.listDocuments.mockResolvedValue([]);
    mockEmbeddingClient.embed.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  describe('handshake', () => {
    it('completes full MCP handshake and returns server info', async () => {
      const client = await createMcpClient(port);

      const serverVersion = client.getServerVersion();
      expect(serverVersion?.name).toBe('arch-docs-mcp');
      expect(serverVersion?.version).toBe('1.0.0');

      const capabilities = client.getServerCapabilities();
      expect(capabilities?.tools).toBeDefined();

      await client.close();
    });

    it('returns all three tools via tools/list', async () => {
      const client = await createMcpClient(port);

      const { tools } = await client.listTools();
      const toolNames = tools.map(t => t.name).sort();

      expect(toolNames).toEqual([
        'get_document',
        'list_documents',
        'search_architecture_docs',
      ]);

      await client.close();
    });

    it('tools have descriptions and input schemas', async () => {
      const client = await createMcpClient(port);

      const { tools } = await client.listTools();

      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }

      await client.close();
    });
  });

  describe('multi-client sessions', () => {
    it('supports two clients connected simultaneously', async () => {
      const client1 = await createMcpClient(port);
      const client2 = await createMcpClient(port);

      const [tools1, tools2] = await Promise.all([
        client1.listTools(),
        client2.listTools(),
      ]);

      expect(tools1.tools).toHaveLength(3);
      expect(tools2.tools).toHaveLength(3);

      await client1.close();
      await client2.close();
    });

    it('sessions are independent — closing one does not affect the other', async () => {
      const client1 = await createMcpClient(port);
      const client2 = await createMcpClient(port);

      await client1.close();

      // client2 should still work after client1 disconnects
      const { tools } = await client2.listTools();
      expect(tools).toHaveLength(3);

      await client2.close();
    });
  });

  describe('invalid session', () => {
    it('returns 404 for unknown session ID', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'mcp-session-id': 'nonexistent-session-id',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/list',
          id: 1,
          params: {},
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('tool execution: search_architecture_docs', () => {
    it('calls embed + search and returns results', async () => {
      mockEmbeddingClient.embed.mockResolvedValue([0.5, 0.6]);
      mockVectorStore.search.mockResolvedValue([
        {
          id: 'adr-001.md#chunk-0',
          score: 0.95,
          payload: {
            content: 'We chose JWT for authentication.',
            document_path: 'adrs/adr-001.md',
            document_title: 'ADR-001: Authentication',
            section_headers: ['Decision'],
            metadata: { category: 'adr', tags: ['auth'], last_modified: '2024-01-01', author: 'alice' },
          },
        },
      ]);

      const client = await createMcpClient(port);

      const result = await client.callTool({
        name: 'search_architecture_docs',
        arguments: { query: 'authentication pattern' },
      });

      expect(mockEmbeddingClient.embed).toHaveBeenCalledWith('authentication pattern');
      expect(mockVectorStore.search).toHaveBeenCalled();

      // Result is JSON text content
      expect(result.content).toHaveLength(1);
      const content = result.content[0];
      expect(content).toHaveProperty('type', 'text');
      if (content.type === 'text') {
        const parsed = JSON.parse(content.text);
        expect(parsed.total_results).toBe(1);
        expect(parsed.results[0].content).toBe('We chose JWT for authentication.');
        expect(parsed.results[0].relevance_score).toBe(0.95);
      }

      await client.close();
    });

    it('handles empty search results', async () => {
      mockVectorStore.search.mockResolvedValue([]);

      const client = await createMcpClient(port);

      const result = await client.callTool({
        name: 'search_architecture_docs',
        arguments: { query: 'nonexistent topic' },
      });

      const content = result.content[0];
      if (content.type === 'text') {
        const parsed = JSON.parse(content.text);
        expect(parsed.total_results).toBe(0);
        expect(parsed.results).toEqual([]);
      }

      await client.close();
    });
  });

  describe('tool execution: list_documents', () => {
    it('returns document list', async () => {
      mockVectorStore.listDocuments.mockResolvedValue([
        { path: 'adrs/adr-001.md', title: 'ADR-001', category: 'adr', tags: ['auth'], last_modified: '2024-01-01' },
        { path: 'api/users.md', title: 'Users API', category: 'api', tags: [], last_modified: '2024-02-01' },
      ]);

      const client = await createMcpClient(port);

      const result = await client.callTool({
        name: 'list_documents',
        arguments: {},
      });

      const content = result.content[0];
      if (content.type === 'text') {
        const parsed = JSON.parse(content.text);
        expect(parsed.total_count).toBe(2);
        expect(parsed.documents[0].path).toBe('adrs/adr-001.md');
      }

      await client.close();
    });

    it('passes category filter', async () => {
      mockVectorStore.listDocuments.mockResolvedValue([]);

      const client = await createMcpClient(port);

      await client.callTool({
        name: 'list_documents',
        arguments: { category: 'adr' },
      });

      expect(mockVectorStore.listDocuments).toHaveBeenCalledWith('adr');

      await client.close();
    });
  });

  describe('tool execution: get_document', () => {
    it('returns reconstructed document from chunks', async () => {
      mockVectorStore.getByDocumentPath.mockResolvedValue([
        {
          id: 'doc.md#chunk-1',
          score: 1,
          payload: {
            content: 'Second section',
            document_path: 'doc.md',
            document_title: 'Test Doc',
            section_headers: ['Intro'],
            metadata: { category: 'general', tags: [], last_modified: '', author: '' },
            full_content_hash: 'b',
          },
        },
        {
          id: 'doc.md#chunk-0',
          score: 1,
          payload: {
            content: 'First section',
            document_path: 'doc.md',
            document_title: 'Test Doc',
            section_headers: ['Intro'],
            metadata: { category: 'general', tags: [], last_modified: '', author: '' },
            full_content_hash: 'a',
          },
        },
      ]);

      const client = await createMcpClient(port);

      const result = await client.callTool({
        name: 'get_document',
        arguments: { path: 'doc.md' },
      });

      const content = result.content[0];
      if (content.type === 'text') {
        const parsed = JSON.parse(content.text);
        expect(parsed.content).toBe('First section\n\nSecond section');
        expect(parsed.title).toBe('Test Doc');
        expect(parsed.path).toBe('doc.md');
      }

      await client.close();
    });

    it('returns error for missing document', async () => {
      mockVectorStore.getByDocumentPath.mockResolvedValue([]);

      const client = await createMcpClient(port);

      const result = await client.callTool({
        name: 'get_document',
        arguments: { path: 'nonexistent.md' },
      });

      const content = result.content[0];
      if (content.type === 'text') {
        const parsed = JSON.parse(content.text);
        expect(parsed.error).toContain('nonexistent.md');
      }

      await client.close();
    });
  });

  describe('health endpoint', () => {
    it('returns ok status', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ status: 'ok', service: 'arch-docs-mcp' });
    });
  });
});
