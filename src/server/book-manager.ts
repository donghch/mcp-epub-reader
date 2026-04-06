/**
 * Book Manager for session lifecycle management
 * 
 * This module provides functionality to open, close, retrieve, and list
 * EPUB book sessions. It handles session state, unique ID generation,
 * and resource cleanup.
 */

import { createHash, randomUUID } from 'crypto';
import { ParsedEpub, Chapter, ReadingPosition, BookMetadata, TOCEntry } from '../epub/types';
import { BookSession, SessionId } from './types';
import { parseEpub, FileNotFoundError, InvalidEpubError, EpubParseError } from '../epub/parser';
import { calculatePages } from '../epub/paginator';

/**
 * Custom errors thrown by the BookManager
 */
export class BookManagerError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly sessionId?: SessionId,
    public readonly filePath?: string
  ) {
    super(message);
    this.name = 'BookManagerError';
  }
}

export class SessionNotFoundError extends BookManagerError {
  constructor(sessionId: SessionId) {
    super(`Session not found: ${sessionId}`, undefined, sessionId);
    this.name = 'SessionNotFoundError';
  }
}

export class FileAccessError extends BookManagerError {
  constructor(filePath: string, cause?: Error) {
    super(`Cannot access file: ${filePath}`, cause, undefined, filePath);
    this.name = 'FileAccessError';
  }
}

/**
 * Options for BookManager (future extensibility)
 */
export interface BookManagerOptions {
  /** Words per page for pagination (default: 300) */
  wordsPerPage?: number;
  /** Maximum number of concurrent sessions (default: unlimited) */
  maxSessions?: number;
}

/**
 * Core Book Manager interface
 */
export interface BookManager {
  /** Open an EPUB file and create a new session */
  openBook(filePath: string): Promise<BookSession>;
  /** Close a session and release its resources */
  closeBook(sessionId: SessionId): boolean;
  /** Retrieve a session by its ID (updates lastAccessed) */
  getBook(sessionId: SessionId): BookSession | null;
  /** List all currently open sessions */
  listOpenBooks(): BookSession[];
  /** Update the lastAccessed timestamp of a session */
  updateLastAccessed(sessionId: SessionId): void;
  /** Retrieve paginated chapters for a session (internal use) */
  getPaginatedChapters(sessionId: SessionId): Chapter[] | null;
  /** Update the reading position of a session */
  updateSessionPosition(sessionId: SessionId, position: ReadingPosition): BookSession;
  /** Retrieve all sessions for a given book ID */
  getSessionsByBookId(bookId: string): BookSession[];
  /** Retrieve the most recently accessed session for a given book ID */
  getBookByBookId(bookId: string): BookSession | null;
  /** Generate a deterministic book ID from a file path */
  generateBookId(filePath: string): Promise<string>;
  /** Generate a unique session ID */
  generateSessionId(): string;
}

/**
 * Internal session storage with additional tracking
 */
interface InternalSession {
  session: BookSession;
  // Additional internal state could go here (e.g., paginated chapters)
  paginatedChapters?: Chapter[];
}

/**
 * Default implementation of BookManager
 */
export class BookManagerImpl implements BookManager {
  private sessions: Map<SessionId, InternalSession> = new Map();
  private wordsPerPage: number;

  constructor(options: BookManagerOptions = {}) {
    this.wordsPerPage = options.wordsPerPage ?? 300;
  }

  /**
   * Generate a deterministic book ID based on file content hash.
   * Uses SHA-256 of the file's absolute path and size as a fallback
   * when file reading is not desired. For true content-based IDs,
   * hash the file bytes (requires reading the entire file).
   */
  async generateBookId(filePath: string): Promise<string> {
    // Use absolute path for consistency
    const { resolve } = await import('path');
    const absPath = resolve(filePath);
    
    // Hash the absolute path (fast, deterministic, but not content-sensitive)
    // If the same path can contain different content, consider hashing the file content.
    const hash = createHash('sha256').update(absPath).digest('hex');
    return `book_${hash.substring(0, 16)}`;
  }

  /**
   * Generate a unique session ID using UUID v4
   */
  generateSessionId(): string {
    return randomUUID();
  }

  /**
   * Open an EPUB file, parse it, paginate, and create a new session.
   * Throws BookManagerError with appropriate subclass on failures.
   */
  async openBook(filePath: string): Promise<BookSession> {
    try {
      // 1. Parse EPUB
      const parsed: ParsedEpub = await parseEpub(filePath);
      
      // 2. Paginate chapters
      const paginatedChapters = calculatePages(parsed.chapters, this.wordsPerPage);
      
      // 3. Generate IDs
      const bookId = await this.generateBookId(filePath);
      const sessionId = this.generateSessionId();
      
      // 4. Determine total pages (sum of pages across paginated chapters)
      const totalPages = paginatedChapters.reduce((max, ch) => Math.max(max, ch.endPage || 0), 0);
      
      // 5. Create initial reading position (first page, zero progress)
      const firstChapterId = parsed.chapters[0]?.id;
      const initialPosition: ReadingPosition = {
        page: 1,
        chapterId: firstChapterId,
        progress: 0,
      };
      
      // 6. Build session object (immutable)
      const now = new Date();
      const session: BookSession = {
        sessionId,
        bookId,
        filePath,
        metadata: {
          ...parsed.metadata,
          totalPages,
        },
        toc: parsed.toc,
    footnotes: parsed.footnotes,
        currentPosition: initialPosition,
        bookmarks: [],
        createdAt: now,
        lastAccessed: now,
      };
      
      // 7. Store session internally
      this.sessions.set(sessionId, {
        session,
        paginatedChapters,
      });
      
      return session;
      
    } catch (error: any) {
      // Map known EPUB parser errors to BookManager errors
      if (error instanceof FileNotFoundError) {
        throw new FileAccessError(filePath, error);
      }
      if (error instanceof InvalidEpubError || error instanceof EpubParseError) {
        throw new BookManagerError(`Invalid EPUB file: ${filePath}`, error, undefined, filePath);
      }
      // Rethrow any other error wrapped as BookManagerError
      throw new BookManagerError(`Failed to open book: ${error.message}`, error, undefined, filePath);
    }
  }

  /**
   * Close a session, removing it from memory.
   * Returns true if a session was found and removed, false otherwise.
   */
  closeBook(sessionId: SessionId): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Retrieve a session by ID and update its lastAccessed timestamp.
   * Returns null if no session exists with the given ID.
   */
  getBook(sessionId: SessionId): BookSession | null {
    const internal = this.sessions.get(sessionId);
    if (!internal) {
      return null;
    }
    
    // Update lastAccessed timestamp (immutable update)
    const updatedSession: BookSession = {
      ...internal.session,
      lastAccessed: new Date(),
    };
    
    // Replace stored session with updated one
    this.sessions.set(sessionId, {
      ...internal,
      session: updatedSession,
    });
    
    return updatedSession;
  }

  /**
   * Update the lastAccessed timestamp of a session without returning it.
   * No-op if the session does not exist.
   */
  updateLastAccessed(sessionId: SessionId): void {
    const internal = this.sessions.get(sessionId);
    if (internal) {
      this.sessions.set(sessionId, {
        ...internal,
        session: {
          ...internal.session,
          lastAccessed: new Date(),
        },
      });
    }
  }

  /**
   * Retrieve all sessions for a given book ID.
   */
  getSessionsByBookId(bookId: string): BookSession[] {
    return Array.from(this.sessions.values())
      .filter(internal => internal.session.bookId === bookId)
      .map(internal => internal.session)
      .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime());
  }

  /**
   * Retrieve the most recently accessed session for a given book ID.
   * Returns null if no session exists for that book.
   */
  getBookByBookId(bookId: string): BookSession | null {
    const sessions = this.getSessionsByBookId(bookId);
    return sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Retrieve paginated chapters for a session.
   * Returns null if the session does not exist or paginated chapters are unavailable.
   */
  getPaginatedChapters(sessionId: SessionId): Chapter[] | null {
    const internal = this.sessions.get(sessionId);
    if (!internal) {
      return null;
    }
    return internal.paginatedChapters || null;
  }

  /**
   * Update the reading position of a session and refresh its lastAccessed timestamp.
   * Throws SessionNotFoundError if the session does not exist.
   */
  updateSessionPosition(sessionId: SessionId, position: ReadingPosition): BookSession {
    const internal = this.sessions.get(sessionId);
    if (!internal) {
      throw new SessionNotFoundError(sessionId);
    }

    const updatedSession: BookSession = {
      ...internal.session,
      currentPosition: position,
      lastAccessed: new Date(),
    };

    this.sessions.set(sessionId, {
      ...internal,
      session: updatedSession,
    });

    return updatedSession;
  }

  /**
   * List all open sessions, sorted by creation date (oldest first).
   */
  listOpenBooks(): BookSession[] {
    return Array.from(this.sessions.values())
      .map(internal => internal.session)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}

/**
 * Default singleton instance (optional convenience export)
 */
export const defaultBookManager = new BookManagerImpl();