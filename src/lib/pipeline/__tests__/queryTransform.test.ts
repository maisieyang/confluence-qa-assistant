import { transformQuery } from '../queryTransform';
import type { QueryTransformResult } from '../queryTransform';

// Mock the entire modelProvider module so no real LLM calls are made
jest.mock('@/lib/providers/modelProvider', () => ({
  chatCompletion: jest.fn(),
}));

import { chatCompletion } from '@/lib/providers/modelProvider';
const mockChatCompletion = chatCompletion as jest.MockedFunction<typeof chatCompletion>;

// Helper to make chatCompletion resolve with a text response
function mockLlmResponse(text: string) {
  mockChatCompletion.mockResolvedValueOnce({ text, provider: 'qwen', model: 'qwen-turbo' });
}

describe('transformQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful LLM calls', () => {
    it('returns intent and queries for a knowledge_qa response', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["VPN setup guide steps"]}');

      const result = await transformQuery('How do I set up VPN?');

      expect(result).toMatchObject<QueryTransformResult>({
        intent: 'knowledge_qa',
        queries: ['VPN setup guide steps'],
        originalQuestion: 'How do I set up VPN?',
      });
    });

    it('returns intent general with empty queries for casual questions', async () => {
      mockLlmResponse('{"intent":"general","queries":[]}');

      const result = await transformQuery('你好');

      expect(result.intent).toBe('general');
      expect(result.queries).toEqual([]);
      expect(result.originalQuestion).toBe('你好');
    });

    it('returns multiple queries for compound questions', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["Project A tech stack","Project B tech stack"]}');

      const result = await transformQuery('Compare project A and project B tech stack');

      expect(result.intent).toBe('knowledge_qa');
      expect(result.queries).toHaveLength(2);
      expect(result.queries[0]).toBe('Project A tech stack');
      expect(result.queries[1]).toBe('Project B tech stack');
    });

    it('falls back to original question when LLM returns empty queries for knowledge_qa', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":[]}');

      const result = await transformQuery('What is the deployment process?');

      expect(result.intent).toBe('knowledge_qa');
      expect(result.queries).toEqual(['What is the deployment process?']);
      expect(result.originalQuestion).toBe('What is the deployment process?');
    });

    it('strips whitespace from queries returned by LLM', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["  trimmed query  ", "  another  "]}');

      const result = await transformQuery('some question');

      expect(result.queries).toEqual(['trimmed query', 'another']);
    });

    it('filters out non-string values from queries array', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["valid query", 42, null, "another valid"]}');

      const result = await transformQuery('mixed array question');

      expect(result.queries).toEqual(['valid query', 'another valid']);
    });

    it('filters out empty-string queries', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["valid", "", "  ", "also valid"]}');

      const result = await transformQuery('question with empty items');

      expect(result.queries).toEqual(['valid', 'also valid']);
    });

    it('treats unknown intent values as knowledge_qa', async () => {
      mockLlmResponse('{"intent":"unknown_intent","queries":["some query"]}');

      const result = await transformQuery('ambiguous question');

      expect(result.intent).toBe('knowledge_qa');
    });

    it('passes chatHistory when provided', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["resolved query"]}');

      await transformQuery('What about its configuration?', 'user: Tell me about Project X');

      expect(mockChatCompletion).toHaveBeenCalledTimes(1);
      const callArgs = mockChatCompletion.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).toContain('Conversation history:');
      expect(userMessage?.content).toContain('Tell me about Project X');
    });

    it('does not include Conversation history section when chatHistory is empty string', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["direct query"]}');

      await transformQuery('direct question', '');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).not.toContain('Conversation history:');
    });

    it('does not include Conversation history section when chatHistory is only whitespace', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["direct query"]}');

      await transformQuery('direct question', '   ');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const userMessage = callArgs.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).not.toContain('Conversation history:');
    });
  });

  describe('response parsing — markdown fence stripping', () => {
    it('handles response wrapped in ```json fences', async () => {
      mockLlmResponse('```json\n{"intent":"knowledge_qa","queries":["fenced query"]}\n```');

      const result = await transformQuery('some question');

      expect(result.intent).toBe('knowledge_qa');
      expect(result.queries).toEqual(['fenced query']);
    });

    it('handles response wrapped in plain ``` fences', async () => {
      mockLlmResponse('```\n{"intent":"knowledge_qa","queries":["plain fence"]}\n```');

      const result = await transformQuery('some question');

      expect(result.queries).toEqual(['plain fence']);
    });
  });

  describe('response parsing — invalid JSON fallback', () => {
    it('falls back to original question when LLM returns invalid JSON', async () => {
      mockLlmResponse('this is not json at all');

      const result = await transformQuery('fallback question');

      expect(result.intent).toBe('knowledge_qa');
      expect(result.queries).toEqual(['fallback question']);
      expect(result.originalQuestion).toBe('fallback question');
    });

    it('falls back to original question when queries field is missing', async () => {
      mockLlmResponse('{"intent":"knowledge_qa"}');

      const result = await transformQuery('no queries field');

      // queries is not an array → parsed as [] → knowledge_qa with no queries → fallback
      expect(result.intent).toBe('knowledge_qa');
      expect(result.queries).toEqual(['no queries field']);
    });
  });

  describe('error handling', () => {
    it('falls back gracefully when chatCompletion throws', async () => {
      mockChatCompletion.mockRejectedValueOnce(new Error('API unavailable'));

      const result = await transformQuery('question when api fails');

      expect(result.intent).toBe('knowledge_qa');
      expect(result.queries).toEqual(['question when api fails']);
      expect(result.originalQuestion).toBe('question when api fails');
    });

    it('falls back when chatCompletion rejects with a non-Error value', async () => {
      mockChatCompletion.mockRejectedValueOnce('string rejection');

      const result = await transformQuery('non-error rejection');

      expect(result.intent).toBe('knowledge_qa');
      expect(result.queries).toEqual(['non-error rejection']);
    });
  });

  describe('language detection via user prompt', () => {
    it('labels English question as English in user prompt', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["test"]}');

      await transformQuery('How does CI pipeline work?');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m) => m.role === 'user');
      expect(userMsg?.content).toContain('User question (English):');
    });

    it('labels Chinese question as Chinese in user prompt', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["CI流水线工作原理"]}');

      await transformQuery('CI流水线是如何工作的？');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m) => m.role === 'user');
      expect(userMsg?.content).toContain('User question (Chinese):');
    });

    it('includes language reminder in user prompt', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["anything"]}');

      await transformQuery('test');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const userMsg = callArgs.messages.find((m) => m.role === 'user');
      expect(userMsg?.content).toContain('REMINDER: Output queries MUST be in');
    });
  });

  describe('LLM call parameters', () => {
    it('calls chatCompletion with temperature 0', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["q"]}');

      await transformQuery('test');

      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0 }),
      );
    });

    it('includes a system message', async () => {
      mockLlmResponse('{"intent":"knowledge_qa","queries":["q"]}');

      await transformQuery('test');

      const callArgs = mockChatCompletion.mock.calls[0][0];
      const systemMsg = callArgs.messages.find((m) => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect(systemMsg?.content).toContain('query optimizer');
    });
  });
});
