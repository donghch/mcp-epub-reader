/**
 * Input validation utilities for MCP EPUB Reader
 * 
 * Provides Zod schemas for all tool inputs and a helper function for validation.
 * Follows the project's TypeScript definitions from `src/server/types.ts`.
 */

import * as z from 'zod';

// ============================================================================
// Security Constants
// ============================================================================

/**
 * Maximum allowed length for search queries to prevent DoS attacks.
 */
export const MAX_SEARCH_QUERY_LENGTH = 500;

/**
 * Regex special characters that need escaping in search queries.
 */
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

// ============================================================================
// Base Schemas (reusable)
// ============================================================================

/**
 * Session ID must be a non‑empty string.
 */
export const SessionIdSchema = z.string({
  required_error: 'sessionId is required',
  invalid_type_error: 'sessionId must be a string',
}).min(1, 'sessionId cannot be empty');

/**
 * File path must be a non‑empty string.
 */
export const FilePathSchema = z.string({
  required_error: 'filePath is required',
  invalid_type_error: 'filePath must be a string',
}).min(1, 'filePath cannot be empty');

/**
 * Validates that a file path does not contain path traversal sequences.
 * Rejects paths containing `../` or `..\` which could be used for directory traversal attacks.
 */
export const SafeFilePathSchema = z.string()
  .min(1, 'filePath cannot be empty')
  .refine(
    (path) => !path.includes('..') && !path.includes('\\..'),
    { message: 'Path traversal not allowed' }
  );

/**
 * Positive integer (≥1) for page numbers and steps.
 */
export const PositiveIntSchema = z.number({
  required_error: 'value must be a number',
  invalid_type_error: 'value must be a number',
}).int('value must be an integer').min(1, 'value must be ≥1');

/**
 * Non‑negative integer for limits.
 */
export const NonNegativeIntSchema = z.number({
  required_error: 'limit must be a number',
  invalid_type_error: 'limit must be a number',
}).int('limit must be an integer').min(0, 'limit must be ≥0');

// ============================================================================
// Tool Input Schemas
// ============================================================================

/**
 * 1. ebook__open – Open an EPUB file
 */
export const OpenBookInputSchema = z.object({
  filePath: FilePathSchema,
  autoNavigate: z.boolean({ invalid_type_error: 'autoNavigate must be a boolean' }).optional(),
}).strict();

/**
 * 2. ebook__close – Close an open book session
 */
export const CloseBookInputSchema = z.object({
  sessionId: SessionIdSchema,
}).strict();

/**
 * 3. ebook__list_open_books – List currently open books
 */
export const ListOpenBooksInputSchema = z.object({}).strict(); // Record<string, never>

/**
 * 4. ebook__navigate_next – Go to next page
 */
export const NavigateNextInputSchema = z.object({
  sessionId: SessionIdSchema,
  steps: PositiveIntSchema.optional(),
}).strict();

/**
 * 5. ebook__navigate_previous – Go to previous page
 */
export const NavigatePreviousInputSchema = NavigateNextInputSchema; // same structure

/**
 * 6. ebook__jump_to_page – Jump to specific page number
 */
export const JumpToPageInputSchema = z.object({
  sessionId: SessionIdSchema,
  page: PositiveIntSchema,
}).strict();

/**
 * 7. ebook__jump_to_chapter – Jump to specific chapter
 */
export const JumpToChapterInputSchema = z.object({
  sessionId: SessionIdSchema,
  chapterId: z.string({
    required_error: 'chapterId is required',
    invalid_type_error: 'chapterId must be a string',
  }).min(1, 'chapterId cannot be empty'),
}).strict();

/**
 * 8. ebook__get_position – Get current reading position
 */
export const GetPositionInputSchema = z.object({
  sessionId: SessionIdSchema,
}).strict();

/**
 * 9. ebook__search – Search within the book
 */
export const SearchInputSchema = z.object({
  sessionId: SessionIdSchema,
  query: z.string({
    required_error: 'query is required',
    invalid_type_error: 'query must be a string',
  }).min(1, 'query cannot be empty'),
  caseSensitive: z.boolean({ invalid_type_error: 'caseSensitive must be a boolean' }).optional(),
  limit: NonNegativeIntSchema.optional(),
  contextWindow: NonNegativeIntSchema.optional(),
}).strict();

/**
 * 10. ebook__get_toc – Get table of contents
 */
export const GetTocInputSchema = z.object({
  sessionId: SessionIdSchema,
}).strict();

/**
 * 11. ebook__get_metadata – Get book metadata
 */
export const GetMetadataInputSchema = z.object({
  sessionId: SessionIdSchema,
}).strict();

/**
 * 12. ebook__get_footnote – Get footnote by ID
 */
export const GetFootnoteInputSchema = z.object({
  sessionId: SessionIdSchema,
  footnoteId: z.string({
    required_error: 'footnoteId is required',
    invalid_type_error: 'footnoteId must be a string',
  }).min(1, 'footnoteId cannot be empty'),
}).strict();

/**
 * 13. ebook__get_chapter_summary – Get summary of a chapter
 */
export const GetChapterSummaryInputSchema = z.object({
  sessionId: SessionIdSchema,
  chapterId: z.string({
    required_error: 'chapterId is required',
    invalid_type_error: 'chapterId must be a string',
  }).min(1, 'chapterId cannot be empty'),
  maxSentences: NonNegativeIntSchema.optional(),
}).strict();

// ============================================================================
// Validation Helper
// ============================================================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

/**
 * Validate input against a Zod schema.
 * 
 * @param schema - Zod schema to validate against
 * @param input - Unknown input data
 * @returns ValidationResult with typed data on success, or error messages on failure
 * 
 * @example
 * const result = validateInput(OpenBookInputSchema, { filePath: 'book.epub' });
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.errors);
 * }
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  } else {
    // Flatten errors into user‑friendly strings
    const errors = result.error.errors.map((err) => {
      const path = err.path.length > 0 ? ` at ${err.path.join('.')}` : '';
      return `${err.message}${path}`;
    });
    return { success: false, errors };
  }
}

// ============================================================================
// Schema Map (for dynamic validation)
// ============================================================================

export const ToolInputSchemas = {
  'ebook__open': OpenBookInputSchema,
  'ebook__close': CloseBookInputSchema,
  'ebook__list_open_books': ListOpenBooksInputSchema,
  'ebook__navigate_next': NavigateNextInputSchema,
  'ebook__navigate_previous': NavigatePreviousInputSchema,
  'ebook__jump_to_page': JumpToPageInputSchema,
  'ebook__jump_to_chapter': JumpToChapterInputSchema,
  'ebook__get_position': GetPositionInputSchema,
  'ebook__search': SearchInputSchema,
  'ebook__get_toc': GetTocInputSchema,
  'ebook__get_metadata': GetMetadataInputSchema,
  'ebook__get_footnote': GetFootnoteInputSchema,
  'ebook__get_chapter_summary': GetChapterSummaryInputSchema,
} as const;

export type ToolName = keyof typeof ToolInputSchemas;

/**
 * Validate input for a specific tool.
 * 
 * @param tool - Tool name (e. g., 'ebook__open')
 * @param input - Unknown input data
 * @returns ValidationResult for that tool's input schema
 */
export function validateToolInput<T extends ToolName>(
  tool: T,
  input: unknown,
): ValidationResult<z.infer<typeof ToolInputSchemas[T]>> {
  return validateInput(ToolInputSchemas[tool], input);
}

// ============================================================================
// Query Sanitization
// ============================================================================

/**
 * Sanitizes a search query to prevent injection attacks and DoS.
 * - Truncates to MAX_SEARCH_QUERY_LENGTH characters
 * - Escapes regex special characters to prevent regex injection
 * 
 * @param query - Raw search query from user input
 * @returns Sanitized query safe for use in search operations
 * 
 * @example
 * sanitizeSearchQuery('test.*query') // Returns 'test\\.\\*query'
 * sanitizeSearchQuery('a'.repeat(1000)) // Returns truncated to 500 chars
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query || typeof query !== 'string') {
    return '';
  }

  // Truncate to max length to prevent DoS
  let sanitized = query.slice(0, MAX_SEARCH_QUERY_LENGTH);

  // Escape regex special characters to prevent regex injection
  sanitized = sanitized.replace(REGEX_SPECIAL_CHARS, '\\$&');

  return sanitized;
}
