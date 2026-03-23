import { startTimer, writeObservation } from '../qaObservation';
import type { QAObservation } from '../qaObservation';

// Mock the fs module
jest.mock('node:fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    appendFile: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockObservation: QAObservation = {
  requestId: 'test-req-123',
  timestamp: '2024-01-01T00:00:00Z',
  queryTransform: {
    originalQuestion: 'What is Confluence?',
    intent: 'factual',
    rewrittenQueries: ['What is Confluence used for?'],
    latencyMs: 50,
  },
  retrieval: {
    queries: ['What is Confluence?'],
    rawResultCount: 10,
    includedResultCount: 5,
    topScore: 0.95,
    avgScore: 0.82,
    fallbackApplied: false,
    latencyMs: 100,
  },
  generation: {
    model: 'gpt-4o-mini',
    provider: 'openai',
    promptCharCount: 1500,
    referenceCount: 3,
    scenario: 'normal',
  },
  totalLatencyMs: 200,
};

describe('startTimer', () => {
  it('returns a function', () => {
    const stop = startTimer();
    expect(typeof stop).toBe('function');
  });

  it('returns elapsed milliseconds when called', async () => {
    const stop = startTimer();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const elapsed = stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(typeof elapsed).toBe('number');
  });

  it('measures at least 0ms immediately', () => {
    const stop = startTimer();
    const elapsed = stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe('writeObservation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes a JSONL line to the log file', async () => {
    const { promises: fsMock } = jest.requireMock('node:fs');
    await writeObservation(mockObservation);
    expect(fsMock.mkdir).toHaveBeenCalledTimes(1);
    expect(fsMock.appendFile).toHaveBeenCalledTimes(1);
    const [, content] = fsMock.appendFile.mock.calls[0];
    const parsed = JSON.parse(content.trim());
    expect(parsed.requestId).toBe('test-req-123');
  });

  it('does not throw when fs operations fail', async () => {
    const { promises: fsMock } = jest.requireMock('node:fs');
    fsMock.mkdir.mockRejectedValueOnce(new Error('Permission denied'));
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(writeObservation(mockObservation)).resolves.not.toThrow();
    consoleSpy.mockRestore();
  });

  it('serializes the observation as valid JSON', async () => {
    const { promises: fsMock } = jest.requireMock('node:fs');
    await writeObservation(mockObservation);
    const [, content] = fsMock.appendFile.mock.calls[0];
    expect(() => JSON.parse(content.trim())).not.toThrow();
  });

  it('appends a newline at the end of each entry', async () => {
    const { promises: fsMock } = jest.requireMock('node:fs');
    await writeObservation(mockObservation);
    const [, content] = fsMock.appendFile.mock.calls[0];
    expect(content.endsWith('\n')).toBe(true);
  });
});
