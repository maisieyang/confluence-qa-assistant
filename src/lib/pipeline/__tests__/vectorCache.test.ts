import { evaluatePageChange, buildCacheEntry } from '../vectorCache';
import type { CleanConfluencePage } from '../../confluence/clean';
import type { PageCacheEntry } from '../vectorCache';
import type { PageChunk } from '../../confluence/chunk';

const mockPage: CleanConfluencePage = {
  pageId: 'page-1',
  title: 'Test Page',
  markdown: '# Test Page\n\nSome content.',
  spaceKey: 'SPACE',
  updatedAt: '2024-01-01T00:00:00Z',
  etag: '42',
  url: 'https://example.com/wiki/test',
};

const mockCacheEntry: PageCacheEntry = {
  pageId: 'page-1',
  pageTitle: 'Test Page',
  spaceKey: 'SPACE',
  etag: '42',
  updatedAt: '2024-01-01T00:00:00Z',
  embedVersion: 'v1',
  chunkCount: 3,
  chunkIds: ['page-1-0', 'page-1-1', 'page-1-2'],
  lastEmbeddedAt: '2024-01-02T00:00:00Z',
};

describe('evaluatePageChange', () => {
  it('returns changed=true when no cached entry exists', () => {
    const result = evaluatePageChange(mockPage, 'v1', undefined);
    expect(result.changed).toBe(true);
    expect(result.reasons).toContain('no existing cache entry');
  });

  it('returns changed=false when page matches cache', () => {
    const result = evaluatePageChange(mockPage, 'v1', mockCacheEntry);
    expect(result.changed).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('detects etag change', () => {
    const updatedPage: CleanConfluencePage = { ...mockPage, etag: '99' };
    const result = evaluatePageChange(updatedPage, 'v1', mockCacheEntry);
    expect(result.changed).toBe(true);
    expect(result.reasons.some((r) => r.includes('etag changed'))).toBe(true);
  });

  it('detects updatedAt change', () => {
    const updatedPage: CleanConfluencePage = {
      ...mockPage,
      updatedAt: '2024-06-01T00:00:00Z',
    };
    const result = evaluatePageChange(updatedPage, 'v1', mockCacheEntry);
    expect(result.changed).toBe(true);
    expect(result.reasons.some((r) => r.includes('updated_at changed'))).toBe(true);
  });

  it('detects embedVersion change', () => {
    const result = evaluatePageChange(mockPage, 'v2', mockCacheEntry);
    expect(result.changed).toBe(true);
    expect(result.reasons.some((r) => r.includes('embedding version changed'))).toBe(true);
  });

  it('accumulates multiple reasons', () => {
    const updatedPage: CleanConfluencePage = {
      ...mockPage,
      etag: '99',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    const result = evaluatePageChange(updatedPage, 'v2', mockCacheEntry);
    expect(result.changed).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});

describe('buildCacheEntry', () => {
  const mockChunks: PageChunk[] = [
    {
      id: 'page-1-0',
      nodeId: 'page-1-0',
      pageId: 'page-1',
      chunkIndex: 0,
      content: 'Chunk 0 content.',
      tokenEstimate: 5,
      title: 'Test Page',
      headingPath: ['Test Page'],
      headingPathString: 'Test Page',
      embedVersion: 'v1',
      piiFlag: false,
    },
    {
      id: 'page-1-1',
      nodeId: 'page-1-1',
      pageId: 'page-1',
      chunkIndex: 1,
      content: 'Chunk 1 content.',
      tokenEstimate: 5,
      title: 'Test Page',
      headingPath: ['Test Page'],
      headingPathString: 'Test Page',
      embedVersion: 'v1',
      piiFlag: false,
    },
  ];

  it('builds a cache entry with correct fields', () => {
    const embeddedAt = '2024-03-01T00:00:00Z';
    const entry = buildCacheEntry(mockPage, 'v1', mockChunks, embeddedAt);

    expect(entry.pageId).toBe('page-1');
    expect(entry.pageTitle).toBe('Test Page');
    expect(entry.spaceKey).toBe('SPACE');
    expect(entry.etag).toBe('42');
    expect(entry.updatedAt).toBe('2024-01-01T00:00:00Z');
    expect(entry.embedVersion).toBe('v1');
    expect(entry.chunkCount).toBe(2);
    expect(entry.chunkIds).toEqual(['page-1-0', 'page-1-1']);
    expect(entry.lastEmbeddedAt).toBe(embeddedAt);
  });

  it('handles empty chunk array', () => {
    const entry = buildCacheEntry(mockPage, 'v1', [], '2024-01-01T00:00:00Z');
    expect(entry.chunkCount).toBe(0);
    expect(entry.chunkIds).toEqual([]);
  });
});
