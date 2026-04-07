'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { visit, EXIT } from 'unist-util-visit';
import type {
  Root,
  Heading,
  List,
  Paragraph,
  ListItem,
  Link,
  Text,
  PhrasingContent,
} from 'mdast';
import { useDarkMode } from '../hooks/useDarkMode';
import { createMarkdownComponents } from './MarkdownComponents';

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className'],
  },
};

interface MarkdownRendererProps {
  content: string;
}

function extractHeadingText(node: Heading): string {
  const rawText = node.children
    .map((child) => {
      if (child.type === 'text') {
        return child.value;
      }
      if ('value' in child && typeof child.value === 'string') {
        return child.value;
      }
      return '';
    })
    .join('')
    .trim();

  return rawText.replace(/[:\s]+$/g, '').toLowerCase();
}

function createInlineReferenceParagraph(listNode: List): Paragraph | null {
  const inlineChildren: PhrasingContent[] = [];

  listNode.children.forEach((item, index) => {
    const listItem = item as ListItem;
    const refNumber = index + 1;

    let linkAdded = false;

    visit(listItem, 'link', (linkNode) => {
      const link = linkNode as Link;
      const linkText = link.children
        .map((child) => {
          if (child.type === 'text') {
            return (child as Text).value;
          }
          return '';
        })
        .join('')
        .trim();

      inlineChildren.push({
        type: 'link',
        url: link.url,
        children: [
          {
            type: 'text',
            value: `[${refNumber}] ${linkText || link.url}`,
          } as Text,
        ],
      } as Link);

      linkAdded = true;
      return EXIT;
    });

    if (!linkAdded) {
      inlineChildren.push({
        type: 'text',
        value: `[${refNumber}] Reference`,
      } as Text);
    }

    if (index !== listNode.children.length - 1) {
      inlineChildren.push({ type: 'text', value: ' ' } as Text);
    }
  });

  if (inlineChildren.length === 0) {
    return null;
  }

  return {
    type: 'paragraph',
    children: inlineChildren,
  };
}

function bankingMarkdownFormatting() {
  return (tree: Root) => {
    const nodes = tree.children;

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];

      if (node.type === 'heading') {
        const heading = node as Heading;
        const text = extractHeadingText(heading);

        if (text === 'references') {
          nodes.splice(i, 1);

          const nextNode = nodes[i];
          if (nextNode && nextNode.type === 'list') {
            const paragraph = createInlineReferenceParagraph(nextNode as List);
            nodes.splice(i, 1);

            if (paragraph) {
              nodes.splice(i, 0, paragraph);
              i += 1;
            }
          }

          i -= 1;
        }
      }
    }

    // No longer inject an "Answer" heading for short/casual responses
  };
}

// ReactMarkdown and unified types are slightly out of sync; coerce the plugin list.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const remarkPluginsList: any = [remarkGfm, remarkBreaks, bankingMarkdownFormatting];

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const { isDarkMode } = useDarkMode();

  const components = useMemo(
    () => createMarkdownComponents({ isDarkMode }),
    [isDarkMode]
  );

  return (
    <div className="prose prose-lg max-w-none dark:prose-invert">
      <ReactMarkdown
        components={components}
        remarkPlugins={remarkPluginsList}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
