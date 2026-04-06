/**
 * Unit tests for BookManager session lifecycle.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Opening a book successfully creates a session
 * - Closing a session removes it and cleans up resources
 * - Retrieving a session by ID updates lastAccessed
 * - Listing all open sessions returns correct data
 * - ID generation (deterministic bookId, unique sessionId)
 * - Error handling for file not found, invalid EPUB, session not found
 * - Concurrent access and memory safety
 */

import { BookManagerImpl, BookManagerError, FileAccessError, SessionNotFoundError } from '../../src/server/book-manager';
import { BookSession, SessionId } from '../../src/server/types';
import { parseEpub, FileNotFoundError, InvalidEpubError } from '../../src/epub/parser';
import { calculatePages } from '../../src/epub/paginator';
import { ParsedEpub, BookMetadata, Chapter, TOCEntry, ReadingPosition } from '../../src/epub/types';

// Mock the EPUB parser and paginator modules
jest.mock('../../src/epub/parser');
jest.mock('../../src/epub/paginator');

const mockParseEpub = parseEpub as jest.MockedFunction<typeof parseEpub>;
const mockCalculatePages = calculatePages as jest.MockedFunction<typeof calculatePages>;

// Helper to create a consistent mock parsed EPUB
function createMockParsedEpub(filePath: string): ParsedEpub {
  const metadata: BookMetadata = {
    title: 'Sample Book',
    author: 'Author Name',
    publisher: 'Test Publisher',
    isbn: '1234567890',
    language: 'en',
    totalPages: 5, // will be overridden by pagination
    totalChapters: 2,
  };
  
  const toc: TOCEntry[] = [
    { id: 'toc1', title: 'Chapter 1', level: 1, href: 'chap1.xhtml' },
    { id: 'toc2', title: 'Chapter 2', level: 1, href: 'chap2.xhtml' },
  ];
  
  const chapters: Chapter[] = [
    { id: 'chapter1', title: 'Chapter 1', startPage: 0, endPage: 0, content: '<p>Content of chapter 1</p>' },
    { id: 'chapter2', title: 'Chapter 2', startPage: 0, endPage: 0, content: '<p>Content of chapter 2</p>' },
  ];
  
  return { metadata, toc, chapters, footnotes: [] };
}

// Helper to create mock paginated chapters (simulating calculatePages output)
function createMockPaginatedChapters(chapters: Chapter[]) {
  return chapters.map((ch, idx) => ({
    ...ch,
    startPage: idx * 3 + 1,
    endPage: idx * 3 + 3,
    wordCount: 500,
    pages: ['<p>Page 1</p>', '<p>Page 2</p>', '<p>Page 3</p>'],
  }));
}

describe('BookManager', () => {
  let manager: BookManagerImpl;
  const mockFilePath = '/path/to/book.epub';
  
  beforeEach(() => {
    jest.clearAllMocks();
    manager = new BookManagerImpl();
    
    // Default mock implementations
    const parsed = createMockParsedEpub(mockFilePath);
    mockParseEpub.mockResolvedValue(parsed);
    mockCalculatePages.mockReturnValue(createMockPaginatedChapters(parsed.chapters));
  });
  
  describe('openBook', () => {
    it('creates a new session with correct metadata, TOC, and reading position', async () => {
      // Arrange
      const parsed = createMockParsedEpub(mockFilePath);
      const paginated = createMockPaginatedChapters(parsed.chapters);
      mockParseEpub.mockResolvedValue(parsed);
      mockCalculatePages.mockReturnValue(paginated);
      
      // Act
      const session = await manager.openBook(mockFilePath);
      
      // Assert
      expect(mockParseEpub).toHaveBeenCalledWith(mockFilePath);
      expect(mockCalculatePages).toHaveBeenCalledWith(parsed.chapters, 300); // default wordsPerPage
      
      expect(session.sessionId).toBeDefined();
      expect(session.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i); // UUID v4
      expect(session.bookId).toBeDefined();
      expect(session.bookId).toMatch(/^book_[0-9a-f]{16}$/);
      expect(session.filePath).toBe(mockFilePath);
      
      // Metadata matches parsed metadata, with totalPages updated by pagination
      expect(session.metadata.title).toBe('Sample Book');
      expect(session.metadata.author).toBe('Author Name');
      expect(session.metadata.totalPages).toBe(6); // last chapter endPage = 6
      expect(session.metadata.totalChapters).toBe(2);
      
      // TOC preserved
      expect(session.toc).toEqual(parsed.toc);
      
      // Initial reading position
      expect(session.currentPosition.page).toBe(1);
      expect(session.currentPosition.chapterId).toBe('chapter1');
      expect(session.currentPosition.progress).toBe(0);
      
      // Timestamps
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastAccessed).toBeInstanceOf(Date);
      expect(Math.abs(session.createdAt.getTime() - session.lastAccessed.getTime())).toBeLessThan(1000);
      
      // Bookmarks empty
      expect(session.bookmarks).toEqual([]);
    });
    
    it('generates the same bookId for the same file path', async () => {
      // Act
      const session1 = await manager.openBook(mockFilePath);
      const session2 = await manager.openBook(mockFilePath);
      
      // Assert
      expect(session1.bookId).toBe(session2.bookId);
      expect(session1.sessionId).not.toBe(session2.sessionId); // different session IDs
    });
    
    it('throws FileAccessError when file does not exist', async () => {
      // Arrange
      const fileNotFound = new FileNotFoundError(mockFilePath);
      mockParseEpub.mockRejectedValue(fileNotFound);
      
      // Act & Assert
      await expect(manager.openBook(mockFilePath)).rejects.toThrow(FileAccessError);
      await expect(manager.openBook(mockFilePath)).rejects.toThrow(/Cannot access file/);
    });
    
    it('throws BookManagerError when EPUB is invalid', async () => {
      // Arrange
      const invalidEpub = new InvalidEpubError(mockFilePath);
      mockParseEpub.mockRejectedValue(invalidEpub);
      
      // Act & Assert
      await expect(manager.openBook(mockFilePath)).rejects.toThrow(BookManagerError);
      await expect(manager.openBook(mockFilePath)).rejects.toThrow(/Invalid EPUB file/);
    });
    
    it('throws BookManagerError for any other parsing error', async () => {
      // Arrange
      mockParseEpub.mockRejectedValue(new Error('Unexpected error'));
      
      // Act & Assert
      await expect(manager.openBook(mockFilePath)).rejects.toThrow(BookManagerError);
      await expect(manager.openBook(mockFilePath)).rejects.toThrow(/Failed to open book/);
    });
    
    it('respects custom wordsPerPage option', async () => {
      // Arrange
      const customManager = new BookManagerImpl({ wordsPerPage: 500 });
      const parsed = createMockParsedEpub(mockFilePath);
      mockParseEpub.mockResolvedValue(parsed);
      
      // Act
      await customManager.openBook(mockFilePath);
      
      // Assert
      expect(mockCalculatePages).toHaveBeenCalledWith(parsed.chapters, 500);
    });
  });
  
  describe('closeBook', () => {
    it('removes an existing session and returns true', async () => {
      // Arrange
      const session = await manager.openBook(mockFilePath);
      
      // Act
      const result = manager.closeBook(session.sessionId);
      
      // Assert
      expect(result).toBe(true);
      expect(manager.getBook(session.sessionId)).toBeNull();
      expect(manager.listOpenBooks()).toHaveLength(0);
    });
    
    it('returns false when closing a non‑existent session', () => {
      // Act
      const result = manager.closeBook('non-existent-session-id');
      
      // Assert
      expect(result).toBe(false);
    });
    
    it('allows re‑opening the same file after closing', async () => {
      // Arrange
      const session1 = await manager.openBook(mockFilePath);
      manager.closeBook(session1.sessionId);
      
      // Act
      const session2 = await manager.openBook(mockFilePath);
      
      // Assert
      expect(session2.sessionId).not.toBe(session1.sessionId);
      expect(session2.bookId).toBe(session1.bookId);
      expect(manager.listOpenBooks()).toHaveLength(1);
    });
  });
  
  describe('getBook', () => {
    it('retrieves an existing session and updates lastAccessed', async () => {
      // Arrange
      const session = await manager.openBook(mockFilePath);
      const initialAccessed = session.lastAccessed;
      
      // Wait a millisecond to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 1));
      
      // Act
      const retrieved = manager.getBook(session.sessionId);
      
      // Assert
      expect(retrieved).not.toBeNull();
      expect(retrieved!.sessionId).toBe(session.sessionId);
      expect(retrieved!.lastAccessed).not.toBe(initialAccessed);
      expect(retrieved!.lastAccessed.getTime()).toBeGreaterThanOrEqual(initialAccessed.getTime());
    });
    
    it('returns null for non‑existent session', () => {
      // Act & Assert
      expect(manager.getBook('non-existent')).toBeNull();
    });
    
    it('does not update lastAccessed when session not found', () => {
      // Act (should not throw)
      expect(() => manager.getBook('non-existent')).not.toThrow();
    });
  });
  
  describe('updateLastAccessed', () => {
    it('updates lastAccessed timestamp of an existing session', async () => {
      // Arrange
      const session = await manager.openBook(mockFilePath);
      const initialAccessed = session.lastAccessed;
      
      // Wait a millisecond to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 1));
      
      // Act
      manager.updateLastAccessed(session.sessionId);
      
      // Assert
      const updated = manager.getBook(session.sessionId);
      expect(updated!.lastAccessed.getTime()).toBeGreaterThan(initialAccessed.getTime());
    });
    
    it('does nothing for non‑existent session', () => {
      // Act (should not throw)
      expect(() => manager.updateLastAccessed('non-existent')).not.toThrow();
    });
  });
  
  describe('listOpenBooks', () => {
    it('returns empty array when no sessions are open', () => {
      // Act & Assert
      expect(manager.listOpenBooks()).toEqual([]);
    });
    
    it('returns all open sessions sorted by creation date', async () => {
      // Arrange
      const session1 = await manager.openBook('/path/to/book1.epub');
      await new Promise(resolve => setTimeout(resolve, 1));
      const session2 = await manager.openBook('/path/to/book2.epub');
      
      // Act
      const list = manager.listOpenBooks();
      
      // Assert
      expect(list).toHaveLength(2);
      expect(list[0].sessionId).toBe(session1.sessionId);
      expect(list[1].sessionId).toBe(session2.sessionId);
      expect(list[0].createdAt.getTime()).toBeLessThan(list[1].createdAt.getTime());
    });
    
    it('does not include closed sessions', async () => {
      // Arrange
      const session1 = await manager.openBook('/path/to/book1.epub');
      const session2 = await manager.openBook('/path/to/book2.epub');
      manager.closeBook(session1.sessionId);
      
      // Act
      const list = manager.listOpenBooks();
      
      // Assert
      expect(list).toHaveLength(1);
      expect(list[0].sessionId).toBe(session2.sessionId);
    });
  });
  
  describe('ID generation', () => {
    describe('generateBookId', () => {
      it('produces deterministic IDs for the same file path', async () => {
        // Act
        const id1 = await manager.generateBookId(mockFilePath);
        const id2 = await manager.generateBookId(mockFilePath);
        
        // Assert
        expect(id1).toBe(id2);
        expect(id1).toMatch(/^book_[0-9a-f]{16}$/);
      });
      
      it('produces different IDs for different file paths', async () => {
        // Act
        const id1 = await manager.generateBookId('/path/to/book1.epub');
        const id2 = await manager.generateBookId('/path/to/book2.epub');
        
        // Assert
        expect(id1).not.toBe(id2);
      });
    });
    
    describe('generateSessionId', () => {
      it('generates unique IDs each call', () => {
        // Act
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) {
          ids.add(manager.generateSessionId());
        }
        
        // Assert
        expect(ids.size).toBe(100);
        // Should be UUID v4 format
        const sampleId = Array.from(ids)[0];
        expect(sampleId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      });
    });
  });
  
  describe('Memory and concurrency safety', () => {
    it('does not leak sessions after closing', async () => {
      // Arrange
      const session = await manager.openBook(mockFilePath);
      
      // Act
      manager.closeBook(session.sessionId);
      
      // Assert
      // No direct way to inspect internal map; verify via public API
      expect(manager.listOpenBooks()).toHaveLength(0);
      expect(manager.getBook(session.sessionId)).toBeNull();
    });
    
    it('handles concurrent open/close operations', async () => {
      // Act (open multiple sessions concurrently)
      const promises = Array.from({ length: 10 }, (_, i) =>
        manager.openBook(`/path/to/book${i}.epub`)
      );
      const sessions = await Promise.all(promises);
      
      // Assert all sessions are distinct and retrievable
      expect(new Set(sessions.map(s => s.sessionId)).size).toBe(10);
      sessions.forEach(session => {
        expect(manager.getBook(session.sessionId)).not.toBeNull();
      });
      
      // Close half of them
      const toClose = sessions.slice(0, 5);
      toClose.forEach(session => manager.closeBook(session.sessionId));
      
      expect(manager.listOpenBooks()).toHaveLength(5);
      
      // The remaining five should still be accessible
      sessions.slice(5).forEach(session => {
        expect(manager.getBook(session.sessionId)).not.toBeNull();
      });
    });

    describe('Book ID based retrieval', () => {
      it('getSessionsByBookId returns all sessions for a given book', async () => {
        const session1 = await manager.openBook(mockFilePath);
        const session2 = await manager.openBook(mockFilePath); // same book, different session
        const session3 = await manager.openBook('/path/to/other.epub');

        const sessions = manager.getSessionsByBookId(session1.bookId);
        expect(sessions).toHaveLength(2);
        expect(sessions.map(s => s.sessionId)).toContain(session1.sessionId);
        expect(sessions.map(s => s.sessionId)).toContain(session2.sessionId);
        expect(sessions).not.toContainEqual(expect.objectContaining({ sessionId: session3.sessionId }));
      });

      it('getSessionsByBookId returns empty array for unknown book ID', () => {
        expect(manager.getSessionsByBookId('unknown')).toEqual([]);
      });

      it('getBookByBookId returns the most recently accessed session', async () => {
        const session1 = await manager.openBook(mockFilePath);
        await new Promise(resolve => setTimeout(resolve, 1));
        const session2 = await manager.openBook(mockFilePath); // newer session

        // session2 is more recent (later lastAccessed)
        const recent = manager.getBookByBookId(session1.bookId);
        expect(recent!.sessionId).toBe(session2.sessionId);

        // Update lastAccessed of session1 via getBook
        manager.getBook(session1.sessionId);
        const afterUpdate = manager.getBookByBookId(session1.bookId);
        expect(afterUpdate!.sessionId).toBe(session1.sessionId); // now session1 is more recent
      });

      it('getBookByBookId returns null for unknown book ID', () => {
        expect(manager.getBookByBookId('unknown')).toBeNull();
      });
    });
  });
});