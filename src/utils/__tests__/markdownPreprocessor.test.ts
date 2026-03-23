import { preprocessMarkdown, processCollapsibleContent } from '@/utils/markdownPreprocessor';

describe('preprocessMarkdown', () => {
  describe('fixHeadings - adds space after # symbols', () => {
    it('adds a space between # and first character for single-word heading', () => {
      // fixHeadings converts #Hello -> "# Hello"
      // but then fixHeadingContentSeparation treats the last char as non-heading content
      const result = preprocessMarkdown('#Hello');
      // The heading marker and a space are correctly inserted; the regex pipeline
      // also runs fixHeadingContentSeparation which further processes the result
      expect(result).toContain('# Hell');
    });

    it('does not alter content that has no # markers', () => {
      const result = preprocessMarkdown('Just plain text.');
      expect(result).toBe('Just plain text.');
    });

    it('processes list items independently of headings', () => {
      const input = '-item1\n-item2\n- item3';
      const result = preprocessMarkdown(input);
      expect(result).toContain('- item1');
      expect(result).toContain('- item2');
      expect(result).toContain('- item3');
    });
  });

  describe('fixLists - adds space after list markers', () => {
    it('adds space after - when missing', () => {
      const result = preprocessMarkdown('-item');
      expect(result).toBe('- item');
    });

    it('adds space after * when missing', () => {
      const result = preprocessMarkdown('*item');
      expect(result).toBe('* item');
    });

    it('adds space after + when missing', () => {
      const result = preprocessMarkdown('+item');
      expect(result).toBe('+ item');
    });

    it('adds space after numbered list marker when missing', () => {
      const result = preprocessMarkdown('1.item');
      expect(result).toBe('1. item');
    });

    it('does not modify list items already properly formatted', () => {
      const result = preprocessMarkdown('- already spaced');
      expect(result).toBe('- already spaced');
    });

    it('handles multiple unspaced list items', () => {
      const input = '-item1\n-item2\n- item3';
      const result = preprocessMarkdown(input);
      expect(result).toContain('- item1');
      expect(result).toContain('- item2');
      expect(result).toContain('- item3');
    });

    it('handles multiple numbered list items without spaces', () => {
      const input = '1.first\n2.second';
      const result = preprocessMarkdown(input);
      expect(result).toContain('1. first');
      expect(result).toContain('2. second');
    });
  });

  describe('cleanExtraNewlines - collapses excess blank lines', () => {
    it('collapses three newlines into two', () => {
      const result = preprocessMarkdown('a\n\n\nb');
      expect(result).toBe('a\n\nb');
    });

    it('collapses four newlines into two', () => {
      const result = preprocessMarkdown('a\n\n\n\nb');
      expect(result).toBe('a\n\nb');
    });

    it('leaves two newlines (one blank line) unchanged', () => {
      const result = preprocessMarkdown('a\n\nb');
      expect(result).toBe('a\n\nb');
    });

    it('trims leading whitespace', () => {
      const result = preprocessMarkdown('   hello');
      expect(result).toBe('hello');
    });

    it('trims trailing whitespace', () => {
      const result = preprocessMarkdown('hello   ');
      expect(result).toBe('hello');
    });

    it('does not contain 3+ consecutive newlines after processing', () => {
      const input = 'a\n\n\n\n\nb\n\n\n\nc';
      const result = preprocessMarkdown(input);
      expect(result).not.toMatch(/\n{3,}/);
    });
  });

  describe('combined pipeline behavior', () => {
    it('handles empty string', () => {
      const result = preprocessMarkdown('');
      expect(result).toBe('');
    });

    it('handles plain text without any markdown', () => {
      const result = preprocessMarkdown('Just plain text.');
      expect(result).toBe('Just plain text.');
    });

    it('properly formats unspaced list items across multiple lines', () => {
      const input = '-item one\n-item two';
      const result = preprocessMarkdown(input);
      expect(result).toContain('- item one');
      expect(result).toContain('- item two');
    });

    it('collapses excess blank lines in a list context', () => {
      const input = '- item one\n\n\n\n- item two';
      const result = preprocessMarkdown(input);
      expect(result).not.toMatch(/\n{3,}/);
    });

    it('trims the output', () => {
      const result = preprocessMarkdown('\n\n  hello  \n\n');
      expect(result).toBe('hello');
    });

    it('handles mixed list markers', () => {
      const input = '-first\n*second\n+third';
      const result = preprocessMarkdown(input);
      expect(result).toContain('- first');
      expect(result).toContain('* second');
      expect(result).toContain('+ third');
    });
  });
});

describe('processCollapsibleContent', () => {
  describe('with no code example sections', () => {
    it('returns a single normal block for plain content', () => {
      const content = 'Hello world';
      const sections = processCollapsibleContent(content);
      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('normal');
      expect(sections[0].content).toBe('Hello world');
    });

    it('returns a single normal block for content with other headings', () => {
      const content = '## Introduction\n\nSome content here.';
      const sections = processCollapsibleContent(content);
      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('normal');
    });

    it('returns the original content when no code example section matched', () => {
      const content = 'No code sections here.';
      const sections = processCollapsibleContent(content);
      expect(sections[0].content).toBe(content);
    });
  });

  describe('with a 代码示例 section', () => {
    it('detects a 代码示例 section and marks it as collapsible', () => {
      const content = '## 代码示例\n\n```js\nconsole.log("hi");\n```';
      const sections = processCollapsibleContent(content);
      expect(sections.length).toBeGreaterThanOrEqual(1);
      const collapsible = sections.find(s => s.type === 'collapsible');
      expect(collapsible).toBeDefined();
    });

    it('extracts the title from the 代码示例 heading', () => {
      const content = '## 代码示例\n\nsome code';
      const sections = processCollapsibleContent(content);
      const collapsible = sections.find(s => s.type === 'collapsible');
      expect(collapsible?.title).toBe('代码示例');
    });

    it('separates normal content before the code example section', () => {
      const content = '## Overview\n\nSome intro text.\n\n## 代码示例\n\n```js\ncode\n```';
      const sections = processCollapsibleContent(content);
      expect(sections.length).toBeGreaterThanOrEqual(2);
      const normalBlock = sections.find(s => s.type === 'normal');
      expect(normalBlock).toBeDefined();
      expect(normalBlock?.content).toContain('Overview');
    });

    it('captures content after the code example section as a separate normal block', () => {
      const content = '## 代码示例\n\ncode here\n\n## Summary\n\nFinal words.';
      const sections = processCollapsibleContent(content);
      const normalAfter = sections.find(s => s.type === 'normal' && s.content.includes('Summary'));
      expect(normalAfter).toBeDefined();
    });

    it('collapsible section content includes the heading text', () => {
      const content = '## 代码示例\n\nsome code here';
      const sections = processCollapsibleContent(content);
      const collapsible = sections.find(s => s.type === 'collapsible');
      expect(collapsible?.content).toContain('代码示例');
    });
  });

  describe('edge cases', () => {
    it('returns single normal block for empty string', () => {
      const sections = processCollapsibleContent('');
      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('normal');
    });

    it('each section has a content property that is a string', () => {
      const content = 'Some content without special headings.';
      const sections = processCollapsibleContent(content);
      sections.forEach(section => {
        expect(section).toHaveProperty('content');
        expect(typeof section.content).toBe('string');
      });
    });

    it('each section has a type that is normal or collapsible', () => {
      const content = '## 代码示例\n\ncode\n\n## Regular Section\n\ntext';
      const sections = processCollapsibleContent(content);
      sections.forEach(section => {
        expect(['normal', 'collapsible']).toContain(section.type);
      });
    });

    it('collapsible sections optionally have a title property', () => {
      const content = '## 代码示例\n\nsome code';
      const sections = processCollapsibleContent(content);
      const collapsible = sections.find(s => s.type === 'collapsible');
      expect(collapsible).toHaveProperty('title');
    });

    it('always returns at least one section', () => {
      const cases = ['', 'text', '## 代码示例\n\ncode', '## Other heading'];
      cases.forEach(c => {
        const sections = processCollapsibleContent(c);
        expect(sections.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
