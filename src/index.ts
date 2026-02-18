import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { config } from './config/index.js';
import { searchArchitectureDocs, searchSchema } from './server/tools/search.js';
import { getDocument, getDocumentSchema } from './server/tools/get-document.js';
import { listDocuments, listDocumentsSchema } from './server/tools/list-documents.js';
import { getVectorStore } from './shared.js';
import { handleWebhook, verifyWebhookSignature } from './indexer/gitlab/webhook.js';
import { fullSync } from './indexer/gitlab/sync.js';
import type { GitLabWebhookPayload } from './types/index.js';
import pino from 'pino';

const logger = pino({ name: 'arch-docs-mcp' });

async function runInitialLoad(): Promise<void> {
  logger.info('Starting initial document load');
  try {
    await fullSync();
    logger.info('Initial load complete');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Initial load failed');
    process.exit(1);
  }
}

/**
 * Creates a fresh MCP server with all tools registered.
 * Each client session gets its own server+transport pair because
 * the MCP SDK only allows one initialize per server instance.
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'arch-docs-mcp',
    version: '1.0.0',
  });

  server.tool(
    'search_architecture_docs',
    'Search architectural design documents using natural language queries. Returns relevant document sections ranked by relevance.',
    searchSchema.shape,
    async (args) => {
      const input = searchSchema.parse(args);
      const result = await searchArchitectureDocs(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'get_document',
    'Retrieve the full content of a specific architecture document by its path',
    getDocumentSchema.shape,
    async (args) => {
      const input = getDocumentSchema.parse(args);
      const result = await getDocument(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    'list_documents',
    'List available architecture documents, optionally filtered by category',
    listDocumentsSchema.shape,
    async (args) => {
      const input = listDocumentsSchema.parse(args);
      const result = await listDocuments(input);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  return server;
}

export async function startServer(): Promise<ReturnType<express.Application['listen']>> {
  // Initialize vector store at startup
  const vectorStore = await getVectorStore();
  await vectorStore.initialize();
  logger.info('Vector store initialized');

  // Session map: each client gets its own MCP server+transport pair
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // Create Express app
  const app = express();

  // Default JSON parser
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'arch-docs-mcp' });
  });

  // MCP endpoint — route by session ID
  app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — route to its transport
    if (sessionId) {
      const transport = sessions.get(sessionId);
      if (!transport) {
        res.status(404).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Session not found' }, id: null });
        return;
      }
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // No session ID — new client, create a dedicated server+transport
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport);
        logger.info({ sessionId: id, activeSessions: sessions.size }, 'MCP session created');
      },
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) {
        sessions.delete(id);
        logger.info({ sessionId: id, activeSessions: sessions.size }, 'MCP session closed');
      }
      server.close();
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // GitLab webhook endpoint
  app.post('/webhook', async (req, res) => {
    try {
      const signature = req.headers['x-gitlab-token'] as string || '';
      const rawBody = JSON.stringify(req.body);

      if (!verifyWebhookSignature(rawBody, signature)) {
        logger.warn('Invalid webhook signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      const payload = req.body as GitLabWebhookPayload;

      if (payload.event !== 'push') {
        logger.info({ event: payload.event }, 'Ignoring non-push event');
        res.json({ status: 'ignored' });
        return;
      }

      // Process webhook asynchronously
      handleWebhook(payload).catch(error => {
        logger.error({ err: error }, 'Webhook processing failed');
      });

      res.json({ status: 'accepted' });
    } catch (error) {
      logger.error({ err: error }, 'Webhook handler error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Start server
  const handle = app.listen(config.port, config.host, () => {
    logger.info(`Server listening on http://${config.host}:${config.port}`);
    logger.info('Available endpoints:');
    logger.info('  GET  /health  - Health check');
    logger.info('  POST /mcp     - MCP endpoint');
    logger.info('  POST /webhook - GitLab webhook');
  });

  return handle;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--initial-load') || args.includes('--reindex')) {
    await runInitialLoad();
    return;
  }

  await startServer();
}

// Only auto-start when run directly (not when imported by tests)
const isDirectRun = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isDirectRun) {
  main().catch((error) => {
    logger.error({ err: error }, 'Failed to start');
    process.exit(1);
  });
}
