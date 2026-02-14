import { Lexer, Token } from 'marked';
import matter from 'gray-matter';
import { config } from '../../config/index.js';
import { generateChunkId, generateContentHash } from '../embedding/batch.js';
import type { GitLabFile, DocumentChunk, DocumentMetadata } from '../../types/index.js';
import { estimateTokens } from './strategies.js';

interface ParsedDocument {
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

function parseMarkdown(raw: string): ParsedDocument {
  const { data: frontmatter, content } = matter(raw);

  // Extract title from first h1 or frontmatter
  let title = (frontmatter.title as string) || '';
  if (!title) {
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      title = h1Match[1];
    }
  }

  return { title, content, frontmatter };
}

function extractCategory(path: string, frontmatter: Record<string, unknown>): string {
  // Check frontmatter first
  if (frontmatter.category) {
    return String(frontmatter.category);
  }

  // Infer from path
  const parts = path.split('/');
  if (parts.length > 1) {
    const dir = parts[0].toLowerCase();
    if (dir === 'adrs' || dir === 'adr') return 'adr';
    if (dir === 'api-specs' || dir === 'api') return 'api';
    if (dir === 'integrations') return 'integration';
    if (dir === 'security') return 'security';
    return dir;
  }

  return 'general';
}

function extractTags(frontmatter: Record<string, unknown>): string[] {
  if (Array.isArray(frontmatter.tags)) {
    return frontmatter.tags.map(String);
  }
  return [];
}

interface Section {
  headers: string[];
  content: string;
  level: number;
}

function tokenizeToSections(content: string): Section[] {
  const lexer = new Lexer();
  const tokens = lexer.lex(content);

  const sections: Section[] = [];
  let currentSection: Section = { headers: [], content: '', level: 0 };
  const headerStack: string[] = [];

  for (const token of tokens) {
    if (token.type === 'heading') {
      const heading = token as Token & { depth: number; text: string };

      // Save current section if it has content
      if (currentSection.content.trim()) {
        sections.push({ ...currentSection });
      }

      // Update header stack
      while (headerStack.length >= heading.depth) {
        headerStack.pop();
      }
      headerStack.push(heading.text);

      // Start new section
      currentSection = {
        headers: [...headerStack],
        content: '',
        level: heading.depth,
      };
    } else {
      // Accumulate content
      currentSection.content += token.raw || '';
    }
  }

  // Save final section
  if (currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections;
}

function mergeSmallSections(sections: Section[], minTokens: number): Section[] {
  const merged: Section[] = [];

  for (const section of sections) {
    const tokens = estimateTokens(section.content);

    if (merged.length === 0) {
      merged.push(section);
      continue;
    }

    const lastSection = merged[merged.length - 1];
    const lastTokens = estimateTokens(lastSection.content);

    // Merge if current section is too small
    if (tokens < minTokens && lastSection.level <= section.level) {
      lastSection.content += '\n\n' + section.content;
      // Keep the headers from the last section
    } else {
      merged.push(section);
    }
  }

  return merged;
}

function splitLargeSection(section: Section, maxTokens: number, overlapTokens: number): Section[] {
  const tokens = estimateTokens(section.content);
  if (tokens <= maxTokens) {
    return [section];
  }

  // Split at paragraph boundaries
  const paragraphs = section.content.split(/\n\n+/);
  const chunks: Section[] = [];
  let currentContent = '';
  let overlapContent = '';

  for (const paragraph of paragraphs) {
    const newContent = currentContent ? currentContent + '\n\n' + paragraph : paragraph;
    const newTokens = estimateTokens(newContent);

    if (newTokens > maxTokens && currentContent) {
      // Save current chunk
      chunks.push({
        ...section,
        content: currentContent,
      });

      // Calculate overlap from end of current content
      const words = currentContent.split(/\s+/);
      const overlapWords = Math.floor(overlapTokens * 0.75); // Rough word to token ratio
      overlapContent = words.slice(-overlapWords).join(' ');

      // Start new chunk with overlap
      currentContent = overlapContent + '\n\n' + paragraph;
    } else {
      currentContent = newContent;
    }
  }

  // Save final chunk
  if (currentContent.trim()) {
    chunks.push({
      ...section,
      content: currentContent,
    });
  }

  return chunks;
}

export function chunkMarkdown(file: GitLabFile): DocumentChunk[] {
  const { title, content, frontmatter } = parseMarkdown(file.content);

  const metadata: DocumentMetadata = {
    category: extractCategory(file.path, frontmatter),
    tags: extractTags(frontmatter),
    last_modified: file.last_modified,
    author: file.author,
  };

  // Tokenize into sections
  let sections = tokenizeToSections(content);

  // Merge small sections
  sections = mergeSmallSections(sections, config.chunking.minTokens);

  // Split large sections
  const finalSections: Section[] = [];
  for (const section of sections) {
    const split = splitLargeSection(
      section,
      config.chunking.maxTokens,
      config.chunking.overlapTokens
    );
    finalSections.push(...split);
  }

  // Convert to chunks
  const chunks: DocumentChunk[] = finalSections.map((section, index) => ({
    chunk_id: generateChunkId(file.path, index),
    document_path: file.path,
    document_title: title || file.path.split('/').pop()?.replace('.md', '') || file.path,
    section_headers: section.headers,
    content: section.content.trim(),
    metadata,
    full_content_hash: generateContentHash(section.content),
  }));

  return chunks;
}
