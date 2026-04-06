/**
 * ebook/search – Search within the book's content
 * 
 * This tool performs full-text search across all chapters of an open book.
 * It strips HTML tags from chapter content, searches case‑insensitively by default,
 * and returns matches with surrounding context and page numbers.
 */

import { BookManager } from '../server/book-manager';
import { SessionNotFoundError } from '../server/book-manager';
import { SearchInput, SearchOutput } from '../server/types';
import { Chapter } from '../epub/types';
import { stripHtmlTags } from '../epub/paginator';
import { sanitizeSearchQuery } from '../utils/validation';

/**
 * Options for text search within a page.
 */
interface SearchOptions {
  caseSensitive: boolean;
  limit: number;
  contextWindow: number; // characters before/after match
}

/**
 * Default search options.
 */
const DEFAULT_OPTIONS: SearchOptions = {
  caseSensitive: false,
  limit: 20,
  contextWindow: 50,
};

/**
 * Extract the `pages` array from a paginated chapter.
 * This property is added by `calculatePages` but not reflected in the Chapter type.
 */
function getChapterPages(chapter: Chapter): string[] {
  return (chapter as any).pages ?? [];
}

/**
 * Perform a simple text search within a single page's stripped content.
 * Returns an array of matches with their character offsets.
 */
function findMatchesInText(
  text: string,
  query: string,
  caseSensitive: boolean
): Array<{ index: number; length: number }> {
  const matches: Array<{ index: number; length: number }> = [];
  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  let startIndex = 0;

  while (startIndex < searchText.length) {
    const index = searchText.indexOf(searchQuery, startIndex);
    if (index === -1) break;
    matches.push({ index, length: searchQuery.length });
    startIndex = index + 1; // allow overlapping matches? move forward by 1.
  }
  return matches;
}

/**
 * Build a snippet with surrounding context.
 * Strips HTML tags from both snippet and context for safe output.
 */
function buildSnippet(
  text: string,
  matchIndex: number,
  matchLength: number,
  contextWindow: number
): { snippet: string; context?: string } {
  const start = Math.max(0, matchIndex - contextWindow);
  const end = Math.min(text.length, matchIndex + matchLength + contextWindow);
  const rawSnippet = text.substring(matchIndex, matchIndex + matchLength);
  const rawContext = text.substring(start, end);

  // Strip HTML tags from output for security
  const snippet = stripHtmlTags(rawSnippet);
  const context = stripHtmlTags(rawContext);

  return { snippet, context };
}

/**
 * Handle the ebook/search tool request.
 * 
 * @param input - Validated input containing sessionId, query, caseSensitive, limit
 * @param bookManager - BookManager instance for session lifecycle
 * @returns SearchOutput with results and totalMatches
 * @throws {SessionNotFoundError} If the session does not exist
 */
export async function handleSearch(
  input: SearchInput,
  bookManager: BookManager
): Promise<SearchOutput> {
  // 1. Retrieve the session and its paginated chapters
  const session = bookManager.getBook(input.sessionId);
  if (!session) {
    throw new SessionNotFoundError(input.sessionId);
  }

  const paginatedChapters = bookManager.getPaginatedChapters(input.sessionId);
  if (!paginatedChapters) {
    // This should not happen if the session exists, but handle gracefully
    return { results: [], totalMatches: 0 };
  }

  // 2. Determine search options
  const opts: SearchOptions = {
    caseSensitive: input.caseSensitive ?? DEFAULT_OPTIONS.caseSensitive,
    limit: input.limit ?? DEFAULT_OPTIONS.limit,
    contextWindow: input.contextWindow ?? DEFAULT_OPTIONS.contextWindow,
  };

  // 3. Sanitize the search query to prevent injection attacks
  const sanitizedQuery = sanitizeSearchQuery(input.query);

  const results: SearchOutput['results'] = [];
  let totalMatches = 0;

  // 4. Iterate over each chapter and each page
  for (const chapter of paginatedChapters) {
    const pages = getChapterPages(chapter);
    if (pages.length === 0) continue;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
      const pageHtml = pages[pageIdx];
      const pageNumber = chapter.startPage + pageIdx;

      // Strip HTML tags for searching
      const plainText = stripHtmlTags(pageHtml);

      // Find all matches in this page using sanitized query
      const matches = findMatchesInText(plainText, sanitizedQuery, opts.caseSensitive);

      for (const match of matches) {
        totalMatches++;
        if (results.length < opts.limit) {
          const { snippet, context } = buildSnippet(
            plainText,
            match.index,
            match.length,
            opts.contextWindow
          );

          results.push({
            page: pageNumber,
            chapterId: chapter.id,
            snippet,
            context,
          });
        }
      }
    }
  }

  return { results, totalMatches };
}

/**
 * Factory function to create an MCP tool for ebook/search with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createSearchTool(bookManager: BookManager) {
  return {
    name: 'ebook/search' as const,
    handler: (input: unknown) => handleSearch(input as SearchInput, bookManager),
  };
}