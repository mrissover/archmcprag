# Architecture Documentation RAG MCP Server

An MCP (Model Context Protocol) server that provides semantic search access to architectural design documents stored in GitLab. Enables developers to query architecture documentation directly from Claude Code and OpenAI Codex.

## What This Project Does

This server indexes your organization's architecture documentation (ADRs, API specs, design docs) and makes them searchable via natural language queries. It:

1. **Syncs** markdown files from your GitLab repository
2. **Chunks** documents intelligently (respecting headers, code blocks, tables)
3. **Embeds** chunks using OpenAI embeddings
4. **Stores** vectors in Qdrant for fast similarity search
5. **Serves** queries via MCP protocol over HTTP
6. **Listens** for GitLab webhooks to auto-update on push

Developers can then ask questions like:
- "How does our authentication system work?"
- "What's the API contract for the user service?"
- "Show me the ADR about database selection"

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- OpenAI API key
- GitLab access token (for the docs repository)

### 1. Clone and Configure

```bash
git clone <this-repo>
cd arch-docs-mcp

# Copy example env and fill in values
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Required
OPENAI_API_KEY=sk-...
GITLAB_URL=https://gitlab.company.com
GITLAB_PROJECT_ID=arch-team/design-docs
GITLAB_ACCESS_TOKEN=glpat-...

# Optional - for authentication
AUTH_TOKENS=your-secret-token-1,your-secret-token-2
```

### 2. Start Services

```bash
# Start Qdrant and the app
cd docker
docker-compose up -d

# Run initial document indexing
docker-compose --profile init run initial-load
```

### 3. Verify

```bash
# Health check
curl http://localhost:3000/health
# Should return: {"status":"ok","service":"arch-docs-mcp"}
```

## Hosting Options

### Option A: Docker Compose (Recommended for Small Teams)

Use the included `docker/docker-compose.yml`:

```bash
docker-compose up -d
```

This starts:
- **App** (MCP server + webhook listener) on port 3000
- **Qdrant** on ports 6333/6334

### Option B: Kubernetes

For production deployments, create deployments for:
1. Qdrant (or use Qdrant Cloud)
2. App (stateless, can scale horizontally)

### Option C: Local Development

```bash
npm install
npm run dev          # Start server with hot reload (MCP + webhooks on port 3000)
npm run initial-load # Index documents once
```

## Configuring Claude Code

Add the MCP server to your Claude Code configuration.

### Method 1: CLI Configuration

```bash
claude mcp add arch-docs --url http://your-server:3000/mcp
```

### Method 2: Configuration File

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "arch-docs": {
      "url": "http://your-server:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token"
      }
    }
  }
}
```

Or using environment variable for the token:

```json
{
  "mcpServers": {
    "arch-docs": {
      "url": "http://your-server:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${ARCH_DOCS_TOKEN}"
      }
    }
  }
}
```

Then set in your shell:
```bash
export ARCH_DOCS_TOKEN=your-secret-token
```

### Verify Connection

In Claude Code, you should now be able to:
```
> Search architecture docs for authentication flow
```

Claude will use the `search_architecture_docs` tool to find relevant documentation.

## Configuring OpenAI Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.arch-docs]
url = "http://your-server:3000/mcp"
bearer_token_env_var = "ARCH_DOCS_TOKEN"
```

Set the environment variable:
```bash
export ARCH_DOCS_TOKEN=your-secret-token
```

## Available MCP Tools

### 1. `search_architecture_docs`

Search documents using natural language.

**Parameters:**
- `query` (required): What you're looking for
- `limit` (optional): Max results (default: 5, max: 20)
- `filter.category` (optional): Filter by category (adr, api, integration, security)
- `filter.tags` (optional): Filter by tags

**Example:**
```json
{
  "query": "how does OAuth authentication work",
  "limit": 3,
  "filter": { "category": "adr" }
}
```

### 2. `get_document`

Get full content of a specific document.

**Parameters:**
- `path` (required): Document path (e.g., "adrs/0001-auth-pattern.md")

### 3. `list_documents`

List all available documents.

**Parameters:**
- `category` (optional): Filter by category
- `include_summaries` (optional): Include brief summaries

## Keeping Documents Updated

### Automatic Updates (Recommended)

Configure a GitLab webhook to notify the server when documents change:

1. In GitLab, go to **Settings > Webhooks**
2. Add webhook URL: `http://your-server:3000/webhook`
3. Set secret token (same as `GITLAB_WEBHOOK_SECRET` in your env)
4. Select **Push events** trigger

### Manual Reindex

```bash
# Using npm
npm run reindex

# Using Docker
docker-compose --profile init run initial-load
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │     │  OpenAI Codex   │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │    MCP Protocol       │
         │   (HTTP + JSON)       │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │         App           │
         │     (Port 3000)       │
         │                       │
         │  - POST /mcp          │
         │  - POST /webhook      │
         │  - GET  /health       │
         └───────────┬───────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │       Qdrant          │
         │    (Port 6333)        │
         │                       │
         │  Vector similarity    │
         │  search               │
         └───────────────────────┘
                     ▲
                     │
         ┌───────────────────────┐
         │  GitLab Repository    │
         │                       │
         │  - Markdown docs      │
         │  - ADRs               │
         │  - API specs          │
         └───────────────────────┘
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `HOST` | No | 0.0.0.0 | Server host |
| `AUTH_TOKENS` | No | - | Comma-separated bearer tokens |
| `VECTOR_STORE` | No | qdrant | Vector store type (qdrant/chroma) |
| `QDRANT_URL` | No | http://localhost:6333 | Qdrant URL |
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for embeddings |
| `GITLAB_URL` | Yes | - | GitLab instance URL |
| `GITLAB_PROJECT_ID` | Yes | - | GitLab project path |
| `GITLAB_ACCESS_TOKEN` | Yes | - | GitLab access token |
| `GITLAB_BRANCH` | No | main | Branch to index |
| `GITLAB_WEBHOOK_SECRET` | No | - | Secret for webhook signature verification |
| `CHUNK_SIZE` | No | 1500 | Max tokens per chunk |
| `CHUNK_OVERLAP` | No | 100 | Token overlap between chunks |

## Troubleshooting

### "Connection refused" from Claude Code

1. Verify the server is running: `curl http://localhost:3000/health`
2. Check firewall allows connections on port 3000
3. If using Docker, ensure you're using the correct host IP (not localhost)

### "Unauthorized" errors

1. Check `AUTH_TOKENS` is set in server environment
2. Verify token in Claude Code config matches one in `AUTH_TOKENS`
3. Ensure Authorization header format is `Bearer <token>`

### No search results

1. Run initial indexing: `npm run initial-load`
2. Check Qdrant has data: `curl http://localhost:6333/collections/architecture_docs`
3. Verify GitLab credentials are correct

### Slow searches

1. Ensure Qdrant is running on SSD storage
2. Check network latency to OpenAI for embeddings
3. Consider reducing `limit` parameter in queries

## Development

```bash
# Install dependencies
npm install

# Run server with hot reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run lint

# Build
npm run build

# Index documents
npm run initial-load

# Reindex all documents
npm run reindex
```

## License

MIT
