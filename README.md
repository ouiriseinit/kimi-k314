🌀 KimiN8N — Kimi × n8n MCP Extensions (Dual Mode)
All tools execute real API calls. Works with n8n (SSE), Continue.dev (stdio), Claude Desktop (stdio), and Cursor (stdio).
Quick Start
bash
cd kimin8n
npm install
n8n (SSE mode)
bash
npm start
# → http://localhost:3000
Continue.dev / Claude Desktop / Cursor (Stdio mode)
bash
npm run stdio
# → Connects via stdin/stdout
Requires Node.js 18+ (native fetch).
Continue.dev Setup
Add to your Continue.dev config (~/.continue/config.json):
JSON
{
  "servers": [
    {
      "name": "kimin8n",
      "command": "node",
      "args": ["/absolute/path/to/kimin8n/server.js", "--stdio"]
    }
  ]
}
Or use npx if you publish it:
JSON
{
  "servers": [
    {
      "name": "kimin8n",
      "command": "npx",
      "args": ["kimin8n-mcp-server", "--stdio"]
    }
  ]
}
Restart Continue.dev. The KimiN8N tools appear in your tool palette.
Claude Desktop Setup
Add to ~/Library/Application Support/Claude/claude_desktop_config.json (macOS) or %APPDATA%\Claude\claude_desktop_config.json (Windows):
JSON
{
  "mcpServers": {
    "kimin8n": {
      "command": "node",
      "args": ["/absolute/path/to/kimin8n/server.js", "--stdio"]
    }
  }
}
Restart Claude Desktop. The 🌀 icon appears when tools are available.
Cursor Setup
Cursor supports MCP via .cursor/mcp.json in your project root:
JSON
{
  "mcpServers": {
    "kimin8n": {
      "command": "node",
      "args": ["./kimin8n/server.js", "--stdio"]
    }
  }
}
Or in Cursor Settings → MCP → Add Server.
Tools — All Live
Table
Tool	Real Integration	Example Prompt
web_search	DuckDuckGo HTML scrape (no API key)	"Search latest AI news"
web_open_url	Native fetch + HTML→text	"Read https://example.com"
get_data_source	Yahoo Finance, arXiv, World Bank, Binance	"Get AAPL stock price"
memory_read	File-backed .memory.json	"What did I save as 'todo'?"
memory_write	File-backed with optional TTL	"Save 'buy milk' as todo"
execute_code	JS via vm module, Python via python3 spawn	"Calculate fibonacci(20) in JS"
Data Source Examples
Yahoo Finance
JSON
{
  "data_source_name": "yahoo_finance",
  "api_name": "get_historical_stock_prices",
  "params": { "ticker": "NVDA", "interval": "1d", "range": "1mo" }
}
arXiv
JSON
{
  "data_source_name": "arxiv",
  "api_name": "search",
  "params": { "query": "transformer architecture", "max_results": 5 }
}
World Bank
JSON
{
  "data_source_name": "world_bank_open_data",
  "api_name": "indicator",
  "params": { "indicator": "NY.GDP.MKTP.CD", "country": "USA", "per_page": 5 }
}
Binance
JSON
{
  "data_source_name": "binance_crypto",
  "api_name": "ticker_24hr",
  "params": { "symbol": "BTCUSDT" }
}
Code Execution
JavaScript: Runs in isolated vm context with 30s timeout. Has Math, JSON, Date, Array, Object, String, Number, RegExp, Error. No require, no fs, no network.
Python: Spawns python3 -c with 30s timeout. Has full Python stdlib. Use responsibly.
Architecture
plain
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Continue.dev  │      │  Claude Desktop │      │     Cursor      │
│   (stdio MCP)   │      │   (stdio MCP)   │      │   (stdio MCP)   │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │ stdin/stdout
                         ┌────────▼────────┐
                         │  KimiN8N MCP    │
                         │  --stdio mode   │
                         └─────────────────┘

┌─────────────────┐      ┌─────────────────┐
│      n8n        │      │  Custom Client  │
│  (SSE MCP)      │      │   (HTTP/SSE)    │
└────────┬────────┘      └────────┬────────┘
         │                        │
         └────────┬───────────────┘
                  │ HTTP/SSE
         ┌────────▼────────┐
         │  KimiN8N MCP    │
         │   :3000 (SSE)   │
         └────────┬────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
DuckDuckGo   File .memory.json   Yahoo Finance
arXiv API    JS vm / Python      World Bank
             spawn               Binance
Production Hardening
Add API key auth to /sse endpoint
Use Redis instead of .memory.json for multi-instance
Containerize with Docker
For execute_code, consider Docker isolation for Python
DuckDuckGo scraping may break if they change HTML — fallback to Brave Search API with key
Built lean. No Python dependency for the server. Just mesh. 🌒