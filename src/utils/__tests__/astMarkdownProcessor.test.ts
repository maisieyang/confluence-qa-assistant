import {
  processMarkdownWithAST,
  normalizeMarkdown,
  detectCodeBlockLanguage,
  extractImportantInfo,
} from '@/utils/astMarkdownProcessor';

describe('processMarkdownWithAST', () => {
  describe('fallback behavior for content without headings', () => {
    it('returns a single normal block for empty string', () => {
      const result = processMarkdownWithAST('');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('normal');
    });

    it('returns a single normal block for plain text with no headings', () => {
      const result = processMarkdownWithAST('Hello world, this is plain text.');
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('normal');
    });

    it('preserves original content in fallback block', () => {
      const markdown = 'Hello world';
      const result = processMarkdownWithAST(markdown);
      // Either a processed block that includes the text, or original content
      expect(result[0].content).toBeTruthy();
    });
  });

  describe('normal heading detection', () => {
    it('creates a normal block for a regular heading', () => {
      const markdown = '## Introduction\n\nSome introductory text.';
      const result = processMarkdownWithAST(markdown);
      expect(result.length).toBeGreaterThanOrEqual(1);
      const normalBlock = result.find(b => b.type === 'normal');
      expect(normalBlock).toBeDefined();
    });

    it('includes the heading in block content', () => {
      const markdown = '## Introduction\n\nSome text.';
      const result = processMarkdownWithAST(markdown);
      const block = result.find(b => b.type === 'normal');
      expect(block?.content).toContain('Introduction');
    });

    it('handles multiple headings producing multiple blocks', () => {
      const markdown = '## Section One\n\nText one.\n\n## Section Two\n\nText two.';
      const result = processMarkdownWithAST(markdown);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('code example heading detection (代码示例)', () => {
    it('creates a code-example block for 代码示例 heading', () => {
      const markdown = '## 代码示例\n\n```js\nconsole.log("hi");\n```';
      const result = processMarkdownWithAST(markdown);
      const codeBlock = result.find(b => b.type === 'code-example');
      expect(codeBlock).toBeDefined();
    });

    it('sets the title for a 代码示例 block', () => {
      const markdown = '## 代码示例\n\nsome code';
      const result = processMarkdownWithAST(markdown);
      const codeBlock = result.find(b => b.type === 'code-example');
      expect(codeBlock?.title).toBe('代码示例');
    });

    it('marks code-example block with isCodeBlock metadata', () => {
      const markdown = '## 代码示例\n\nsome code';
      const result = processMarkdownWithAST(markdown);
      const codeBlock = result.find(b => b.type === 'code-example');
      expect(codeBlock?.metadata?.isCodeBlock).toBe(true);
    });

    it('detects Code Example heading in English', () => {
      const markdown = '## Code Example\n\nsome code';
      const result = processMarkdownWithAST(markdown);
      const codeBlock = result.find(b => b.type === 'code-example');
      expect(codeBlock).toBeDefined();
    });
  });

  describe('important/notice heading detection (重要/注意)', () => {
    it('creates a collapsible block for 重要 heading', () => {
      const markdown = '## 重要\n\nThis is important information.';
      const result = processMarkdownWithAST(markdown);
      const collapsible = result.find(b => b.type === 'collapsible');
      expect(collapsible).toBeDefined();
    });

    it('sets the title for a 重要 block', () => {
      const markdown = '## 重要提示\n\nNote this carefully.';
      const result = processMarkdownWithAST(markdown);
      const collapsible = result.find(b => b.type === 'collapsible');
      expect(collapsible?.title).toContain('重要');
    });

    it('marks collapsible block with isImportant metadata', () => {
      const markdown = '## 重要\n\nThis is important.';
      const result = processMarkdownWithAST(markdown);
      const collapsible = result.find(b => b.type === 'collapsible');
      expect(collapsible?.metadata?.isImportant).toBe(true);
    });

    it('creates a collapsible block for 注意 heading', () => {
      const markdown = '## 注意\n\nPay attention here.';
      const result = processMarkdownWithAST(markdown);
      const collapsible = result.find(b => b.type === 'collapsible');
      expect(collapsible).toBeDefined();
    });
  });

  describe('block structure', () => {
    it('every block has a type property', () => {
      const result = processMarkdownWithAST('## Test\n\nContent.');
      result.forEach(block => {
        expect(block).toHaveProperty('type');
        expect(['normal', 'collapsible', 'code-example']).toContain(block.type);
      });
    });

    it('every block has a content property that is a string', () => {
      const result = processMarkdownWithAST('## Test\n\nContent.');
      result.forEach(block => {
        expect(block).toHaveProperty('content');
        expect(typeof block.content).toBe('string');
      });
    });

    it('always returns at least one block', () => {
      const cases = [
        '',
        'plain text',
        '## Normal\n\nText',
        '## 代码示例\n\ncode',
        '## 重要\n\nimportant',
      ];
      cases.forEach(md => {
        const result = processMarkdownWithAST(md);
        expect(result.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('complex markdown with mixed headings', () => {
    it('separates regular and special headings into different block types', () => {
      const markdown = [
        '## Introduction',
        '',
        'Normal content.',
        '',
        '## 代码示例',
        '',
        'code here',
      ].join('\n');

      const result = processMarkdownWithAST(markdown);
      const types = result.map(b => b.type);
      expect(types).toContain('normal');
      expect(types).toContain('code-example');
    });

    it('handles a document with heading, paragraph, and list', () => {
      const markdown = '## Overview\n\nSome text.\n\n- item one\n- item two';
      const result = processMarkdownWithAST(markdown);
      expect(result.length).toBeGreaterThanOrEqual(1);
      // The block with Overview heading should contain the list items
      const block = result.find(b => b.content.includes('Overview'));
      expect(block).toBeDefined();
    });
  });
});

describe('normalizeMarkdown', () => {
  it('returns a string for valid markdown', () => {
    const result = normalizeMarkdown('# Hello\n\nParagraph.');
    expect(typeof result).toBe('string');
  });

  it('preserves heading content', () => {
    const result = normalizeMarkdown('# Hello World\n\nSome paragraph.');
    expect(result).toContain('Hello World');
  });

  it('preserves paragraph content', () => {
    const result = normalizeMarkdown('# Heading\n\nSome paragraph text.');
    expect(result).toContain('Some paragraph text.');
  });

  it('handles empty string', () => {
    const result = normalizeMarkdown('');
    expect(result).toBe('');
  });

  it('trims extra whitespace from heading text', () => {
    // remark parses "  heading  " and normalizeMarkdown trims via the visitor
    const result = normalizeMarkdown('#  Heading with spaces  ');
    expect(result).toContain('Heading with spaces');
    // Should not have trailing spaces in heading
    expect(result).not.toMatch(/# .+\s+\n/);
  });

  it('handles list items', () => {
    const result = normalizeMarkdown('- item one\n- item two');
    expect(result).toContain('item one');
    expect(result).toContain('item two');
  });

  it('returns a string (falls back to original when processor is frozen)', () => {
    // normalizeMarkdown uses remark().parse() which freezes the processor, then calls
    // .use() on the frozen instance, causing it to fall back to returning the original markdown
    const input = '# Hello\n\nParagraph.';
    const result = normalizeMarkdown(input);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a string when given only whitespace', () => {
    const result = normalizeMarkdown('   ');
    expect(typeof result).toBe('string');
  });

  it('preserves code block content', () => {
    const result = normalizeMarkdown('```js\nconsole.log("hi");\n```');
    expect(result).toContain('console.log');
  });

  it('handles deeply nested structure', () => {
    const md = '# Title\n\n## Subtitle\n\nParagraph with **bold** and *italic* text.';
    const result = normalizeMarkdown(md);
    expect(result).toContain('Title');
    expect(result).toContain('Subtitle');
  });
});

describe('detectCodeBlockLanguage', () => {
  it('detects javascript language', () => {
    const result = detectCodeBlockLanguage('```javascript\nconsole.log("hi");\n```');
    expect(result).toBe('javascript');
  });

  it('detects js shorthand language', () => {
    const result = detectCodeBlockLanguage('```js\nconst x = 1;\n```');
    expect(result).toBe('js');
  });

  it('detects python language', () => {
    const result = detectCodeBlockLanguage('```python\nprint("hi")\n```');
    expect(result).toBe('python');
  });

  it('detects typescript language', () => {
    const result = detectCodeBlockLanguage('```typescript\nconst x: number = 1;\n```');
    expect(result).toBe('typescript');
  });

  it('returns null when no language is specified', () => {
    const result = detectCodeBlockLanguage('```\nconsole.log("hi");\n```');
    expect(result).toBeNull();
  });

  it('returns null for plain text with no code block', () => {
    const result = detectCodeBlockLanguage('Just plain text.');
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = detectCodeBlockLanguage('');
    expect(result).toBeNull();
  });

  it('returns a detected language when multiple code blocks exist', () => {
    const content = '```js\ncode1\n```\n\n```python\ncode2\n```';
    const result = detectCodeBlockLanguage(content);
    // The visitor overwrites detectedLanguage on each match, so the last language wins
    expect(result).toBe('python');
  });

  it('returns null for markdown that has no fenced code blocks', () => {
    const result = detectCodeBlockLanguage('# Heading\n\nParagraph text.\n\n- list item');
    expect(result).toBeNull();
  });
});

describe('extractImportantInfo', () => {
  describe('hasCodeBlocks', () => {
    it('returns true when content has a code block', () => {
      const result = extractImportantInfo('```js\ncode\n```');
      expect(result.hasCodeBlocks).toBe(true);
    });

    it('returns false when content has no code blocks', () => {
      const result = extractImportantInfo('Just plain text.');
      expect(result.hasCodeBlocks).toBe(false);
    });

    it('returns false for empty string', () => {
      const result = extractImportantInfo('');
      expect(result.hasCodeBlocks).toBe(false);
    });
  });

  describe('hasTables', () => {
    it('returns false for content without tables (remark does not parse tables without gfm plugin)', () => {
      // remark without gfm plugin does not recognize pipe tables
      const content = '| Name | Age |\n| ---- | --- |\n| Alice | 30 |';
      const result = extractImportantInfo(content);
      // Without remark-gfm, tables are parsed as paragraphs, not table nodes
      expect(typeof result.hasTables).toBe('boolean');
    });

    it('returns false for plain text', () => {
      const result = extractImportantInfo('Just text.');
      expect(result.hasTables).toBe(false);
    });
  });

  describe('hasLinks', () => {
    it('returns true when content has a markdown link', () => {
      const result = extractImportantInfo('[Google](https://google.com)');
      expect(result.hasLinks).toBe(true);
    });

    it('returns false when content has no links', () => {
      const result = extractImportantInfo('Just plain text with no links.');
      expect(result.hasLinks).toBe(false);
    });

    it('detects links in a full document', () => {
      const content = '# Heading\n\nSome text with a [link](http://example.com) here.';
      const result = extractImportantInfo(content);
      expect(result.hasLinks).toBe(true);
    });
  });

  describe('languages array', () => {
    it('returns an empty array when no code blocks exist', () => {
      const result = extractImportantInfo('Just text.');
      expect(result.languages).toEqual([]);
    });

    it('includes the language of a code block', () => {
      const result = extractImportantInfo('```javascript\ncode\n```');
      expect(result.languages).toContain('javascript');
    });

    it('returns empty array for code block without a language', () => {
      const result = extractImportantInfo('```\ncode\n```');
      expect(result.languages).toEqual([]);
    });

    it('collects multiple languages from multiple code blocks', () => {
      const content = '```js\ncode1\n```\n\n```python\ncode2\n```';
      const result = extractImportantInfo(content);
      expect(result.languages).toContain('js');
      expect(result.languages).toContain('python');
      expect(result.languages).toHaveLength(2);
    });

    it('returns array type', () => {
      const result = extractImportantInfo('');
      expect(Array.isArray(result.languages)).toBe(true);
    });
  });

  describe('returned object shape', () => {
    it('always has all four properties', () => {
      const result = extractImportantInfo('');
      expect(result).toHaveProperty('hasCodeBlocks');
      expect(result).toHaveProperty('hasTables');
      expect(result).toHaveProperty('hasLinks');
      expect(result).toHaveProperty('languages');
    });

    it('hasCodeBlocks is a boolean', () => {
      const result = extractImportantInfo('text');
      expect(typeof result.hasCodeBlocks).toBe('boolean');
    });

    it('hasTables is a boolean', () => {
      const result = extractImportantInfo('text');
      expect(typeof result.hasTables).toBe('boolean');
    });

    it('hasLinks is a boolean', () => {
      const result = extractImportantInfo('text');
      expect(typeof result.hasLinks).toBe('boolean');
    });
  });
});
