import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import type { Root, Content, Heading } from 'mdast';
import type { CleanConfluencePage } from './clean';

const DEFAULT_MIN_TOKENS = 300;
const DEFAULT_MAX_TOKENS = 800;

export interface ChunkOptions {
  minTokens?: number;
  maxTokens?: number;
  embedVersion: string;
}

export interface PageChunk {
  id: string;
  nodeId: string;
  pageId: string;
  chunkIndex: number;
  content: string;
  tokenEstimate: number;
  title: string;
  heading?: string;
  headingPath: string[];
  headingPathString: string;
  sourceUrl?: string;
  spaceKey?: string;
  updatedAt?: string;
  etag?: string;
  embedVersion: string;
  piiFlag: boolean;
  parentNodeId?: string;
  chunkType?: 'parent' | 'child';
}

export interface ParentChildChunks {
  parents: PageChunk[];
  children: PageChunk[];
}

type SectionType = 'content' | 'code' | 'table';

type Section = {
  nodes: Content[];
  heading?: string;
  headingPath: string[];
  headingDepth: number;
  type: SectionType;
};

const parser = unified().use(remarkParse);
const stringifier = unified().use(remarkStringify, {
  fences: true,
  bullet: '-',
  listItemIndent: 'one',
});

function estimateTokens(text: string): number {
  // Whitespace-separated words (covers Latin/mixed text)
  const words = text.split(/\s+/g).filter(Boolean).length;
  // CJK characters are not separated by spaces — each is roughly 0.6 tokens for LLM tokenizers
  const cjkChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g) || []).length;
  return words + Math.ceil(cjkChars * 0.6);
}

function nodesToMarkdown(nodes: Content[]): string {
  const tree: Root = {
    type: 'root',
    children: nodes,
  };

  return stringifier.stringify(tree).trim();
}

function nodeToPlainText(node: Content): string {
  if ('value' in node && typeof node.value === 'string') {
    return node.value;
  }

  if ('children' in node && Array.isArray(node.children)) {
    return node.children.map((child) => nodeToPlainText(child as Content)).join('');
  }

  return '';
}

function headingToPlainText(heading: Heading): string {
  const text = heading.children.map((child) => nodeToPlainText(child as Content)).join('').trim();
  return text || `Heading level ${heading.depth ?? 1}`;
}

function buildSections(page: CleanConfluencePage, tree: Root): Section[] {
  const sections: Section[] = [];
  const headingStack: { depth: number; text: string }[] = [];
  let currentSection: Section | null = null;

  const fallbackHeadingPath = page.title ? [page.title] : [];

  for (const node of tree.children) {
    if (node.type === 'heading') {
      const headingNode = node as Heading;
      const depth = headingNode.depth ?? 1;
      while (headingStack.length && headingStack[headingStack.length - 1]?.depth >= depth) {
        headingStack.pop();
      }

      const text = headingToPlainText(headingNode);
      headingStack.push({ depth, text });

      currentSection = {
        nodes: [node as Content],
        heading: text,
        headingPath: headingStack.map((entry) => entry.text),
        headingDepth: depth,
        type: 'content',
      };
      sections.push(currentSection);
      continue;
    }

    if (node.type === 'code' || node.type === 'table') {
      const headingPath = headingStack.length ? headingStack.map((entry) => entry.text) : fallbackHeadingPath;
      const heading = headingStack.length ? headingStack[headingStack.length - 1]?.text : fallbackHeadingPath[0];
      sections.push({
        nodes: [node as Content],
        heading,
        headingPath,
        headingDepth: headingStack.length ? headingStack[headingStack.length - 1]?.depth ?? 1 : 1,
        type: node.type,
      });
      currentSection = null;
      continue;
    }

    if (!currentSection) {
      const heading = headingStack.length ? headingStack[headingStack.length - 1]?.text : fallbackHeadingPath[0];
      const headingPath = headingStack.length ? headingStack.map((entry) => entry.text) : fallbackHeadingPath;
      currentSection = {
        nodes: [],
        heading,
        headingPath,
        headingDepth: headingStack.length ? headingStack[headingStack.length - 1]?.depth ?? 1 : 1,
        type: 'content',
      };
      sections.push(currentSection);
    }

    currentSection.nodes.push(node as Content);
  }

  return sections.filter((section) => section.nodes.length > 0);
}

function splitSectionNodes(section: Section, minTokens: number, maxTokens: number): Content[][] {
  if (section.type !== 'content') {
    return [section.nodes];
  }

  const result: Content[][] = [];
  let buffer: Content[] = [];
  let bufferTokens = 0;

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }
    result.push(buffer);
    buffer = [];
    bufferTokens = 0;
  };

  for (const node of section.nodes) {
    const nodeMarkdown = nodesToMarkdown([node]);
    const nodeTokens = estimateTokens(nodeMarkdown);
    const wouldExceed = bufferTokens + nodeTokens > maxTokens;

    if (wouldExceed && bufferTokens >= minTokens) {
      flush();
    }

    if (wouldExceed && bufferTokens === 0) {
      result.push([node]);
      continue;
    }

    buffer.push(node as Content);
    bufferTokens += nodeTokens;

    if (bufferTokens >= maxTokens) {
      flush();
    }
  }

  flush();

  return result;
}

export function chunkPage(page: CleanConfluencePage, options: ChunkOptions): PageChunk[] {
  const minTokens = options.minTokens ?? DEFAULT_MIN_TOKENS;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const tree = parser.parse(page.markdown) as Root;
  const sections = buildSections(page, tree);

  const chunks: PageChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const nodeGroups = splitSectionNodes(section, minTokens, maxTokens);
    for (const nodes of nodeGroups) {
      const content = nodesToMarkdown(nodes);
      if (!content) {
        continue;
      }

      const headingPath = section.headingPath.length ? section.headingPath : (page.title ? [page.title] : []);
      const headingPathString = headingPath.join(' > ');
      const heading = section.heading ?? headingPath[headingPath.length - 1];
      const nodeId = `${page.pageId}-${chunkIndex}`;
      const tokenEstimate = estimateTokens(content);

      chunks.push({
        id: nodeId,
        nodeId,
        pageId: page.pageId,
        chunkIndex,
        content,
        tokenEstimate,
        title: page.title,
        heading,
        headingPath,
        headingPathString,
        sourceUrl: page.url,
        spaceKey: page.spaceKey,
        updatedAt: page.updatedAt,
        etag: page.etag,
        embedVersion: options.embedVersion,
        piiFlag: false,
      });

      chunkIndex += 1;
    }
  }

  return chunks;
}

const CHILD_MIN_TOKENS = 100;
const CHILD_MAX_TOKENS = 200;

/**
 * Split parent content into child chunks by paragraph boundaries (double newline).
 * Greedily merges paragraphs until reaching ~100-200 tokens per child.
 * If parent ≤200 tokens, returns a single child with the same content.
 */
function splitParentIntoChildren(parentContent: string): string[] {
  const parentTokens = estimateTokens(parentContent);
  if (parentTokens <= CHILD_MAX_TOKENS) {
    return [parentContent];
  }

  const paragraphs = parentContent.split(/\n\n+/);
  const children: string[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    if (bufferTokens + paraTokens > CHILD_MAX_TOKENS && bufferTokens >= CHILD_MIN_TOKENS) {
      children.push(buffer.join('\n\n'));
      buffer = [];
      bufferTokens = 0;
    }
    buffer.push(para);
    bufferTokens += paraTokens;
  }

  if (buffer.length > 0) {
    // If leftover is too small and we have previous children, merge with last child
    if (bufferTokens < CHILD_MIN_TOKENS && children.length > 0) {
      children[children.length - 1] += '\n\n' + buffer.join('\n\n');
    } else {
      children.push(buffer.join('\n\n'));
    }
  }

  return children.length > 0 ? children : [parentContent];
}

/**
 * A raw fragment from section-level splitting, before cross-section merging.
 */
interface RawFragment {
  content: string;
  tokens: number;
  heading?: string;
  headingPath: string[];
}

const PARENT_MIN_TOKENS = 300;
const PARENT_MAX_TOKENS = 800;

/**
 * Greedily merge adjacent small fragments into parent-sized chunks (300-800 tokens).
 * This cross-section merging is critical: buildSections() creates many tiny sections
 * (headings, code blocks, tables) that must be combined into meaningful parents.
 */
function mergeFragmentsIntoParents(fragments: RawFragment[]): RawFragment[] {
  if (fragments.length === 0) return [];

  const parents: RawFragment[] = [];
  let buffer: RawFragment[] = [];
  let bufferTokens = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const content = buffer.map((f) => f.content).join('\n\n');
    // Use the first fragment's heading info (represents the leading section)
    parents.push({
      content,
      tokens: estimateTokens(content),
      heading: buffer[0].heading,
      headingPath: buffer[0].headingPath,
    });
    buffer = [];
    bufferTokens = 0;
  };

  for (const frag of fragments) {
    const wouldExceed = bufferTokens + frag.tokens > PARENT_MAX_TOKENS;

    if (wouldExceed && bufferTokens >= PARENT_MIN_TOKENS) {
      flush();
    }

    // Single fragment exceeds max on its own — flush buffer first, then emit it solo
    if (wouldExceed && bufferTokens === 0 && frag.tokens > PARENT_MAX_TOKENS) {
      parents.push(frag);
      continue;
    }

    buffer.push(frag);
    bufferTokens += frag.tokens;
  }

  flush();
  return parents;
}

/**
 * Two-level chunking: produces parent chunks (300-800 tokens) and child chunks (100-200 tokens).
 * Children are embedded in Pinecone for precise retrieval; parents are stored locally for
 * context expansion and BM25 search.
 *
 * Key: adjacent small sections are merged cross-section into larger parents before splitting.
 */
export function chunkPageParentChild(page: CleanConfluencePage, options: ChunkOptions): ParentChildChunks {
  const tree = parser.parse(page.markdown) as Root;
  const sections = buildSections(page, tree);

  // Phase 1: Collect all raw fragments (one per section node-group, no min/max merging)
  const rawFragments: RawFragment[] = [];
  for (const section of sections) {
    // For section-level splitting, use low min so we don't merge here — merging happens cross-section
    const nodeGroups = splitSectionNodes(section, 0, PARENT_MAX_TOKENS);
    for (const nodes of nodeGroups) {
      const content = nodesToMarkdown(nodes);
      if (!content) continue;
      const headingPath = section.headingPath.length ? section.headingPath : (page.title ? [page.title] : []);
      rawFragments.push({
        content,
        tokens: estimateTokens(content),
        heading: section.heading ?? headingPath[headingPath.length - 1],
        headingPath,
      });
    }
  }

  // Phase 2: Greedily merge adjacent fragments into parent-sized chunks
  const mergedParents = mergeFragmentsIntoParents(rawFragments);

  // Phase 3: Build parent and child PageChunks
  const parents: PageChunk[] = [];
  const children: PageChunk[] = [];

  for (let pi = 0; pi < mergedParents.length; pi++) {
    const merged = mergedParents[pi];
    const headingPathString = merged.headingPath.join(' > ');
    const parentNodeId = `${page.pageId}-p${pi}`;

    parents.push({
      id: parentNodeId,
      nodeId: parentNodeId,
      pageId: page.pageId,
      chunkIndex: pi,
      content: merged.content,
      tokenEstimate: merged.tokens,
      title: page.title,
      heading: merged.heading,
      headingPath: merged.headingPath,
      headingPathString,
      sourceUrl: page.url,
      spaceKey: page.spaceKey,
      updatedAt: page.updatedAt,
      etag: page.etag,
      embedVersion: options.embedVersion,
      piiFlag: false,
      chunkType: 'parent',
    });

    // Split parent content into children
    const childContents = splitParentIntoChildren(merged.content);
    for (let ci = 0; ci < childContents.length; ci++) {
      const childContent = childContents[ci];
      const childNodeId = `${page.pageId}-p${pi}-c${ci}`;

      children.push({
        id: childNodeId,
        nodeId: childNodeId,
        pageId: page.pageId,
        chunkIndex: ci,
        content: childContent,
        tokenEstimate: estimateTokens(childContent),
        title: page.title,
        heading: merged.heading,
        headingPath: merged.headingPath,
        headingPathString,
        sourceUrl: page.url,
        spaceKey: page.spaceKey,
        updatedAt: page.updatedAt,
        etag: page.etag,
        embedVersion: options.embedVersion,
        piiFlag: false,
        parentNodeId,
        chunkType: 'child',
      });
    }
  }

  return { parents, children };
}

