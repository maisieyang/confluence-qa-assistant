import { config as loadEnv } from 'dotenv';
import { File as NodeFile } from 'node:buffer';
import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { chunkPageParentChild, type CleanConfluencePage } from '../src/lib/confluence';
import { getEmbeddingModelVersion } from '../src/lib/providers/modelProvider';
import { getPineconeStore } from '../src/lib/vectorstore';
import { buildParentStore, saveParentStore } from '../src/lib/vectorstore/parentStore';
import { buildBM25Index } from '../src/lib/search';
import type { PageChunk } from '../src/lib/confluence/chunk';

const globalWithFile = globalThis as unknown as { File?: typeof NodeFile };
if (typeof globalWithFile.File === 'undefined') {
  globalWithFile.File = NodeFile;
}

loadEnv();
loadEnv({ path: '.env.local', override: true });

const DEFAULT_DOCS_DIR = join(process.cwd(), 'data', 'test-docs');
const DEFAULT_SPACE_KEY = 'TEST';

async function loadMarkdownFiles(dir: string): Promise<CleanConfluencePage[]> {
  const entries = await fs.readdir(dir);
  const mdFiles = entries.filter((f) => f.endsWith('.md')).sort();

  const pages: CleanConfluencePage[] = [];

  for (const file of mdFiles) {
    const filePath = join(dir, file);
    const markdown = await fs.readFile(filePath, 'utf-8');
    const pageId = `local-${basename(file, '.md')}`;

    // Extract title from first heading, or use filename
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : basename(file, '.md');

    pages.push({
      pageId,
      title,
      markdown,
      spaceKey: DEFAULT_SPACE_KEY,
      updatedAt: new Date().toISOString(),
      etag: String(Date.now()),
    });
  }

  return pages;
}

async function main() {
  const docsDir = process.argv[2] || DEFAULT_DOCS_DIR;
  const pages = await loadMarkdownFiles(docsDir);

  if (pages.length === 0) {
    console.log(`No .md files found in ${docsDir}`);
    process.exit(1);
  }

  console.log(`\nFound ${pages.length} markdown files in ${docsDir}\n`);

  const embedVersion = getEmbeddingModelVersion();
  const store = await getPineconeStore();

  let totalChildren = 0;
  let totalParents = 0;
  const allParents: PageChunk[] = [];
  const allChildren: PageChunk[] = [];

  for (const page of pages) {
    const { parents, children } = chunkPageParentChild(page, { embedVersion });

    if (children.length === 0) {
      console.log(`  SKIP  ${page.title} — no content after chunking`);
      continue;
    }

    // Delete old chunks for this page, then upsert children to Pinecone
    await store.deletePageChunks(page.pageId);
    await store.upsertChunks(children);

    allParents.push(...parents);
    allChildren.push(...children);
    totalParents += parents.length;
    totalChildren += children.length;
    console.log(`  DONE  ${page.title} — ${parents.length} parents, ${children.length} children`);
  }

  // Build BM25 index from parents (larger chunks for better keyword matching)
  const bm25Index = buildBM25Index(allParents);
  const bm25Path = join(process.cwd(), 'data', 'bm25-index.json');
  await fs.writeFile(bm25Path, JSON.stringify(bm25Index), 'utf-8');
  console.log(`\n  BM25 index: ${bm25Index.docCount} docs, ${Object.keys(bm25Index.invertedIndex).length} terms → ${bm25Path}`);

  // Build and save parent store for context expansion
  const parentStoreData = buildParentStore(allParents);
  const parentStorePath = join(process.cwd(), 'data', 'parent-store.json');
  await saveParentStore(parentStoreData, parentStorePath);
  console.log(`  Parent store: ${Object.keys(parentStoreData.parents).length} parents → ${parentStorePath}`);

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Pages:    ${pages.length}`);
  console.log(`Parents:  ${totalParents}`);
  console.log(`Children: ${totalChildren} (embedded in Pinecone)`);
  console.log(`Model:    ${embedVersion}`);
  console.log(`Done.`);
}

main().catch((error) => {
  console.error('Ingestion failed:', error);
  process.exit(1);
});
