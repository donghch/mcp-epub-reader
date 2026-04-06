/**
 * ebook/get_position – Get current reading position details
 * 
 * This tool returns the current reading position within a book session,
 * including current chapter, page number, total pages, percentage through book,
 * chapter title, and position within chapter.
 */

import { BookManager } from '../server/book-manager';
import { GetPositionInput, GetPositionOutput } from '../server/types';
import { SessionNotFoundError } from '../server/book-manager';
import { Chapter } from '../epub/types';
import { validateInput, GetPositionInputSchema } from '../utils/validation';

/**
 * Handle the ebook/get_position tool request.
 * 
 * @param input - Validated input containing sessionId
 * @param bookManager - BookManager instance for session lifecycle
 * @returns GetPositionOutput with session, optional chapter, and progress
 * @throws {SessionNotFoundError} If the session does not exist
 * @throws {Error} If input validation fails
 */
export async function handleGetPosition(
  input: GetPositionInput,
  bookManager: BookManager
): Promise<GetPositionOutput> {
  // Validate input (safety net; caller should have already validated)
  const validation = validateInput(GetPositionInputSchema, input);
  if (!validation.success) {
    // validation is now narrowed to { success: false; errors: string[] }
    const { errors } = validation;
    throw new Error(`Invalid input: ${errors.join(', ')}`);
  }
  // validation is now narrowed to { success: true; data: GetPositionInput }
  const { sessionId } = validation.data;

  // Retrieve session (updates lastAccessed)
  const session = bookManager.getBook(sessionId);
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  // Retrieve paginated chapters for this session
  const chapters = bookManager.getPaginatedChapters(sessionId);
  
  // Find current chapter if chapterId is present
  let currentChapter: Chapter | undefined;
  if (session.currentPosition.chapterId && chapters) {
    currentChapter = chapters.find(ch => ch.id === session.currentPosition.chapterId);
  }

  // Calculate progress: current page / total pages
  // Ensure totalPages is positive to avoid division by zero
  const totalPages = session.metadata.totalPages;
  const progress = totalPages > 0 
    ? session.currentPosition.page / totalPages
    : 0;

  // Return output with session, optional chapter, and progress
  return {
    session,
    chapter: currentChapter,
    progress,
  };
}

/**
 * Factory function to create an MCP tool for ebook/get_position with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createGetPositionTool(bookManager: BookManager) {
  return {
    name: 'ebook/get_position' as const,
    handler: (input: unknown) => handleGetPosition(input as GetPositionInput, bookManager),
  };
}