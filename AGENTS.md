# Agent Guidelines

## Project Summary

MCP server providing semantic search access to architectural design documents from GitLab. Supports Claude Code and OpenAI Codex clients. Runs as a single application container alongside Qdrant.

## Tech Stack

- **Language:** TypeScript (Node.js 18+)
- **Vector DB:** Qdrant (primary), Chroma (fallback)
- **Transport:** Streamable HTTP (MCP protocol)
- **Embeddings:** OpenAI `text-embedding-3-small`
- **Validation:** Zod schemas
- **Testing:** Vitest with v8 coverage

## Key Directories

```
src/
├── index.ts             # Unified entry point (MCP server + webhook listener)
├── shared.ts            # Shared singletons (vector store, embedding client)
├── config/              # Configuration management
├── server/
│   ├── auth/            # Bearer token authentication
│   └── tools/           # MCP tools (search, get-document, list-documents)
├── indexer/
│   ├── chunking/        # Markdown chunking and token strategies
│   ├── embedding/       # OpenAI/Azure embedding client and batching
│   └── gitlab/          # GitLab API client, sync, and webhook handler
├── vectorstore/         # Qdrant/Chroma implementations
└── types/               # Shared TypeScript types
docker/                  # Dockerfile and docker-compose
```

## MCP Tools

1. `search_architecture_docs` - Semantic search across docs
2. `get_document` - Retrieve full document by path
3. `list_documents` - Browse documents by category

## Endpoints

- `GET /health` - Health check
- `POST /mcp` - MCP protocol endpoint
- `DELETE /mcp` - Session management
- `POST /webhook` - GitLab push event webhook

## Running Locally

```bash
npm run dev           # Start server with hot reload
npm run initial-load  # Index all documents
npm run reindex       # Reindex all documents
npm test              # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Docker

```bash
docker-compose -f docker/docker-compose.yml up -d
docker-compose -f docker/docker-compose.yml --profile init run initial-load
```

## Architecture Reference

See **PROJECT_SPEC.md** for complete details including:
- Full architecture diagrams
- Tool schemas and response formats
- Chunking strategy and token limits
- GitLab integration details
- Environment variables
- Implementation phases
