import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockVectorStore, mockEmbeddingClient, mockListMarkdownFiles, mockGetFiles, mockGetFile } = vi.hoisted(() => ({
  mockVectorStore: {
    initialize: vi.fn(),
    upsert: vi.fn(),
    search: vi.fn(),
    delete: vi.fn(),
    deleteByDocumentPath: vi.fn(),
    getByDocumentPath: vi.fn(),
    listDocuments: vi.fn(),
  },
  mockEmbeddingClient: {
    embed: vi.fn(),
    embedBatch: vi.fn(),
  },
  mockListMarkdownFiles: vi.fn(),
  mockGetFiles: vi.fn(),
  mockGetFile: vi.fn(),
}));

vi.mock('../../../vectorstore/interface.js', () => ({
  createVectorStore: vi.fn().mockResolvedValue(mockVectorStore),
}));

vi.mock('../../embedding/client.js', () => ({
  createEmbeddingClient: vi.fn().mockReturnValue(mockEmbeddingClient),
}));

vi.mock('../../chunking/markdown.js', () => ({
  chunkMarkdown: vi.fn().mockReturnValue([
    {
      chunk_id: 'test.md#chunk-0',
      document_path: 'test.md',
      document_title: 'Test',
      section_headers: [],
      content: 'chunk content',
      metadata: { category: 'general', tags: [], last_modified: '', author: '' },
      full_content_hash: 'abc',
    },
  ]),
}));

vi.mock('../../embedding/batch.js', () => ({
  embedChunks: vi.fn().mockResolvedValue([
    { id: 'test.md#chunk-0', vector: [0.1], payload: {} },
  ]),
}));

vi.mock('../client.js', () => ({
  GitLabClient: class MockGitLabClient {
    listMarkdownFiles = mockListMarkdownFiles;
    getFiles = mockGetFiles;
    getFile = mockGetFile;
    constructor() {}
  },
}));

vi.mock('../../../config/index.js', () => ({
  config: {
    vectorStore: 'qdrant' as const,
  },
}));

import { fullSync, syncFile, deleteFile } from '../sync.js';
import type { GitLabFile } from '../../../types/index.js';

describe('fullSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes files in batches and upserts chunks', async () => {
    mockListMarkdownFiles.mockResolvedValue(['a.md', 'b.md']);
    mockGetFiles.mockResolvedValue([
      { path: 'a.md', content: '# A', last_modified: '', author: '' },
      { path: 'b.md', content: '# B', last_modified: '', author: '' },
    ]);

    await fullSync();

    expect(mockVectorStore.initialize).toHaveBeenCalled();
    expect(mockListMarkdownFiles).toHaveBeenCalled();
    expect(mockGetFiles).toHaveBeenCalled();
    expect(mockVectorStore.upsert).toHaveBeenCalled();
  });

  it('accepts injected dependencies', async () => {
    const customVS = { ...mockVectorStore, initialize: vi.fn(), upsert: vi.fn() };
    const customEC = { embed: vi.fn(), embedBatch: vi.fn() };

    mockListMarkdownFiles.mockResolvedValue([]);

    await fullSync({ vectorStore: customVS, embeddingClient: customEC });

    expect(customVS.initialize).toHaveBeenCalled();
  });

  it('handles empty file list', async () => {
    mockListMarkdownFiles.mockResolvedValue([]);

    await fullSync();

    expect(mockVectorStore.upsert).not.toHaveBeenCalled();
  });
});

describe('syncFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes old chunks then upserts new ones', async () => {
    const file: GitLabFile = { path: 'test.md', content: '# Test', last_modified: '', author: '' };

    await syncFile(file);

    expect(mockVectorStore.deleteByDocumentPath).toHaveBeenCalledWith('test.md');
    expect(mockVectorStore.upsert).toHaveBeenCalled();
  });

  it('accepts injected dependencies', async () => {
    const customVS = { ...mockVectorStore, deleteByDocumentPath: vi.fn(), upsert: vi.fn() };
    const file: GitLabFile = { path: 'test.md', content: '# Test', last_modified: '', author: '' };

    await syncFile(file, { vectorStore: customVS });

    expect(customVS.deleteByDocumentPath).toHaveBeenCalledWith('test.md');
  });
});

describe('deleteFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls deleteByDocumentPath', async () => {
    await deleteFile('docs/old.md');

    expect(mockVectorStore.deleteByDocumentPath).toHaveBeenCalledWith('docs/old.md');
  });

  it('accepts injected dependencies', async () => {
    const customVS = { ...mockVectorStore, deleteByDocumentPath: vi.fn() };

    await deleteFile('docs/old.md', { vectorStore: customVS });

    expect(customVS.deleteByDocumentPath).toHaveBeenCalledWith('docs/old.md');
  });
});
