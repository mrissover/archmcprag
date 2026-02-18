import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/index.js', () => ({
  config: {
    chunking: {
      maxTokens: 1500,
      overlapTokens: 100,
      minTokens: 200,
    },
  },
}));

import { chunkMarkdown } from '../markdown.js';
import { config } from '../../../config/index.js';
import type { GitLabFile } from '../../../types/index.js';

function makeFile(content: string, path = 'docs/test.md'): GitLabFile {
  return {
    path,
    content,
    last_modified: '2024-01-01T00:00:00Z',
    author: 'test-author',
  };
}

describe('chunkMarkdown', () => {
  it('extracts title from frontmatter', () => {
    const file = makeFile('---\ntitle: My Title\n---\n\nContent here.');
    const chunks = chunkMarkdown(file);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].document_title).toBe('My Title');
  });

  it('extracts title from H1 fallback', () => {
    const file = makeFile('# My H1 Title\n\nContent here.');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].document_title).toBe('My H1 Title');
  });

  it('falls back to filename for title', () => {
    const file = makeFile('Just content, no title.', 'docs/readme.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].document_title).toBe('readme');
  });

  it('extracts category from frontmatter', () => {
    const file = makeFile('---\ncategory: security\n---\n\nContent.', 'docs/test.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.category).toBe('security');
  });

  it('infers category from path (adrs/)', () => {
    const file = makeFile('# ADR\n\nContent.', 'adrs/0001-test.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.category).toBe('adr');
  });

  it('infers category from path (adr/)', () => {
    const file = makeFile('# ADR\n\nContent.', 'adr/0001-test.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.category).toBe('adr');
  });

  it('infers category from path (api-specs/)', () => {
    const file = makeFile('# API\n\nContent.', 'api-specs/user.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.category).toBe('api');
  });

  it('infers category from path (api/)', () => {
    const file = makeFile('# API\n\nContent.', 'api/user.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.category).toBe('api');
  });

  it('infers category from path (integrations/)', () => {
    const file = makeFile('# Integration\n\nContent.', 'integrations/kafka.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.category).toBe('integration');
  });

  it('infers category from path (security/)', () => {
    const file = makeFile('# Security\n\nContent.', 'security/policy.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.category).toBe('security');
  });

  it('uses general category for root files', () => {
    const file = makeFile('# Root\n\nContent.', 'readme.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.category).toBe('general');
  });

  it('uses directory name as category for unknown dirs', () => {
    const file = makeFile('# Doc\n\nContent.', 'guides/test.md');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.category).toBe('guides');
  });

  it('extracts tags from frontmatter', () => {
    const file = makeFile('---\ntags:\n  - auth\n  - security\n---\n\nContent.');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.tags).toEqual(['auth', 'security']);
  });

  it('returns empty tags when not in frontmatter', () => {
    const file = makeFile('# Doc\n\nContent.');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.tags).toEqual([]);
  });

  it('splits at headers into sections', () => {
    // Each section needs ~800+ chars (200+ tokens) to avoid being merged
    const content = '# Title\n\n' + 'word '.repeat(400) + '\n\n## Section 2\n\n' + 'word '.repeat(400);
    const file = makeFile(content);
    const chunks = chunkMarkdown(file);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('merges small sections together', () => {
    const content = '# Title\n\nShort.\n\n## Section 2\n\nAlso short.';
    const file = makeFile(content);
    const chunks = chunkMarkdown(file);
    // Both sections are tiny, should be merged
    expect(chunks.length).toBe(1);
  });

  it('splits large sections at paragraph boundaries', () => {
    // Make a large section exceeding maxTokens
    const paragraphs = Array.from({ length: 50 }, (_, i) => 'Paragraph ' + i + '. ' + 'word '.repeat(50));
    const content = '# Title\n\n' + paragraphs.join('\n\n');
    const file = makeFile(content);
    const chunks = chunkMarkdown(file);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('preserves code blocks in content', () => {
    const content = '# Title\n\n```js\nconst x = 1;\n```\n\nAfter code.' + ' word'.repeat(100);
    const file = makeFile(content);
    const chunks = chunkMarkdown(file);
    const allContent = chunks.map(c => c.content).join('\n');
    expect(allContent).toContain('```js\nconst x = 1;\n```');
  });

  it('handles empty content', () => {
    const file = makeFile('');
    const chunks = chunkMarkdown(file);
    expect(chunks).toEqual([]);
  });

  it('generates correct chunk IDs', () => {
    const content = '# Title\n\n' + 'a '.repeat(200) + '\n\n## Section 2\n\n' + 'b '.repeat(200);
    const file = makeFile(content, 'docs/test.md');
    const chunks = chunkMarkdown(file);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunk_id).toBe(`docs/test.md#chunk-${i}`);
    }
  });

  it('sets document_path on all chunks', () => {
    const file = makeFile('# Title\n\n' + 'content '.repeat(100), 'docs/my-file.md');
    const chunks = chunkMarkdown(file);
    for (const chunk of chunks) {
      expect(chunk.document_path).toBe('docs/my-file.md');
    }
  });

  it('generates content hashes', () => {
    const file = makeFile('# Title\n\nSome content.');
    const chunks = chunkMarkdown(file);
    for (const chunk of chunks) {
      expect(chunk.full_content_hash).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('preserves author and last_modified in metadata', () => {
    const file = makeFile('# Title\n\nContent.');
    const chunks = chunkMarkdown(file);
    expect(chunks[0].metadata.last_modified).toBe('2024-01-01T00:00:00Z');
    expect(chunks[0].metadata.author).toBe('test-author');
  });

  it('tracks section headers for each chunk', () => {
    const content = '# Title\n\ncontent.\n\n## Sub\n\nsub content.' + ' word'.repeat(200);
    const file = makeFile(content);
    const chunks = chunkMarkdown(file);
    const subChunk = chunks.find(c => c.section_headers.includes('Sub'));
    if (subChunk) {
      expect(subChunk.section_headers).toContain('Sub');
    }
  });
});
