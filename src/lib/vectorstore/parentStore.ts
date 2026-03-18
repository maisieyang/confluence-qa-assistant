import { promises as fs } from 'node:fs';
import type { PageChunk } from '../confluence/chunk';

const DEFAULT_PARENT_STORE_PATH = process.env.PARENT_STORE_PATH ?? 'data/parent-store.json';

export interface ParentChunkEntry {
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
}

export interface ParentStoreData {
  version: 1;
  parents: Record<string, ParentChunkEntry>;
}

function chunkToEntry(chunk: PageChunk): ParentChunkEntry {
  return {
    nodeId: chunk.nodeId,
    pageId: chunk.pageId,
    title: chunk.title,
    heading: chunk.heading,
    headingPath: chunk.headingPathString,
    content: chunk.content,
    sourceUrl: chunk.sourceUrl,
    chunkIndex: chunk.chunkIndex,
    tokenEstimate: chunk.tokenEstimate,
    embedVersion: chunk.embedVersion,
    updatedAt: chunk.updatedAt,
    etag: chunk.etag,
    spaceKey: chunk.spaceKey,
    piiFlag: chunk.piiFlag,
  };
}

export async function loadParentStore(
  path: string = DEFAULT_PARENT_STORE_PATH,
): Promise<ParentStoreData | null> {
  try {
    const raw = await fs.readFile(path, 'utf-8');
    return JSON.parse(raw) as ParentStoreData;
  } catch {
    return null;
  }
}

export async function saveParentStore(
  data: ParentStoreData,
  path: string = DEFAULT_PARENT_STORE_PATH,
): Promise<void> {
  await fs.writeFile(path, JSON.stringify(data), 'utf-8');
}

export function buildParentStore(parentChunks: PageChunk[]): ParentStoreData {
  const parents: Record<string, ParentChunkEntry> = {};
  for (const chunk of parentChunks) {
    parents[chunk.nodeId] = chunkToEntry(chunk);
  }
  return { version: 1, parents };
}

export function incrementalUpdateParentStore(
  existing: ParentStoreData | null,
  changedPageIds: Set<string>,
  newParents: PageChunk[],
): ParentStoreData {
  const parents: Record<string, ParentChunkEntry> = {};

  // Keep entries not belonging to changed pages
  if (existing) {
    for (const [nodeId, entry] of Object.entries(existing.parents)) {
      if (!changedPageIds.has(entry.pageId)) {
        parents[nodeId] = entry;
      }
    }
  }

  // Add new parent entries
  for (const chunk of newParents) {
    parents[chunk.nodeId] = chunkToEntry(chunk);
  }

  return { version: 1, parents };
}

// --- Singleton reader ---

export interface ParentStoreReader {
  getParent(nodeId: string): ParentChunkEntry | undefined;
}

let readerPromise: Promise<ParentStoreReader | null> | null = null;

export async function getParentStoreReader(
  path?: string,
): Promise<ParentStoreReader | null> {
  if (!readerPromise) {
    const storePath = path ?? DEFAULT_PARENT_STORE_PATH;
    readerPromise = (async () => {
      const data = await loadParentStore(storePath);
      if (!data) {
        console.warn(`Parent store not available at ${storePath}, parent expansion disabled.`);
        return null;
      }
      console.log(`Parent store loaded: ${Object.keys(data.parents).length} parents`);
      return {
        getParent(nodeId: string) {
          return data.parents[nodeId];
        },
      };
    })();
  }
  return readerPromise;
}

export function resetParentStoreReader(): void {
  readerPromise = null;
}

/**
 * Parse parent node ID from a child node ID.
 * Child IDs follow the pattern: `{pageId}-p{parentIndex}-c{childIndex}`
 * Returns the parent ID `{pageId}-p{parentIndex}`, or null if not a child ID.
 */
export function parseParentNodeId(childNodeId: string): string | null {
  const match = childNodeId.match(/^(.+-p\d+)-c\d+$/);
  return match ? match[1] : null;
}
