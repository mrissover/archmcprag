import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { config } from '../config/index.js';
import { authenticateRequest } from './auth/bearer.js';
import { searchArchitectureDocs, searchSchema } from './tools/search.js';
import { getDocument, getDocumentSchema } from './tools/get-document.js';
import { listDocuments, listDocumentsSchema } from './tools/list-documents.js';
import { createVectorStore } from '../vectorstore/interface.js';
import pino from 'pino';

const logger = pino({ name: 'mcp-server' });

async function main() {
  // Initialize vector store
  const vectorStore = await createVectorStore(config.vectorStore);
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
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'arch-docs-mcp' });
  });

  // MCP endpoint with authentication
  app.all('/mcp', async (req, res) => {
    // Authenticate
    if (!authenticateRequest(req)) {
      logger.warn('Unauthorized MCP request');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Create transport for this request
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    // Connect server to transport
    await server.connect(transport);

    // Handle the request
    await transport.handleRequest(req, res, req.body);
  });

  // Handle MCP session management
  app.delete('/mcp', async (req, res) => {
    if (!authenticateRequest(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.status(200).json({ status: 'session closed' });
  });

  // Start server
  app.listen(config.port, config.host, () => {
    logger.info(`MCP server listening on http://${config.host}:${config.port}`);
    logger.info('Available endpoints:');
    logger.info(`  GET  /health - Health check`);
    logger.info(`  POST /mcp    - MCP endpoint`);
  });
}

main().catch((error) => {
  logger.error({ error }, 'Server failed to start');
  process.exit(1);
});
