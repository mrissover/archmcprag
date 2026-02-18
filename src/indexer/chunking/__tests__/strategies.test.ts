import { describe, it, expect } from 'vitest';
import { estimateTokens, countWords, containsCodeBlock, containsTable, containsMermaid } from '../strategies.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates roughly 1 token per 4 characters', () => {
    const text = 'a'.repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });

  it('rounds up to nearest integer', () => {
    expect(estimateTokens('ab')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});

describe('countWords', () => {
  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
  });

  it('counts words separated by spaces', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  it('handles multiple whitespace types', () => {
    expect(countWords('hello\tworld\nfoo')).toBe(3);
  });

  it('ignores leading/trailing whitespace', () => {
    expect(countWords('  hello world  ')).toBe(2);
  });
});

describe('containsCodeBlock', () => {
  it('returns true when text contains a fenced code block', () => {
    expect(containsCodeBlock('before\n```js\ncode\n```\nafter')).toBe(true);
  });

  it('returns false for text without code blocks', () => {
    expect(containsCodeBlock('just regular text')).toBe(false);
  });

  it('returns false for single backticks', () => {
    expect(containsCodeBlock('inline `code` here')).toBe(false);
  });
});

describe('containsTable', () => {
  it('returns true for markdown table', () => {
    const table = '| Col A | Col B |\n|-------|-------|\n| val1  | val2  |';
    expect(containsTable(table)).toBe(true);
  });

  it('returns false for text without table', () => {
    expect(containsTable('just text')).toBe(false);
  });

  it('returns false for pipes without separator row', () => {
    expect(containsTable('| just | pipes |')).toBe(false);
  });
});

describe('containsMermaid', () => {
  it('returns true for mermaid block', () => {
    expect(containsMermaid('```mermaid\ngraph TD\n```')).toBe(true);
  });

  it('returns false for regular code blocks', () => {
    expect(containsMermaid('```js\ncode\n```')).toBe(false);
  });

  it('returns false for text without code blocks', () => {
    expect(containsMermaid('plain text')).toBe(false);
  });
});
