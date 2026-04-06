/**
 * ebook/get_chapter_summary – Generate a summary of a chapter
 * 
 * This tool extracts key sentences from a chapter's content, providing a concise
 * summary. It strips HTML tags, splits the text into paragraphs, and selects
 * the first sentence of each paragraph (or first/last for longer paragraphs).
 * The summary length is configurable via `maxSentences`.
 */

import { BookManager } from '../server/book-manager';
import { SessionNotFoundError } from '../server/book-manager';
import { GetChapterSummaryInput, GetChapterSummaryOutput } from '../server/types';
import { stripHtmlTags, splitIntoParagraphs, countWords } from '../epub/paginator';

/**
 * Default maximum number of sentences to include in the summary.
 */
const DEFAULT_MAX_SENTENCES = 10;

/**
 * Simple sentence boundary detection.
 * Splits text on periods, exclamation marks, or question marks followed by whitespace.
 * This is a basic implementation and may not handle all edge cases (abbreviations, etc.).
 */
function splitIntoSentences(text: string): string[] {
  // Regex: split on . ! ? followed by whitespace or end of string
  // Keep the delimiters attached to previous sentence (we'll trim later)
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Extract the first sentence from a paragraph.
 * If the paragraph contains only one sentence, returns that sentence.
 * If the paragraph contains multiple sentences, returns the first sentence.
 * Optionally also include the last sentence for longer paragraphs (if paragraph has >2 sentences).
 */
function extractKeySentences(paragraphText: string, includeLast: boolean = false): string[] {
  const sentences = splitIntoSentences(paragraphText);
  if (sentences.length === 0) {
    return [];
  }
  const key: string[] = [sentences[0]];
  if (includeLast && sentences.length > 2) {
    // Include last sentence only if paragraph has at least three sentences
    key.push(sentences[sentences.length - 1]);
  }
  return key;
}

/**
 * Generate a summary from raw HTML content.
 * 
 * @param rawHtml - Chapter HTML content with paragraph tags
 * @param maxSentences - Maximum number of sentences to include (default 10)
 * @returns Object containing summary string and key points array
 */
function generateSummary(rawHtml: string, maxSentences: number = DEFAULT_MAX_SENTENCES): { summary: string; keyPoints: string[] } {
  const paragraphs = splitIntoParagraphs(rawHtml);
  const extractedSentences: string[] = [];
  
  // First pass: collect first sentence of each paragraph
  for (const paragraphHtml of paragraphs) {
    const paragraphText = stripHtmlTags(paragraphHtml);
    if (!paragraphText.trim()) continue;
    
    const sentences = splitIntoSentences(paragraphText);
    if (sentences.length === 0) continue;
    
    extractedSentences.push(sentences[0]);
    if (extractedSentences.length >= maxSentences) {
      extractedSentences.length = maxSentences;
      break;
    }
  }
  
  // If we still have capacity, collect last sentences from paragraphs with >2 sentences
  if (extractedSentences.length < maxSentences) {
    for (const paragraphHtml of paragraphs) {
      const paragraphText = stripHtmlTags(paragraphHtml);
      if (!paragraphText.trim()) continue;
      
      const sentences = splitIntoSentences(paragraphText);
      // Only consider paragraphs with at least three sentences
      if (sentences.length < 3) continue;
      
      const lastSentence = sentences[sentences.length - 1];
      // Ensure we don't duplicate the first sentence (if first == last, but unlikely)
      if (extractedSentences.includes(lastSentence)) continue;
      
      extractedSentences.push(lastSentence);
      if (extractedSentences.length >= maxSentences) {
        extractedSentences.length = maxSentences;
        break;
      }
    }
  }
  
  const summary = extractedSentences.join(' ');
  const keyPoints = extractedSentences.slice(0, maxSentences);
  
  return { summary, keyPoints };
}

/**
 * Handle the ebook/get_chapter_summary tool request.
 * 
 * @param input - Validated input containing sessionId, chapterId, and optional maxSentences
 * @param bookManager - BookManager instance for session lifecycle
 * @returns GetChapterSummaryOutput with chapter title, word count, summary, and optional key points
 * @throws {SessionNotFoundError} If the session does not exist
 */
export async function handleGetChapterSummary(
  input: GetChapterSummaryInput,
  bookManager: BookManager
): Promise<GetChapterSummaryOutput> {
  // 1. Retrieve the session and its paginated chapters
  const session = bookManager.getBook(input.sessionId);
  if (!session) {
    throw new SessionNotFoundError(input.sessionId);
  }
  
  const paginatedChapters = bookManager.getPaginatedChapters(input.sessionId);
  if (!paginatedChapters) {
    // This should not happen if the session exists, but handle gracefully
    return {
      chapterId: input.chapterId,
      chapterTitle: '',
      wordCount: 0,
      summary: '',
      keyPoints: undefined,
    };
  }
  
  // 2. Find the target chapter
  const targetChapter = paginatedChapters.find(ch => ch.id === input.chapterId);
  if (!targetChapter) {
    // Chapter not found
    return {
      chapterId: input.chapterId,
      chapterTitle: '',
      wordCount: 0,
      summary: '',
      keyPoints: undefined,
    };
  }
  
  // 3. Extract chapter content (HTML) and strip tags
  const rawContent = targetChapter.content || '';
  const plainText = stripHtmlTags(rawContent);
  const wordCount = countWords(plainText);
  
  // 4. Determine max sentences (default if not provided)
  const maxSentences = input.maxSentences ?? DEFAULT_MAX_SENTENCES;
  
  // 5. Generate summary and key points
  const { summary, keyPoints } = generateSummary(rawContent, maxSentences);
  
  // 6. Return the result
  return {
    chapterId: targetChapter.id,
    chapterTitle: targetChapter.title,
    wordCount,
    summary,
    keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
  };
}

/**
 * Factory function to create an MCP tool for ebook/get_chapter_summary with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createGetChapterSummaryTool(bookManager: BookManager) {
  return {
    name: 'ebook/get_chapter_summary' as const,
    handler: (input: unknown) => handleGetChapterSummary(input as GetChapterSummaryInput, bookManager),
  };
}