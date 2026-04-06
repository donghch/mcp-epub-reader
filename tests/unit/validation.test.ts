/**
 * Unit tests for input validation utilities.
 * 
 * Follows AAA (Arrange‑Act‑Assert) pattern and tests:
 * - Happy path (valid inputs)
 * - Edge cases (empty strings, negative numbers, missing fields)
 * - Error messages (descriptive, user‑friendly)
 * - Type inference (TypeScript compatibility)
 */

import * as z from 'zod';
import {
  // Base schemas
  SessionIdSchema,
  FilePathSchema,
  SafeFilePathSchema,
  PositiveIntSchema,
  NonNegativeIntSchema,
  // Tool input schemas
  OpenBookInputSchema,
  CloseBookInputSchema,
  ListOpenBooksInputSchema,
  NavigateNextInputSchema,
  NavigatePreviousInputSchema,
  JumpToPageInputSchema,
  JumpToChapterInputSchema,
  GetPositionInputSchema,
  SearchInputSchema,
  GetTocInputSchema,
  GetMetadataInputSchema,
  GetFootnoteInputSchema,
  GetChapterSummaryInputSchema,
  // Helper
  validateInput,
  ValidationResult,
  ToolInputSchemas,
  validateToolInput,
  sanitizeSearchQuery,
} from '../../src/utils/validation';

// ============================================================================
// Helper for testing validation results
// ============================================================================

function expectSuccess<T>(result: ValidationResult<T>, expectedData?: T) {
  expect(result.success).toBe(true);
  if (expectedData !== undefined) {
    expect((result as any).data).toEqual(expectedData);
  }
}

function expectFailure(result: ValidationResult<unknown>, expectedErrorCount = 1) {
  expect(result.success).toBe(false);
  expect((result as any).errors).toHaveLength(expectedErrorCount);
}

// ============================================================================
// Base Schema Tests
// ============================================================================

describe('Base schemas', () => {
  describe('SessionIdSchema', () => {
    it('accepts non‑empty string', () => {
      const result = SessionIdSchema.safeParse('session-123');
      expect(result.success).toBe(true);
    });

    it('rejects empty string', () => {
      const result = SessionIdSchema.safeParse('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('sessionId cannot be empty');
      }
    });

    it('rejects non‑string', () => {
      const result = SessionIdSchema.safeParse(42);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('sessionId must be a string');
      }
    });

    it('rejects missing value', () => {
      const result = SessionIdSchema.safeParse(undefined);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('sessionId is required');
      }
    });
  });

  describe('FilePathSchema', () => {
    it('accepts non‑empty string', () => {
      const result = FilePathSchema.safeParse('/path/to/book.epub');
      expect(result.success).toBe(true);
    });

    it('rejects empty string', () => {
      const result = FilePathSchema.safeParse('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('filePath cannot be empty');
      }
    });
  });

  describe('PositiveIntSchema', () => {
    it('accepts positive integer', () => {
      const result = PositiveIntSchema.safeParse(5);
      expect(result.success).toBe(true);
    });

    it('rejects zero', () => {
      const result = PositiveIntSchema.safeParse(0);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('value must be ≥1');
      }
    });

    it('rejects negative integer', () => {
      const result = PositiveIntSchema.safeParse(-5);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('value must be ≥1');
      }
    });

    it('rejects non‑integer', () => {
      const result = PositiveIntSchema.safeParse(3.14);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('value must be an integer');
      }
    });
  });

  describe('NonNegativeIntSchema', () => {
    it('accepts zero', () => {
      const result = NonNegativeIntSchema.safeParse(0);
      expect(result.success).toBe(true);
    });

    it('accepts positive integer', () => {
      const result = NonNegativeIntSchema.safeParse(10);
      expect(result.success).toBe(true);
    });

    it('rejects negative integer', () => {
      const result = NonNegativeIntSchema.safeParse(-1);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('limit must be ≥0');
      }
    });
  });
});

// ============================================================================
// Tool Input Schema Tests
// ============================================================================

describe('Tool input schemas', () => {
  describe('OpenBookInputSchema', () => {
    it('accepts valid input with required fields', () => {
      const input = { filePath: '/books/test.epub' };
      const result = OpenBookInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it('accepts valid input with optional autoNavigate', () => {
      const input = { filePath: '/books/test.epub', autoNavigate: true };
      const result = OpenBookInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it('rejects missing filePath', () => {
      const input = { autoNavigate: false };
      const result = OpenBookInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects empty filePath', () => {
      const input = { filePath: '' };
      const result = OpenBookInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid autoNavigate type', () => {
      const input = { filePath: '/books/test.epub', autoNavigate: 'yes' };
      const result = OpenBookInputSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBe('autoNavigate must be a boolean');
      }
    });
  });

  describe('CloseBookInputSchema', () => {
    it('accepts valid sessionId', () => {
      const input = { sessionId: 'sess-123' };
      const result = CloseBookInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects missing sessionId', () => {
      const input = {};
      const result = CloseBookInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ListOpenBooksInputSchema', () => {
    it('accepts empty object', () => {
      const input = {};
      const result = ListOpenBooksInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects extra fields', () => {
      const input = { extra: 'field' };
      const result = ListOpenBooksInputSchema.safeParse(input);
      // Strict mode rejects unknown keys.
      expect(result.success).toBe(false);
    });
  });

  describe('NavigateNextInputSchema', () => {
    it('accepts valid input with sessionId', () => {
      const input = { sessionId: 'sess-123' };
      const result = NavigateNextInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts valid input with optional steps', () => {
      const input = { sessionId: 'sess-123', steps: 3 };
      const result = NavigateNextInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects missing sessionId', () => {
      const input = { steps: 2 };
      const result = NavigateNextInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects invalid steps (negative)', () => {
      const input = { sessionId: 'sess-123', steps: -1 };
      const result = NavigateNextInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('JumpToPageInputSchema', () => {
    it('accepts valid input', () => {
      const input = { sessionId: 'sess-123', page: 42 };
      const result = JumpToPageInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects page zero', () => {
      const input = { sessionId: 'sess-123', page: 0 };
      const result = JumpToPageInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects non‑integer page', () => {
      const input = { sessionId: 'sess-123', page: 3.14 };
      const result = JumpToPageInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('JumpToChapterInputSchema', () => {
    it('accepts valid input', () => {
      const input = { sessionId: 'sess-123', chapterId: 'chap-5' };
      const result = JumpToChapterInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects empty chapterId', () => {
      const input = { sessionId: 'sess-123', chapterId: '' };
      const result = JumpToChapterInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('SearchInputSchema', () => {
    it('accepts valid input with required fields', () => {
      const input = { sessionId: 'sess-123', query: 'keyword' };
      const result = SearchInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('accepts valid input with optional fields', () => {
      const input = { sessionId: 'sess-123', query: 'keyword', caseSensitive: true, limit: 10 };
      const result = SearchInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects empty query', () => {
      const input = { sessionId: 'sess-123', query: '' };
      const result = SearchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('rejects negative limit', () => {
      const input = { sessionId: 'sess-123', query: 'keyword', limit: -5 };
      const result = SearchInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('GetFootnoteInputSchema', () => {
    it('accepts valid input', () => {
      const input = { sessionId: 'sess-123', footnoteId: 'fn-42' };
      const result = GetFootnoteInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects empty footnoteId', () => {
      const input = { sessionId: 'sess-123', footnoteId: '' };
      const result = GetFootnoteInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('GetChapterSummaryInputSchema', () => {
    it('accepts valid input', () => {
      const input = { sessionId: 'sess-123', chapterId: 'chap-7' };
      const result = GetChapterSummaryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects empty chapterId', () => {
      const input = { sessionId: 'sess-123', chapterId: '' };
      const result = GetChapterSummaryInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Validation Helper Tests
// ============================================================================

describe('validateInput', () => {
  it('returns success with typed data for valid input', () => {
    const schema = z.object({ name: z.string() });
    const input = { name: 'Alice' };
    const result = validateInput(schema, input);
    expectSuccess(result, input);
  });

  it('returns failure with error messages for invalid input', () => {
    const schema = z.object({ age: PositiveIntSchema });
    const input = { age: -5 };
    const result = validateInput(schema, input);
    expectFailure(result);
    if (!result.success) {
      expect(result.errors[0]).toContain('value must be ≥1');
      expect(result.errors[0]).toContain('age');
    }
  });

  it('aggregates multiple errors', () => {
    const schema = z.object({ sessionId: SessionIdSchema, page: PositiveIntSchema });
    const input = { sessionId: '', page: 0 };
    const result = validateInput(schema, input);
    expectFailure(result, 2);
  });
});

// ============================================================================
// Tool‑Specific Validation Tests
// ============================================================================

describe('validateToolInput', () => {
  it('validates ebook/open input', () => {
    const result = validateToolInput('ebook/open', { filePath: '/book.epub' });
    expectSuccess(result);
  });

  it('validates ebook/close input', () => {
    const result = validateToolInput('ebook/close', { sessionId: 'sess-1' });
    expectSuccess(result);
  });

  it('rejects invalid tool input with appropriate errors', () => {
    const result = validateToolInput('ebook/jump_to_page', { sessionId: '', page: -1 });
    expectFailure(result, 2);
  });

  it('supports all tool keys', () => {
    const tools = Object.keys(ToolInputSchemas) as Array<keyof typeof ToolInputSchemas>;
    expect(tools).toHaveLength(13);
    // Quick smoke test: each schema should accept a minimal valid input
    const minimalInputs: Record<string, unknown> = {
      'ebook/open': { filePath: '/test.epub' },
      'ebook/close': { sessionId: 'sess' },
      'ebook/list_open_books': {},
      'ebook/navigate_next': { sessionId: 'sess' },
      'ebook/navigate_previous': { sessionId: 'sess' },
      'ebook/jump_to_page': { sessionId: 'sess', page: 1 },
      'ebook/jump_to_chapter': { sessionId: 'sess', chapterId: 'chap' },
      'ebook/get_position': { sessionId: 'sess' },
      'ebook/search': { sessionId: 'sess', query: 'q' },
      'ebook/get_toc': { sessionId: 'sess' },
      'ebook/get_metadata': { sessionId: 'sess' },
      'ebook/get_footnote': { sessionId: 'sess', footnoteId: 'fn' },
      'ebook/get_chapter_summary': { sessionId: 'sess', chapterId: 'chap' },
    };
    tools.forEach((tool) => {
      const input = minimalInputs[tool];
      const result = validateToolInput(tool, input);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Security Schema Tests
// ============================================================================

describe('SafeFilePathSchema', () => {
  it('accepts normal file path', () => {
    const result = SafeFilePathSchema.safeParse('/books/my-book.epub');
    expect(result.success).toBe(true);
  });

  it('accepts file path with underscores and hyphens', () => {
    const result = SafeFilePathSchema.safeParse('/books/my_book-1.epub');
    expect(result.success).toBe(true);
  });

  it('accepts Windows-style path without backslash traversal', () => {
    const result = SafeFilePathSchema.safeParse('C:\\books\\my-book.epub');
    expect(result.success).toBe(true);
  });

  it('rejects path with ../ traversal', () => {
    const result = SafeFilePathSchema.safeParse('/books/../../../etc/passwd');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe('Path traversal not allowed');
    }
  });

  it('rejects path with ..\\ traversal', () => {
    const result = SafeFilePathSchema.safeParse('/books/..\\windows\\system32');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe('Path traversal not allowed');
    }
  });

  it('rejects backslash-only traversal', () => {
    const result = SafeFilePathSchema.safeParse('C:\\..\\..\\windows');
    expect(result.success).toBe(false);
  });

  it('rejects empty path', () => {
    const result = SafeFilePathSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('sanitizeSearchQuery', () => {
  it('returns query unchanged if under limit', () => {
    expect(sanitizeSearchQuery('hello')).toBe('hello');
  });

  it('returns query unchanged for exact 500 characters', () => {
    const query = 'a'.repeat(500);
    expect(sanitizeSearchQuery(query)).toBe(query);
  });

  it('truncates query over 500 characters', () => {
    const longQuery = 'a'.repeat(600);
    const result = sanitizeSearchQuery(longQuery);
    expect(result.length).toBe(500);
    expect(result).toBe('a'.repeat(500));
  });

  it('escapes regex special characters', () => {
    expect(sanitizeSearchQuery('test.*+?^${}()|[]\\')).toBe('test\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('escapes dot and asterisk for regex safety', () => {
    expect(sanitizeSearchQuery('search.*pattern')).toBe('search\\.\\*pattern');
  });

  it('handles empty string', () => {
    expect(sanitizeSearchQuery('')).toBe('');
  });

  it('handles non-string input', () => {
    expect(sanitizeSearchQuery(null as any)).toBe('');
    expect(sanitizeSearchQuery(undefined as any)).toBe('');
  });

  it('preserves normal alphanumeric characters', () => {
    expect(sanitizeSearchQuery('hello world 123')).toBe('hello world 123');
  });
});
