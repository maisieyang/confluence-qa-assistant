import React from 'react';
import { render, screen } from '@testing-library/react';
import { createMarkdownComponents } from '../MarkdownComponents';

// Mock CodeCopyButton
jest.mock('../CodeCopyButton', () => ({
  CodeCopyButton: ({ code }: { code: string }) => (
    <button data-testid="copy-button" data-code={code}>Copy</button>
  ),
}));

// Mock VisualSeparator
jest.mock('../VisualSeparator', () => ({
  VisualSeparator: () => <hr data-testid="visual-separator" />,
}));

// Mock SyntaxHighlighter to keep tests fast
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({ children, language }: { children: string; language: string }) => (
    <pre data-testid="syntax-highlighter" data-language={language}>
      <code>{children}</code>
    </pre>
  ),
}));

jest.mock('../../styles/chatgpt-syntax-theme', () => ({
  chatgptTheme: {},
  chatgptDarkTheme: {},
}));

describe('createMarkdownComponents', () => {
  describe('code component', () => {
    it('renders inline code when no language class is present', () => {
      const components = createMarkdownComponents({ isDarkMode: false });
      const CodeComponent = components.code;
      render(<CodeComponent>inline code</CodeComponent>);
      const el = screen.getByText('inline code');
      expect(el.tagName.toLowerCase()).toBe('code');
    });

    it('renders code block with language class', () => {
      const components = createMarkdownComponents({ isDarkMode: false });
      const CodeComponent = components.code;
      render(<CodeComponent className="language-javascript">const x = 1;</CodeComponent>);
      expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
    });

    it('renders language label when language is specified', () => {
      const components = createMarkdownComponents({ isDarkMode: false });
      const CodeComponent = components.code;
      render(<CodeComponent className="language-python">print("hi")</CodeComponent>);
      expect(screen.getByText('python')).toBeInTheDocument();
    });

    it('renders copy button for code blocks with language', () => {
      const components = createMarkdownComponents({ isDarkMode: false });
      const CodeComponent = components.code;
      render(<CodeComponent className="language-typescript">const x = 1;</CodeComponent>);
      expect(screen.getByTestId('copy-button')).toBeInTheDocument();
    });

    it('does not render language label when no language class', () => {
      const components = createMarkdownComponents({ isDarkMode: false });
      const CodeComponent = components.code;
      render(<CodeComponent className="language-javascript">code here</CodeComponent>);
      // No language indicator when className is missing
      const components2 = createMarkdownComponents({ isDarkMode: false });
      const CodeComponent2 = components2.code;
      const { container } = render(<CodeComponent2>no lang</CodeComponent2>);
      // Inline code should not have syntax highlighter
      expect(container.querySelector('[data-testid="syntax-highlighter"]')).toBeNull();
    });

    it('uses dark theme when isDarkMode is true', () => {
      const components = createMarkdownComponents({ isDarkMode: true });
      const CodeComponent = components.code;
      render(<CodeComponent className="language-python">x = 1</CodeComponent>);
      // Should render without error
      expect(screen.getByTestId('syntax-highlighter')).toBeInTheDocument();
    });
  });

  describe('link (a) component', () => {
    it('renders an anchor with target=_blank and noreferrer', () => {
      const components = createMarkdownComponents({ isDarkMode: false });
      const LinkComponent = components.a;
      render(<LinkComponent href="https://example.com">Click me</LinkComponent>);
      const link = screen.getByRole('link', { name: /click me/i });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders link children correctly', () => {
      const components = createMarkdownComponents({ isDarkMode: false });
      const LinkComponent = components.a;
      render(<LinkComponent href="https://example.com">My Link</LinkComponent>);
      expect(screen.getByText('My Link')).toBeInTheDocument();
    });
  });

  describe('table component', () => {
    it('wraps table in overflow-x-auto div', () => {
      const components = createMarkdownComponents({ isDarkMode: false });
      const TableComponent = components.table;
      const { container } = render(
        <TableComponent>
          <tbody><tr><td>Cell</td></tr></tbody>
        </TableComponent>
      );
      const wrapper = container.querySelector('.overflow-x-auto');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper?.querySelector('table')).toBeInTheDocument();
    });
  });

  describe('hr component', () => {
    it('renders VisualSeparator for hr', () => {
      const components = createMarkdownComponents({ isDarkMode: false });
      const HrComponent = components.hr;
      render(<HrComponent />);
      expect(screen.getByTestId('visual-separator')).toBeInTheDocument();
    });
  });
});
