/**
 * ebook/close – Close an open book session and release its resources
 * 
 * This tool validates the session ID, removes the session from the book manager,
 * and releases any associated resources (parsed EPUB, paginated chapters, etc.).
 * Returns a confirmation that the session was closed.
 */

import { BookManager } from '../server/book-manager';
import { CloseBookInput, CloseBookOutput } from '../server/types';
import { SessionNotFoundError } from '../server/book-manager';

/**
 * Handle the ebook/close tool request.
 * 
 * @param input - Validated input containing sessionId
 * @param bookManager - BookManager instance for session lifecycle
 * @returns CloseBookOutput with closed flag and sessionId
 * @throws {SessionNotFoundError} If no session exists with the given sessionId
 */
export async function handleCloseBook(
  input: CloseBookInput,
  bookManager: BookManager
): Promise<CloseBookOutput> {
  // The caller has already validated input using CloseBookSchema.
  // We can safely assume sessionId is a non‑empty string.
  
  const wasClosed = bookManager.closeBook(input.sessionId);
  
  if (!wasClosed) {
    throw new SessionNotFoundError(input.sessionId);
  }
  
  return {
    closed: true,
    sessionId: input.sessionId,
  };
}

/**
 * Factory function to create an MCP tool for ebook/close with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createCloseTool(bookManager: BookManager) {
  return {
    name: 'ebook/close' as const,
    handler: (input: unknown) => handleCloseBook(input as CloseBookInput, bookManager),
  };
}