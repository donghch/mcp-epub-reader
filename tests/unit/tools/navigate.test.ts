/**
 * Unit tests for ebook__navigate_next and ebook__navigate_previous tools
 */

import { handleNavigateNext, handleNavigatePrevious } from '../../../src/tools/navigate';
import { BookManager } from '../../../src/server/book-manager';
import { SessionNotFoundError } from '../../../src/server/book-manager';
import { Chapter, ReadingPosition } from '../../../src/epub/types';

// Mock the book manager
const mockBookManager = {
  getBook: jest.fn(),
  getPaginatedChapters: jest.fn(),
  updateSessionPosition: jest.fn(),
} as unknown as jest.Mocked<BookManager>;

// Helper to create a mock session
const createMockSession = (page: number, totalPages: number, chapterId?: string) => ({
  sessionId: 'test-session',
  bookId: 'test-book',
  filePath: '/test.epub',
  metadata: {
    title: 'Test Book',
    totalPages,
    totalChapters: 5,
  },
  toc: [],
  currentPosition: {
    page,
    chapterId,
    progress: page / totalPages,
  } as ReadingPosition,
  bookmarks: [],
  createdAt: new Date(),
  lastAccessed: new Date(),
});

// Helper to create mock paginated chapters
const createMockPaginatedChapters = (): Chapter[] => [
  {
    id: 'chapter-1',
    title: 'Chapter 1',
    startPage: 1,
    endPage: 10,
    wordCount: 3000,
    content: '<p>Chapter 1 content</p>',
  },
  {
    id: 'chapter-2',
    title: 'Chapter 2',
    startPage: 11,
    endPage: 25,
    wordCount: 4500,
    content: '<p>Chapter 2 content</p>',
  },
];

describe('ebook__navigate_next', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully navigates forward one page within same chapter', async () => {
    // Arrange
    const input = { sessionId: 'test-session', steps: 1 };
    const mockSession = createMockSession(5, 25, 'chapter-1');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 6, chapterId: 'chapter-1', progress: 6 / 25 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleNavigateNext(input, mockBookManager);

    // Assert
    expect(mockBookManager.getBook).toHaveBeenCalledWith('test-session');
    expect(mockBookManager.getPaginatedChapters).toHaveBeenCalledWith('test-session');
    expect(mockBookManager.updateSessionPosition).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        page: 6,
        chapterId: 'chapter-1',
        progress: 6 / 25,
      })
    );
    expect(result.session).toBe(updatedSession);
    expect(result.newPage).toBe(6);
    expect(result.chapter?.id).toBe('chapter-1');
  });

  test('successfully navigates forward multiple pages across chapter boundary', async () => {
    // Arrange
    const input = { sessionId: 'test-session', steps: 7 };
    const mockSession = createMockSession(8, 25, 'chapter-1');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 15, chapterId: 'chapter-2', progress: 15 / 25 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleNavigateNext(input, mockBookManager);

    // Assert
    expect(mockBookManager.updateSessionPosition).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        page: 15,
        chapterId: 'chapter-2',
        progress: 15 / 25,
      })
    );
    expect(result.newPage).toBe(15);
    expect(result.chapter?.id).toBe('chapter-2');
  });

  test('throws SessionNotFoundError when session does not exist', async () => {
    // Arrange
    const input = { sessionId: 'non-existent', steps: 1 };
    mockBookManager.getBook.mockReturnValue(null);

    // Act & Assert
    await expect(handleNavigateNext(input, mockBookManager))
      .rejects.toThrow(SessionNotFoundError);
  });

  test('throws error when paginated chapters are unavailable', async () => {
    // Arrange
    const input = { sessionId: 'test-session', steps: 1 };
    const mockSession = createMockSession(5, 25);
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(null);

    // Act & Assert
    await expect(handleNavigateNext(input, mockBookManager))
      .rejects.toThrow('does not have paginated chapters');
  });

  test('throws error when navigating beyond last page', async () => {
    // Arrange
    const input = { sessionId: 'test-session', steps: 5 };
    const mockSession = createMockSession(22, 25);
    const mockChapters = createMockPaginatedChapters();
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleNavigateNext(input, mockBookManager))
      .rejects.toThrow('Cannot navigate next beyond book boundaries');
  });

  test('uses default steps value of 1 when not provided', async () => {
    // Arrange
    const input = { sessionId: 'test-session' };
    const mockSession = createMockSession(5, 25);
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 6, chapterId: 'chapter-1', progress: 6 / 25 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleNavigateNext(input, mockBookManager);

    // Assert
    expect(mockBookManager.updateSessionPosition).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({ page: 6 })
    );
    expect(result.newPage).toBe(6);
  });
});

describe('ebook__navigate_previous', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully navigates backward one page within same chapter', async () => {
    // Arrange
    const input = { sessionId: 'test-session', steps: 1 };
    const mockSession = createMockSession(15, 25, 'chapter-2');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 14, chapterId: 'chapter-2', progress: 14 / 25 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleNavigatePrevious(input, mockBookManager);

    // Assert
    expect(mockBookManager.updateSessionPosition).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        page: 14,
        chapterId: 'chapter-2',
        progress: 14 / 25,
      })
    );
    expect(result.newPage).toBe(14);
    expect(result.chapter?.id).toBe('chapter-2');
  });

  test('successfully navigates backward multiple pages across chapter boundary', async () => {
    // Arrange
    const input = { sessionId: 'test-session', steps: 5 };
    const mockSession = createMockSession(13, 25, 'chapter-2');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 8, chapterId: 'chapter-1', progress: 8 / 25 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleNavigatePrevious(input, mockBookManager);

    // Assert
    expect(mockBookManager.updateSessionPosition).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        page: 8,
        chapterId: 'chapter-1',
        progress: 8 / 25,
      })
    );
    expect(result.newPage).toBe(8);
    expect(result.chapter?.id).toBe('chapter-1');
  });

  test('throws error when navigating beyond first page', async () => {
    // Arrange
    const input = { sessionId: 'test-session', steps: 5 };
    const mockSession = createMockSession(3, 25);
    const mockChapters = createMockPaginatedChapters();
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleNavigatePrevious(input, mockBookManager))
      .rejects.toThrow('Cannot navigate previous beyond book boundaries');
  });

  test('handles book with zero pages gracefully', async () => {
    // Arrange
    const input = { sessionId: 'test-session', steps: 1 };
    const mockSession = createMockSession(1, 0); // totalPages = 0
    const mockChapters: Chapter[] = [];
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleNavigatePrevious(input, mockBookManager))
      .rejects.toThrow('Book has no pages');
  });
});