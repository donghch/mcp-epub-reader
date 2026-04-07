/**
 * ebook__open – Open an EPUB file and create a reading session
 * 
 * This tool validates the file path, parses the EPUB, paginates its content,
 * and creates a new session with metadata, table of contents, and initial
 * reading position. Returns a session ID that can be used with other tools.
 */

import { BookManager } from '../server/book-manager';
import { OpenBookInput, OpenBookOutput } from '../server/types';
import { BookManagerError, FileAccessError } from '../server/book-manager';

/**
 * Handle the ebook__open tool request.
 * 
 * @param input - Validated input containing filePath (and optional autoNavigate)
 * @param bookManager - BookManager instance for session lifecycle
 * @returns OpenBookOutput with session ID, metadata, total pages, and total chapters
 * @throws {BookManagerError} If the file cannot be accessed or is not a valid EPUB
 */
export async function handleOpenBook(
  input: OpenBookInput,
  bookManager: BookManager
): Promise<OpenBookOutput> {
  // The caller has already validated input using OpenBookSchema.
  // We can safely assume filePath is a non‑empty string.
  
  const session = await bookManager.openBook(input.filePath);
  
  // The metadata already contains totalPages and totalChapters,
  // but the OpenBookOutput type requires them as separate fields as well.
  return {
    sessionId: session.sessionId,
    metadata: session.metadata,
    totalPages: session.metadata.totalPages,
    totalChapters: session.metadata.totalChapters,
  };
}

/**
 * Factory function to create an MCP tool for ebook__open with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createOpenTool(bookManager: BookManager) {
  return {
    name: 'ebook__open' as const,
    handler: (input: unknown) => handleOpenBook(input as OpenBookInput, bookManager),
  };
}