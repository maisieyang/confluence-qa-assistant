import { config as loadEnv } from 'dotenv';
import { File as NodeFile } from 'node:buffer';
import { promises as fs } from 'node:fs';
import { join, basename } from 'node:path';
import { chunkPage, type CleanConfluencePage } from '../src/lib/confluence';
import { getEmbeddingModelVersion } from '../src/lib/providers/modelProvider';
import { getPineconeStore } from '../src/lib/vectorstore';

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

  let totalChunks = 0;

  for (const page of pages) {
    const chunks = chunkPage(page, { embedVersion });

    if (chunks.length === 0) {
      console.log(`  SKIP  ${page.title} — no content after chunking`);
      continue;
    }

    // Delete old chunks for this page, then upsert new ones
    await store.deletePageChunks(page.pageId);
    await store.upsertChunks(chunks);

    totalChunks += chunks.length;
    console.log(`  DONE  ${page.title} — ${chunks.length} chunks`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Pages:  ${pages.length}`);
  console.log(`Chunks: ${totalChunks}`);
  console.log(`Model:  ${embedVersion}`);
  console.log(`Done.`);
}

main().catch((error) => {
  console.error('Ingestion failed:', error);
  process.exit(1);
});
