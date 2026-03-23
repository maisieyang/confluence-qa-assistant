import {
  buildParentStore,
  incrementalUpdateParentStore,
  parseParentNodeId,
  resetParentStoreReader,
} from '../parentStore';
import type { PageChunk } from '../../confluence/chunk';
import type { ParentStoreData } from '../parentStore';

function makeChunk(overrides: Partial<PageChunk> = {}): PageChunk {
  return {
    id: 'page-1-p0',
    nodeId: 'page-1-p0',
    pageId: 'page-1',
    chunkIndex: 0,
    content: 'Parent chunk content here.',
    tokenEstimate: 50,
    title: 'Test Page',
    heading: 'Introduction',
    headingPath: ['Test Page', 'Introduction'],
    headingPathString: 'Test Page > Introduction',
    sourceUrl: 'https://example.com/wiki/test',
    spaceKey: 'SPACE',
    updatedAt: '2024-01-01T00:00:00Z',
    etag: '42',
    embedVersion: 'v1',
    piiFlag: false,
    chunkType: 'parent',
    ...overrides,
  };
}

describe('buildParentStore', () => {
  it('builds a store from an array of chunks', () => {
    const chunks = [
      makeChunk({ nodeId: 'page-1-p0', pageId: 'page-1' }),
      makeChunk({ nodeId: 'page-1-p1', pageId: 'page-1', chunkIndex: 1 }),
    ];
    const store = buildParentStore(chunks);
    expect(store.version).toBe(1);
    expect(Object.keys(store.parents)).toHaveLength(2);
    expect(store.parents['page-1-p0']).toBeDefined();
    expect(store.parents['page-1-p1']).toBeDefined();
  });

  it('maps chunk fields to entry fields correctly', () => {
    const chunk = makeChunk();
    const store = buildParentStore([chunk]);
    const entry = store.parents['page-1-p0'];

    expect(entry.nodeId).toBe('page-1-p0');
    expect(entry.pageId).toBe('page-1');
    expect(entry.title).toBe('Test Page');
    expect(entry.heading).toBe('Introduction');
    expect(entry.headingPath).toBe('Test Page > Introduction');
    expect(entry.content).toBe('Parent chunk content here.');
    expect(entry.sourceUrl).toBe('https://example.com/wiki/test');
    expect(entry.chunkIndex).toBe(0);
    expect(entry.tokenEstimate).toBe(50);
    expect(entry.embedVersion).toBe('v1');
    expect(entry.updatedAt).toBe('2024-01-01T00:00:00Z');
    expect(entry.etag).toBe('42');
    expect(entry.spaceKey).toBe('SPACE');
    expect(entry.piiFlag).toBe(false);
  });

  it('returns empty parents for empty array', () => {
    const store = buildParentStore([]);
    expect(store.version).toBe(1);
    expect(Object.keys(store.parents)).toHaveLength(0);
  });
});

describe('incrementalUpdateParentStore', () => {
  const existingStore: ParentStoreData = {
    version: 1,
    parents: {
      'page-1-p0': makeChunk({ nodeId: 'page-1-p0', pageId: 'page-1' }) as any,
      'page-2-p0': makeChunk({ nodeId: 'page-2-p0', pageId: 'page-2' }) as any,
    },
  };

  it('keeps unchanged pages and adds new chunks', () => {
    const changedPageIds = new Set(['page-1']);
    const newChunks = [
      makeChunk({ nodeId: 'page-1-p0-new', pageId: 'page-1', content: 'Updated content.' }),
    ];
    const result = incrementalUpdateParentStore(existingStore, changedPageIds, newChunks);

    // page-2 should be preserved
    expect(result.parents['page-2-p0']).toBeDefined();
    // page-1 old entry should be gone, new entry present
    expect(result.parents['page-1-p0']).toBeUndefined();
    expect(result.parents['page-1-p0-new']).toBeDefined();
    expect(result.parents['page-1-p0-new'].content).toBe('Updated content.');
  });

  it('handles null existing store', () => {
    const newChunks = [makeChunk({ nodeId: 'page-3-p0', pageId: 'page-3' })];
    const result = incrementalUpdateParentStore(null, new Set(['page-3']), newChunks);
    expect(result.parents['page-3-p0']).toBeDefined();
  });

  it('returns version 1', () => {
    const result = incrementalUpdateParentStore(null, new Set(), []);
    expect(result.version).toBe(1);
  });

  it('removes all entries for changed page IDs', () => {
    const changedPageIds = new Set(['page-1', 'page-2']);
    const result = incrementalUpdateParentStore(existingStore, changedPageIds, []);
    expect(Object.keys(result.parents)).toHaveLength(0);
  });
});

describe('parseParentNodeId', () => {
  it('parses a valid child node ID', () => {
    expect(parseParentNodeId('page-1-p0-c3')).toBe('page-1-p0');
  });

  it('parses child ID with multi-digit parent and child indices', () => {
    expect(parseParentNodeId('mypage-p12-c99')).toBe('mypage-p12');
  });

  it('returns null for a parent node ID (not a child)', () => {
    expect(parseParentNodeId('page-1-p0')).toBeNull();
  });

  it('returns null for arbitrary strings', () => {
    expect(parseParentNodeId('completely-random-string')).toBeNull();
    expect(parseParentNodeId('')).toBeNull();
  });

  it('parses complex page IDs', () => {
    expect(parseParentNodeId('12345-p2-c0')).toBe('12345-p2');
  });
});

describe('resetParentStoreReader', () => {
  it('can be called without error', () => {
    expect(() => resetParentStoreReader()).not.toThrow();
  });
});
