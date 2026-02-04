# Architecture Documentation RAG MCP Server

## Project Overview

This project implements a Model Context Protocol (MCP) server that provides semantic search access to architectural design documents stored in a GitLab repository. The server supports both Anthropic Claude Code and OpenAI Codex clients, enabling developers across the organization to query architecture documentation directly from their coding tools.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | Best MCP SDK support (Anthropic's official SDK is TypeScript-first), strong typing for MCP tool schemas, mature ecosystem |
| Vector Database | Qdrant (primary) | Rust-based performance, strong filtering for category/tags, typed payload schemas, production-ready. Chroma adapter available as fallback. |
| Transport | Streamable HTTP | Central server for all developers, single source of truth, easier GitLab sync |
| Embedding Model | OpenAI `text-embedding-3-small` or open-source alternative | Cost-effective, good performance for documentation |

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │     │  OpenAI Codex   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │    MCP Protocol       │
         │   (Streamable HTTP)   │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │     MCP Server        │
         │  (TypeScript/Node)    │
         │                       │
         │  - Tool Handlers      │
         │  - Auth Middleware    │
         │  - Query Processing   │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │   Vector Store        │
         │   (Qdrant/Chroma)     │
         │                       │
         │  - Document Chunks    │
         │  - Embeddings         │
         │  - Metadata           │
         └───────────────────────┘
                     ▲
                     │
         ┌───────────────────────┐
         │     Indexer           │
         │                       │
         │  - GitLab Sync        │
         │  - Chunking           │
         │  - Embedding Gen      │
         └───────────────────────┘
                     ▲
                     │
         ┌───────────────────────┐
         │   GitLab Repository   │
         │                       │
         │  - Markdown Docs      │
         │  - Contributing Guide │
         │  - Architecture ADRs  │
         └───────────────────────┘
```

## Project Structure

```
arch-docs-mcp/
├── src/
│   ├── server/
│   │   ├── index.ts              # MCP server entry point
│   │   ├── tools/
│   │   │   ├── search.ts         # search_architecture_docs tool
│   │   │   ├── get-document.ts   # get_document tool
│   │   │   └── list-documents.ts # list_documents tool
│   │   ├── transport/
│   │   │   └── http.ts           # Streamable HTTP transport
│   │   └── auth/
│   │       └── bearer.ts         # Bearer token authentication
│   ├── indexer/
│   │   ├── index.ts              # Indexer entry point
│   │   ├── gitlab/
│   │   │   ├── client.ts         # GitLab API client
│   │   │   ├── sync.ts           # Full sync logic
│   │   │   └── webhook.ts        # Webhook handler for incremental updates
│   │   ├── chunking/
│   │   │   ├── markdown.ts       # Markdown-aware chunking
│   │   │   └── strategies.ts     # Chunking strategy definitions
│   │   └── embedding/
│   │       ├── client.ts         # Embedding API client
│   │       └── batch.ts          # Batch embedding processing
│   ├── vectorstore/
│   │   ├── interface.ts          # Abstract vector store interface
│   │   ├── qdrant.ts             # Qdrant implementation
│   │   └── chroma.ts             # Chroma implementation
│   ├── config/
│   │   └── index.ts              # Configuration management
│   └── types/
│       └── index.ts              # Shared TypeScript types
├── scripts/
│   ├── initial-load.ts           # One-time full indexing script
│   └── reindex.ts                # Manual reindex trigger
├── docker/
│   ├── Dockerfile                # MCP server container
│   ├── Dockerfile.indexer        # Indexer container
│   └── docker-compose.yml        # Local dev setup with Qdrant/Chroma
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## MCP Tool Definitions

### Tool 1: `search_architecture_docs`

Semantic search across all architecture documentation.

```typescript
{
  name: "search_architecture_docs",
  description: "Search architectural design documents using natural language queries. Returns relevant document sections ranked by relevance.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language search query describing what you're looking for"
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 5, max: 20)",
        default: 5
      },
      filter: {
        type: "object",
        description: "Optional filters to narrow results",
        properties: {
          category: {
            type: "string",
            description: "Filter by document category (e.g., 'adr', 'api', 'integration', 'security')"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter by tags"
          }
        }
      }
    },
    required: ["query"]
  }
}
```

**Response format:**
```typescript
{
  results: [
    {
      content: string,           // The relevant text chunk
      document_path: string,     // Path in GitLab repo
      document_title: string,    // Extracted title
      section_header: string,    // Nearest header above the chunk
      relevance_score: number,   // 0-1 similarity score
      metadata: {
        category: string,
        tags: string[],
        last_modified: string,
        author: string
      }
    }
  ],
  total_results: number
}
```

### Tool 2: `get_document`

Retrieve a complete document by path.

```typescript
{
  name: "get_document",
  description: "Retrieve the full content of a specific architecture document by its path",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the document in the repository (e.g., 'adrs/0001-authentication-pattern.md')"
      }
    },
    required: ["path"]
  }
}
```

**Response format:**
```typescript
{
  content: string,              // Full markdown content
  path: string,
  title: string,
  metadata: {
    category: string,
    tags: string[],
    last_modified: string,
    author: string,
    word_count: number
  }
}
```

### Tool 3: `list_documents`

Browse available documents by category.

```typescript
{
  name: "list_documents",
  description: "List available architecture documents, optionally filtered by category",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Filter by category (e.g., 'adr', 'api', 'integration', 'security')"
      },
      include_summaries: {
        type: "boolean",
        description: "Include brief summaries of each document (default: false)",
        default: false
      }
    },
    required: []
  }
}
```

**Response format:**
```typescript
{
  documents: [
    {
      path: string,
      title: string,
      category: string,
      tags: string[],
      summary?: string,         // If include_summaries=true
      last_modified: string
    }
  ],
  total_count: number
}
```

## Chunking Strategy

Architecture documents require careful chunking to preserve context. Use the following strategy:

### Chunk Boundaries

1. **Primary split**: By markdown headers (h1, h2, h3)
2. **Secondary split**: If a section exceeds 1500 tokens, split at paragraph boundaries
3. **Minimum chunk size**: 200 tokens (merge small sections with their parent)
4. **Overlap**: 100 tokens between chunks to preserve context at boundaries

### Metadata Extraction

For each chunk, extract and store:

```typescript
{
  // Identifiers
  document_path: string,        // "adrs/0001-auth-pattern.md"
  chunk_id: string,             // "adrs/0001-auth-pattern.md#chunk-3"
  
  // Hierarchy
  document_title: string,       // From first h1 or filename
  section_headers: string[],    // ["Authentication", "OAuth 2.0 Flow"]
  
  // Classification
  category: string,             // Extracted from path or frontmatter
  tags: string[],               // From frontmatter or auto-extracted
  
  // Provenance
  last_modified: string,        // ISO timestamp from Git
  author: string,               // From Git blame or frontmatter
  
  // For retrieval
  full_content_hash: string     // For deduplication on reindex
}
```

### Special Handling

- **Code blocks**: Keep intact, don't split mid-block
- **Tables**: Keep intact with their headers
- **Mermaid diagrams**: Keep intact, include surrounding context
- **Frontmatter**: Parse YAML frontmatter for metadata, don't include in searchable content

## Vector Store Schema

### Qdrant Collection Configuration

```typescript
{
  collection_name: "architecture_docs",
  vectors: {
    size: 1536,                 // For text-embedding-3-small
    distance: "Cosine"
  },
  payload_schema: {
    document_path: "keyword",
    document_title: "text",
    section_headers: "text[]",
    category: "keyword",
    tags: "keyword[]",
    last_modified: "datetime",
    author: "keyword",
    content: "text"             // Store original text for retrieval
  }
}
```

### Chroma Collection Configuration

```typescript
{
  name: "architecture_docs",
  metadata: {
    "hnsw:space": "cosine"
  }
}
```

## GitLab Integration

### Initial Sync

1. Clone repository (or use GitLab API for file listing)
2. Walk all `.md` files
3. Parse each file:
   - Extract frontmatter metadata
   - Chunk content
   - Generate embeddings
4. Upsert to vector store
5. Store sync state (commit SHA, timestamp)

### Incremental Updates (Webhook)

Listen for GitLab push events:

```typescript
// Webhook payload processing
{
  event: "push",
  commits: [
    {
      added: ["docs/new-doc.md"],
      modified: ["adrs/0001-auth.md"],
      removed: ["deprecated/old-doc.md"]
    }
  ]
}
```

For each change:
- **Added**: Chunk, embed, insert
- **Modified**: Delete old chunks, re-chunk, embed, insert
- **Removed**: Delete all chunks for that document

### GitLab API Client

```typescript
interface GitLabConfig {
  baseUrl: string;              // "https://gitlab.company.com"
  projectId: string;            // "arch-team/design-docs"
  accessToken: string;          // Personal or project access token
  branch: string;               // "main"
}
```

## Configuration

### Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0
AUTH_TOKENS=token1,token2,token3   # Comma-separated valid bearer tokens

# Vector Store
VECTOR_STORE=qdrant              # or "chroma"
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                  # Optional
CHROMA_URL=http://localhost:8000

# Embeddings
EMBEDDING_PROVIDER=openai        # or "azure" or "local"
OPENAI_API_KEY=sk-...
# For Azure:
# AZURE_OPENAI_ENDPOINT=https://xxx.openai.azure.com
# AZURE_OPENAI_API_KEY=...
# AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small

# GitLab
GITLAB_URL=https://gitlab.company.com
GITLAB_PROJECT_ID=arch-team/design-docs
GITLAB_ACCESS_TOKEN=glpat-...
GITLAB_BRANCH=main
GITLAB_WEBHOOK_SECRET=           # For validating webhook payloads

# Indexer
CHUNK_SIZE=1500                  # Max tokens per chunk
CHUNK_OVERLAP=100                # Token overlap between chunks
```

## Authentication

### Bearer Token Auth

Simple bearer token authentication for internal use:

```typescript
// Middleware
function authenticateRequest(req: Request): boolean {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.slice(7);
  return config.authTokens.includes(token);
}
```

### Client Configuration

**OpenAI Codex** (`~/.codex/config.toml`):
```toml
[mcp_servers.arch-docs]
url = "https://arch-docs-mcp.internal.company.com/mcp"
bearer_token_env_var = "ARCH_DOCS_TOKEN"
```

**Claude Code** (`claude_desktop_config.json` or CLI):
```json
{
  "mcpServers": {
    "arch-docs": {
      "url": "https://arch-docs-mcp.internal.company.com/mcp",
      "headers": {
        "Authorization": "Bearer ${ARCH_DOCS_TOKEN}"
      }
    }
  }
}
```

## Docker Compose (Local Development)

```yaml
services:
  mcp-server:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - VECTOR_STORE=qdrant
      - QDRANT_URL=http://qdrant:6333
    depends_on:
      - qdrant
    volumes:
      - ./src:/app/src   # For hot reload in dev

  indexer:
    build:
      context: .
      dockerfile: docker/Dockerfile.indexer
    environment:
      - VECTOR_STORE=qdrant
      - QDRANT_URL=http://qdrant:6333
    depends_on:
      - qdrant

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_data:/qdrant/storage

  # Alternative: Chroma
  # chroma:
  #   image: chromadb/chroma:latest
  #   ports:
  #     - "8000:8000"
  #   volumes:
  #     - chroma_data:/chroma/chroma

volumes:
  qdrant_data:
  # chroma_data:
```

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.0",
    "openai": "^6.16.0",
    "@qdrant/js-client-rest": "^1.13.0",
    "chromadb": "^3.2.0",
    "marked": "^15.0.0",
    "gray-matter": "^4.0.0",
    "tiktoken": "^1.0.0",
    "express": "^5.0.0",
    "dotenv": "^16.0.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/express": "^5.0.0",
    "typescript": "^5.7.0",
    "tsx": "^4.0.0",
    "vitest": "^4.0.0"
  }
}
```

## Implementation Order

1. **Phase 1: Core Infrastructure**
   - Set up TypeScript project structure
   - Implement vector store interface and Qdrant/Chroma adapters
   - Create embedding client abstraction

2. **Phase 2: Indexer**
   - GitLab API client
   - Markdown chunking with metadata extraction
   - Initial load script
   - Test against sample documents

3. **Phase 3: MCP Server**
   - Streamable HTTP transport
   - Implement three tools
   - Bearer token auth
   - Local testing with Claude Code / Codex

4. **Phase 4: Production Readiness**
   - GitLab webhook handler for incremental updates
   - Docker configuration
   - Logging and monitoring
   - Documentation for developers on how to connect

## Testing Strategy

### Unit Tests
- Chunking logic with various markdown structures
- Metadata extraction from frontmatter
- Vector store query building

### Integration Tests
- Full index → query → response flow
- GitLab sync with mock API
- MCP protocol compliance

### Manual Testing
- Connect Claude Code, run sample queries
- Connect OpenAI Codex, run same queries
- Verify results are relevant and well-formatted

## Notes for Claude Code

When implementing this project:

1. Start with the vector store interface—get Qdrant or Chroma working locally first
2. The MCP SDK handles most of the protocol complexity; focus on the tool implementations
3. For chunking, the `marked` library gives you an AST you can walk to find header boundaries
4. Use `tiktoken` to count tokens accurately for chunk sizing
5. The GitLab API client should handle pagination for large repos
6. Consider adding a simple health check endpoint alongside the MCP endpoint
7. Log all queries (sanitized) for debugging relevance issues later

## Open Questions for Implementation

1. **Embedding model**: Start with OpenAI `text-embedding-3-small` for simplicity, but the abstraction should allow swapping to Azure OpenAI or a local model later

2. **Categories**: These should be auto-detected from directory structure (e.g., `adrs/` → "adr", `api-specs/` → "api") with frontmatter override

3. **Access control**: Current design uses shared bearer tokens. If you need per-team access control later, the auth middleware is the place to add it

4. **Caching**: Consider adding a query cache (Redis or in-memory) if the same queries come up frequently
