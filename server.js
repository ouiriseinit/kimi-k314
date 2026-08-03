/**
 * KimiN8N MCP Server — Dual Mode
 * SSE mode:  n8n MCP Client Tool connects via HTTP
 * Stdio mode: Continue.dev, Claude Desktop, Cursor, etc.
 *
 * Usage:
 *   npm start              → SSE mode on :3000
 *   node server.js --stdio → Stdio mode (for Continue.dev/Claude)
 */

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { webSearchTool, handleWebSearch } from './tools/web-search.js';
import { webOpenTool, handleWebOpen } from './tools/web-open.js';
import { dataSourceTool, handleDataSource } from './tools/data-source.js';
import { memoryReadTool, memoryWriteTool, handleMemory } from './tools/memory.js';
import { codeRunTool, handleCodeRun } from './tools/code-runner.js';

const USE_STDIO = process.argv.includes('--stdio');

// ── MCP Server Core ───────────────────────────────────────────────
const server = new Server(
  { name: 'kimin8n-server', version: '1.1.0' },
  { capabilities: { tools: {} } }
);

const ALL_TOOLS = [
  webSearchTool,
  webOpenTool,
  dataSourceTool,
  memoryReadTool,
  memoryWriteTool,
  codeRunTool,
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (!USE_STDIO) console.log(`[KimiN8N] Tool called: ${name}`, args);

  try {
    switch (name) {
      case 'web_search': return await handleWebSearch(args);
      case 'web_open_url': return await handleWebOpen(args);
      case 'get_data_source': return await handleDataSource(args);
      case 'memory_read': return await handleMemory('read', args);
      case 'memory_write': return await handleMemory('write', args);
      case 'execute_code': return await handleCodeRun(args);
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ── Stdio Mode (Continue.dev / Claude Desktop / Cursor) ───────────
if (USE_STDIO) {
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  console.error('[KimiN8N] Stdio MCP server running — connected to host');
}

// ── SSE Mode (n8n / custom HTTP clients) ──────────────────────────
else {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const PORT = process.env.PORT || 3000;
  const transports = new Map();

  app.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    transports.set(transport.sessionId, transport);
    console.log(`[KimiN8N] SSE connect: ${transport.sessionId}`);

    res.on('close', () => {
      transports.delete(transport.sessionId);
      console.log(`[KimiN8N] SSE disconnect: ${transport.sessionId}`);
    });

    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(400).json({ error: 'Invalid sessionId' });
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  app.get('/', (req, res) => {
    res.json({
      name: 'KimiN8N MCP Server',
      version: '1.1.0',
      mode: 'sse',
      tools: ALL_TOOLS.map((t) => t.name),
      status: 'running',
    });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.listen(PORT, () => {
    console.log(`🌀 KimiN8N MCP Server running on http://localhost:${PORT}`);
    console.log(`   SSE endpoint: http://localhost:${PORT}/sse`);
    console.log(`   Messages:     http://localhost:${PORT}/messages?sessionId=<id>`);
    console.log(`   For Continue.dev/Claude: node server.js --stdio`);
  });
}