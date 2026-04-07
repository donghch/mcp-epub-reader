/**
 * Unit tests for ebook__open tool.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful book opening with valid file path
 * - Proper mapping of session data to output (sessionId, metadata, totalPages, totalChapters)
 * - Error handling for file not found, corrupt EPUB, and validation errors
 * - Dependency injection via createOpenTool factory
 */

import { handleOpenBook, createOpenTool } from '../../../src/tools/open';
import { BookManager } from '../../../src/server/book-manager';
import { OpenBookInput, OpenBookOutput } from '../../../src/server/types';
import { BookManagerError, FileAccessError } from '../../../src/server/book-manager';
import { BookSession } from '../../../src/server/types';
import { BookMetadata } from '../../../src/epub/types';

describe('ebook__open tool', () => {
  let mockBookManager: jest.Mocked<BookManager>;
  const mockFilePath = '/path/to/book.epub';
  
  // Helper to create a consistent mock book session
  function createMockSession(sessionId: string, bookId: string): BookSession {
    const metadata: BookMetadata = {
      title: 'Sample Book',
      author: 'Author Name',
      publisher: 'Test Publisher',
      isbn: '1234567890',
      language: 'en',
      totalPages: 42,
      totalChapters: 7,
    };
    
    return {
      sessionId,
      bookId,
      filePath: mockFilePath,
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
  
  describe('handleOpenBook', () => {
    it('successfully opens a book and returns correct output', async () => {
      // Arrange
      const input: OpenBookInput = { filePath: mockFilePath };
      const mockSession = createMockSession('session-123', 'book-456');
      mockBookManager.openBook.mockResolvedValue(mockSession);
      
      // Act
      const result: OpenBookOutput = await handleOpenBook(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.openBook).toHaveBeenCalledTimes(1);
      expect(mockBookManager.openBook).toHaveBeenCalledWith(mockFilePath);
      
      expect(result.sessionId).toBe('session-123');
      expect(result.metadata.title).toBe('Sample Book');
      expect(result.metadata.author).toBe('Author Name');
      expect(result.metadata.totalPages).toBe(42);
      expect(result.metadata.totalChapters).toBe(7);
      
      // Separate totalPages and totalChapters must match metadata
      expect(result.totalPages).toBe(42);
      expect(result.totalChapters).toBe(7);
    });
    
    it('forwards file‑not‑found errors from BookManager', async () => {
      // Arrange
      const input: OpenBookInput = { filePath: '/nonexistent.epub' };
      const error = new FileAccessError('/nonexistent.epub', new Error('File not found'));
      mockBookManager.openBook.mockRejectedValue(error);
      
      // Act & Assert
      await expect(handleOpenBook(input, mockBookManager))
        .rejects.toThrow(FileAccessError);
      
      expect(mockBookManager.openBook).toHaveBeenCalledWith('/nonexistent.epub');
    });
    
    it('forwards corrupt‑EPUB errors from BookManager', async () => {
      // Arrange
      const input: OpenBookInput = { filePath: '/corrupt.epub' };
      const error = new BookManagerError('Invalid EPUB file: /corrupt.epub');
      mockBookManager.openBook.mockRejectedValue(error);
      
      // Act & Assert
      await expect(handleOpenBook(input, mockBookManager))
        .rejects.toThrow(BookManagerError);
      
      expect(mockBookManager.openBook).toHaveBeenCalledWith('/corrupt.epub');
    });
    
    it('handles optional autoNavigate parameter (ignored by handler)', async () => {
      // Arrange
      const input: OpenBookInput = { filePath: mockFilePath, autoNavigate: true };
      const mockSession = createMockSession('session-123', 'book-456');
      mockBookManager.openBook.mockResolvedValue(mockSession);
      
      // Act
      const result = await handleOpenBook(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.openBook).toHaveBeenCalledWith(mockFilePath);
      expect(result.sessionId).toBe('session-123');
      // autoNavigate is not used by the tool; it's just ignored (future feature)
    });
  });
  
  describe('createOpenTool', () => {
    it('creates a tool object with correct name and handler', () => {
      // Arrange
      const tool = createOpenTool(mockBookManager);
      
      // Assert
      expect(tool.name).toBe('ebook__open');
      expect(typeof tool.handler).toBe('function');
    });
    
    it('tool handler calls handleOpenBook with typed input', async () => {
      // Arrange
      const tool = createOpenTool(mockBookManager);
      const input: OpenBookInput = { filePath: mockFilePath };
      const mockSession = createMockSession('session-123', 'book-456');
      mockBookManager.openBook.mockResolvedValue(mockSession);
      
      // Act
      const result = await tool.handler(input);
      
      // Assert
      expect(mockBookManager.openBook).toHaveBeenCalledWith(mockFilePath);
      expect(result.sessionId).toBe('session-123');
    });
    
    it('tool handler passes through errors', async () => {
      // Arrange
      const tool = createOpenTool(mockBookManager);
      const input: OpenBookInput = { filePath: '/bad.epub' };
      const error = new BookManagerError('Invalid EPUB');
      mockBookManager.openBook.mockRejectedValue(error);
      
      // Act & Assert
      await expect(tool.handler(input)).rejects.toThrow(BookManagerError);
    });
  });
});