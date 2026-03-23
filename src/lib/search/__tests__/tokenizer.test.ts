import { tokenize } from '../tokenizer';

describe('tokenize', () => {
  // --- Empty / falsy inputs ---
  it('returns empty array for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('returns empty array for null/undefined-like falsy values', () => {
    // The implementation guards with `if (!text) return []`
    expect(tokenize('')).toEqual([]);
  });

  // --- English tokenization ---
  it('lowercases English tokens', () => {
    const result = tokenize('Hello World');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('removes English stopwords', () => {
    const result = tokenize('the quick brown fox');
    expect(result).not.toContain('the');
    expect(result).toContain('quick');
    expect(result).toContain('brown');
    expect(result).toContain('fox');
  });

  it('splits on punctuation and whitespace', () => {
    const result = tokenize('hello, world! foo-bar');
    expect(result).toContain('hello');
    expect(result).toContain('world');
    expect(result).toContain('foo');
    expect(result).toContain('bar');
  });

  it('filters out single-character English tokens', () => {
    // split(/[^a-z0-9]+/) on "a b c" => ['a','b','c'], all length 1, all filtered
    const result = tokenize('a b c');
    expect(result).toEqual([]);
  });

  it('keeps numeric tokens longer than 1 character', () => {
    const result = tokenize('version 42');
    expect(result).toContain('42');
    expect(result).toContain('version');
  });

  it('removes common English stopwords from a sentence', () => {
    const stopwords = ['is', 'are', 'was', 'have', 'has', 'in', 'of', 'to', 'and', 'or'];
    const sentence = stopwords.join(' ');
    const result = tokenize(sentence);
    for (const sw of stopwords) {
      expect(result).not.toContain(sw);
    }
  });

  it('handles multiple spaces and punctuation gracefully', () => {
    const result = tokenize('  hello   world  ');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  // --- Chinese tokenization ---
  it('produces unigrams for non-stopword Chinese characters', () => {
    // '机器学习' => chars: 机,器,学,习
    // None are in ZH_STOPWORDS, so all 4 unigrams should appear
    const result = tokenize('机器学习');
    expect(result).toContain('机');
    expect(result).toContain('器');
    expect(result).toContain('学');
    expect(result).toContain('习');
  });

  it('produces bigrams for Chinese text', () => {
    // '机器学习' => bigrams: 机器, 器学, 学习
    const result = tokenize('机器学习');
    expect(result).toContain('机器');
    expect(result).toContain('器学');
    expect(result).toContain('学习');
  });

  it('filters Chinese stopword unigrams but keeps bigrams containing them', () => {
    // '的确' — '的' is a ZH_STOPWORD
    // Unigram '的' should be excluded, unigram '确' should be included
    // Bigram '的确' should be included
    const result = tokenize('的确');
    expect(result).not.toContain('的');
    expect(result).toContain('确');
    expect(result).toContain('的确');
  });

  it('returns empty array for text that is only Chinese stopwords', () => {
    // '的了在' — all ZH_STOPWORDS, only 2 bigrams produced (no unigrams kept)
    const result = tokenize('的了在');
    expect(result).not.toContain('的');
    expect(result).not.toContain('了');
    expect(result).not.toContain('在');
    // bigrams: 的了, 了在
    expect(result).toContain('的了');
    expect(result).toContain('了在');
  });

  it('handles single Chinese character with no bigram', () => {
    // Non-stopword single char => one unigram, no bigrams
    const result = tokenize('学');
    expect(result).toContain('学');
    // No bigrams possible from single char
    expect(result).toHaveLength(1);
  });

  // --- Mixed language ---
  it('handles mixed Chinese and English text', () => {
    const result = tokenize('BM25 搜索算法 search');
    // English
    expect(result).toContain('bm25');
    expect(result).toContain('search');
    // Chinese unigrams
    expect(result).toContain('搜');
    expect(result).toContain('索');
    expect(result).toContain('算');
    expect(result).toContain('法');
    // Chinese bigrams
    expect(result).toContain('搜索');
    expect(result).toContain('索算');
    expect(result).toContain('算法');
  });

  it('correctly alternates between CJK and non-CJK segments', () => {
    // English then Chinese then English
    const result = tokenize('hello世界world');
    expect(result).toContain('hello');
    expect(result).toContain('world');
    expect(result).toContain('世');
    expect(result).toContain('界');
    expect(result).toContain('世界');
  });

  it('handles text that is only whitespace/punctuation', () => {
    const result = tokenize('   ,,,   ');
    expect(result).toEqual([]);
  });

  it('returns stable token list for same input', () => {
    const input = 'machine learning algorithm';
    expect(tokenize(input)).toEqual(tokenize(input));
  });
});
