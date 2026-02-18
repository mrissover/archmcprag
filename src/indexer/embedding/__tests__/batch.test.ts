import { describe, it, expect, vi } from 'vitest';
import { embedChunks, generateChunkId, generateContentHash, chunkIdToUuid } from '../batch.js';
import type { EmbeddingClient, DocumentChunk } from '../../../types/index.js';

describe('generateChunkId', () => {
  it('returns path#chunk-N format', () => {
    expect(generateChunkId('docs/readme.md', 0)).toBe('docs/readme.md#chunk-0');
    expect(generateChunkId('foo.md', 5)).toBe('foo.md#chunk-5');
  });
});

describe('chunkIdToUuid', () => {
  it('returns a valid UUID format', () => {
    const uuid = chunkIdToUuid('doc.md#chunk-0');
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('is deterministic', () => {
    expect(chunkIdToUuid('doc.md#chunk-0')).toBe(chunkIdToUuid('doc.md#chunk-0'));
  });

  it('produces different UUIDs for different chunk IDs', () => {
    expect(chunkIdToUuid('doc.md#chunk-0')).not.toBe(chunkIdToUuid('doc.md#chunk-1'));
  });
});

describe('generateContentHash', () => {
  it('returns a 16-char hex string', () => {
    const hash = generateContentHash('hello world');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic', () => {
    const a = generateContentHash('test content');
    const b = generateContentHash('test content');
    expect(a).toBe(b);
  });

  it('produces different hashes for different content', () => {
    const a = generateContentHash('content A');
    const b = generateContentHash('content B');
    expect(a).not.toBe(b);
  });
});

describe('embedChunks', () => {
  it('maps chunks to vector records using the embedding client', async () => {
    const mockClient: EmbeddingClient = {
      embed: vi.fn(),
      embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
    };

    const chunks: DocumentChunk[] = [
      {
        chunk_id: 'doc.md#chunk-0',
        document_path: 'doc.md',
        document_title: 'Doc',
        section_headers: ['Header'],
        content: 'chunk one',
        metadata: { category: 'general', tags: [], last_modified: '', author: '' },
        full_content_hash: 'abc123',
      },
      {
        chunk_id: 'doc.md#chunk-1',
        document_path: 'doc.md',
        document_title: 'Doc',
        section_headers: ['Header'],
        content: 'chunk two',
        metadata: { category: 'general', tags: [], last_modified: '', author: '' },
        full_content_hash: 'def456',
      },
    ];

    const records = await embedChunks(mockClient, chunks);

    expect(mockClient.embedBatch).toHaveBeenCalledWith(['chunk one', 'chunk two']);
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe(chunkIdToUuid('doc.md#chunk-0'));
    expect(records[0].vector).toEqual([0.1, 0.2]);
    expect(records[0].payload).toBe(chunks[0]);
    expect(records[1].id).toBe(chunkIdToUuid('doc.md#chunk-1'));
    expect(records[1].vector).toEqual([0.3, 0.4]);
  });
});
