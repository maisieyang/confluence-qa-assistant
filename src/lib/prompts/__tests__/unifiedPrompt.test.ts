import {
  buildUnifiedUserPrompt,
  buildProviderMessages,
  tracePrompt,
  QA_USER_PROMPT_INSTRUCTIONS,
} from '../unifiedPrompt';
import { UNIFIED_SYSTEM_PROMPT } from '../systemPrompts';

describe('buildUnifiedUserPrompt', () => {
  it('builds a minimal prompt with only a question', () => {
    const result = buildUnifiedUserPrompt({ question: 'What is Confluence?' });
    expect(result).toContain('## User Question');
    expect(result).toContain('What is Confluence?');
  });

  it('includes chat history when provided', () => {
    const result = buildUnifiedUserPrompt({
      question: 'Follow-up question',
      chatHistory: 'user: Hello\nassistant: Hi there',
    });
    expect(result).toContain('## Conversation History');
    expect(result).toContain('user: Hello');
    expect(result).toContain('## User Question');
    expect(result).toContain('Follow-up question');
  });

  it('omits chat history when empty string or null', () => {
    const result1 = buildUnifiedUserPrompt({ question: 'Q?', chatHistory: '' });
    expect(result1).not.toContain('## Conversation History');

    const result2 = buildUnifiedUserPrompt({ question: 'Q?', chatHistory: null });
    expect(result2).not.toContain('## Conversation History');
  });

  it('includes custom instructions at the top', () => {
    const result = buildUnifiedUserPrompt({
      question: 'What is this?',
      instructions: '### Custom Task\nDo something specific.',
    });
    expect(result).toContain('### Custom Task');
    const instructionsIndex = result.indexOf('### Custom Task');
    const questionIndex = result.indexOf('## User Question');
    expect(instructionsIndex).toBeLessThan(questionIndex);
  });

  it('omits instructions when empty or whitespace', () => {
    const result = buildUnifiedUserPrompt({ question: 'Q?', instructions: '   ' });
    expect(result).not.toContain('###');
    expect(result).toContain('## User Question');
  });

  it('includes context sections with content', () => {
    const result = buildUnifiedUserPrompt({
      question: 'What is X?',
      contextSections: [
        { title: 'Retrieval Context', content: 'X is a thing described here.' },
        { title: 'Extra Info', content: 'Some extra information.' },
      ],
    });
    expect(result).toContain('## Retrieval Context');
    expect(result).toContain('X is a thing described here.');
    expect(result).toContain('## Extra Info');
  });

  it('skips context sections with null or empty content', () => {
    const result = buildUnifiedUserPrompt({
      question: 'Q?',
      contextSections: [
        { title: 'Empty Section', content: null },
        { title: 'Whitespace Section', content: '   ' },
        { title: 'Real Section', content: 'Actual content here.' },
      ],
    });
    expect(result).not.toContain('Empty Section');
    expect(result).not.toContain('Whitespace Section');
    expect(result).toContain('## Real Section');
    expect(result).toContain('Actual content here.');
  });

  it('uses "Context" as fallback for empty section title', () => {
    const result = buildUnifiedUserPrompt({
      question: 'Q?',
      contextSections: [{ title: '', content: 'Content here.' }],
    });
    expect(result).toContain('## Context');
    expect(result).toContain('Content here.');
  });

  it('uses --- as separator between sections', () => {
    const result = buildUnifiedUserPrompt({
      question: 'Q?',
      chatHistory: 'Previous conversation.',
    });
    expect(result).toContain('\n\n---\n\n');
  });

  it('trims whitespace from question', () => {
    const result = buildUnifiedUserPrompt({ question: '  My question  ' });
    expect(result).toContain('My question');
  });
});

describe('buildProviderMessages', () => {
  it('returns system and user messages', () => {
    const { messages, userPrompt } = buildProviderMessages({ question: 'Hello?' });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe(userPrompt);
  });

  it('uses UNIFIED_SYSTEM_PROMPT by default', () => {
    const { messages } = buildProviderMessages({ question: 'Q?' });
    expect(messages[0].content).toBe(UNIFIED_SYSTEM_PROMPT.trim());
  });

  it('uses custom systemPrompt when provided', () => {
    const customSystem = 'You are a custom assistant.';
    const { messages } = buildProviderMessages({
      question: 'Q?',
      systemPrompt: customSystem,
    });
    expect(messages[0].content).toBe(customSystem);
  });

  it('passes through all options to buildUnifiedUserPrompt', () => {
    const { userPrompt } = buildProviderMessages({
      question: 'What is X?',
      chatHistory: 'Some history',
      contextSections: [{ title: 'Context', content: 'Details about X.' }],
    });
    expect(userPrompt).toContain('Some history');
    expect(userPrompt).toContain('Details about X.');
    expect(userPrompt).toContain('What is X?');
  });
});

describe('tracePrompt', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('does not call console.debug when PROMPT_TRACE is not set', () => {
    // PROMPT_TRACE is not set by default in test env
    tracePrompt(
      { label: 'test' },
      [{ role: 'user', content: 'Hello' }]
    );
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('handles empty messages array without error', () => {
    expect(() =>
      tracePrompt({ label: 'test', requestId: 'req-123' }, [])
    ).not.toThrow();
  });
});

describe('QA_USER_PROMPT_INSTRUCTIONS', () => {
  it('is a non-empty string', () => {
    expect(typeof QA_USER_PROMPT_INSTRUCTIONS).toBe('string');
    expect(QA_USER_PROMPT_INSTRUCTIONS.length).toBeGreaterThan(0);
  });

  it('contains citation instruction', () => {
    expect(QA_USER_PROMPT_INSTRUCTIONS).toContain('[n]');
  });
});
