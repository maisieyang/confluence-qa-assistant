import { UNIFIED_SYSTEM_PROMPT } from '../systemPrompts';

describe('UNIFIED_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof UNIFIED_SYSTEM_PROMPT).toBe('string');
    expect(UNIFIED_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('contains grounding rules about citations', () => {
    expect(UNIFIED_SYSTEM_PROMPT).toContain('Cite every factual claim');
  });

  it('contains language instructions', () => {
    expect(UNIFIED_SYSTEM_PROMPT).toContain('Language');
  });

  it('contains response format instructions', () => {
    expect(UNIFIED_SYSTEM_PROMPT).toContain('Response Format');
  });

  it('contains instructions about not fabricating information', () => {
    expect(UNIFIED_SYSTEM_PROMPT).toContain('Never fabricate');
  });
});
