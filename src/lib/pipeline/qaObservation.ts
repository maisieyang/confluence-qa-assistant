import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { QueryIntent } from './queryTransform';

const LOG_DIR = join(process.cwd(), 'logs');
const LOG_FILE = join(LOG_DIR, 'qa-observations.jsonl');

export interface QAObservation {
  requestId: string;
  timestamp: string;

  // Query Transform stage
  queryTransform: {
    originalQuestion: string;
    intent: QueryIntent;
    rewrittenQueries: string[];
    latencyMs: number;
  };

  // Retrieval stage (null when intent=general)
  retrieval: {
    queries: string[];
    rawResultCount: number;
    includedResultCount: number;
    topScore: number | null;
    avgScore: number | null;
    fallbackApplied: boolean;
    latencyMs: number;
  } | null;

  // Generation stage
  generation: {
    model: string;
    provider: string;
    promptCharCount: number;
    referenceCount: number;
    scenario: 'general' | 'normal' | 'low_confidence' | 'no_context';
  };

  // Overall
  totalLatencyMs: number;
  error?: string;
}

/** Simple timer helper */
export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

/** Append one observation record to the JSONL log file */
export async function writeObservation(observation: QAObservation): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const line = JSON.stringify(observation) + '\n';
    await fs.appendFile(LOG_FILE, line, 'utf-8');
  } catch (error) {
    // Never let observation logging break the main flow
    console.warn(
      'Failed to write QA observation:',
      error instanceof Error ? error.message : String(error),
    );
  }
}
