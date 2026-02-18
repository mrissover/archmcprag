import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/index.js', () => ({
  config: {
    authTokens: [] as string[],
  },
}));

import { authenticateRequest } from '../bearer.js';
import { config } from '../../../config/index.js';

function mockRequest(authHeader?: string) {
  return {
    headers: {
      authorization: authHeader,
    },
  } as import('express').Request;
}

describe('authenticateRequest', () => {
  beforeEach(() => {
    (config as { authTokens: string[] }).authTokens = [];
  });

  it('allows all requests when no tokens are configured', () => {
    expect(authenticateRequest(mockRequest())).toBe(true);
    expect(authenticateRequest(mockRequest('Bearer anything'))).toBe(true);
  });

  it('allows valid bearer token', () => {
    (config as { authTokens: string[] }).authTokens = ['valid-token'];
    expect(authenticateRequest(mockRequest('Bearer valid-token'))).toBe(true);
  });

  it('rejects invalid bearer token', () => {
    (config as { authTokens: string[] }).authTokens = ['valid-token'];
    expect(authenticateRequest(mockRequest('Bearer wrong-token'))).toBe(false);
  });

  it('rejects missing Authorization header', () => {
    (config as { authTokens: string[] }).authTokens = ['valid-token'];
    expect(authenticateRequest(mockRequest())).toBe(false);
  });

  it('rejects malformed Authorization header (no Bearer prefix)', () => {
    (config as { authTokens: string[] }).authTokens = ['valid-token'];
    expect(authenticateRequest(mockRequest('Basic valid-token'))).toBe(false);
  });

  it('supports multiple tokens', () => {
    (config as { authTokens: string[] }).authTokens = ['token-a', 'token-b'];
    expect(authenticateRequest(mockRequest('Bearer token-a'))).toBe(true);
    expect(authenticateRequest(mockRequest('Bearer token-b'))).toBe(true);
    expect(authenticateRequest(mockRequest('Bearer token-c'))).toBe(false);
  });
});
