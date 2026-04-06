/**
 * ebook/get_footnote – Retrieve a footnote by its ID
 * 
 * This tool resolves a footnote reference by ID or marker and returns the footnote content.
 * It handles both inline and endnote style footnotes.
 */

import { BookManager } from '../server/book-manager';
import { GetFootnoteInput, GetFootnoteOutput } from '../server/types';
import { Footnote } from '../epub/types';
import { SessionNotFoundError } from '../server/book-manager';

/**
 * Error thrown when a requested footnote is not found in the session.
 */
export class FootnoteNotFoundError extends Error {
  constructor(
    public readonly footnoteId: string,
    public readonly sessionId: string,
  ) {
    super(`Footnote not found: ${footnoteId} in session ${sessionId}`);
    this.name = 'FootnoteNotFoundError';
  }
}

/**
 * Handle the ebook/get_footnote tool request.
 * 
 * @param input - Validated input containing sessionId and footnoteId
 * @param bookManager - BookManager instance for session lifecycle
 * @returns GetFootnoteOutput (Footnote) with footnote content
 * @throws {SessionNotFoundError} If the session does not exist
 * @throws {FootnoteNotFoundError} If the footnote ID is not found in the session
 */
export async function handleGetFootnote(
  input: GetFootnoteInput,
  bookManager: BookManager
): Promise<GetFootnoteOutput> {
  // The caller has already validated input using GetFootnoteSchema.
  // We can safely assume sessionId and footnoteId are non‑empty strings.
  
  const session = bookManager.getBook(input.sessionId);
  if (!session) {
    throw new SessionNotFoundError(input.sessionId);
  }

  // Footnotes are stored as an optional array on the session.
  // If footnotes are missing (should not happen for a properly opened book), treat as empty.
  const footnotes = session.footnotes ?? [];
  
  const footnote = footnotes.find(fn => fn.id === input.footnoteId);
  if (!footnote) {
    throw new FootnoteNotFoundError(input.footnoteId, input.sessionId);
  }

  return footnote;
}

/**
 * Factory function to create an MCP tool for ebook/get_footnote with dependency injection.
 * 
 * @param bookManager - BookManager instance to be used by the tool
 * @returns Tool object with name and handler suitable for MCP server registration
 */
export function createFootnoteTool(bookManager: BookManager) {
  return {
    name: 'ebook/get_footnote' as const,
    handler: (input: unknown) => handleGetFootnote(input as GetFootnoteInput, bookManager),
  };
}