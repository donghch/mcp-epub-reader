/**
 * Unit tests for ebook/get_metadata tool.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful metadata retrieval with complete metadata
 * - Handling of sparse metadata (missing optional fields)
 * - Error handling for session not found
 * - Dependency injection via createGetMetadataTool factory
 */

import { handleGetMetadata, createGetMetadataTool } from '../../../src/tools/metadata';
import { BookManager } from '../../../src/server/book-manager';
import { GetMetadataInput, GetMetadataOutput } from '../../../src/server/types';
import { SessionNotFoundError } from '../../../src/server/book-manager';
import { BookSession } from '../../../src/server/types';
import { BookMetadata } from '../../../src/epub/types';

describe('ebook/get_metadata tool', () => {
  let mockBookManager: jest.Mocked<BookManager>;
  const mockSessionId = 'session-123';
  
  // Helper to create a mock book session with configurable metadata
  function createMockSession(
    sessionId: string,
    bookId: string,
    metadataOverrides: Partial<BookMetadata> = {}
  ): BookSession {
    const defaultMetadata: BookMetadata = {
      title: 'Sample Book',
      author: 'Author Name',
      publisher: 'Test Publisher',
      isbn: '1234567890',
      language: 'en',
      pubDate: '2023-01-15',
      description: 'A fascinating sample book for testing.',
      coverImageId: 'cover.jpg',
      totalPages: 42,
      totalChapters: 7,
    };
    
    const metadata: BookMetadata = { ...defaultMetadata, ...metadataOverrides };
    
    return {
      sessionId,
      bookId,
      filePath: '/path/to/book.epub',
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
      getPaginatedChapters: jest.fn(),
      updateSessionPosition: jest.fn(),
      getSessionsByBookId: jest.fn(),
      getBookByBookId: jest.fn(),
      generateBookId: jest.fn(),
      generateSessionId: jest.fn(),
    } as any;
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('handleGetMetadata', () => {
    it('successfully returns complete metadata for an open session', async () => {
      // Arrange
      const input: GetMetadataInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456');
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act
      const result: GetMetadataOutput = await handleGetMetadata(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledTimes(1);
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      
      expect(result.title).toBe('Sample Book');
      expect(result.author).toBe('Author Name');
      expect(result.publisher).toBe('Test Publisher');
      expect(result.isbn).toBe('1234567890');
      expect(result.language).toBe('en');
      expect(result.pubDate).toBe('2023-01-15');
      expect(result.description).toBe('A fascinating sample book for testing.');
      expect(result.coverImageId).toBe('cover.jpg');
      expect(result.totalPages).toBe(42);
      expect(result.totalChapters).toBe(7);
    });
    
    it('returns sparse metadata when optional fields are missing', async () => {
      // Arrange
      const input: GetMetadataInput = { sessionId: mockSessionId };
      const sparseMetadata: Partial<BookMetadata> = {
        author: undefined,
        publisher: undefined,
        isbn: undefined,
        language: undefined,
        pubDate: undefined,
        description: undefined,
        coverImageId: undefined,
      };
      const mockSession = createMockSession(mockSessionId, 'book-456', sparseMetadata);
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act
      const result: GetMetadataOutput = await handleGetMetadata(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.title).toBe('Sample Book'); // Required field
      expect(result.author).toBeUndefined();
      expect(result.publisher).toBeUndefined();
      expect(result.isbn).toBeUndefined();
      expect(result.language).toBeUndefined();
      expect(result.pubDate).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.coverImageId).toBeUndefined();
      expect(result.totalPages).toBe(42);
      expect(result.totalChapters).toBe(7);
    });
    
    it('throws SessionNotFoundError when session does not exist', async () => {
      // Arrange
      const input: GetMetadataInput = { sessionId: 'nonexistent-session' };
      mockBookManager.getBook.mockReturnValue(null);
      
      // Act & Assert
      await expect(handleGetMetadata(input, mockBookManager))
        .rejects.toThrow(SessionNotFoundError);
      
      expect(mockBookManager.getBook).toHaveBeenCalledWith('nonexistent-session');
    });
    
    it('updates lastAccessed timestamp via getBook', async () => {
      // Arrange
      const input: GetMetadataInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456');
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act
      await handleGetMetadata(input, mockBookManager);
      
      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      // getBook already updates lastAccessed; we just verify it was called
    });
  });
  
  describe('createGetMetadataTool', () => {
    it('creates a tool object with correct name and handler', () => {
      // Arrange
      const tool = createGetMetadataTool(mockBookManager);
      
      // Assert
      expect(tool.name).toBe('ebook/get_metadata');
      expect(typeof tool.handler).toBe('function');
    });
    
    it('tool handler calls handleGetMetadata with typed input', async () => {
      // Arrange
      const tool = createGetMetadataTool(mockBookManager);
      const input: GetMetadataInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456');
      mockBookManager.getBook.mockReturnValue(mockSession);
      
      // Act
      const result = await tool.handler(input);
      
      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.title).toBe('Sample Book');
    });
    
    it('tool handler passes through SessionNotFoundError', async () => {
      // Arrange
      const tool = createGetMetadataTool(mockBookManager);
      const input: GetMetadataInput = { sessionId: 'nonexistent' };
      mockBookManager.getBook.mockReturnValue(null);
      
      // Act & Assert
      await expect(tool.handler(input)).rejects.toThrow(SessionNotFoundError);
    });
  });
});