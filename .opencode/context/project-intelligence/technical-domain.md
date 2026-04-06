<!-- Context: project-intelligence/technical | Priority: critical | Version: 1.1 | Updated: 2026-04-06 -->

# Technical Domain

**Purpose**: Tech stack, architecture, development patterns for this project. Agents use these patterns to generate code matching project standards.
**Last Updated**: 2026-04-06

## Quick Reference
**Update Triggers**: Tech stack changes | New patterns | Architecture decisions
**Audience**: Developers, AI agents

## Primary Stack
| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Language | TypeScript | 5.7.3 | Type safety, modern features, good tooling |
| Framework | Node.js + Express | >=20 | MCP server requires Node.js runtime |
| Database | None (CLI tool) | N/A | No persistent storage needed for EPUB reading |
| Styling | None (CLI tool) | N/A | Command-line interface, no UI |
| Key Libraries | @modelcontextprotocol/sdk, epub, zod, jest | Various | MCP protocol, EPUB parsing, validation, testing |

## Architecture Pattern
```
Type: Modular CLI Server
Pattern: MCP (Model Context Protocol) server with dependency injection
Structure: src/epub/ (parsing), src/server/ (MCP), src/tools/ (handlers), src/utils/ (shared)
```

### Why This Architecture?
MCP servers follow a specific protocol pattern: tool handlers with dependency injection, validation, and factory functions. This architecture enables clean separation between EPUB parsing logic, MCP server lifecycle, and individual tool implementations.

## Code Patterns

### API Endpoint Pattern (MCP Tool Handler)
```typescript
// Async handler with dependency injection
export async function handleSearch(
  input: SearchInput,
  bookManager: BookManager
): Promise<SearchOutput> {
  // Validate session exists
  const session = bookManager.getBook(input.sessionId);
  if (!session) throw new SessionNotFoundError(input.sessionId);

  // Get data and apply defaults
  const paginatedChapters = bookManager.getPaginatedChapters(input.sessionId);
  const opts: SearchOptions = {
    caseSensitive: input.caseSensitive ?? DEFAULT_OPTIONS.caseSensitive,
    limit: input.limit ?? DEFAULT_OPTIONS.limit,
    contextWindow: input.contextWindow ?? DEFAULT_OPTIONS.contextWindow,
  };

  // Process and return (implementation omitted for brevity)
  return { results: [], totalMatches: 0 };
}

// Factory function for MCP registration
export function createSearchTool(bookManager: BookManager) {
  return {
    name: 'ebook/search' as const,
    handler: (input: unknown) => handleSearch(input as SearchInput, bookManager),
  };
}
```

### Component Pattern (Validation Utilities)
```typescript
// Base Zod schemas with descriptive errors
export const SessionIdSchema = z.string().min(1, 'sessionId cannot be empty');
export const FilePathSchema = z.string().min(1, 'filePath cannot be empty');
export const PositiveIntSchema = z.number().int().min(1);

// Tool-specific schema with strict validation
export const OpenBookInputSchema = z.object({
  filePath: FilePathSchema,
  autoNavigate: z.boolean().optional(),
}).strict();

// Schema map for dynamic lookup
export const ToolInputSchemas = {
  'ebook/open': OpenBookInputSchema,
  // ... other tools
} as const;

export type ToolName = keyof typeof ToolInputSchemas;

// Validation result type
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

// Generic validation helper
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: result.error.errors.map(e => e.message) };
}
```

## Naming Conventions
| Type | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `book-manager.ts`, `tool-registration.ts` |
| Directories | kebab-case | `src/epub/`, `src/server/`, `src/tools/` |
| Types/Interfaces | PascalCase | `SearchInput`, `BookSession`, `Chapter` |
| Variables | camelCase | `session`, `paginatedChapters`, `totalMatches` |
| Functions | camelCase | `handleSearch()`, `createSearchTool()`, `validateInput()` |
| Constants | PascalCase for objects, UPPER_SNAKE_CASE for primitives | `DEFAULT_OPTIONS` (object), `MAX_FILE_SIZE` |
| Schemas | PascalCase + "Schema" suffix | `SessionIdSchema`, `OpenBookInputSchema` |
| Error Classes | PascalCase + "Error" suffix | `SessionNotFoundError`, `FileNotFoundError` |

## Code Standards
1. **TypeScript strict mode** (`strict: true` in tsconfig)
2. **Zod validation** for all tool inputs with descriptive error messages
3. **Async/await pattern** for handler functions
4. **Custom error classes** for domain errors (e.g., `SessionNotFoundError`)
5. **Dependency injection** pattern (BookManager passed to factory functions)
6. **Factory functions** for MCP tool creation (`create*Tool`)
7. **JSDoc comments** for public functions with `@param`, `@returns`, `@throws`
8. **Separation of concerns**: `tools/`, `server/`, `epub/`, `utils/` directories
9. **Testing**: Jest + ts-jest with coverage collection (`collectCoverageFrom`)
10. **Import style**: Relative imports (`../server/types`) not absolute paths
11. **Variable declaration**: `const` preferred, `let` only when reassigning
12. **Type annotations**: Explicit for function parameters and return types
13. **Options pattern**: Interfaces for options, default objects with fallbacks
14. **File organization**: One main export per file, helper functions private

## Security Requirements
1. **Validate all user input** with Zod schemas (strict mode)
2. **Limit EPUB file size** to 50MB (`maxFileSizeBytes: 50 * 1024 * 1024`)
3. **Validate file existence and type** before parsing
4. **Validate session existence** before operations
5. **Strip HTML tags** from content before text processing (`stripHtmlTags()`)
6. **Use TypeScript strict mode** for type safety
7. **Implement custom error classes** for domain errors
8. **Validate input boundaries** (positive integers, non-negative limits)
9. **Basic file path validation** (non-empty string)

## 📂 Codebase References
**Primary Patterns**:
- `src/utils/validation.ts` - Zod schemas and validation utilities
- `src/tools/search.ts` - MCP tool handler with async/await pattern
- `src/server/types.ts` - Type definitions for book sessions and tool I/O
- `src/epub/parser.ts` - EPUB parsing with file validation

**Configuration**:
- `tsconfig.json` - TypeScript strict mode configuration
- `jest.config.js` - Testing setup with coverage
- `package.json` - Dependencies and scripts

**Project Structure**:
```
src/
├── epub/           # EPUB parsing and pagination
├── server/         # MCP server and session management  
├── tools/          # Individual MCP tool handlers
└── utils/          # Shared utilities (validation)
```

## Related Files
- `business-domain.md` - Why this technical foundation exists (currently template)
- `business-tech-bridge.md` - How business needs map to technical solutions
- `decisions-log.md` - Full decision history with context
- `navigation.md` - Quick overview of all project intelligence files