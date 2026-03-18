import { Pinecone, type Index } from '@pinecone-database/pinecone';
import { File as NodeFile } from 'node:buffer';
import { embedTexts, embedText, getEmbeddingModelVersion } from '../providers/modelProvider';
import type { PageChunk } from '../confluence/chunk';

// Pinecone's client (via undici) expects a global File object when running under Node.
// Next.js edge runtime already provides it, but the Node runtime in development may not.
// Assign a polyfill from undici when needed.
const globalWithFile = globalThis as unknown as { File?: typeof NodeFile };
if (typeof globalWithFile.File === 'undefined') {
  globalWithFile.File = NodeFile;
}

const UPSERT_BATCH_SIZE = 50;
const DEFAULT_NAMESPACE = process.env.PINECONE_NAMESPACE ?? 'default';

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const maybeStatus = (error as { status?: number }).status;
  if (maybeStatus === 404) {
    return true;
  }

  const message = typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : '';
  return message.includes('HTTP status 404') || message.includes('status 404') || message.includes('404 Not Found');
}

interface ParsedHost {
  host: string;
  environment: string;
  indexName: string;
  projectId?: string;
}

function parsePineconeHost(host: string, fallback?: { indexName?: string; projectId?: string }): ParsedHost {
  try {
    const normalizedHost = host.startsWith('http') ? host : `https://${host}`;
    const url = new URL(normalizedHost);
    const hostname = url.hostname;

    const svcMarker = '.svc.';
    const markerIndex = hostname.indexOf(svcMarker);
    if (markerIndex === -1) {
      throw new Error('Host must include a ".svc." segment, e.g. my-index-xyz.svc.region.pinecone.io');
    }

    const subdomain = hostname.slice(0, markerIndex);
    const environmentPart = hostname
      .slice(markerIndex + svcMarker.length)
      .replace(/\.pinecone\.io$/i, '')
      .trim();

    if (!environmentPart) {
      throw new Error('Could not derive environment from host.');
    }

    const segments = subdomain.split('-');
    let projectId = segments.length > 1 ? segments.pop() : undefined;
    let indexName = segments.join('-');

    if (!indexName) {
      indexName = fallback?.indexName ?? subdomain;
    }

    if (!projectId) {
      projectId = fallback?.projectId;
    }

    return {
      host: `https://${hostname}`,
      environment: environmentPart,
      indexName,
      projectId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid PINECONE_HOST value: ${message}`);
  }
}

type ChunkMetadata = {
  page_id: string;
  node_id: string;
  page_title: string;
  heading?: string;
  heading_path?: string;
  space_key?: string;
  updated_at?: string;
  etag?: string;
  embed_version: string;
  chunk_index: number;
  token_estimate: number;
  source_url?: string;
  pii_flag: boolean;
  content: string;
  parent_node_id?: string;
  chunk_type?: 'parent' | 'child';
};

type PineconeVector = {
  id: string;
  values: number[];
  metadata?: ChunkMetadata;
};

export interface RetrievedChunk {
  id: string;
  nodeId: string;
  pageId: string;
  title: string;
  heading?: string;
  headingPath?: string;
  content: string;
  sourceUrl?: string;
  chunkIndex: number;
  tokenEstimate: number;
  embedVersion: string;
  updatedAt?: string;
  etag?: string;
  spaceKey?: string;
  piiFlag: boolean;
  parentNodeId?: string;
  chunkType?: 'parent' | 'child';
}

export interface SearchResult {
  chunk: RetrievedChunk;
  score: number;
}

export class PineconeStore {
  private pinecone: Pinecone | null = null;
  private index: Index | null = null;
  private readonly indexName: string;
  private readonly namespace: string;
  private readonly environment?: string;
  private readonly projectId?: string;
  private readonly indexHost?: string;

  constructor() {
    const explicitIndexName = process.env.PINECONE_INDEX_NAME ?? process.env.PINECONE_INDEX;
    const explicitProjectId = process.env.PINECONE_PROJECT_ID?.trim();
    const hostEnv = process.env.PINECONE_HOST ?? process.env.PINECONE_INDEX_HOST;

    if (hostEnv) {
      const parsed = parsePineconeHost(hostEnv, {
        indexName: explicitIndexName,
        projectId: explicitProjectId,
      });

      this.indexName = parsed.indexName;
      this.environment = parsed.environment;
      this.projectId = parsed.projectId;
      this.indexHost = parsed.host;
    } else {
      if (!explicitIndexName) {
        throw new Error('PINECONE_INDEX_NAME (or PINECONE_INDEX) environment variable is required.');
      }

      const environment = process.env.PINECONE_ENVIRONMENT?.trim();

      if (!environment) {
        throw new Error('PINECONE_ENVIRONMENT environment variable is required when PINECONE_HOST is not set.');
      }

      this.indexName = explicitIndexName;
      this.environment = environment;
      this.projectId = explicitProjectId;
    }

    this.namespace = DEFAULT_NAMESPACE;
  }

  async ensureReady() {
    await this.getIndex();
  }

  async upsertChunks(chunks: PageChunk[]) {
    if (chunks.length === 0) {
      return;
    }

    const target = await this.getTargetIndex();

    for (let start = 0; start < chunks.length; start += UPSERT_BATCH_SIZE) {
      const batch = chunks.slice(start, start + UPSERT_BATCH_SIZE);
      const embeddings = await embedTexts(batch.map((chunk) => chunk.content));

      const vectors: PineconeVector[] = embeddings.map((vector, idx) => {
        const chunk = batch[idx];
        return {
          id: chunk.id,
          values: vector,
          metadata: {
            page_id: chunk.pageId,
            node_id: chunk.nodeId,
            page_title: chunk.title,
            heading: chunk.heading,
            heading_path: chunk.headingPathString,
            space_key: chunk.spaceKey,
            updated_at: chunk.updatedAt,
            etag: chunk.etag,
            embed_version: chunk.embedVersion,
            chunk_index: chunk.chunkIndex,
            token_estimate: chunk.tokenEstimate,
            source_url: chunk.sourceUrl,
            pii_flag: chunk.piiFlag,
            content: chunk.content,
            ...(chunk.parentNodeId ? { parent_node_id: chunk.parentNodeId } : {}),
            ...(chunk.chunkType ? { chunk_type: chunk.chunkType } : {}),
          },
        };
      });

      await target.upsert(vectors);
    }
  }

  async deletePageChunks(pageId: string) {
    const target = await this.getTargetIndex();
    try {
      await target.deleteMany({ page_id: { $eq: pageId } });
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }

  async search(query: string, topK = 5): Promise<SearchResult[]> {
    const target = await this.getTargetIndex();
    const queryEmbedding = await embedText(query);

    const response = await target.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });

    const matches = response.matches ?? [];

    return matches
      .filter((match) => match.metadata && typeof match.metadata === 'object')
      .map((match) => {
        const metadata = match.metadata as ChunkMetadata;
        return {
          chunk: {
            id: metadata.node_id,
            nodeId: metadata.node_id,
            pageId: metadata.page_id,
            title: metadata.page_title,
            heading: metadata.heading,
            headingPath: metadata.heading_path,
            content: metadata.content,
            sourceUrl: metadata.source_url,
            chunkIndex: metadata.chunk_index,
            tokenEstimate: metadata.token_estimate,
            embedVersion: metadata.embed_version ?? getEmbeddingModelVersion(),
            updatedAt: metadata.updated_at,
            etag: metadata.etag,
            spaceKey: metadata.space_key,
            piiFlag: Boolean(metadata.pii_flag),
            parentNodeId: metadata.parent_node_id,
            chunkType: metadata.chunk_type,
          },
          score: match.score ?? 0,
        } as SearchResult;
      });
  }

  getNamespace(): string {
    return this.namespace;
  }

  async clearNamespace(): Promise<void> {
    const target = await this.getTargetIndex();
    const actor = target as unknown as { deleteAll?: () => Promise<void> };
    if (typeof actor.deleteAll === 'function') {
      try {
        await actor.deleteAll();
      } catch (error) {
        if (isNotFoundError(error)) {
          return;
        }
        throw error;
      }
      return;
    }

    throw new Error('Pinecone client does not support deleteAll(). Upgrade @pinecone-database/pinecone to v1.1.0 or later.');
  }

  private async getTargetIndex(): Promise<Index> {
    const index = await this.getIndex();
    return this.namespace ? index.namespace(this.namespace) : index;
  }

  private async getIndex(): Promise<Index> {
    if (this.index) {
      return this.index;
    }

    const pinecone = await this.getPinecone();
    this.index = pinecone.index(this.indexName);
    return this.index;
  }

  private async getPinecone(): Promise<Pinecone> {
    if (this.pinecone) {
      return this.pinecone;
    }

    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('PINECONE_API_KEY environment variable is required.');
    }

    if (this.indexHost && !this.projectId) {
      throw new Error(
        'Unable to determine Pinecone project ID from host. Set PINECONE_PROJECT_ID or use a host containing the index suffix.'
      );
    }

    if (!this.environment) {
      throw new Error('Unable to determine Pinecone environment. Set PINECONE_HOST or PINECONE_ENVIRONMENT.');
    }

    this.pinecone = new Pinecone({
      apiKey,
      environment: this.environment,
      ...(this.projectId ? { projectId: this.projectId } : {}),
    });

    return this.pinecone;
  }

}

let storePromise: Promise<PineconeStore> | null = null;

export async function getPineconeStore(): Promise<PineconeStore> {
  if (!storePromise) {
    const store = new PineconeStore();
    storePromise = (async () => {
      await store.ensureReady();
      return store;
    })();
  }

  return storePromise;
}

