import express, { Request, Response, NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from '../../config/index.js';
import { authenticateRequest } from '../auth/bearer.js';
import pino from 'pino';

const logger = pino({ name: 'http-transport' });

export function createHttpServer() {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // Health check (no auth required)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'arch-docs-mcp' });
  });

  // Auth middleware for MCP endpoints
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!authenticateRequest(req)) {
      logger.warn({ path: req.path }, 'Unauthorized request');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };

  return { app, authMiddleware };
}

export function startServer(app: express.Application) {
  app.listen(config.port, config.host, () => {
    logger.info(`MCP server listening on ${config.host}:${config.port}`);
  });
}
