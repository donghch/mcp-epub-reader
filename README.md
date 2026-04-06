# EPUB Reader MCP Server

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![MCP Version](https://img.shields.io/badge/MCP-2025--11--25-blue)](https://modelcontextprotocol.io/specification)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-green)](https://nodejs.org/)

> A Model Context Protocol (MCP) server that acts as a "Kindle for AI agents," exposing EPUB file content through standard MCP protocol operations and the Tools API.

## Overview

The EPUB Reader MCP server provides AI agents with the ability to read and navigate EPUB files. It implements the Model Context Protocol (MCP) to expose 13 tools, and now follows the standard MCP handshake/discovery flow so clients like OpenClaw can initialize, list tools, and call them normally.

### Features

- **Open EPUB files**: Validate and parse EPUB files, create reading sessions
- **Navigate content**: Move forward/backward through pages, jump to specific pages or chapters
- **Discover content**: View table of contents, metadata, and chapter summaries
- **Search functionality**: Full-text search across chapters with context
- **Reference tools**: Resolve footnote references, get reading position
- **Session management**: List open books, close sessions, manage resources

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [npm](https://www.npmjs.com/) or compatible package manager
- EPUB files to read (`.epub` format)

## Installation

### From Source

```bash
git clone https://github.com/your-username/mcp-epub-reader.git
cd mcp-epub-reader
npm install
npm run build
```

## Usage

### Running the Server

The server uses stdio transport, making it ideal for local MCP clients (including OpenClaw).

#### stdio (Local Integration)

For integration with OpenClaw or other MCP clients:

```bash
node build/index.js
```

The server communicates via stdin/stdout using the MCP JSON-RPC protocol and supports standard MCP operations like initialization, `tools/list`, `tools/call`, and `ping`.

### Configuration

#### OpenClaw Quick Start (recommended)

OpenClaw can connect to MCP servers over **stdio**. Add this server in OpenClaw’s MCP settings (exact location may vary). Tool discovery now works through standard MCP `tools/list`, so no custom wiring is needed.

**Example (stdio):**

```json
{
  "command": "node",
  "args": ["/absolute/path/to/mcp-epub-reader/build/index.js"]
}
```

Then use the tools like this:

1) **Open an EPUB**

```json
{
  "method": "tools/call",
  "params": {
    "name": "ebook/open",
    "arguments": {
      "filePath": "/path/to/book.epub",
      "autoNavigate": true
    }
  }
}
```

2) **Navigate**

```json
{
  "method": "tools/call",
  "params": {
    "name": "ebook/navigate_next",
    "arguments": {
      "sessionId": "<sessionId>"
    }
  }
}
```

3) **Search**

```json
{
  "method": "tools/call",
  "params": {
    "name": "ebook/search",
    "arguments": {
      "sessionId": "<sessionId>",
      "query": "adventure",
      "limit": 10,
      "contextWindow": 80
    }
  }
}
```

#### Security notes

This server validates `filePath` (prevents traversal), validates EPUB type (requires `.epub` + ZIP magic bytes), wraps the callback-based EPUB chapter API safely, and strips HTML from search snippets.

#### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `LOG_LEVEL` | Logging level (`error`, `warn`, `info`, `debug`) | No | `info` |

## Tools Reference

Tools are published through MCP discovery, so clients can enumerate them automatically before calling them.

The server provides 13 tools for EPUB file interaction:

| Tool | Description | Input Parameters |
|------|-------------|------------------|
| `ebook/open` | Open an EPUB file and create a reading session | `filePath: string`, `autoNavigate?: boolean` |
| `ebook/close` | Close a reading session and release resources | `sessionId: string` |
| `ebook/list_open_books` | List all currently open EPUB sessions | (none) |
| `ebook/navigate_next` | Move to the next page in the current session | `sessionId: string` |
| `ebook/navigate_previous` | Move to the previous page in the current session | `sessionId: string` |
| `ebook/jump_to_page` | Jump to a specific page number | `sessionId: string`, `page: number` |
| `ebook/jump_to_chapter` | Jump to a specific chapter | `sessionId: string`, `chapterId: string` |
| `ebook/get_position` | Get current reading position and progress | `sessionId: string` |
| `ebook/search` | Search across all chapters for text | `sessionId: string`, `query: string`, `caseSensitive?: boolean`, `limit?: number`, `contextWindow?: number` |
| `ebook/get_toc` | Get hierarchical table of contents | `sessionId: string` |
| `ebook/get_metadata` | Get EPUB metadata (title, author, publisher, etc.) | `sessionId: string` |
| `ebook/get_footnote` | Resolve a footnote reference by ID | `sessionId: string`, `footnoteId: string` |
| `ebook/get_chapter_summary` | Get a summary of the current chapter | `sessionId: string`, `maxSentences?: number` |

### Tool Details

#### `ebook/open`

Opens an EPUB file, parses its content, creates a reading session, and returns metadata.

**Input Schema**:
```typescript
{
  filePath: string;      // Absolute or relative path to EPUB file
  autoNavigate?: boolean; // Whether to auto-navigate to first page (default: false)
}
```

**Example Request**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "ebook/open",
    "arguments": {
      "filePath": "/path/to/book.epub",
      "autoNavigate": true
    }
  }
}
```

**Example Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"sessionId\":\"sess_123\",\"metadata\":{\"title\":\"Sample Book\",\"author\":\"Author Name\",\"totalPages\":250,\"totalChapters\":12}}"
      }
    ]
  }
}
```

#### `ebook/close`

Closes a reading session and releases associated resources.

**Input Schema**:
```typescript
{
  sessionId: string;  // Session ID returned by ebook/open
}
```

#### `ebook/list_open_books`

Lists all currently active reading sessions.

**Input Schema**: (none)

**Example Response**:
```json
{
  "sessions": [
    {
      "sessionId": "sess_123",
      "filePath": "/path/to/book.epub",
      "metadata": {
        "title": "Sample Book",
        "author": "Author Name",
        "currentPage": 42,
        "totalPages": 250
      }
    }
  ]
}
```

#### `ebook/navigate_next` and `ebook/navigate_previous`

Navigate forward or backward through pages.

**Input Schema**:
```typescript
{
  sessionId: string;
}
```

**Example Response**:
```json
{
  "sessionId": "sess_123",
  "currentPage": 43,
  "content": "Page content here...",
  "chapterTitle": "Chapter 3: The Adventure Begins"
}
```

#### `ebook/jump_to_page`

Jump to a specific page number.

**Input Schema**:
```typescript
{
  sessionId: string;
  page: number;  // 1-based page number
}
```

#### `ebook/jump_to_chapter`

Jump to a specific chapter by `chapterId` (from the EPUB flow entry).

**Input Schema**:
```typescript
{
  sessionId: string;
  chapterId: string;  // Chapter identifier from EPUB flow
}
```

#### `ebook/get_position`

Get current reading position and progress statistics.

**Example Response**:
```json
{
  "sessionId": "sess_123",
  "currentPage": 42,
  "totalPages": 250,
  "progress": 0.168,
  "chapterTitle": "Chapter 3: The Adventure Begins",
  "chapterIndex": 3
}
```

#### `ebook/search`

Search across all chapters for text, with optional context words.

**Input Schema**:
```typescript
{
  sessionId: string;
  query: string;
  caseSensitive?: boolean;
  limit?: number;
  contextWindow?: number;
}
```

**Example Response**:
```json
{
  "sessionId": "sess_123",
  "query": "adventure",
  "matches": [
    {
      "chapterIndex": 3,
      "chapterTitle": "Chapter 3: The Adventure Begins",
      "pageNumber": 42,
      "context": "...the great adventure began when...",
      "position": 1250
    }
  ],
  "totalMatches": 1
}
```

#### `ebook/get_toc`

Get hierarchical table of contents.

**Example Response**:
```json
{
  "sessionId": "sess_123",
  "toc": [
    {
      "title": "Chapter 1: Introduction",
      "level": 1,
      "pageNumber": 1,
      "children": []
    },
    {
      "title": "Part I: The Beginning",
      "level": 1,
      "pageNumber": 10,
      "children": [
        {
          "title": "Chapter 2: First Steps",
          "level": 2,
          "pageNumber": 12,
          "children": []
        }
      ]
    }
  ]
}
```

#### `ebook/get_metadata`

Get complete EPUB metadata.

**Example Response**:
```json
{
  "sessionId": "sess_123",
  "metadata": {
    "title": "Sample Book",
    "author": "Author Name",
    "publisher": "Publisher Name",
    "description": "Book description...",
    "language": "en",
    "publishedDate": "2023-01-01",
    "totalPages": 250,
    "totalChapters": 12
  }
}
```

#### `ebook/get_footnote`

Resolve a footnote reference by ID.

**Input Schema**:
```typescript
{
  sessionId: string;
  footnoteId: string;  // Footnote reference ID (e.g., "fn1")
}
```

**Example Response**:
```json
{
  "sessionId": "sess_123",
  "footnoteId": "fn1",
  "content": "Footnote content here...",
  "referencingPage": 42
}
```

#### `ebook/get_chapter_summary`

Get a summary of the current chapter using key sentence extraction.

**Input Schema**:
```typescript
{
  sessionId: string;
  maxSentences?: number;  // Maximum sentences in summary (default: 3)
}
```

**Example Response**:
```json
{
  "sessionId": "sess_123",
  "chapterTitle": "Chapter 3: The Adventure Begins",
  "summary": [
    "The protagonist begins their journey.",
    "They encounter their first challenge.",
    "A mysterious figure offers guidance."
  ]
}
```

## Development

### Project Structure

```
mcp-epub-reader/
├── src/
│   ├── epub/                    # EPUB domain logic
│   │   ├── parser.ts           # EPUB parsing and metadata extraction
│   │   ├── paginator.ts        # Page splitting and content retrieval
│   │   └── types.ts            # EPUB domain types
│   ├── server/                 # MCP server implementation
│   │   ├── index.ts           # Server entry point (stdio transport)
│   │   ├── book-manager.ts    # Session lifecycle management
│   │   ├── tool-registration.ts # Tool registration and routing
│   │   └── types.ts           # Server-side types
│   ├── tools/                  # All 13 tool implementations
│   │   ├── open.ts            # ebook/open tool
│   │   ├── close.ts           # ebook/close tool
│   │   ├── list-books.ts      # ebook/list_open_books tool
│   │   ├── navigate.ts        # Navigation tools (next/previous)
│   │   ├── jump.ts            # Jump tools (page/chapter)
│   │   ├── position.ts        # ebook/get_position tool
│   │   ├── search.ts          # ebook/search tool
│   │   ├── toc.ts             # ebook/get_toc tool
│   │   ├── metadata.ts        # ebook/get_metadata tool
│   │   ├── footnote.ts        # ebook/get_footnote tool
│   │   └── summary.ts         # ebook/get_chapter_summary tool
│   └── utils/                  # Shared utilities
│       └── validation.ts      # Zod schemas and input validation
├── tests/                      # Test suites
│   ├── unit/                  # Unit tests
│   └── integration/           # Integration tests
├── package.json
├── tsconfig.json
└── jest.config.js
```

### Building from Source

```bash
# Install dependencies
npm install

# Build the project (TypeScript → JavaScript)
npm run build

# Output goes to `build/` directory
```

### Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/unit/epub/parser.test.ts
```

### Adding a New Tool

1. Create a new file in `src/tools/` with the tool implementation:

```typescript
// src/tools/example.ts
import { BookManager } from '../server/book-manager';
import { ExampleToolInput, ExampleToolOutput } from '../server/types';

export async function handleExampleTool(
  input: ExampleToolInput,
  bookManager: BookManager
): Promise<ExampleToolOutput> {
  // Tool implementation
  return { result: 'success' };
}

export function createExampleTool(bookManager: BookManager) {
  return {
    name: 'ebook/example' as const,
    handler: (input: ExampleToolInput) => handleExampleTool(input, bookManager),
  };
}
```

2. Add Zod schema in `src/utils/validation.ts`:

```typescript
export const ExampleToolSchema = z.object({
  sessionId: z.string(),
  // ... other parameters
});
```

3. Import and register in `src/server/tool-registration.ts`:

```typescript
import { createExampleTool } from '../tools/example';

const toolFactories = {
  // ... existing tools
  'ebook/example': createExampleTool,
};
```

## Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-username/mcp-epub-reader.git
cd mcp-epub-reader

# Install dependencies
npm install

# Set up environment
cp .env.example .env  # if applicable

# Run development server with watch mode
npm run dev
```

### Code Standards

- Follow TypeScript best practices with strict typing
- Write pure functions with immutability where possible
- Use dependency injection for testability
- Include comprehensive unit tests (AAA pattern)
- Document public APIs and complex logic

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgements

- [Model Context Protocol](https://modelcontextprotocol.io) for the protocol specification
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) for the SDK
- [epub library](https://github.com/julien-c/epub) for EPUB parsing
- [OpenAgents](https://github.com/openagents) for development standards and workflows

## References

- [MCP Specification](https://spec.modelcontextprotocol.io)
- [MCP Documentation](https://modelcontextprotocol.io)
- [TypeScript SDK Documentation](https://ts.sdk.modelcontextprotocol.io)
- [MCP client setup (stdio)](https://modelcontextprotocol.io/quickstart/user)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

**Note**: This server is designed for use with MCP clients (e.g., OpenClaw). It provides AI agents with EPUB reading capabilities while maintaining session isolation and resource management.
