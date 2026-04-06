/**
 * ebook/navigate_next and ebook/navigate_previous – Navigate forward/backward through a book
 * 
 * These tools move the reading position by a specified number of pages (default: 1),
 * handling chapter boundaries and respecting book limits. They return the updated
 * session, new page number, and the chapter containing that page.
 */

import { BookManager } from '../server/book-manager';
import { 
  NavigateNextInput, 
  NavigateNextOutput, 
  NavigatePreviousInput, 
  NavigatePreviousOutput 
} from '../server/types';
import { Chapter, ReadingPosition } from '../epub/types';
import { SessionNotFoundError } from '../server/book-manager';
import { getPageContent } from '../epub/paginator';

/**
 * Common navigation logic for moving forward or backward.
 * 
 * @param input - Validated input containing sessionId and optional steps
 * @param bookManager - BookManager instance for session lifecycle
 * @param direction - 'next' for forward navigation, 'previous' for backward
 * @returns Navigation output with updated session, new page, and chapter
 * @throws {SessionNotFoundError} If the session does not exist
 * @throws {Error} If navigation would exceed book boundaries
 */
async function handleNavigate(
  input: NavigateNextInput | NavigatePreviousInput,
  bookManager: BookManager,
  direction: 'next' | 'previous'
): Promise<NavigateNextOutput | NavigatePreviousOutput> {
  const { sessionId, steps = 1 } = input;
  
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
  
  // 3. Determine total pages
  const totalPages = session.metadata.totalPages;
  if (totalPages <= 0) {
    throw new Error('Book has no pages');
  }
  
  // 4. Compute new page number
  const currentPage = session.currentPosition.page;
  const delta = direction === 'next' ? steps : -steps;
  const newPage = currentPage + delta;
  
  // 5. Validate boundaries
  if (newPage < 1 || newPage > totalPages) {
    throw new Error(
      `Cannot navigate ${direction} beyond book boundaries. ` +
      `Current page: ${currentPage}, requested steps: ${steps}, ` +
      `total pages: ${totalPages}`
    );
  }
  
  // 6. Find chapter containing the new page
  let targetChapter: Chapter | undefined;
  for (const chapter of paginatedChapters) {
    if (chapter.startPage <= newPage && chapter.endPage >= newPage) {
      targetChapter = chapter;
      break;
    }
  }
  
  if (!targetChapter) {
    // This should not happen if paginated chapters are consistent with total pages
    throw new Error(`Could not find chapter for page ${newPage}`);
  }
  
  // 7. Compute progress
  const progress = newPage / totalPages;
  
  // 8. Create new reading position
  const newPosition: ReadingPosition = {
    page: newPage,
    chapterId: targetChapter.id,
    progress,
  };
  
  // 9. Update session position (also updates lastAccessed)
  const updatedSession = bookManager.updateSessionPosition(sessionId, newPosition);
  
  // 10. Retrieve page content (for internal use; not part of output but we could include later)
  // const pageContent = getPageContent(paginatedChapters, newPage);
  
  // 11. Return output
  return {
    session: updatedSession,
    newPage,
    chapter: targetChapter,
  };
}

/**
 * Handle the ebook/navigate_next tool request.
 * 
 * @param input - Validated input containing sessionId and optional steps
 * @param bookManager - BookManager instance for session lifecycle
 * @returns NavigateNextOutput with updated session, new page, and chapter
 */
export async function handleNavigateNext(
  input: NavigateNextInput,
  bookManager: BookManager
): Promise<NavigateNextOutput> {
  return handleNavigate(input, bookManager, 'next') as Promise<NavigateNextOutput>;
}

/**
 * Handle the ebook/navigate_previous tool request.
 * 
 * @param input - Validated input containing sessionId and optional steps
 * @param bookManager - BookManager instance for session lifecycle
 * @returns NavigatePreviousOutput with updated session, new page, and chapter
 */
export async function handleNavigatePrevious(
  input: NavigatePreviousInput,
  bookManager: BookManager
): Promise<NavigatePreviousOutput> {
  return handleNavigate(input, bookManager, 'previous') as Promise<NavigatePreviousOutput>;
}

/**
 * Factory function to create an MCP tool for ebook/navigate_next with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createNavigateNextTool(bookManager: BookManager) {
  return {
    name: 'ebook/navigate_next' as const,
    handler: (input: unknown) => handleNavigateNext(input as NavigateNextInput, bookManager),
  };
}

/**
 * Factory function to create an MCP tool for ebook/navigate_previous with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createNavigatePreviousTool(bookManager: BookManager) {
  return {
    name: 'ebook/navigate_previous' as const,
    handler: (input: unknown) => handleNavigatePrevious(input as NavigatePreviousInput, bookManager),
  };
}