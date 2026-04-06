/**
 * EPUB-specific types for the MCP EPUB Reader
 * 
 * These types represent the core domain entities for EPUB parsing and reading.
 */

/**
 * Book metadata extracted from an EPUB file
 */
export interface BookMetadata {
  /** Book title */
  readonly title: string;
  /** Author(s) of the book */
  readonly author?: string;
  /** Publisher information */
  readonly publisher?: string;
  /** ISBN identifier */
  readonly isbn?: string;
  /** Language code (e.g., 'en', 'fr') */
  readonly language?: string;
  /** Publication date (string format, e.g., YYYY-MM-DD) */
  readonly pubDate?: string;
  /** Description/summary of the book */
  readonly description?: string;
  /** Cover image ID (referenced in EPUB manifest) */
  readonly coverImageId?: string;
  /** Total number of pages in the book */
  readonly totalPages: number;
  /** Total number of chapters */
  readonly totalChapters: number;
}

/**
 * A chapter within an EPUB book
 */
export interface Chapter {
  /** Unique identifier for the chapter */
  readonly id: string;
  /** Chapter title */
  readonly title: string;
  /** Starting page number (1-indexed) */
  readonly startPage: number;
  /** Ending page number (inclusive) */
  readonly endPage: number;
  /** Approximate word count */
  readonly wordCount?: number;
  /** Chapter content (HTML or plain text) */
  readonly content?: string;
}

/**
 * Table of contents entry representing a navigational point
 */
export interface TOCEntry {
  /** Unique identifier for the TOC entry */
  readonly id: string;
  /** Display title */
  readonly title: string;
  /** Nesting level (1 = top-level) */
  readonly level: number;
  /** Reference to the content file */
  readonly href: string;
  /** Page number where this entry starts */
  readonly page?: number;
  /** Child entries for hierarchical TOCs */
  readonly children?: TOCEntry[];
}

/**
 * Footnote or endnote within a book
 */
export interface Footnote {
  /** Unique identifier for the footnote */
  readonly id: string;
  /** Footnote content (HTML or plain text) */
  readonly content: string;
  /** Page number where the footnote appears */
  readonly page: number;
  /** Chapter ID where the footnote is referenced */
  readonly sourceChapter?: string;
}

/**
 * Reading position within a book
 */
export interface ReadingPosition {
  /** Current page number (1-indexed) */
  readonly page: number;
  /** Current chapter ID */
  readonly chapterId?: string;
  /** Progress through the book (0 to 1) */
  readonly progress: number;
}

/**
 * User bookmark for saving a specific position
 */
export interface Bookmark {
  /** Unique identifier for the bookmark */
  readonly id: string;
  /** User-defined label */
  readonly label: string;
  /** Associated book ID */
  readonly bookId: string;
  /** Page number where the bookmark is placed */
  readonly page: number;
  /** Chapter ID at the bookmark location */
  readonly chapterId?: string;
  /** Optional note from the user */
  readonly note?: string;
  /** When the bookmark was created */
  readonly createdAt: Date;
}

/**
 * Search result within a book
 */
export interface SearchResult {
  /** Page number where the match occurs */
  readonly page: number;
  /** Chapter ID where the match occurs */
  readonly chapterId: string;
  /** Text snippet containing the match */
  readonly snippet: string;
  /** Additional context around the match */
  readonly context?: string;
}

/**
 * Parsed EPUB data containing extracted metadata, table of contents, chapters, and footnotes
 */
export interface ParsedEpub {
  /** Book metadata */
  readonly metadata: BookMetadata;
  /** Table of contents entries with hierarchy */
  readonly toc: TOCEntry[];
  /** Chapters with content */
  readonly chapters: Chapter[];
  /** Footnotes extracted from the content */
  readonly footnotes: Footnote[];
}