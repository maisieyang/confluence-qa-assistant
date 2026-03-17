# Confluence QA Assistant

Conversational question answering experience for Confluence documentation, built with Next.js 15, TypeScript, Pinecone, and OpenAI. The app ingests Confluence pages, vectorises them into Pinecone, and serves a streaming chat experience at `/qa` that cites source references inline.

## Environment Variables

Create a `.env.local` (or export variables) before running any scripts or the dev server:

| Key | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Used for both embeddings (`text-embedding-3-small`) and chat completions (`gpt-4o-mini`). |
| `PINECONE_API_KEY` | Pinecone authentication token. |
| `PINECONE_ENVIRONMENT` | Pinecone environment/region (e.g. `us-east-1-aws`). |
| `PINECONE_INDEX_NAME` | Target Pinecone index for embeddings. |
| `CONFLUENCE_MAX_PAGES` *(optional)* | Limits how many Confluence pages are fetched per ingestion run. Defaults to `5`. |
| `CONFLUENCE_PAGE_LIMIT` *(optional)* | Page size per Confluence API request. Defaults to `25`. |
| `CHUNK_MIN_TOKENS` *(optional)* | Minimum tokens per chunk. Defaults to `300`. |
| `CHUNK_MAX_TOKENS` *(optional)* | Maximum tokens per chunk. Defaults to `800`. |
| `PINECONE_NAMESPACE` *(optional)* | Namespace to write vectors into. Defaults to `default`. |

## Vectorisation Workflow

1. **Ingest Confluence content**
   ```bash
   npm run vectorize
   ```
   - Validates required environment variables.
   - Fetches Confluence content, cleans Markdown, chunks, embeds, and upserts vectors into Pinecone.
   - Provides retry logic and progress logs (pages, chunks, duration).

2. **Verify Pinecone index contents**
   ```bash
   npm run verify-pinecone
   ```
   - Prints index status, vector counts per namespace, and dimension info.
   - Executes a sample semantic query and lists retrieved chunks + metadata.
   - Override the sample query via CLI argument or `PINECONE_SAMPLE_QUERY`.

3. **Run the QA experience**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000/qa](http://localhost:3000/qa) for the RAG chat interface. Responses stream in real time and each answer includes clickable references sourced from Pinecone.

## Available Scripts

- `npm run dev`: Start the Next.js dev server with Turbopack.
- `npm run build`: Create an optimised production build.
- `npm run start`: Run the production server.
- `npm run lint`: Lint all source files.
- `npm run vectorize`: Batch ingest Confluence pages and upsert vectors to Pinecone.
- `npm run verify-pinecone`: Inspect Pinecone index stats and run a sample query.

## Project Structure Highlights

- `src/lib/confluence`: Fetching, cleaning, and chunking Confluence content.
- `src/lib/vectorstore`: Pinecone store wrapper used by ingestion and runtime retrieval.
- `src/lib/pipeline`: Build/QA pipeline orchestrating ingestion, vectorisation, and streaming answers.
- `src/components`: Shared UI (ChatWindow, Markdown rendering, reference lists) reused by `/` and `/qa`.
- `scripts/`: Standalone TSX scripts for vectorisation and verification.

## Notes

- Scripts use `tsx` so they can run TypeScript directly. No build step needed.
- The QA route (`/api/qa`) streams SSE responses compatible with the shared `useChat` hook.
- Adjust ingestion limits using the optional environment variables when experimenting locally.
