/**
 * ebook__get_metadata – Get book metadata
 * 
 * This tool retrieves the metadata for an open book session, including
 * title, author, publisher, language, publication date, description,
 * cover image ID, total pages, and total chapters.
 */

import { BookManager } from '../server/book-manager';
import { GetMetadataInput, GetMetadataOutput } from '../server/types';
import { SessionNotFoundError } from '../server/book-manager';

/**
 * Handle the ebook__get_metadata tool request.
 * 
 * @param input - Validated input containing sessionId
 * @param bookManager - BookManager instance for session lifecycle
 * @returns GetMetadataOutput (BookMetadata) with all available metadata fields
 * @throws {SessionNotFoundError} If no session exists with the given sessionId
 */
export async function handleGetMetadata(
  input: GetMetadataInput,
  bookManager: BookManager
): Promise<GetMetadataOutput> {
  // The caller has already validated input using GetMetadataSchema.
  // We can safely assume sessionId is a non‑empty string.
  
  const session = bookManager.getBook(input.sessionId);
  
  if (!session) {
    throw new SessionNotFoundError(input.sessionId);
  }
  
  // Return the session's metadata (already includes all fields)
  return session.metadata;
}

/**
 * Factory function to create an MCP tool for ebook__get_metadata with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createGetMetadataTool(bookManager: BookManager) {
  return {
    name: 'ebook__get_metadata' as const,
    handler: (input: unknown) => handleGetMetadata(input as GetMetadataInput, bookManager),
  };
}