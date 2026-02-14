import { Request } from 'express';
import { config } from '../../config/index.js';

export function authenticateRequest(req: Request): boolean {
  // Skip auth if no tokens configured (development mode)
  if (config.authTokens.length === 0) {
    return true;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  return config.authTokens.includes(token);
}
