import { writeVectorizationLog } from '../vectorLog';
import type { VectorizationLog } from '../vectorLog';

jest.mock('node:fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockLog: VectorizationLog = {
  generatedAt: '2024-01-01T00:00:00Z',
  embedVersion: 'v1',
  embeddedPages: [
    {
      pageId: 'page-1',
      pageTitle: 'Page One',
      spaceKey: 'SPACE',
      etag: '1',
      updatedAt: '2024-01-01',
      chunkCount: 3,
    },
  ],
  skippedPages: [
    {
      pageId: 'page-2',
      pageTitle: 'Page Two',
      reasons: ['etag unchanged'],
    },
  ],
  chunks: [
    {
      chunkId: 'page-1-0',
      nodeId: 'page-1-0',
      pageId: 'page-1',
      pageTitle: 'Page One',
      heading: 'Introduction',
      headingPath: 'Page One > Introduction',
      updatedAt: '2024-01-01',
      etag: '1',
      spaceKey: 'SPACE',
      embedVersion: 'v1',
      tokenEstimate: 120,
      piiFlag: false,
    },
  ],
};

describe('writeVectorizationLog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the log directory', async () => {
    const { promises: fsMock } = jest.requireMock('node:fs');
    await writeVectorizationLog(mockLog);
    expect(fsMock.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('logs'),
      { recursive: true }
    );
  });

  it('writes the log to a JSON file', async () => {
    const { promises: fsMock } = jest.requireMock('node:fs');
    await writeVectorizationLog(mockLog);
    expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
    const [, content] = fsMock.writeFile.mock.calls[0];
    const parsed = JSON.parse(content.trim());
    expect(parsed.embedVersion).toBe('v1');
    expect(parsed.embeddedPages).toHaveLength(1);
    expect(parsed.skippedPages).toHaveLength(1);
  });

  it('formats JSON with indentation', async () => {
    const { promises: fsMock } = jest.requireMock('node:fs');
    await writeVectorizationLog(mockLog);
    const [, content] = fsMock.writeFile.mock.calls[0];
    // Indented JSON contains newlines
    expect(content).toContain('\n');
    expect(content).toContain('  ');
  });

  it('appends a trailing newline', async () => {
    const { promises: fsMock } = jest.requireMock('node:fs');
    await writeVectorizationLog(mockLog);
    const [, content] = fsMock.writeFile.mock.calls[0];
    expect(content.endsWith('\n')).toBe(true);
  });
});
