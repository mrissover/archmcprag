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
    logger.error({ error }, 'Initial load failed');
    process.exit(1);
  }
}

export async function startServer(): Promise<ReturnType<express.Application['listen']>> {
  // Initialize vector store at startup
  const vectorStore = await getVectorStore();
  await vectorStore.initialize();
  logger.info('Vector store initialized');

  // Create MCP server
  const server = new McpServer({
    name: 'arch-docs-mcp',
    version: '1.0.0',
  });

  // Register tools
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

  // Create Express app
  const app = express();

  // Default JSON parser
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'arch-docs-mcp' });
  });

  // MCP endpoint
  app.all('/mcp', async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // Handle MCP session management
  app.delete('/mcp', async (_req, res) => {
    res.status(200).json({ status: 'session closed' });
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
        logger.error({ error }, 'Webhook processing failed');
      });

      res.json({ status: 'accepted' });
    } catch (error) {
      logger.error({ error }, 'Webhook handler error');
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

main().catch((error) => {
  logger.error({ error }, 'Failed to start');
  process.exit(1);
});
