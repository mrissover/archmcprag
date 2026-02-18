// Document and chunk types
export interface DocumentMetadata {
  category: string;
  tags: string[];
  last_modified: string;
  author: string;
}

export interface DocumentChunk {
  chunk_id: string;
  document_path: string;
  document_title: string;
  section_headers: string[];
  content: string;
  metadata: DocumentMetadata;
  full_content_hash: string;
}

export interface Document {
  path: string;
  title: string;
  content: string;
  metadata: DocumentMetadata & { word_count: number };
}

// Search types
export interface SearchFilter {
  category?: string;
  tags?: string[];
}

export interface SearchResult {
  content: string;
  document_path: string;
  document_title: string;
  section_header: string;
  relevance_score: number;
  metadata: DocumentMetadata;
}

export interface SearchResponse {
  results: SearchResult[];
  total_results: number;
}

// List documents types
export interface DocumentListItem {
  path: string;
  title: string;
  category: string;
  tags: string[];
  summary?: string;
  last_modified: string;
}

export interface ListDocumentsResponse {
  documents: DocumentListItem[];
  total_count: number;
}

// Get document response
export interface GetDocumentResponse {
  content: string;
  path: string;
  title: string;
  metadata: DocumentMetadata & { word_count: number };
}

// Vector store types
export interface VectorRecord {
  id: string;
  vector: number[];
  payload: DocumentChunk;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  payload: DocumentChunk;
}

// GitLab types
export interface GitLabFile {
  path: string;
  content: string;
  last_modified: string;
  author: string;
}

export interface GitLabWebhookPayload {
  event: string;
  commits: Array<{
    added: string[];
    modified: string[];
    removed: string[];
  }>;
}

// Embedding types
export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// Vector store interface
export interface VectorStore {
  initialize(): Promise<void>;
  reset(): Promise<void>;
  upsert(records: VectorRecord[]): Promise<void>;
  search(vector: number[], limit: number, filter?: SearchFilter): Promise<VectorSearchResult[]>;
  delete(ids: string[]): Promise<void>;
  deleteByDocumentPath(path: string): Promise<void>;
  getByDocumentPath(path: string): Promise<VectorSearchResult[]>;
  listDocuments(category?: string): Promise<DocumentListItem[]>;
}
