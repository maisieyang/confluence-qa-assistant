import { normalizeProviderName, PROVIDER_OPTIONS } from '../types';

describe('normalizeProviderName', () => {
  it('normalizes "qwen" to qwen', () => {
    expect(normalizeProviderName('qwen')).toBe('qwen');
  });

  it('normalizes "qwen-plus" to qwen', () => {
    expect(normalizeProviderName('qwen-plus')).toBe('qwen');
  });

  it('normalizes "tongyi" to qwen', () => {
    expect(normalizeProviderName('tongyi')).toBe('qwen');
  });

  it('normalizes "通义千问" to qwen', () => {
    expect(normalizeProviderName('通义千问')).toBe('qwen');
  });

  it('normalizes "openai" to openai', () => {
    expect(normalizeProviderName('openai')).toBe('openai');
  });

  it('normalizes "gpt" to openai', () => {
    expect(normalizeProviderName('gpt')).toBe('openai');
  });

  it('normalizes "chatgpt" to openai', () => {
    expect(normalizeProviderName('chatgpt')).toBe('openai');
  });

  it('is case-insensitive', () => {
    expect(normalizeProviderName('OPENAI')).toBe('openai');
    expect(normalizeProviderName('QWEN')).toBe('qwen');
    expect(normalizeProviderName('GPT')).toBe('openai');
  });

  it('trims whitespace', () => {
    expect(normalizeProviderName('  openai  ')).toBe('openai');
    expect(normalizeProviderName('  qwen  ')).toBe('qwen');
  });

  it('returns "qwen" as default for unknown values', () => {
    expect(normalizeProviderName('unknown-provider')).toBe('qwen');
    expect(normalizeProviderName('')).toBe('qwen');
    expect(normalizeProviderName(null)).toBe('qwen');
    expect(normalizeProviderName(undefined)).toBe('qwen');
  });
});

describe('PROVIDER_OPTIONS', () => {
  it('contains openai and qwen', () => {
    expect(PROVIDER_OPTIONS).toContain('openai');
    expect(PROVIDER_OPTIONS).toContain('qwen');
    expect(PROVIDER_OPTIONS).toHaveLength(2);
  });
});
