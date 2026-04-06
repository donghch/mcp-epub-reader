/**
 * Unit tests for ebook/list_open_books tool.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Returns array of open book sessions with bookId and basic metadata
 * - Returns empty array when no books open
 * - Proper output format matching ListOpenBooksOutput type
 * - Dependency injection via createListOpenBooksTool factory
 */

import { handleListOpenBooks, createListOpenBooksTool } from '../../../src/tools/list-books';
import { BookManager } from '../../../src/server/book-manager';
import { ListOpenBooksInput, ListOpenBooksOutput, BookSession } from '../../../src/server/types';
import { BookMetadata } from '../../../src/epub/types';

describe('ebook/list_open_books tool', () => {
  let mockBookManager: jest.Mocked<BookManager>;
  
  // Helper to create a consistent mock book session
  function createMockSession(sessionId: string, bookId: string, title: string): BookSession {
    const metadata: BookMetadata = {
      title,
      author: 'Author Name',
      publisher: 'Test Publisher',
      isbn: '1234567890',
      language: 'en',
      totalPages: 100,
      totalChapters: 10,
    };
    
    return {
      sessionId,
      bookId,
      filePath: `/path/to/${title.toLowerCase().replace(/\s+/g, '-')}.epub`,
      metadata,
      toc: [
        { id: 'toc1', title: 'Chapter 1', level: 1, href: 'chap1.xhtml' },
        { id: 'toc2', title: 'Chapter 2', level: 1, href: 'chap2.xhtml' },
      ],
      currentPosition: { page: 1, chapterId: 'chapter1', progress: 0 },
      bookmarks: [],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      lastAccessed: new Date('2026-01-01T00:00:00Z'),
    };
  }
  
  beforeEach(() => {
    // Create a mocked BookManager with jest
    mockBookManager = {
      openBook: jest.fn(),
      closeBook: jest.fn(),
      getBook: jest.fn(),
      listOpenBooks: jest.fn(),
      updateLastAccessed: jest.fn(),
      getSessionsByBookId: jest.fn(),
      getBookByBookId: jest.fn(),
      generateBookId: jest.fn(),
      generateSessionId: jest.fn(),
    } as any;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('handleListOpenBooks', () => {
    it('returns array of open book sessions with bookId and basic metadata', async () => {
      // Arrange
      const input: ListOpenBooksInput = {};
      const mockSession1 = createMockSession('session-123', 'book-456', 'Sample Book One');
      const mockSession2 = createMockSession('session-789', 'book-abc', 'Sample Book Two');
      mockBookManager.listOpenBooks.mockReturnValue([mockSession1, mockSession2]);
      
      // Act
      const result: ListOpenBooksOutput = await handleListOpenBooks(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.listOpenBooks).toHaveBeenCalledTimes(1);
      expect(mockBookManager.listOpenBooks).toHaveBeenCalledWith();
      
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].sessionId).toBe('session-123');
      expect(result.sessions[0].bookId).toBe('book-456');
      expect(result.sessions[0].metadata.title).toBe('Sample Book One');
      expect(result.sessions[0].metadata.author).toBe('Author Name');
      expect(result.sessions[1].sessionId).toBe('session-789');
      expect(result.sessions[1].bookId).toBe('book-abc');
      expect(result.sessions[1].metadata.title).toBe('Sample Book Two');
    });
    
    it('returns empty array when no books open', async () => {
      // Arrange
      const input: ListOpenBooksInput = {};
      mockBookManager.listOpenBooks.mockReturnValue([]);
      
      // Act
      const result: ListOpenBooksOutput = await handleListOpenBooks(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.listOpenBooks).toHaveBeenCalledTimes(1);
      expect(result.sessions).toEqual([]);
    });
    
    it('returns sessions sorted by creation date (oldest first) as per BookManager implementation', async () => {
      // Arrange
      const input: ListOpenBooksInput = {};
      const olderSession = createMockSession('older', 'book1', 'Older Book');
      const newerSession = createMockSession('newer', 'book2', 'Newer Book');
      // Simulate sorting by createdAt (older first) in BookManager.listOpenBooks
      mockBookManager.listOpenBooks.mockReturnValue([olderSession, newerSession]);
      
      // Act
      const result = await handleListOpenBooks(input, mockBookManager);
      
      // Assert
      expect(result.sessions[0].sessionId).toBe('older');
      expect(result.sessions[1].sessionId).toBe('newer');
    });
  });
  
  describe('createListOpenBooksTool', () => {
    it('creates a tool object with correct name and handler', () => {
      // Arrange
      const tool = createListOpenBooksTool(mockBookManager);
      
      // Assert
      expect(tool.name).toBe('ebook/list_open_books');
      expect(typeof tool.handler).toBe('function');
    });
    
    it('tool handler calls handleListOpenBooks with typed input', async () => {
      // Arrange
      const tool = createListOpenBooksTool(mockBookManager);
      const input: ListOpenBooksInput = {};
      const mockSession = createMockSession('session-123', 'book-456', 'Sample Book');
      mockBookManager.listOpenBooks.mockReturnValue([mockSession]);
      
      // Act
      const result = await tool.handler(input);
      
      // Assert
      expect(mockBookManager.listOpenBooks).toHaveBeenCalledWith();
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].sessionId).toBe('session-123');
    });
    
    it('tool handler passes through errors', async () => {
      // Arrange
      const tool = createListOpenBooksTool(mockBookManager);
      const input: ListOpenBooksInput = {};
      const error = new Error('Unexpected internal error');
      mockBookManager.listOpenBooks.mockImplementation(() => {
        throw error;
      });
      
      // Act & Assert
      await expect(tool.handler(input)).rejects.toThrow('Unexpected internal error');
    });
  });
});