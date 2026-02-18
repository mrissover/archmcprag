import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/index.js', () => ({
  config: {
    gitlab: {
      url: 'https://gitlab.test.com',
      projectId: 'my-project',
      accessToken: 'test-token',
      branch: 'main',
    },
  },
}));

import { GitLabClient } from '../client.js';

describe('GitLabClient', () => {
  let client: GitLabClient;

  beforeEach(() => {
    client = new GitLabClient();
    vi.restoreAllMocks();
  });

  describe('listMarkdownFiles', () => {
    it('returns markdown file paths, filtering non-.md files', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { type: 'blob', path: 'docs/readme.md', id: '1', name: 'readme.md', mode: '100644' },
          { type: 'blob', path: 'src/index.ts', id: '2', name: 'index.ts', mode: '100644' },
          { type: 'tree', path: 'src', id: '3', name: 'src', mode: '040000' },
          { type: 'blob', path: 'adrs/0001.md', id: '4', name: '0001.md', mode: '100644' },
        ],
      } as Response);

      const files = await client.listMarkdownFiles();

      expect(files).toEqual(['docs/readme.md', 'adrs/0001.md']);
    });

    it('handles pagination', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({
        type: 'blob' as const,
        path: `docs/file-${i}.md`,
        id: String(i),
        name: `file-${i}.md`,
        mode: '100644',
      }));

      const page2 = [
        { type: 'blob' as const, path: 'docs/last.md', id: '100', name: 'last.md', mode: '100644' },
      ];

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({ ok: true, json: async () => page1 } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => page2 } as Response);

      const files = await client.listMarkdownFiles();

      expect(files).toHaveLength(101);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getFile', () => {
    it('decodes base64 content and fetches commit metadata', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            file_name: 'readme.md',
            file_path: 'docs/readme.md',
            content: Buffer.from('# Hello World').toString('base64'),
            encoding: 'base64',
            last_commit_id: 'abc123',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ([
            { id: 'abc123', authored_date: '2024-01-15T10:00:00Z', author_name: 'Alice' },
          ]),
        } as Response);

      const file = await client.getFile('docs/readme.md');

      expect(file.path).toBe('docs/readme.md');
      expect(file.content).toBe('# Hello World');
      expect(file.last_modified).toBe('2024-01-15T10:00:00Z');
      expect(file.author).toBe('Alice');
    });

    it('uses default values when commit data is empty', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            file_name: 'readme.md',
            file_path: 'docs/readme.md',
            content: Buffer.from('content').toString('base64'),
            encoding: 'base64',
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ([]),
        } as Response);

      const file = await client.getFile('docs/readme.md');

      expect(file.author).toBe('unknown');
      expect(file.last_modified).toBeTruthy(); // Falls back to new Date().toISOString()
    });
  });

  describe('getFiles', () => {
    it('returns files and handles individual failures gracefully', async () => {
      let callCount = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        callCount++;
        const urlStr = String(url);

        if (urlStr.includes('good.md') && urlStr.includes('/files/')) {
          return {
            ok: true,
            json: async () => ({
              file_name: 'good.md',
              file_path: 'good.md',
              content: Buffer.from('good content').toString('base64'),
              encoding: 'base64',
            }),
          } as Response;
        }

        if (urlStr.includes('good.md') && urlStr.includes('/commits')) {
          return {
            ok: true,
            json: async () => ([{ id: 'a', authored_date: '2024-01-01', author_name: 'A' }]),
          } as Response;
        }

        if (urlStr.includes('bad.md')) {
          return { ok: false, status: 404, statusText: 'Not Found' } as Response;
        }

        return { ok: true, json: async () => ([]) } as Response;
      });

      const files = await client.getFiles(['good.md', 'bad.md']);

      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('good.md');
    });
  });

  describe('API error handling', () => {
    it('throws on non-OK response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(client.listMarkdownFiles()).rejects.toThrow('GitLab API error: 500 Internal Server Error');
    });
  });
});
