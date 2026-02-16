# Agent Guidelines

## Project Summary

MCP server providing semantic search access to architectural design documents from GitLab. Supports Claude Code and OpenAI Codex clients.

## Tech Stack

- **Language:** TypeScript (Node.js 18+)
- **Vector DB:** Qdrant (primary), Chroma (fallback)
- **Transport:** Streamable HTTP (MCP protocol)
- **Embeddings:** OpenAI `text-embedding-3-small`
- **Validation:** Zod schemas

## Key Directories

```
src/
├── server/          # MCP server, tools, auth
├── indexer/         # GitLab sync, chunking, embeddings
├── vectorstore/     # Qdrant/Chroma implementations
├── config/          # Configuration management
└── types/           # Shared TypeScript types
scripts/             # Initial load and reindex scripts
docker/              # Dockerfiles and compose
```

## MCP Tools

1. `search_architecture_docs` - Semantic search across docs
2. `get_document` - Retrieve full document by path
3. `list_documents` - Browse documents by category

## Running Locally

```bash
docker-compose -f docker/docker-compose.yml up
```

## Architecture Reference

See **PROJECT_SPEC.md** for complete details including:
- Full architecture diagrams
- Tool schemas and response formats
- Chunking strategy and token limits
- GitLab integration details
- Environment variables
- Implementation phases
