# EPUB Reader MCP Server – Developer Documentation

**Purpose**: Document the architecture, design decisions, and development practices for the EPUB Reader MCP server.
**Last Updated**: 2026-04-06

## Overview

The EPUB Reader MCP server is a TypeScript implementation of a Model Context Protocol (MCP) server that provides EPUB file reading capabilities to AI agents. It acts as a "Kindle for AI agents," exposing EPUB content through MCP's Tools API.

### Design Goals

1. **Reliability**: Handle malformed EPUB files gracefully with clear error messages
2. **Performance**: Efficient parsing and pagination for large EPUB files
3. **Testability**: Pure functions, dependency injection, comprehensive test coverage
4. **Maintainability**: Clear separation of concerns, TypeScript strict typing
5. **Protocol Compliance**: Full compliance with MCP specification and best practices

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Client (Claude Desktop)              │
│                    JSON-RPC over stdio                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    MCP Server (Node.js)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │               Tool Registration Layer                 │  │
│  │  • Routes requests to appropriate tool handlers      │  │
│  │  • Validates input using Zod schemas                 │  │
│  │  • Converts errors to MCP error responses            │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                          │
│  ┌──────────────▼───────────────────────────────────────┐  │
│  │               Tool Implementation Layer               │  │
│  │  • 13 tool handlers (open, close, navigate, etc.)    │  │
│  │  • Business logic for EPUB operations                │  │
│  │  • Stateless, receives BookManager via DI            │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                          │
│  ┌──────────────▼───────────────────────────────────────┐  │
│  │               Book Manager Layer                      │  │
│  │  • Session lifecycle management                      │  │
│  │  • EPUB parsing and caching                          │  │
│  │  • Thread-safe session access                        │  │
│  └──────────────┬───────────────────────────────────────┘  │
│                 │                                          │
│  ┌──────────────▼───────────────────────────────────────┐  │
│  │               EPUB Domain Layer                      │  │
│  │  • Parser (epub library wrapper)                     │  │
│  │  • Paginator (content splitting)                     │  │
│  │  • Type definitions                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Request Reception**: MCP server receives JSON-RPC `tools/call` request via stdio
2. **Routing**: Tool registration layer identifies tool by name (`ebook/open`, etc.)
3. **Validation**: Input validated against Zod schema, errors returned if invalid
4. **Execution**: Tool handler executes business logic using BookManager
5. **Response**: Result converted to MCP tool result format, sent via stdout
6. **Error Handling**: Any thrown errors caught and converted to MCP error responses

## Design Decisions

### 1. Pure Functions and Immutability

**Why**: Predictable behavior, easier testing, thread safety in Node.js event loop.

**Implementation**:
- EPUB parser returns immutable data structures
- Paginator uses functional transformations
- Tool handlers are pure relative to their dependencies
- BookManager manages mutable session state but with thread-safe access

### 2. Dependency Injection (DI)

**Why**: Enables unit testing by allowing mock dependencies, separates construction from use.

**Implementation**:
- BookManager passed to tool handlers as constructor parameter
- Each tool exports a factory function that closes over BookManager
- Testing uses mocked BookManager to isolate tool logic

### 3. Zod for Input Validation

**Why**: Type-safe validation at runtime, automatic TypeScript type inference, rich error messages.

**Implementation**:
- All 13 tool inputs have corresponding Zod schemas in `validation.ts`
- `validateToolInput` helper unifies validation logic
- Validation errors include path information for debugging

### 4. Hierarchical TOC Transformation

**Why**: The `epub` library returns flat TOC; hierarchical structure is more useful for navigation.

**Implementation**:
- Parser converts flat TOC entries to nested hierarchy based on heading levels
- Each entry includes `level`, `title`, `pageNumber`, and `children[]`
- Supports multi-level navigation (parts → chapters → sections)

### 5. Configurable Pagination

**Why**: Different EPUBs have different content densities; fixed page sizes don't work well.

**Implementation**:
- Paginator splits content by approximate word count (default: 500 words)
- Respects paragraph boundaries (doesn't split mid-paragraph)
- Configurable via `wordsPerPage` parameter for future extensibility

### 6. Session-Based Architecture

**Why**: Multiple EPUB files may be open simultaneously; sessions isolate state.

**Implementation**:
- Each `ebook/open` creates a unique session ID
- Session stores parsing result, pagination, current position
- `BookManager` tracks sessions with LRU-like cleanup on close
- Session IDs are cryptographically random to prevent guessing

## Code Structure

### Module Breakdown

#### `src/epub/`

**Purpose**: EPUB domain logic, independent of MCP protocol.

- **`parser.ts`**: Wraps `epub` library, extracts metadata, TOC, chapters, footnotes
- **`paginator.ts`**: Splits chapter content into pages, provides page lookup
- **`types.ts`**: Domain types (`Chapter`, `BookMetadata`, `TOCEntry`, `Footnote`)

**Key Design**: Pure functions; no external dependencies except `epub` library.

#### `src/server/`

**Purpose**: MCP server implementation and session management.

- **`index.ts`**: Server entry point, stdio transport setup, graceful shutdown
- **`book-manager.ts`**: Session lifecycle, thread-safe session access, error handling
- **`tool-registration.ts`**: Tool routing, validation, error conversion to MCP format
- **`types.ts`**: Server-side types (`BookSession`, `SessionId`, all tool I/O types)

**Key Design**: Separates protocol handling from business logic.

#### `src/tools/`

**Purpose**: Individual tool implementations.

- **Pattern**: Each tool exports factory function and handler
- **Dependencies**: Receive `BookManager` via closure, not import
- **Error Handling**: Throw descriptive errors, caught by registration layer

**Example** (`open.ts`):
```typescript
export async function handleOpenBook(
  input: OpenBookInput,
  bookManager: BookManager
): Promise<OpenBookOutput> {
  const session = await bookManager.openBook(input.filePath);
  return {
    sessionId: session.sessionId,
    metadata: session.metadata,
    totalPages: session.metadata.totalPages,
    totalChapters: session.metadata.totalChapters,
  };
}
```

#### `src/utils/validation.ts`

**Purpose**: Centralized input validation.

- **Zod Schemas**: 13 schemas matching tool inputs
- **Type Inference**: `ToolInputSchemas` type maps tool names to schemas
- **Helper Function**: `validateToolInput` for unified validation

## Testing Strategy

### Test Pyramid

```
        ┌─────────────────┐
        │   Integration   │  (10-20%)
        │  Server + EPUB  │
        └─────────┬───────┘
                  │
        ┌─────────▼───────┐
        │     Unit        │  (80-90%)
        │  Isolated logic │
        └─────────────────┘
```

### Unit Tests

**Location**: `tests/unit/`

**Pattern**: AAA (Arrange-Act-Assert)

**Example**:
```typescript
describe('EPUB Parser', () => {
  it('should extract metadata from valid EPUB', async () => {
    // Arrange
    const filePath = './test.epub';
    
    // Act
    const result = await parseEpub(filePath);
    
    // Assert
    expect(result.metadata.title).toBe('Test Book');
    expect(result.toc).toHaveLength(5);
  });
});
```

**Coverage**:
- EPUB parser: Metadata, TOC, chapter extraction, error cases
- Paginator: Page splitting, boundary cases, word counting
- BookManager: Session lifecycle, concurrency, error handling
- Each tool: Input validation, error paths, success cases

### Integration Tests

**Location**: `tests/integration/`

**Scope**:
- Server startup and tool registration
- Full EPUB file processing
- End-to-end tool calls with mocked transport

**Mocking**:
- Filesystem access for EPUB files
- `epub` library for controlled test data
- Transport layer to simulate MCP client

### Test Data

**Real EPUBs**: Small test files with known structure
**Synthetic EPUBs**: Generated content for edge cases
**Mock Objects**: `BookManager` mock for tool testing

## Development Workflow

### Adding a New Tool

1. **Define Types** (`src/server/types.ts`):
   ```typescript
   export interface NewToolInput {
     sessionId: string;
     // ... parameters
   }
   
   export interface NewToolOutput {
     // ... result fields
   }
   ```

2. **Create Schema** (`src/utils/validation.ts`):
   ```typescript
   export const NewToolSchema = z.object({
     sessionId: z.string(),
     // ... parameter validation
   });
   ```

3. **Implement Tool** (`src/tools/new-tool.ts`):
   ```typescript
   export async function handleNewTool(
     input: NewToolInput,
     bookManager: BookManager
   ): Promise<NewToolOutput> {
     // Implementation
   }
   
   export function createNewTool(bookManager: BookManager) {
     return {
       name: 'ebook/new_tool' as const,
       handler: (input: NewToolInput) => handleNewTool(input, bookManager),
     };
   }
   ```

4. **Register Tool** (`src/server/tool-registration.ts`):
   ```typescript
   import { createNewTool } from '../tools/new-tool';
   
   const toolFactories = {
     // ... existing
     'ebook/new_tool': createNewTool,
   };
   ```

5. **Write Tests** (`tests/unit/tools/new-tool.test.ts`):
   - Success cases
   - Error cases
   - Input validation

### Code Quality Standards

Follow `.opencode/context/core/standards/code-quality.md`:

1. **Pure Functions**: No side effects unless necessary
2. **Immutability**: Prefer `const`, avoid mutable state
3. **Single Responsibility**: Each function does one thing
4. **Meaningful Names**: Descriptive variables and functions
5. **Error Handling**: Throw specific errors, handle gracefully

### TypeScript Configuration

- `strict: true` – Maximum type safety
- `noUncheckedIndexedAccess` – Safe array/object access
- `exactOptionalPropertyTypes` – Distinguish undefined from missing
- `module: NodeNext` – ES modules with Node.js resolution

## Error Handling

### Error Hierarchy

```
ApplicationError
├── BookManagerError
│   ├── FileAccessError
│   ├── InvalidEpubError
│   └── SessionNotFoundError
├── ValidationError (from Zod)
└── MCPProtocolError (from SDK)
```

### Error Conversion

Tool registration layer catches errors and converts to MCP error responses:

```typescript
catch (error) {
  return {
    error: {
      code: -32603, // Internal error
      message: error instanceof Error ? error.message : String(error),
    },
  };
}
```

### User-Friendly Messages

- File not found: "EPUB file not found at path: /path/to/book.epub"
- Invalid EPUB: "File is not a valid EPUB: missing container.xml"
- Session expired: "Reading session not found or expired"

## Performance Considerations

### Memory Management

1. **EPUB Parsing**: Parse on open, cache results in session
2. **Chapter Loading**: Load chapter HTML only when needed
3. **Page Cache**: Keep recent pages in memory (configurable)
4. **Session Cleanup**: Close inactive sessions, limit concurrent sessions

### Pagination Optimization

- **Lazy Pagination**: Paginate chapters on first access, not on open
- **Word Counting**: Efficient word count algorithm (split by whitespace)
- **Paragraph Detection**: Simple regex for paragraph boundaries

### Concurrency

- **Node.js Event Loop**: All operations are async/non-blocking
- **Session Isolation**: Each session independent, no shared mutable state
- **Thread Safety**: BookManager uses Map for sessions, atomic operations

## Security Considerations

### Input Validation

1. **File Paths**: Validate EPUB file paths, prevent directory traversal
   - Rejects `../` and `..\\` sequences
   - Requires `.epub` extension + ZIP magic bytes (EPUB is a ZIP archive)
2. **Session IDs**: Cryptographically random, validate before use
3. **Content Sanitization**: EPUB HTML may contain scripts; snippets returned to clients are stripped of HTML
4. **Search Safety**: Search query is length-limited and regex-escaped to reduce ReDoS and regex injection risk

### Resource Limits

1. **File Size**: Reject excessively large EPUB files (configurable limit)
2. **Session Count & Lifetime**: Enforce `maxSessions` and expire sessions after a TTL
3. **Memory Usage**: Monitor and limit memory consumption per session

### Protocol Security

1. **MCP over stdio**: No network exposure, local only
2. **JSON-RPC Validation**: Validate all incoming JSON-RPC messages
3. **Error Information**: Avoid leaking sensitive info in error messages

## Future Improvements

### Planned Features

1. **HTTP Transport**: Support remote MCP clients via HTTP/WebSocket
2. **Bookmarking**: Save and restore reading positions across sessions
3. **Annotations**: Highlight and note-taking within EPUBs
4. **Text-to-Speech**: Integration with TTS services
5. **Format Support**: Additional ebook formats (PDF, MOBI)

### Technical Debt

1. **Configuration System**: Centralized config for pagination, limits, caching
2. **Monitoring**: Metrics and logging for production deployment
3. **Plugin System**: Extensible tool registration for custom features
4. **Performance Profiling**: Benchmark and optimize large EPUB processing

### Integration Opportunities

1. **MCP Resources API**: Expose EPUB content as readable resources
2. **MCP Prompts API**: Pre-built prompts for book analysis
3. **External Services**: Integration with Goodreads, Google Books APIs
4. **Cloud Storage**: Support for EPUB files in S3, Google Drive, etc.

## Related Documentation

- `.opencode/context/core/standards/code-quality.md` – Code quality standards
- `.opencode/context/core/standards/test-coverage.md` – Testing standards
- `.opencode/context/core/workflows/task-delegation-basics.md` – Development workflow
- `README.md` – User-facing documentation
- `package.json` – Dependencies and scripts

## Contributing

See `README.md` for contribution guidelines. Follow the established patterns and ensure all changes include appropriate tests.
