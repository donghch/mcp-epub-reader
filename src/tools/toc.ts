/**
 * ebook/get_toc – Get hierarchical table of contents for a book session
 * 
 * This tool returns the table of contents (TOC) of an open EPUB book session.
 * The TOC is returned as a hierarchical structure where each entry includes
 * title, chapter index, nesting level, and optional page number.
 * 
 * Future enhancement: support flat list mode via optional `flat` parameter.
 */

import { BookManager } from '../server/book-manager';
import { GetTocInput, GetTocOutput } from '../server/types';
import { SessionNotFoundError } from '../server/book-manager';
import { validateInput, GetTocInputSchema } from '../utils/validation';
import { TOCEntry } from '../epub/types';

/**
 * Handle the ebook/get_toc tool request.
 * 
 * @param input - Validated input containing sessionId
 * @param bookManager - BookManager instance for session lifecycle
 * @returns GetTocOutput with hierarchical table of contents
 * @throws {SessionNotFoundError} If the session does not exist
 * @throws {Error} If input validation fails
 */
export async function handleGetToc(
  input: GetTocInput,
  bookManager: BookManager
): Promise<GetTocOutput> {
  // Validate input (safety net; caller should have already validated)
  const validation = validateInput(GetTocInputSchema, input);
  if (!validation.success) {
    const { errors } = validation;
    throw new Error(`Invalid input: ${errors.join(', ')}`);
  }
  // validation is now narrowed to { success: true; data: GetTocInput }
  const { sessionId } = validation.data;

  // Retrieve session (updates lastAccessed)
  const session = bookManager.getBook(sessionId);
  if (!session) {
    throw new SessionNotFoundError(sessionId);
  }

  // Return the hierarchical TOC already stored in the session
  return {
    toc: session.toc,
  };
}

/**
 * Factory function to create an MCP tool for ebook/get_toc with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createGetTocTool(bookManager: BookManager) {
  return {
    name: 'ebook/get_toc' as const,
    handler: (input: unknown) => handleGetToc(input as GetTocInput, bookManager),
  };
}