/**
 * ebook__list_open_books – List currently open book sessions
 * 
 * This tool returns an array of all active book sessions with their session IDs,
 * book IDs, metadata, and reading positions. Returns an empty array when no books
 * are open. No input parameters are required.
 */

import { BookManager } from '../server/book-manager';
import { ListOpenBooksInput, ListOpenBooksOutput } from '../server/types';

/**
 * Handle the ebook__list_open_books tool request.
 * 
 * @param input - Validated input (empty object)
 * @param bookManager - BookManager instance for session lifecycle
 * @returns ListOpenBooksOutput with array of open book sessions
 */
export async function handleListOpenBooks(
  input: ListOpenBooksInput,
  bookManager: BookManager
): Promise<ListOpenBooksOutput> {
  // The caller has already validated input using ListOpenBooksSchema.
  // Input is an empty object; we ignore it.
  
  const sessions = bookManager.listOpenBooks();
  
  return {
    sessions,
  };
}

/**
 * Factory function to create an MCP tool for ebook__list_open_books with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createListOpenBooksTool(bookManager: BookManager) {
  return {
    name: 'ebook__list_open_books' as const,
    handler: (input: unknown) => handleListOpenBooks(input as ListOpenBooksInput, bookManager),
  };
}