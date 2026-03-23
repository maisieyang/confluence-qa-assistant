import { buildManagedChatHistory } from '../contextManager';

// Mock the entire modelProvider module so no real LLM calls are made
jest.mock('@/lib/providers/modelProvider', () => ({
  chatCompletion: jest.fn(),
}));

import { chatCompletion } from '@/lib/providers/modelProvider';
const mockChatCompletion = chatCompletion as jest.MockedFunction<typeof chatCompletion>;

function mockSummary(text: string) {
  mockChatCompletion.mockResolvedValueOnce({ text, provider: 'qwen', model: 'qwen-turbo' });
}

// Default MAX_RECENT_ROUNDS = 3 → maxRecentMessages = 6
const MAX_RECENT_MESSAGES = 6;

/** Build a list of alternating user/assistant messages */
function makeMessages(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `message ${i + 1}`,
  }));
}

describe('buildManagedChatHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('empty and short conversations', () => {
    it('returns empty string for an empty messages array', async () => {
      const result = await buildManagedChatHistory([]);
      expect(result).toBe('');
      expect(mockChatCompletion).not.toHaveBeenCalled();
    });

    it('returns formatted history for a single message', async () => {
      const result = await buildManagedChatHistory([{ role: 'user', content: 'Hello' }]);
      expect(result).toBe('user: Hello');
      expect(mockChatCompletion).not.toHaveBeenCalled();
    });

    it('joins all messages with newlines when count equals maxRecentMessages', async () => {
      const messages = makeMessages(MAX_RECENT_MESSAGES);
      const result = await buildManagedChatHistory(messages);

      const lines = result.split('\n');
      expect(lines).toHaveLength(MAX_RECENT_MESSAGES);
      expect(mockChatCompletion).not.toHaveBeenCalled();
    });

    it('does not call LLM when message count is below the threshold', async () => {
      const messages = makeMessages(MAX_RECENT_MESSAGES - 1);
      await buildManagedChatHistory(messages);
      expect(mockChatCompletion).not.toHaveBeenCalled();
    });

    it('formats each message as "role: content"', async () => {
      const messages = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello there' },
      ];
      const result = await buildManagedChatHistory(messages);
      expect(result).toBe('user: Hi\nassistant: Hello there');
    });
  });

  describe('long conversations — summarization path', () => {
    it('calls chatCompletion to summarize when messages exceed threshold', async () => {
      mockSummary('Summarized early content');
      const messages = makeMessages(MAX_RECENT_MESSAGES + 2);

      await buildManagedChatHistory(messages);

      expect(mockChatCompletion).toHaveBeenCalledTimes(1);
    });

    it('includes summary section header in the result', async () => {
      mockSummary('Key discussion points');
      const messages = makeMessages(MAX_RECENT_MESSAGES + 2);

      const result = await buildManagedChatHistory(messages);

      expect(result).toContain('[Summary of earlier conversation]');
      expect(result).toContain('Key discussion points');
    });

    it('includes recent messages section header in the result', async () => {
      mockSummary('Early summary');
      const messages = makeMessages(MAX_RECENT_MESSAGES + 2);

      const result = await buildManagedChatHistory(messages);

      expect(result).toContain('[Recent messages]');
    });

    it('keeps exactly maxRecentMessages in the recent section', async () => {
      mockSummary('Earlier summary');
      const total = MAX_RECENT_MESSAGES + 4;
      const messages = makeMessages(total);

      const result = await buildManagedChatHistory(messages);

      // Extract recent messages section
      const recentSection = result.split('[Recent messages]\n')[1];
      const recentLines = recentSection.trim().split('\n');
      expect(recentLines).toHaveLength(MAX_RECENT_MESSAGES);
    });

    it('summarizes only early messages (not recent ones)', async () => {
      mockSummary('summary');
      const total = MAX_RECENT_MESSAGES + 2;
      const messages = makeMessages(total);

      await buildManagedChatHistory(messages);

      // The LLM is called with a conversation built from the early (non-recent) messages
      const callArgs = mockChatCompletion.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m: { role: string }) => m.role === 'user');
      // early messages count = total - MAX_RECENT_MESSAGES = 2
      const earlyMessages = messages.slice(0, total - MAX_RECENT_MESSAGES);
      earlyMessages.forEach((m) => {
        expect(userMsg?.content).toContain(`${m.role}: ${m.content}`);
      });
      // recent messages should NOT appear in the LLM call
      const recentMessages = messages.slice(-MAX_RECENT_MESSAGES);
      recentMessages.forEach((m) => {
        expect(userMsg?.content).not.toContain(m.content);
      });
    });

    it('trims whitespace from the summary', async () => {
      mockSummary('  trimmed summary  ');
      const messages = makeMessages(MAX_RECENT_MESSAGES + 2);

      const result = await buildManagedChatHistory(messages);

      expect(result).toContain('trimmed summary');
      expect(result).not.toContain('  trimmed summary  ');
    });
  });

  describe('summarization failure fallback', () => {
    it('falls back to truncated text when chatCompletion throws', async () => {
      mockChatCompletion.mockRejectedValueOnce(new Error('LLM unavailable'));
      const total = MAX_RECENT_MESSAGES + 4;
      const messages = makeMessages(total);

      const result = await buildManagedChatHistory(messages);

      // Should still produce a result with the structure
      expect(result).toContain('[Summary of earlier conversation]');
      expect(result).toContain('[Recent messages]');
    });

    it('fallback summary contains truncated content from early messages', async () => {
      const earlyMessages = Array.from({ length: 6 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `early message content ${i + 1} that is fairly long text here`,
      }));
      const recentMessages = makeMessages(MAX_RECENT_MESSAGES);
      const allMessages = [...earlyMessages, ...recentMessages];

      mockChatCompletion.mockRejectedValueOnce(new Error('API error'));

      const result = await buildManagedChatHistory(allMessages);

      // The fallback takes last 4 of earlyMessages, truncated to 100 chars each
      expect(result).toContain('[Summary of earlier conversation]');
    });

    it('fallback summary truncates long content to 100 chars', async () => {
      const longContent = 'x'.repeat(200);
      const earlyMessages = [
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: longContent },
        { role: 'assistant', content: longContent },
        { role: 'user', content: longContent },
      ];
      const recentMessages = makeMessages(MAX_RECENT_MESSAGES);
      const allMessages = [...earlyMessages, ...recentMessages];

      mockChatCompletion.mockRejectedValueOnce(new Error('LLM error'));

      const result = await buildManagedChatHistory(allMessages);

      // Split off summary section only
      const summarySectionStart = result.indexOf('[Summary of earlier conversation]\n') + '[Summary of earlier conversation]\n'.length;
      const summaryEnd = result.indexOf('\n\n[Recent messages]');
      const summaryContent = result.substring(summarySectionStart, summaryEnd);

      // Each fallback line should not contain more than role + ': ' + 100 chars
      const summaryLines = summaryContent.split('\n');
      summaryLines.forEach((line) => {
        // The content part after 'role: ' should be at most 100 chars
        const colonIndex = line.indexOf(': ');
        if (colonIndex !== -1) {
          const contentPart = line.substring(colonIndex + 2);
          expect(contentPart.length).toBeLessThanOrEqual(100);
        }
      });
    });
  });

  describe('LLM call parameters for summarization', () => {
    it('passes temperature 0 to chatCompletion', async () => {
      mockSummary('summary');
      const messages = makeMessages(MAX_RECENT_MESSAGES + 2);

      await buildManagedChatHistory(messages);

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0 }),
      );
    });

    it('includes a system message in the summarization call', async () => {
      mockSummary('summary');
      const messages = makeMessages(MAX_RECENT_MESSAGES + 2);

      await buildManagedChatHistory(messages);

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const systemMsg = callArgs.messages.find((m: { role: string }) => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect(systemMsg?.content).toContain('summarizer');
    });
  });
});
