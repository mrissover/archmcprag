/**
 * Estimate token count for text.
 * Uses a simple heuristic: ~4 characters per token for English text.
 * For more accurate counting, use tiktoken, but this is faster for chunking decisions.
 */
export function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters for English
  // This is conservative to avoid exceeding limits
  return Math.ceil(text.length / 4);
}

/**
 * Count words in text.
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Check if text contains a code block that shouldn't be split.
 */
export function containsCodeBlock(text: string): boolean {
  return /```[\s\S]*?```/.test(text);
}

/**
 * Check if text contains a table that shouldn't be split.
 */
export function containsTable(text: string): boolean {
  return /\|.+\|/.test(text) && /\|[-:]+\|/.test(text);
}

/**
 * Check if text contains a Mermaid diagram.
 */
export function containsMermaid(text: string): boolean {
  return /```mermaid[\s\S]*?```/.test(text);
}
