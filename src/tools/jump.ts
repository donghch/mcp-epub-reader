/**
 * ebook__jump_to_page and ebook__jump_to_chapter – Jump to specific page or chapter
 * 
 * These tools allow navigating directly to a target page number or chapter.
 * They validate that the page is within the book's total pages and that the
 * chapter exists (case‑insensitive matching). The reading position is updated
 * and the updated session is returned together with the chapter containing
 * the target page.
 */

import { BookManager } from '../server/book-manager';
import {
  JumpToPageInput,
  JumpToPageOutput,
  JumpToChapterInput,
  JumpToChapterOutput,
} from '../server/types';
import { Chapter, ReadingPosition } from '../epub/types';
import { SessionNotFoundError } from '../server/book-manager';
import { getPageContent } from '../epub/paginator';

/**
 * Find the chapter that contains a given page number.
 * 
 * @param chapters - Paginated chapters (must have startPage/endPage)
 * @param page - Page number (1‑indexed)
 * @returns The chapter containing that page, or undefined if none
 */
function findChapterByPage(chapters: Chapter[], page: number): Chapter | undefined {
  for (const chapter of chapters) {
    if (chapter.startPage <= page && chapter.endPage >= page) {
      return chapter;
    }
  }
  return undefined;
}

/**
 * Find a chapter by its ID, title, or numeric index (case‑insensitive).
 * 
 * Matching order:
 * 1. Exact case‑insensitive match on chapter.id
 * 2. Exact case‑insensitive match on chapter.title
 * 3. Numeric index (1‑based) within the chapters array
 * 
 * @param chapters - Paginated chapters
 * @param chapterId - Chapter identifier (ID, title, or numeric index)
 * @returns The matching chapter, or undefined if none
 */
function findChapterByIdOrTitleOrIndex(chapters: Chapter[], chapterId: string): Chapter | undefined {
  const lowerId = chapterId.toLowerCase();
  
  // 1. Match by ID
  const byId = chapters.find(ch => ch.id.toLowerCase() === lowerId);
  if (byId) return byId;
  
  // 2. Match by title
  const byTitle = chapters.find(ch => ch.title.toLowerCase() === lowerId);
  if (byTitle) return byTitle;
  
  // 3. Match by numeric index (1‑based)
  const index = parseInt(chapterId, 10);
  if (!isNaN(index) && index >= 1 && index <= chapters.length) {
    return chapters[index - 1];
  }
  
  return undefined;
}

/**
 * Handle the ebook__jump_to_page tool request.
 * 
 * @param input - Validated input containing sessionId and page number
 * @param bookManager - BookManager instance for session lifecycle
 * @returns JumpToPageOutput with updated session and optional chapter
 * @throws {SessionNotFoundError} If the session does not exist
 * @throws {Error} If the page is out of range or the book has no pages
 */
export async function handleJumpToPage(
  input: JumpToPageInput,
  bookManager: BookManager
): Promise<JumpToPageOutput> {
  const { sessionId, page } = input;

  // 1. Retrieve session (updates lastAccessed)
  const session = bookManager.getBook(sessionId);
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  // 2. Retrieve paginated chapters
  const paginatedChapters = bookManager.getPaginatedChapters(sessionId);
  if (!paginatedChapters) {
    throw new Error(`Session ${sessionId} does not have paginated chapters`);
  }

  // 3. Validate total pages
  const totalPages = session.metadata.totalPages;
  if (totalPages <= 0) {
    throw new Error('Book has no pages');
  }

  // 4. Ensure page is within valid range
  if (page < 1 || page > totalPages) {
    throw new Error(
      `Page ${page} is out of range. Valid pages: 1‑${totalPages}`
    );
  }

  // 5. Find chapter containing the target page
  const targetChapter = findChapterByPage(paginatedChapters, page);

  // 6. Retrieve page content (for internal validation; not returned)
  const pageContent = getPageContent(paginatedChapters, page);
  if (!pageContent) {
    // This should not happen if paginated chapters are consistent,
    // but we treat it as an error.
    throw new Error(`Page ${page} has no content`);
  }

  // 7. Compute progress
  const progress = page / totalPages;

  // 8. Create new reading position
  const newPosition: ReadingPosition = {
    page,
    chapterId: targetChapter?.id,
    progress,
  };

  // 9. Update session position (also updates lastAccessed)
  const updatedSession = bookManager.updateSessionPosition(sessionId, newPosition);

  // 10. Return output
  return {
    session: updatedSession,
    chapter: targetChapter,
  };
}

/**
 * Handle the ebook__jump_to_chapter tool request.
 * 
 * @param input - Validated input containing sessionId and chapterId
 * @param bookManager - BookManager instance for session lifecycle
 * @returns JumpToChapterOutput with updated session and chapter
 * @throws {SessionNotFoundError} If the session does not exist
 * @throws {Error} If the chapter does not exist or the book has no pages
 */
export async function handleJumpToChapter(
  input: JumpToChapterInput,
  bookManager: BookManager
): Promise<JumpToChapterOutput> {
  const { sessionId, chapterId } = input;

  // 1. Retrieve session (updates lastAccessed)
  const session = bookManager.getBook(sessionId);
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  // 2. Retrieve paginated chapters
  const paginatedChapters = bookManager.getPaginatedChapters(sessionId);
  if (!paginatedChapters) {
    throw new Error(`Session ${sessionId} does not have paginated chapters`);
  }

  // 3. Find chapter by ID, title, or numeric index (case‑insensitive)
  const targetChapter = findChapterByIdOrTitleOrIndex(paginatedChapters, chapterId);
  if (!targetChapter) {
    throw new Error(`Chapter "${chapterId}" not found in this book (tried ID, title, and numeric index)`);
  }

  // 4. Determine start page of the chapter (default to first page)
  const startPage = targetChapter.startPage;
  if (startPage < 1) {
    throw new Error(`Chapter "${chapterId}" has invalid start page`);
  }

  // 5. Validate total pages
  const totalPages = session.metadata.totalPages;
  if (totalPages <= 0) {
    throw new Error('Book has no pages');
  }

  // 6. Ensure start page is within range
  if (startPage > totalPages) {
    throw new Error(
      `Chapter start page ${startPage} exceeds total pages ${totalPages}`
    );
  }

  // 7. Retrieve page content for the start page (for internal validation)
  const pageContent = getPageContent(paginatedChapters, startPage);
  if (!pageContent) {
    throw new Error(`Chapter "${chapterId}" start page has no content`);
  }

  // 8. Compute progress
  const progress = startPage / totalPages;

  // 9. Create new reading position
  const newPosition: ReadingPosition = {
    page: startPage,
    chapterId: targetChapter.id,
    progress,
  };

  // 10. Update session position (also updates lastAccessed)
  const updatedSession = bookManager.updateSessionPosition(sessionId, newPosition);

  // 11. Return output
  return {
    session: updatedSession,
    chapter: targetChapter,
  };
}

/**
 * Factory function to create an MCP tool for ebook__jump_to_page with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createJumpToPageTool(bookManager: BookManager) {
  return {
    name: 'ebook__jump_to_page' as const,
    handler: (input: unknown) => handleJumpToPage(input as JumpToPageInput, bookManager),
  };
}

/**
 * Factory function to create an MCP tool for ebook__jump_to_chapter with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createJumpToChapterTool(bookManager: BookManager) {
  return {
    name: 'ebook__jump_to_chapter' as const,
    handler: (input: unknown) => handleJumpToChapter(input as JumpToChapterInput, bookManager),
  };
}