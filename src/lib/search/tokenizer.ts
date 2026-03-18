/**
 * Bilingual tokenizer for BM25 search.
 * English: lowercase, split on whitespace/punctuation, remove stopwords.
 * Chinese: character bigrams (zero-dependency approach for CJK).
 * Mixed text: split into CJK and non-CJK runs, apply appropriate strategy.
 */

const EN_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'and', 'but', 'or', 'if', 'while', 'because', 'until', 'about',
  'this', 'that', 'these', 'those', 'it', 'its', 'he', 'she', 'they',
  'them', 'his', 'her', 'their', 'my', 'your', 'our', 'we', 'you', 'i',
  'me', 'him', 'us', 'what', 'which', 'who', 'whom',
]);

// Chinese single-character stopwords — high-frequency function words with near-zero
// discriminative value. Filtered at the unigram level; bigrams containing these chars
// are kept because they may carry meaning (e.g. "的确", "在于").
const ZH_STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她',
  '么', '那', '被', '从', '把', '它', '年', '多', '为', '与',
]);

// CJK Unified Ideographs range
const CJK_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const CJK_CHAR_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf]/g;

function tokenizeEnglish(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !EN_STOPWORDS.has(t));
}

function tokenizeChinese(text: string): string[] {
  const chars = text.match(CJK_CHAR_REGEX) ?? [];
  if (chars.length === 0) return [];

  const tokens: string[] = [];
  // Unigrams (skip stopwords)
  for (const ch of chars) {
    if (!ZH_STOPWORDS.has(ch)) {
      tokens.push(ch);
    }
  }
  // Bigrams (keep all — bigrams may carry meaning even if one char is a stopword)
  for (let i = 0; i < chars.length - 1; i++) {
    tokens.push(chars[i] + chars[i + 1]);
  }
  return tokens;
}

/**
 * Tokenize mixed-language text for BM25 indexing and search.
 * Returns an array of tokens (lowercase English words + Chinese character bigrams).
 */
export function tokenize(text: string): string[] {
  if (!text) return [];

  const tokens: string[] = [];

  // Split text into CJK and non-CJK segments
  let buffer = '';
  let inCJK = false;

  for (const char of text) {
    const isCJK = CJK_REGEX.test(char);
    if (isCJK !== inCJK && buffer) {
      if (inCJK) {
        tokens.push(...tokenizeChinese(buffer));
      } else {
        tokens.push(...tokenizeEnglish(buffer));
      }
      buffer = '';
    }
    buffer += char;
    inCJK = isCJK;
  }

  // Flush remaining buffer
  if (buffer) {
    if (inCJK) {
      tokens.push(...tokenizeChinese(buffer));
    } else {
      tokens.push(...tokenizeEnglish(buffer));
    }
  }

  return tokens;
}
