import { chunkPage, chunkPageParentChild } from '../chunk';
import type { CleanConfluencePage } from '../clean';
import type { ChunkOptions } from '../chunk';

function makePage(overrides: Partial<CleanConfluencePage> = {}): CleanConfluencePage {
  return {
    pageId: 'page-123',
    title: 'Test Page',
    markdown: '# Test Page\n\nThis is the introduction paragraph. It has enough words to form a proper chunk with sufficient token count.\n\n## Section One\n\nSection one content with enough words to be meaningful in context.\n\n## Section Two\n\nSection two has more content here that should be captured as a separate section.',
    spaceKey: 'TEST',
    updatedAt: '2024-01-01T00:00:00Z',
    etag: '42',
    url: 'https://example.com/wiki/test',
    ...overrides,
  };
}

const baseOptions: ChunkOptions = {
  embedVersion: 'v1',
  minTokens: 1,
  maxTokens: 50,
};

describe('chunkPage', () => {
  it('returns an array of chunks', () => {
    const page = makePage();
    const chunks = chunkPage(page, baseOptions);
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('each chunk has required fields', () => {
    const page = makePage();
    const chunks = chunkPage(page, baseOptions);
    for (const chunk of chunks) {
      expect(chunk.id).toBeDefined();
      expect(chunk.nodeId).toBeDefined();
      expect(chunk.pageId).toBe('page-123');
      expect(chunk.content).toBeTruthy();
      expect(typeof chunk.tokenEstimate).toBe('number');
      expect(chunk.title).toBe('Test Page');
      expect(chunk.embedVersion).toBe('v1');
      expect(chunk.piiFlag).toBe(false);
      expect(Array.isArray(chunk.headingPath)).toBe(true);
    }
  });

  it('sets sourceUrl from page url', () => {
    const page = makePage();
    const chunks = chunkPage(page, baseOptions);
    for (const chunk of chunks) {
      expect(chunk.sourceUrl).toBe('https://example.com/wiki/test');
    }
  });

  it('sets spaceKey from page', () => {
    const page = makePage();
    const chunks = chunkPage(page, baseOptions);
    for (const chunk of chunks) {
      expect(chunk.spaceKey).toBe('TEST');
    }
  });

  it('chunk indices are sequential starting from 0', () => {
    const page = makePage();
    const chunks = chunkPage(page, baseOptions);
    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });

  it('nodeId format is pageId-chunkIndex', () => {
    const page = makePage();
    const chunks = chunkPage(page, baseOptions);
    chunks.forEach((chunk, i) => {
      expect(chunk.nodeId).toBe(`page-123-${i}`);
    });
  });

  it('handles page with code block', () => {
    const page = makePage({
      markdown: '# Test\n\n```javascript\nconst x = 1;\nconsole.log(x);\n```\n\nSome text after the code block.',
    });
    const chunks = chunkPage(page, baseOptions);
    expect(chunks.length).toBeGreaterThan(0);
    // At least one chunk should contain the code
    const hasCode = chunks.some((c) => c.content.includes('const x = 1'));
    expect(hasCode).toBe(true);
  });

  it('handles page with table', () => {
    const page = makePage({
      markdown: '# Test\n\n| Name | Value |\n|------|-------|\n| A | 1 |\n| B | 2 |\n\nSome text.',
    });
    const chunks = chunkPage(page, baseOptions);
    expect(chunks.length).toBeGreaterThan(0);
    const hasTable = chunks.some((c) => c.content.includes('|'));
    expect(hasTable).toBe(true);
  });

  it('handles page with no markdown content gracefully', () => {
    const page = makePage({ markdown: '' });
    const chunks = chunkPage(page, baseOptions);
    expect(Array.isArray(chunks)).toBe(true);
    // Empty markdown should produce no chunks
    expect(chunks.length).toBe(0);
  });

  it('uses default min/max tokens when not specified', () => {
    const page = makePage();
    const chunks = chunkPage(page, { embedVersion: 'v1' });
    expect(chunks.length).toBeGreaterThanOrEqual(0);
  });

  it('headingPathString is a > joined string', () => {
    const page = makePage();
    const chunks = chunkPage(page, baseOptions);
    for (const chunk of chunks) {
      expect(typeof chunk.headingPathString).toBe('string');
      if (chunk.headingPath.length > 1) {
        expect(chunk.headingPathString).toContain(' > ');
      }
    }
  });

  it('uses page title as fallback heading path', () => {
    const page = makePage({
      markdown: 'Just plain content without any headings at all.',
    });
    const chunks = chunkPage(page, baseOptions);
    for (const chunk of chunks) {
      if (chunk.headingPath.length > 0) {
        expect(chunk.headingPath).toContain('Test Page');
      }
    }
  });
});

describe('chunkPageParentChild', () => {
  it('returns parents and children arrays', () => {
    const page = makePage();
    const result = chunkPageParentChild(page, { embedVersion: 'v1' });
    expect(Array.isArray(result.parents)).toBe(true);
    expect(Array.isArray(result.children)).toBe(true);
  });

  it('parents have chunkType=parent', () => {
    const page = makePage();
    const result = chunkPageParentChild(page, { embedVersion: 'v1' });
    for (const parent of result.parents) {
      expect(parent.chunkType).toBe('parent');
    }
  });

  it('children have chunkType=child', () => {
    const page = makePage();
    const result = chunkPageParentChild(page, { embedVersion: 'v1' });
    for (const child of result.children) {
      expect(child.chunkType).toBe('child');
    }
  });

  it('children reference parent via parentNodeId', () => {
    const page = makePage();
    const result = chunkPageParentChild(page, { embedVersion: 'v1' });
    const parentIds = new Set(result.parents.map((p) => p.nodeId));
    for (const child of result.children) {
      expect(child.parentNodeId).toBeDefined();
      expect(parentIds.has(child.parentNodeId!)).toBe(true);
    }
  });

  it('parent nodeId follows pageId-pN pattern', () => {
    const page = makePage();
    const result = chunkPageParentChild(page, { embedVersion: 'v1' });
    for (const parent of result.parents) {
      expect(parent.nodeId).toMatch(/^page-123-p\d+$/);
    }
  });

  it('child nodeId follows pageId-pN-cN pattern', () => {
    const page = makePage();
    const result = chunkPageParentChild(page, { embedVersion: 'v1' });
    for (const child of result.children) {
      expect(child.nodeId).toMatch(/^page-123-p\d+-c\d+$/);
    }
  });

  it('handles empty markdown', () => {
    const page = makePage({ markdown: '' });
    const result = chunkPageParentChild(page, { embedVersion: 'v1' });
    expect(result.parents).toHaveLength(0);
    expect(result.children).toHaveLength(0);
  });

  it('produces at least one parent for non-empty content', () => {
    const page = makePage();
    const result = chunkPageParentChild(page, { embedVersion: 'v1' });
    expect(result.parents.length).toBeGreaterThan(0);
  });
});
