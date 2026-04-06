/**
 * Unit tests for ebook/get_position tool.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful position retrieval with valid session ID
 * - Returns current chapter, page number, total pages, percentage through book
 * - Returns chapter title and position within chapter
 * - Calculates progress correctly (0 to 1)
 * - Handles edge cases: start of book, middle, end
 * - Error handling for session not found
 * - Dependency injection via createGetPositionTool factory
 */

import { handleGetPosition, createGetPositionTool } from '../../../src/tools/position';
import { BookManager } from '../../../src/server/book-manager';
import { GetPositionInput, GetPositionOutput } from '../../../src/server/types';
import { SessionNotFoundError } from '../../../src/server/book-manager';
import { BookSession } from '../../../src/server/types';
import { BookMetadata, Chapter } from '../../../src/epub/types';

describe('ebook/get_position tool', () => {
  let mockBookManager: jest.Mocked<BookManager>;
  const mockSessionId = 'session-123';
  
  // Helper to create a consistent mock book session
  function createMockSession(
    sessionId: string,
    bookId: string,
    currentPage: number,
    totalPages: number,
    chapterId?: string
  ): BookSession {
    const metadata: BookMetadata = {
      title: 'Sample Book',
      author: 'Author Name',
      publisher: 'Test Publisher',
      isbn: '1234567890',
      language: 'en',
      totalPages,
      totalChapters: 7,
    };
    
    return {
      sessionId,
      bookId,
      filePath: '/path/to/book.epub',
      metadata,
      toc: [
        { id: 'toc1', title: 'Chapter 1', level: 1, href: 'chap1.xhtml' },
        { id: 'toc2', title: 'Chapter 2', level: 1, href: 'chap2.xhtml' },
      ],
      currentPosition: { 
        page: currentPage, 
        chapterId, 
        progress: currentPage / totalPages 
      },
      bookmarks: [],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      lastAccessed: new Date('2026-01-01T00:00:00Z'),
    };
  }

  // Helper to create mock paginated chapters
  function createMockChapters(): Chapter[] {
    return [
      {
        id: 'chapter1',
        title: 'Chapter 1',
        startPage: 1,
        endPage: 20,
        wordCount: 5000,
      },
      {
        id: 'chapter2',
        title: 'Chapter 2',
        startPage: 21,
        endPage: 40,
        wordCount: 6000,
      },
      {
        id: 'chapter3',
        title: 'Chapter 3',
        startPage: 41,
        endPage: 60,
        wordCount: 7000,
      },
    ];
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
      getPaginatedChapters: jest.fn(),
      updateSessionPosition: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleGetPosition', () => {
    it('returns current position with chapter when chapterId matches', async () => {
      // Arrange
      const input: GetPositionInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', 25, 60, 'chapter2');
      const mockChapters = createMockChapters();
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result: GetPositionOutput = await handleGetPosition(input, mockBookManager);

      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledTimes(1);
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(mockBookManager.getPaginatedChapters).toHaveBeenCalledWith(mockSessionId);

      expect(result.session).toBe(mockSession);
      expect(result.chapter).toBeDefined();
      expect(result.chapter?.id).toBe('chapter2');
      expect(result.chapter?.title).toBe('Chapter 2');
      expect(result.chapter?.startPage).toBe(21);
      expect(result.chapter?.endPage).toBe(40);
      // Progress calculation: page 25 / total 60 = 0.416666...
      expect(result.progress).toBeCloseTo(25 / 60);
    });

    it('returns position without chapter when chapters not available', async () => {
      // Arrange
      const input: GetPositionInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', 10, 60, 'chapter1');
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(null);

      // Act
      const result = await handleGetPosition(input, mockBookManager);

      // Assert
      expect(result.session).toBe(mockSession);
      expect(result.chapter).toBeUndefined();
      expect(result.progress).toBeCloseTo(10 / 60);
    });

    it('returns position without chapter when chapterId not found in chapters', async () => {
      // Arrange
      const input: GetPositionInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', 10, 60, 'nonexistent');
      const mockChapters = createMockChapters();
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result = await handleGetPosition(input, mockBookManager);

      // Assert
      expect(result.session).toBe(mockSession);
      expect(result.chapter).toBeUndefined();
      expect(result.progress).toBeCloseTo(10 / 60);
    });

    it('returns position without chapter when chapterId is undefined', async () => {
      // Arrange
      const input: GetPositionInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', 10, 60); // chapterId omitted -> undefined
      const mockChapters = createMockChapters();
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result = await handleGetPosition(input, mockBookManager);

      // Assert
      expect(result.session).toBe(mockSession);
      expect(result.chapter).toBeUndefined();
      expect(result.progress).toBeCloseTo(10 / 60);
    });

    it('calculates progress correctly for start of book (page 1)', async () => {
      // Arrange
      const input: GetPositionInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', 1, 60, 'chapter1');
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue([]);

      // Act
      const result = await handleGetPosition(input, mockBookManager);

      // Assert
      expect(result.progress).toBeCloseTo(1 / 60);
    });

    it('calculates progress correctly for middle of book', async () => {
      // Arrange
      const input: GetPositionInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', 30, 60, 'chapter2');
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue([]);

      // Act
      const result = await handleGetPosition(input, mockBookManager);

      // Assert
      expect(result.progress).toBeCloseTo(0.5);
    });

    it('calculates progress correctly for end of book (last page)', async () => {
      // Arrange
      const input: GetPositionInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', 60, 60, 'chapter3');
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue([]);

      // Act
      const result = await handleGetPosition(input, mockBookManager);

      // Assert
      expect(result.progress).toBeCloseTo(1.0);
    });

    it('handles zero total pages (progress = 0)', async () => {
      // Arrange
      const input: GetPositionInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', 1, 0, 'chapter1');
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue([]);

      // Act
      const result = await handleGetPosition(input, mockBookManager);

      // Assert
      expect(result.progress).toBe(0);
    });

    it('throws SessionNotFoundError when session does not exist', async () => {
      // Arrange
      const input: GetPositionInput = { sessionId: 'nonexistent' };
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(handleGetPosition(input, mockBookManager))
        .rejects.toThrow(SessionNotFoundError);
      
      expect(mockBookManager.getBook).toHaveBeenCalledWith('nonexistent');
      expect(mockBookManager.getPaginatedChapters).not.toHaveBeenCalled();
    });

    it('throws validation error when sessionId is empty', async () => {
      // Arrange
      const input = { sessionId: '' } as any; // Invalid empty string
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(handleGetPosition(input, mockBookManager))
        .rejects.toThrow(/Invalid input/);
      
      expect(mockBookManager.getBook).not.toHaveBeenCalled();
    });

    it('throws validation error when sessionId is missing', async () => {
      // Arrange
      const input = {} as any; // Missing sessionId
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(handleGetPosition(input, mockBookManager))
        .rejects.toThrow(/Invalid input/);
      
      expect(mockBookManager.getBook).not.toHaveBeenCalled();
    });
  });

  describe('createGetPositionTool', () => {
    it('creates a tool object with correct name and handler', () => {
      // Arrange
      const tool = createGetPositionTool(mockBookManager);

      // Assert
      expect(tool.name).toBe('ebook/get_position');
      expect(typeof tool.handler).toBe('function');
    });

    it('tool handler calls handleGetPosition with typed input', async () => {
      // Arrange
      const tool = createGetPositionTool(mockBookManager);
      const input: GetPositionInput = { sessionId: mockSessionId };
      const mockSession = createMockSession(mockSessionId, 'book-456', 25, 60, 'chapter2');
      const mockChapters = createMockChapters();
      mockBookManager.getBook.mockReturnValue(mockSession);
      mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

      // Act
      const result = await tool.handler(input);

      // Assert
      expect(mockBookManager.getBook).toHaveBeenCalledWith(mockSessionId);
      expect(result.session).toBe(mockSession);
      expect(result.chapter?.id).toBe('chapter2');
    });

    it('tool handler passes through errors', async () => {
      // Arrange
      const tool = createGetPositionTool(mockBookManager);
      const input: GetPositionInput = { sessionId: 'nonexistent' };
      mockBookManager.getBook.mockReturnValue(null);

      // Act & Assert
      await expect(tool.handler(input)).rejects.toThrow(SessionNotFoundError);
    });
  });
});