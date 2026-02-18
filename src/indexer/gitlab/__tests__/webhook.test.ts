import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'crypto';

vi.mock('../../../config/index.js', () => ({
  config: {
    gitlab: {
      url: 'https://gitlab.test.com',
      projectId: 'test-project',
      accessToken: 'test-token',
      branch: 'main',
      webhookSecret: undefined as string | undefined,
    },
  },
}));

const mockSyncFile = vi.fn();
const mockDeleteFile = vi.fn();

vi.mock('../sync.js', () => ({
  syncFile: (...args: unknown[]) => mockSyncFile(...args),
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
}));

const mockGetFile = vi.fn();

vi.mock('../client.js', () => ({
  GitLabClient: class MockGitLabClient {
    getFile = mockGetFile;
    constructor() {}
  },
}));

import { verifyWebhookSignature, handleWebhook } from '../webhook.js';
import { config } from '../../../config/index.js';
import type { GitLabWebhookPayload } from '../../../types/index.js';

describe('verifyWebhookSignature', () => {
  beforeEach(() => {
    (config.gitlab as { webhookSecret: string | undefined }).webhookSecret = undefined;
  });

  it('returns true when no secret is configured', () => {
    expect(verifyWebhookSignature('any payload', 'any sig')).toBe(true);
  });

  it('returns true for valid signature', () => {
    const secret = 'my-secret';
    (config.gitlab as { webhookSecret: string | undefined }).webhookSecret = secret;

    const payload = '{"event":"push"}';
    const expected = createHmac('sha256', secret).update(payload).digest('hex');

    expect(verifyWebhookSignature(payload, expected)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    (config.gitlab as { webhookSecret: string | undefined }).webhookSecret = 'my-secret';
    expect(verifyWebhookSignature('payload', 'wrong-signature')).toBe(false);
  });
});

describe('handleWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFile.mockResolvedValue({
      path: 'docs/new.md',
      content: '# New',
      last_modified: '2024-01-01',
      author: 'Alice',
    });
  });

  it('collects added/modified/removed .md files from commits', async () => {
    const payload: GitLabWebhookPayload = {
      event: 'push',
      commits: [
        {
          added: ['docs/new.md'],
          modified: ['docs/existing.md'],
          removed: ['docs/old.md'],
        },
      ],
    };

    await handleWebhook(payload);

    expect(mockDeleteFile).toHaveBeenCalledWith('docs/old.md', undefined);
    expect(mockSyncFile).toHaveBeenCalledTimes(2);
  });

  it('ignores non-.md files', async () => {
    const payload: GitLabWebhookPayload = {
      event: 'push',
      commits: [
        {
          added: ['src/index.ts', 'docs/new.md'],
          modified: ['package.json'],
          removed: ['old.txt'],
        },
      ],
    };

    await handleWebhook(payload);

    expect(mockDeleteFile).not.toHaveBeenCalled();
    expect(mockSyncFile).toHaveBeenCalledTimes(1);
  });

  it('deduplicates files across multiple commits', async () => {
    const payload: GitLabWebhookPayload = {
      event: 'push',
      commits: [
        { added: ['docs/new.md'], modified: [], removed: [] },
        { added: ['docs/new.md'], modified: [], removed: [] },
      ],
    };

    await handleWebhook(payload);

    expect(mockSyncFile).toHaveBeenCalledTimes(1);
  });

  it('handles sync errors gracefully', async () => {
    mockGetFile.mockRejectedValueOnce(new Error('GitLab error'));

    const payload: GitLabWebhookPayload = {
      event: 'push',
      commits: [
        { added: ['docs/failing.md'], modified: [], removed: [] },
      ],
    };

    // Should not throw
    await handleWebhook(payload);
  });

  it('passes deps through to sync functions', async () => {
    const deps = {
      vectorStore: {} as import('../../../types/index.js').VectorStore,
      embeddingClient: {} as import('../../../types/index.js').EmbeddingClient,
    };

    const payload: GitLabWebhookPayload = {
      event: 'push',
      commits: [
        { added: [], modified: [], removed: ['docs/old.md'] },
      ],
    };

    await handleWebhook(payload, deps);

    expect(mockDeleteFile).toHaveBeenCalledWith('docs/old.md', deps);
  });
});
