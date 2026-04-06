/**
 * Server-related types for the MCP EPUB Reader
 * 
 * These types define the data structures for book sessions and tool input/output
 * interfaces used by the MCP server.
 */

import {
  BookMetadata,
  Chapter,
  TOCEntry,
  Footnote,
  ReadingPosition,
  Bookmark,
  SearchResult,
} from '../epub/types';

/**
 * Unique identifier for a book session
 */
export type SessionId = string;

/**
 * Represents an open book session with reading state
 */
export interface BookSession {
  /** Unique session identifier */
  readonly sessionId: SessionId;
  /** Unique book identifier (e.g., derived from file hash) */
  readonly bookId: string;
  /** Path to the EPUB file on disk */
  readonly filePath: string;
  /** Book metadata */
  readonly metadata: BookMetadata;
  /** Table of contents */
  readonly toc: TOCEntry[];
  /** Current reading position */
  readonly currentPosition: ReadingPosition;
  /** User bookmarks for this session */
  readonly bookmarks?: Bookmark[];
  /** Footnotes extracted from the book */
  readonly footnotes?: Footnote[];
  /** When the session was created */
  readonly createdAt: Date;
  /** Last time the session was accessed */
  readonly lastAccessed: Date;
}

// ============================================================================
// Tool Input/Output Types
// ============================================================================

/**
 * 1. ebook/open – Open an EPUB file
 */
export type OpenBookInput = {
  filePath: string;
  autoNavigate?: boolean;
};

export type OpenBookOutput = {
  sessionId: SessionId;
  metadata: BookMetadata;
  totalPages: number;
  totalChapters: number;
};

/**
 * 2. ebook/close – Close an open book session
 */
export type CloseBookInput = {
  sessionId: SessionId;
};

export type CloseBookOutput = {
  closed: boolean;
  sessionId: SessionId;
};

/**
 * 3. ebook/list_open_books – List currently open books
 */
export type ListOpenBooksInput = Record<string, never>; // No input parameters

export type ListOpenBooksOutput = {
  sessions: BookSession[];
};

/**
 * 4. ebook/navigate_next – Go to next page
 */
export type NavigateNextInput = {
  sessionId: SessionId;
  steps?: number; // Number of pages to advance (default: 1)
};

export type NavigateNextOutput = {
  session: BookSession;
  newPage: number;
  chapter?: Chapter;
};

/**
 * 5. ebook/navigate_previous – Go to previous page
 */
export type NavigatePreviousInput = NavigateNextInput; // Same structure

export type NavigatePreviousOutput = NavigateNextOutput; // Same structure

/**
 * 6. ebook/jump_to_page – Jump to specific page number
 */
export type JumpToPageInput = {
  sessionId: SessionId;
  page: number; // Page number (1-indexed)
};

export type JumpToPageOutput = {
  session: BookSession;
  chapter?: Chapter;
};

/**
 * 7. ebook/jump_to_chapter – Jump to specific chapter
 */
export type JumpToChapterInput = {
  sessionId: SessionId;
  chapterId: string;
};

export type JumpToChapterOutput = {
  session: BookSession;
  chapter: Chapter;
};

/**
 * 8. ebook/get_position – Get current reading position
 */
export type GetPositionInput = {
  sessionId: SessionId;
};

export type GetPositionOutput = {
  session: BookSession;
  chapter?: Chapter;
  progress: number; // 0 to 1
};

/**
 * 9. ebook/search – Search within the book
 */
export type SearchInput = {
  sessionId: SessionId;
  query: string;
  caseSensitive?: boolean;
  limit?: number; // Maximum number of results (default: 20)
  contextWindow?: number; // Characters before/after match for context (default: 50)
};

export type SearchOutput = {
  results: SearchResult[];
  totalMatches: number;
};

/**
 * 10. ebook/get_toc – Get table of contents
 */
export type GetTocInput = {
  sessionId: SessionId;
};

export type GetTocOutput = {
  toc: TOCEntry[];
};

/**
 * 11. ebook/get_metadata – Get book metadata
 */
export type GetMetadataInput = {
  sessionId: SessionId;
};

export type GetMetadataOutput = BookMetadata;

/**
 * 12. ebook/get_footnote – Get footnote by ID
 */
export type GetFootnoteInput = {
  sessionId: SessionId;
  footnoteId: string;
};

export type GetFootnoteOutput = Footnote;

/**
 * 13. ebook/get_chapter_summary – Get summary of a chapter
 */
export type GetChapterSummaryInput = {
  sessionId: SessionId;
  chapterId: string;
  /** Maximum number of sentences to include in summary (default: 10) */
  maxSentences?: number;
};

export type GetChapterSummaryOutput = {
  chapterId: string;
  chapterTitle: string;
  wordCount: number;
  summary: string;
  keyPoints?: string[];
};

/**
 * Union type of all tool inputs for type‑safe routing
 */
export type ToolInput =
  | { tool: 'ebook/open'; input: OpenBookInput }
  | { tool: 'ebook/close'; input: CloseBookInput }
  | { tool: 'ebook/list_open_books'; input: ListOpenBooksInput }
  | { tool: 'ebook/navigate_next'; input: NavigateNextInput }
  | { tool: 'ebook/navigate_previous'; input: NavigatePreviousInput }
  | { tool: 'ebook/jump_to_page'; input: JumpToPageInput }
  | { tool: 'ebook/jump_to_chapter'; input: JumpToChapterInput }
  | { tool: 'ebook/get_position'; input: GetPositionInput }
  | { tool: 'ebook/search'; input: SearchInput }
  | { tool: 'ebook/get_toc'; input: GetTocInput }
  | { tool: 'ebook/get_metadata'; input: GetMetadataInput }
  | { tool: 'ebook/get_footnote'; input: GetFootnoteInput }
  | { tool: 'ebook/get_chapter_summary'; input: GetChapterSummaryInput };

/**
 * Union type of all tool outputs for type‑safe routing
 */
export type ToolOutput =
  | { tool: 'ebook/open'; output: OpenBookOutput }
  | { tool: 'ebook/close'; output: CloseBookOutput }
  | { tool: 'ebook/list_open_books'; output: ListOpenBooksOutput }
  | { tool: 'ebook/navigate_next'; output: NavigateNextOutput }
  | { tool: 'ebook/navigate_previous'; output: NavigatePreviousOutput }
  | { tool: 'ebook/jump_to_page'; output: JumpToPageOutput }
  | { tool: 'ebook/jump_to_chapter'; output: JumpToChapterOutput }
  | { tool: 'ebook/get_position'; output: GetPositionOutput }
  | { tool: 'ebook/search'; output: SearchOutput }
  | { tool: 'ebook/get_toc'; output: GetTocOutput }
  | { tool: 'ebook/get_metadata'; output: GetMetadataOutput }
  | { tool: 'ebook/get_footnote'; output: GetFootnoteOutput }
  | { tool: 'ebook/get_chapter_summary'; output: GetChapterSummaryOutput };