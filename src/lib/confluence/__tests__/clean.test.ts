import { htmlToCleanMarkdown, cleanConfluencePage } from '../clean';
import type { ConfluencePage } from '../types';

describe('htmlToCleanMarkdown', () => {
  it('converts simple HTML to markdown', () => {
    const html = '<p>Hello world</p>';
    const result = htmlToCleanMarkdown('My Page', html);
    expect(result).toContain('Hello world');
  });

  it('prepends the title as an H1 heading', () => {
    const html = '<p>Content here.</p>';
    const result = htmlToCleanMarkdown('My Page Title', html);
    expect(result).toMatch(/^# My Page Title/);
  });

  it('handles empty title without prepending heading', () => {
    const html = '<p>Content here.</p>';
    const result = htmlToCleanMarkdown('', html);
    expect(result).not.toMatch(/^#\s/);
    expect(result).toContain('Content here');
  });

  it('converts headings to markdown ATX style', () => {
    const html = '<h2>Section Title</h2><p>Content</p>';
    const result = htmlToCleanMarkdown('Page', html);
    expect(result).toContain('## Section Title');
  });

  it('removes navigation elements', () => {
    const html = '<nav>Navigation</nav><p>Real content</p>';
    const result = htmlToCleanMarkdown('Page', html);
    expect(result).not.toContain('Navigation');
    expect(result).toContain('Real content');
  });

  it('removes header and footer elements', () => {
    const html = '<header>Header text</header><p>Main</p><footer>Footer text</footer>';
    const result = htmlToCleanMarkdown('Page', html);
    expect(result).not.toContain('Header text');
    expect(result).not.toContain('Footer text');
    expect(result).toContain('Main');
  });

  it('removes script and style tags', () => {
    const html = '<script>alert("xss")</script><style>body{color:red}</style><p>Content</p>';
    const result = htmlToCleanMarkdown('Page', html);
    expect(result).not.toContain('alert');
    expect(result).not.toContain('color:red');
    expect(result).toContain('Content');
  });

  it('converts code blocks with language', () => {
    const html = '<pre><code class="language-python">print("hello")</code></pre>';
    const result = htmlToCleanMarkdown('Page', html);
    expect(result).toContain('```');
    expect(result).toContain('print("hello")');
  });

  it('normalizes excessive newlines', () => {
    const html = '<p>First</p>\n\n\n\n\n<p>Second</p>';
    const result = htmlToCleanMarkdown('Page', html);
    // Should not have more than 2 consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('trims trailing whitespace from lines', () => {
    const html = '<p>Line with trailing spaces   </p>';
    const result = htmlToCleanMarkdown('Page', html);
    const lines = result.split('\n');
    for (const line of lines) {
      expect(line).toBe(line.trimEnd());
    }
  });

  it('handles table without thead by creating one', () => {
    const html = '<table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table>';
    const result = htmlToCleanMarkdown('Page', html);
    expect(result).toContain('|');
  });

  it('handles empty HTML gracefully', () => {
    const result = htmlToCleanMarkdown('Page', '');
    // Should at least contain the title heading
    expect(result).toContain('# Page');
  });

  it('converts bold and italic text', () => {
    const html = '<p><strong>Bold</strong> and <em>italic</em> text.</p>';
    const result = htmlToCleanMarkdown('Page', html);
    expect(result).toContain('Bold');
    expect(result).toContain('italic');
  });

  it('converts unordered lists', () => {
    const html = '<ul><li>Item one</li><li>Item two</li></ul>';
    const result = htmlToCleanMarkdown('Page', html);
    expect(result).toContain('Item one');
    expect(result).toContain('Item two');
    expect(result).toMatch(/[-*]\s+Item one/);
  });
});

describe('cleanConfluencePage', () => {
  const validPage: ConfluencePage = {
    id: 'page-123',
    title: 'Test Page',
    type: 'page',
    status: 'current',
    body: {
      storage: {
        value: '<p>Test content here.</p>',
        representation: 'storage',
      },
    },
    version: {
      number: 5,
      when: '2024-01-15T12:00:00Z',
    },
    space: {
      key: 'MYSPACE',
      name: 'My Space',
    },
    _links: {
      webui: '/wiki/display/MYSPACE/Test+Page',
    },
  };

  it('returns a CleanConfluencePage for valid input', () => {
    const result = cleanConfluencePage(validPage);
    expect(result).not.toBeNull();
    expect(result!.pageId).toBe('page-123');
    expect(result!.title).toBe('Test Page');
    expect(result!.markdown).toContain('Test content here.');
  });

  it('returns null when page has no body storage value', () => {
    const pageNoBody: ConfluencePage = {
      ...validPage,
      body: { storage: { value: '' } },
    };
    const result = cleanConfluencePage(pageNoBody);
    expect(result).toBeNull();
  });

  it('returns null when body is undefined', () => {
    const pageNoBody: ConfluencePage = {
      ...validPage,
      body: undefined,
    };
    const result = cleanConfluencePage(pageNoBody);
    expect(result).toBeNull();
  });

  it('sets spaceKey from page.space.key', () => {
    const result = cleanConfluencePage(validPage);
    expect(result!.spaceKey).toBe('MYSPACE');
  });

  it('sets updatedAt from version.when', () => {
    const result = cleanConfluencePage(validPage);
    expect(result!.updatedAt).toBe('2024-01-15T12:00:00Z');
  });

  it('sets etag from version number', () => {
    const result = cleanConfluencePage(validPage);
    expect(result!.etag).toBe('5');
  });

  it('sets versionNumber correctly', () => {
    const result = cleanConfluencePage(validPage);
    expect(result!.versionNumber).toBe(5);
  });

  it('handles missing space key gracefully', () => {
    const pageNoSpace: ConfluencePage = { ...validPage, space: undefined };
    const result = cleanConfluencePage(pageNoSpace);
    expect(result!.spaceKey).toBeUndefined();
  });

  it('handles missing version gracefully', () => {
    const pageNoVersion: ConfluencePage = { ...validPage, version: undefined };
    const result = cleanConfluencePage(pageNoVersion);
    expect(result!.updatedAt).toBeUndefined();
    expect(result!.versionNumber).toBeUndefined();
  });

  it('builds url from CONFLUENCE_BASE_URL env and webui link', () => {
    const originalEnv = process.env.CONFLUENCE_BASE_URL;
    process.env.CONFLUENCE_BASE_URL = 'https://my-confluence.example.com';
    const result = cleanConfluencePage(validPage);
    expect(result!.url).toBe('https://my-confluence.example.com/wiki/display/MYSPACE/Test+Page');
    process.env.CONFLUENCE_BASE_URL = originalEnv;
  });

  it('returns undefined url when webui link is absent', () => {
    const pageNoLinks: ConfluencePage = { ...validPage, _links: undefined };
    const result = cleanConfluencePage(pageNoLinks);
    expect(result!.url).toBeUndefined();
  });
});
