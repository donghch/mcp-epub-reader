/**
 * Unit tests for ebook/jump_to_page and ebook/jump_to_chapter tools
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Successful jumps to valid page numbers and chapter IDs
 * - Case‑insensitive chapter matching
 * - Proper validation of page ranges and chapter existence
 * - Error handling for invalid session, out‑of‑range pages, missing chapters
 * - Boundary conditions (first page, last page, chapter start page)
 * - Dependency injection via createJumpToPageTool and createJumpToChapterTool
 */

import { handleJumpToPage, handleJumpToChapter, createJumpToPageTool, createJumpToChapterTool } from '../../../src/tools/jump';
import { BookManager } from '../../../src/server/book-manager';
import { SessionNotFoundError } from '../../../src/server/book-manager';
import { Chapter, ReadingPosition } from '../../../src/epub/types';

// Mock the paginator module so getPageContent returns predictable content
jest.mock('../../../src/epub/paginator', () => ({
  getPageContent: jest.fn().mockReturnValue('<p>Mock page content</p>'),
}));

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

// Helper to create mock paginated chapters with pages property for getPageContent
const createMockPaginatedChapters = (): Chapter[] => [
  {
    id: 'chapter-1',
    title: 'Chapter One',
    startPage: 1,
    endPage: 10,
    wordCount: 3000,
    content: '<p>Chapter 1 content</p>',
  },
  {
    id: 'chapter-2',
    title: 'Chapter Two',
    startPage: 11,
    endPage: 25,
    wordCount: 4500,
    content: '<p>Chapter 2 content</p>',
  },
  {
    id: 'chapter-3',
    title: 'Chapter Three',
    startPage: 26,
    endPage: 30,
    wordCount: 1500,
    content: '<p>Chapter 3 content</p>',
  },
];

describe('ebook/jump_to_page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully jumps to a valid page within same chapter', async () => {
    // Arrange
    const input = { sessionId: 'test-session', page: 5 };
    const mockSession = createMockSession(1, 30, 'chapter-1');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 5, chapterId: 'chapter-1', progress: 5 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleJumpToPage(input, mockBookManager);

    // Assert
    expect(mockBookManager.getBook).toHaveBeenCalledWith('test-session');
    expect(mockBookManager.getPaginatedChapters).toHaveBeenCalledWith('test-session');
    expect(mockBookManager.updateSessionPosition).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        page: 5,
        chapterId: 'chapter-1',
        progress: 5 / 30,
      })
    );
    expect(result.session).toBe(updatedSession);
    expect(result.chapter?.id).toBe('chapter-1');
  });

  test('successfully jumps to a page in a different chapter', async () => {
    // Arrange
    const input = { sessionId: 'test-session', page: 15 };
    const mockSession = createMockSession(1, 30, 'chapter-1');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 15, chapterId: 'chapter-2', progress: 15 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleJumpToPage(input, mockBookManager);

    // Assert
    expect(mockBookManager.updateSessionPosition).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        page: 15,
        chapterId: 'chapter-2',
        progress: 15 / 30,
      })
    );
    expect(result.session).toBe(updatedSession);
    expect(result.chapter?.id).toBe('chapter-2');
  });

  test('throws SessionNotFoundError when session does not exist', async () => {
    // Arrange
    const input = { sessionId: 'non-existent', page: 1 };
    mockBookManager.getBook.mockReturnValue(null);

    // Act & Assert
    await expect(handleJumpToPage(input, mockBookManager))
      .rejects.toThrow(SessionNotFoundError);
  });

  test('throws error when paginated chapters are unavailable', async () => {
    // Arrange
    const input = { sessionId: 'test-session', page: 1 };
    const mockSession = createMockSession(1, 30);
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(null);

    // Act & Assert
    await expect(handleJumpToPage(input, mockBookManager))
      .rejects.toThrow('does not have paginated chapters');
  });

  test('throws error when book has zero pages', async () => {
    // Arrange
    const input = { sessionId: 'test-session', page: 1 };
    const mockSession = createMockSession(1, 0);
    const mockChapters: Chapter[] = [];
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleJumpToPage(input, mockBookManager))
      .rejects.toThrow('Book has no pages');
  });

  test('throws error when page is less than 1', async () => {
    // Arrange
    const input = { sessionId: 'test-session', page: 0 };
    const mockSession = createMockSession(1, 30);
    const mockChapters = createMockPaginatedChapters();
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleJumpToPage(input, mockBookManager))
      .rejects.toThrow('Page 0 is out of range');
  });

  test('throws error when page exceeds total pages', async () => {
    // Arrange
    const input = { sessionId: 'test-session', page: 35 };
    const mockSession = createMockSession(1, 30);
    const mockChapters = createMockPaginatedChapters();
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleJumpToPage(input, mockBookManager))
      .rejects.toThrow('Page 35 is out of range');
  });

  test('handles boundary: first page', async () => {
    // Arrange
    const input = { sessionId: 'test-session', page: 1 };
    const mockSession = createMockSession(10, 30);
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 1, chapterId: 'chapter-1', progress: 1 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleJumpToPage(input, mockBookManager);

    // Assert
    expect(result.session.currentPosition.page).toBe(1);
    expect(result.chapter?.id).toBe('chapter-1');
  });

  test('handles boundary: last page', async () => {
    // Arrange
    const input = { sessionId: 'test-session', page: 30 };
    const mockSession = createMockSession(1, 30);
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 30, chapterId: 'chapter-3', progress: 30 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleJumpToPage(input, mockBookManager);

    // Assert
    expect(result.session.currentPosition.page).toBe(30);
    expect(result.chapter?.id).toBe('chapter-3');
  });

  test('returns undefined chapter when page is not within any chapter (should not happen)', async () => {
    // Arrange
    const input = { sessionId: 'test-session', page: 5 };
    const mockSession = createMockSession(1, 30);
    // Mock chapters where the page lies outside all startPage/endPage ranges
    const mockChapters: Chapter[] = [
      { id: 'chap1', title: 'Chap1', startPage: 10, endPage: 20, wordCount: 1000 },
      { id: 'chap2', title: 'Chap2', startPage: 21, endPage: 30, wordCount: 1000 },
    ];
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 5, chapterId: undefined, progress: 5 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleJumpToPage(input, mockBookManager);

    // Assert
    expect(result.chapter).toBeUndefined();
    expect(result.session.currentPosition.chapterId).toBeUndefined();
  });
});

describe('ebook/jump_to_chapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('successfully jumps to existing chapter (case‑sensitive match)', async () => {
    // Arrange
    const input = { sessionId: 'test-session', chapterId: 'chapter-2' };
    const mockSession = createMockSession(1, 30, 'chapter-1');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 11, chapterId: 'chapter-2', progress: 11 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleJumpToChapter(input, mockBookManager);

    // Assert
    expect(mockBookManager.getBook).toHaveBeenCalledWith('test-session');
    expect(mockBookManager.getPaginatedChapters).toHaveBeenCalledWith('test-session');
    expect(mockBookManager.updateSessionPosition).toHaveBeenCalledWith(
      'test-session',
      expect.objectContaining({
        page: 11,
        chapterId: 'chapter-2',
        progress: 11 / 30,
      })
    );
    expect(result.session).toBe(updatedSession);
    expect(result.chapter.id).toBe('chapter-2');
    expect(result.chapter.startPage).toBe(11);
  });

  test('successfully jumps to existing chapter (case‑insensitive match)', async () => {
    // Arrange
    const input = { sessionId: 'test-session', chapterId: 'CHAPTER-2' };
    const mockSession = createMockSession(1, 30, 'chapter-1');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 11, chapterId: 'chapter-2', progress: 11 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleJumpToChapter(input, mockBookManager);

    // Assert
    expect(result.chapter.id).toBe('chapter-2');
  });

  test('successfully jumps to existing chapter by title (case‑insensitive)', async () => {
    // Arrange
    const input = { sessionId: 'test-session', chapterId: 'Chapter Two' };
    const mockSession = createMockSession(1, 30, 'chapter-1');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 11, chapterId: 'chapter-2', progress: 11 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleJumpToChapter(input, mockBookManager);

    // Assert
    expect(result.chapter.id).toBe('chapter-2');
  });

  test('successfully jumps to existing chapter by numeric index', async () => {
    // Arrange
    const input = { sessionId: 'test-session', chapterId: '2' };
    const mockSession = createMockSession(1, 30, 'chapter-1');
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 11, chapterId: 'chapter-2', progress: 11 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await handleJumpToChapter(input, mockBookManager);

    // Assert
    expect(result.chapter.id).toBe('chapter-2');
  });

  test('throws SessionNotFoundError when session does not exist', async () => {
    // Arrange
    const input = { sessionId: 'non-existent', chapterId: 'chapter-1' };
    mockBookManager.getBook.mockReturnValue(null);

    // Act & Assert
    await expect(handleJumpToChapter(input, mockBookManager))
      .rejects.toThrow(SessionNotFoundError);
  });

  test('throws error when paginated chapters are unavailable', async () => {
    // Arrange
    const input = { sessionId: 'test-session', chapterId: 'chapter-1' };
    const mockSession = createMockSession(1, 30);
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(null);

    // Act & Assert
    await expect(handleJumpToChapter(input, mockBookManager))
      .rejects.toThrow('does not have paginated chapters');
  });

  test('throws error when chapter does not exist', async () => {
    // Arrange
    const input = { sessionId: 'test-session', chapterId: 'non-existent-chapter' };
    const mockSession = createMockSession(1, 30);
    const mockChapters = createMockPaginatedChapters();
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleJumpToChapter(input, mockBookManager))
      .rejects.toThrow('Chapter "non-existent-chapter" not found in this book (tried ID, title, and numeric index)');
  });

  test('throws error when chapter start page is invalid', async () => {
    // Arrange
    const input = { sessionId: 'test-session', chapterId: 'chapter-1' };
    const mockSession = createMockSession(1, 30);
    const mockChapters: Chapter[] = [
      { id: 'chapter-1', title: 'Chapter One', startPage: 0, endPage: 10, wordCount: 1000 },
    ];
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleJumpToChapter(input, mockBookManager))
      .rejects.toThrow('Chapter "chapter-1" has invalid start page');
  });

  test('throws error when chapter start page exceeds total pages', async () => {
    // Arrange
    const input = { sessionId: 'test-session', chapterId: 'chapter-1' };
    const mockSession = createMockSession(1, 5); // totalPages = 5
    const mockChapters: Chapter[] = [
      { id: 'chapter-1', title: 'Chapter One', startPage: 10, endPage: 20, wordCount: 1000 },
    ];
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleJumpToChapter(input, mockBookManager))
      .rejects.toThrow('Chapter start page 10 exceeds total pages 5');
  });

  test('handles book with zero pages gracefully', async () => {
    // Arrange
    const input = { sessionId: 'test-session', chapterId: 'chapter-1' };
    const mockSession = createMockSession(1, 0);
    const mockChapters: Chapter[] = [
      { id: 'chapter-1', title: 'Chapter One', startPage: 1, endPage: 0, wordCount: 0 },
    ];
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(handleJumpToChapter(input, mockBookManager))
      .rejects.toThrow('Book has no pages');
  });
});

describe('factory functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createJumpToPageTool returns tool with correct name and handler', () => {
    // Arrange
    const tool = createJumpToPageTool(mockBookManager);

    // Assert
    expect(tool.name).toBe('ebook/jump_to_page');
    expect(typeof tool.handler).toBe('function');
  });

  test('createJumpToChapterTool returns tool with correct name and handler', () => {
    // Arrange
    const tool = createJumpToChapterTool(mockBookManager);

    // Assert
    expect(tool.name).toBe('ebook/jump_to_chapter');
    expect(typeof tool.handler).toBe('function');
  });

  test('tool handler calls handleJumpToPage with typed input', async () => {
    // Arrange
    const tool = createJumpToPageTool(mockBookManager);
    const input = { sessionId: 'test-session', page: 5 };
    const mockSession = createMockSession(1, 30);
    const mockChapters = createMockPaginatedChapters();
    const updatedSession = {
      ...mockSession,
      currentPosition: { page: 5, chapterId: 'chapter-1', progress: 5 / 30 },
      lastAccessed: new Date(),
    };

    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);
    mockBookManager.updateSessionPosition.mockReturnValue(updatedSession);

    // Act
    const result = await tool.handler(input);

    // Assert
    expect(result.session.currentPosition.page).toBe(5);
  });

  test('tool handler passes through errors', async () => {
    // Arrange
    const tool = createJumpToPageTool(mockBookManager);
    const input = { sessionId: 'test-session', page: 100 };
    const mockSession = createMockSession(1, 30);
    const mockChapters = createMockPaginatedChapters();
    mockBookManager.getBook.mockReturnValue(mockSession);
    mockBookManager.getPaginatedChapters.mockReturnValue(mockChapters);

    // Act & Assert
    await expect(tool.handler(input)).rejects.toThrow('Page 100 is out of range');
  });
});