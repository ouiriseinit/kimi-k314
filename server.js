/**
 * KimiN8N MCP Server — Dual Mode + Plane Tracker (WebSocket)
 * SSE mode:  n8n MCP Client Tool connects via HTTP
 * Stdio mode: Continue.dev, Claude Desktop, Cursor, etc.
 * WS mode:    Real-time plane streaming to browser
 *
 * Usage:
 *   npm start              → SSE + WS mode on :3000
 *   node server.js --stdio → Stdio mode (for Continue.dev/Claude)
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
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
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CONFIG ──────────────────────────────────────────────────────
const MAX_FLIGHTS = 100;
const BOOT_FLIGHTS = 25;
const CACHE_TTL = 15000;
const WS_PUSH_INTERVAL = 2000;

// ── MCP Server Core ─────────────────────────────────────────────
const server = new Server(
  { name: 'kimin8n-server', version: '1.3.0' },
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

// ── Stdio Mode ────────────────────────────────────────────────────
if (USE_STDIO) {
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
  console.error('[KimiN8N] Stdio MCP server running — connected to host');
}

// ── SSE + WebSocket Mode ──────────────────────────────────────────
else {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const PORT = process.env.PORT || 3000;
  const transports = new Map();

  // MCP SSE
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

  // Static files
  app.use(express.static(path.join(__dirname, 'public')));

  // ── PLANE TRACKER: FLIGHT ENGINE ─────────────────────────────
  let flightCache = { data: null, timestamp: 0, source: null };
  const wsClients = new Set();

  // ── 25 Random Planes on Boot ─────────────────────────────────
  const ICAO_ALPHABET = '0123456789abcdef';
  const CALLSIGN_PREFIXES = ['DAL', 'AAL', 'UAL', 'SWA', 'JBU', 'FFT', 'ASA', 'NKS', 'SKW', 'ENY', 'RPA', 'EDV', 'GJS', 'PDT', 'AWI', 'QXE', 'VOI', 'VIV', 'AMX', 'AIJ', 'BAW', 'AFR', 'DLH', 'KLM', 'UAE', 'QTR', 'ETH', 'SIA', 'CPA', 'ANA', 'JAL', 'KAL', 'THA', 'MAS', 'PAL', 'EVA', 'CAL', 'HVN', 'VJC', 'BAV', 'CES', 'CSN', 'CXA', 'CHH', 'DKH', 'EPA', 'FZA', 'GCR', 'GSW', 'HXA', 'LKE'];

  function randomHex(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += ICAO_ALPHABET[Math.floor(Math.random() * 16)];
    return s;
  }

  function randomCallsign() {
    const prefix = CALLSIGN_PREFIXES[Math.floor(Math.random() * CALLSIGN_PREFIXES.length)];
    return `${prefix}${Math.floor(Math.random() * 2999) + 1}`;
  }

  function randomLat() {
    const r = Math.random();
    if (r < 0.4) return 25 + Math.random() * 55;
    if (r < 0.65) return -35 + Math.random() * 30;
    if (r < 0.85) return 10 + Math.random() * 35;
    return -10 + Math.random() * 20;
  }

  function randomLon() { return -180 + Math.random() * 360; }

  function randomAltitude() {
    const r = Math.random();
    if (r < 0.05) return Math.random() * 500;
    if (r < 0.15) return 500 + Math.random() * 2500;
    if (r < 0.85) return 6000 + Math.random() * 6000;
    return 12000 + Math.random() * 3000;
  }

  function randomSpeed(alt) {
    if (alt < 500) return Math.random() * 30;
    if (alt < 3000) return 80 + Math.random() * 120;
    return 200 + Math.random() * 100;
  }

  function randomHeading() { return Math.floor(Math.random() * 360); }

  function randomOrigin() {
    const countries = ['United States', 'China', 'United Kingdom', 'Germany', 'France', 'Japan', 'Canada', 'Australia', 'Brazil', 'India', 'Russia', 'Mexico', 'South Korea', 'Italy', 'Spain', 'Netherlands', 'Turkey', 'Saudi Arabia', 'Switzerland', 'Sweden', 'Poland', 'Belgium', 'Argentina', 'Thailand', 'Indonesia'];
    return countries[Math.floor(Math.random() * countries.length)];
  }

  function generateRandomFlights(count) {
    const flights = [];
    for (let i = 0; i < count; i++) {
      const alt = randomAltitude();
      flights.push({
        icao: randomHex(6),
        callsign: randomCallsign(),
        origin: randomOrigin(),
        lat: randomLat(),
        lon: randomLon(),
        altitude: alt,
        geoAltitude: alt + (Math.random() - 0.5) * 100,
        speed: randomSpeed(alt),
        heading: randomHeading(),
        verticalRate: (Math.random() - 0.5) * 10,
        onGround: alt < 300,
        squawk: Math.floor(Math.random() * 7777).toString().padStart(4, '0'),
        lastContact: Math.floor(Date.now() / 1000),
        source: 'boot',
        _lastLat: null, _lastLon: null, _lastHeading: null, _lastAlt: null
      });
    }
    return flights;
  }

  // Seed cache with boot flights (capped at MAX_FLIGHTS)
  const bootFlights = generateRandomFlights(BOOT_FLIGHTS);
  flightCache = {
    data: { flights: bootFlights.slice(0, MAX_FLIGHTS), source: 'boot', timestamp: Date.now() },
    timestamp: Date.now(),
    source: 'boot'
  };
  console.log(`[PlaneTracker] Seeded ${Math.min(BOOT_FLIGHTS, MAX_FLIGHTS)} random flights on boot (cap: ${MAX_FLIGHTS})`);

  // ── API FETCHING ─────────────────────────────────────────────
  async function fetchOpenSky() {
    try {
      const res = await fetch('https://opensky-network.org/api/states/all');
      if (!res.ok) throw new Error(`OpenSky ${res.status}`);
      const data = await res.json();
      return { flights: parseOpenSky(data), source: 'opensky', timestamp: Date.now() };
    } catch (e) { console.log('OpenSky failed:', e.message); return null; }
  }

  async function fetchAdsbFi() {
    try {
      const res = await fetch('https://api.adsb.fi/v2/lat/39.0/lon/-98.5/dist/2500');
      if (!res.ok) throw new Error(`adsb.fi ${res.status}`);
      const data = await res.json();
      return { flights: parseAdsbFi(data), source: 'adsb.fi', timestamp: Date.now() };
    } catch (e) { console.log('adsb.fi failed:', e.message); return null; }
  }

  function parseOpenSky(data) {
    if (!data.states) return [];
    return data.states.map(s => ({
      icao: s[0], callsign: (s[1] || '').trim(), origin: s[2],
      lat: s[6], lon: s[5], altitude: s[7], geoAltitude: s[13],
      speed: s[9], heading: s[10], verticalRate: s[11],
      onGround: s[8], squawk: s[14], lastContact: s[4], source: 'opensky',
      _lastLat: s[6], _lastLon: s[5], _lastHeading: s[10], _lastAlt: s[7]
    })).filter(f => f.lat !== null && f.lon !== null);
  }

  function parseAdsbFi(data) {
    if (!data.ac) return [];
    return data.ac.map(a => ({
      icao: a.hex, callsign: a.flight || '', origin: a.t || '',
      lat: a.lat, lon: a.lon,
      altitude: a.alt_baro ? a.alt_baro * 0.3048 : null,
      geoAltitude: a.alt_geom ? a.alt_geom * 0.3048 : null,
      speed: a.gs ? a.gs * 0.514444 : null,
      heading: a.track,
      verticalRate: a.baro_rate ? a.baro_rate * 0.00508 : null,
      onGround: a.alt_baro === 'ground',
      squawk: a.squawk, lastContact: Math.floor(Date.now() / 1000), source: 'adsb.fi',
      _lastLat: a.lat, _lastLon: a.lon, _lastHeading: a.track, _lastAlt: a.alt_baro ? a.alt_baro * 0.3048 : null
    })).filter(f => f.lat !== null && f.lon !== null);
  }

  // Priority: real flights first, then boot, capped at MAX_FLIGHTS
  function prioritizeFlights(bootFlights, realFlights) {
    const realIcaos = new Set(realFlights.map(f => f.icao));
    const keptBoot = bootFlights.filter(f => !realIcaos.has(f.icao));
    const combined = [...realFlights, ...keptBoot];
    return combined.slice(0, MAX_FLIGHTS);
  }

  async function refreshFlights() {
    const result = await fetchOpenSky() || await fetchAdsbFi();
    if (result) {
      const existingBoot = flightCache.data?.flights?.filter(f => f.source === 'boot') || [];
      result.flights = prioritizeFlights(existingBoot, result.flights);
      flightCache = result;
      console.log(`[PlaneTracker] ${result.flights.length} flights sent (cap: ${MAX_FLIGHTS}) from ${result.source}`);
      broadcast({ type: 'snapshot', flights: result.flights, source: result.source });
    }
  }

  // ── INTERPOLATION ENGINE ─────────────────────────────────────
  function interpolateAndBroadcast() {
    if (!flightCache.data || !flightCache.data.flights) return;
    const now = Date.now();
    const elapsed = (now - flightCache.timestamp) / 1000;
    const flights = flightCache.data.flights.map(f => {
      if (f._lastLat === null || f._lastLon === null) return f;
      const speedMs = (f.speed || 250) * elapsed;
      const distDeg = speedMs / 111320;
      const headingRad = ((f.heading || 0)) * Math.PI / 180;
      return {
        ...f,
        _interpolatedLat: f.lat + Math.cos(headingRad) * distDeg,
        _interpolatedLon: f.lon + Math.sin(headingRad) * distDeg,
        _interpolatedAlt: f.altitude + (f.verticalRate || 0) * elapsed
      };
    });

    broadcast({
      type: 'update',
      flights: flights.map(f => ({
        icao: f.icao,
        callsign: f.callsign,
        origin: f.origin,
        lat: f._interpolatedLat !== undefined ? f._interpolatedLat : f.lat,
        lon: f._interpolatedLon !== undefined ? f._interpolatedLon : f.lon,
        altitude: f._interpolatedAlt !== undefined ? f._interpolatedAlt : f.altitude,
        speed: f.speed,
        heading: f.heading,
        verticalRate: f.verticalRate,
        onGround: f.onGround,
        squawk: f.squawk,
        source: f.source
      })),
      source: flightCache.source,
      interpolated: true
    });
  }

  function broadcast(msg) {
    const json = JSON.stringify(msg);
    wsClients.forEach(ws => {
      if (ws.readyState === 1) ws.send(json);
    });
  }

  // ── WEBSOCKET SETUP ──────────────────────────────────────────
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/flights' });

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log(`[PlaneTracker] WS client connected (${wsClients.size} total)`);
    if (flightCache.data) {
      ws.send(JSON.stringify({
        type: 'snapshot',
        flights: flightCache.data.flights,
        source: flightCache.source
      }));
    }
    ws.on('close', () => {
      wsClients.delete(ws);
      console.log(`[PlaneTracker] WS client disconnected (${wsClients.size} total)`);
    });
    ws.on('error', (err) => {
      console.log('[PlaneTracker] WS error:', err.message);
      wsClients.delete(ws);
    });
  });

  // ── SCHEDULERS ───────────────────────────────────────────────
  setInterval(refreshFlights, CACHE_TTL);
  setInterval(interpolateAndBroadcast, WS_PUSH_INTERVAL);
  setTimeout(refreshFlights, 3000);

  // ── REST API (fallback, capped) ──────────────────────────────
  app.get('/api/flights', async (req, res) => {
    const flights = flightCache.data?.flights || [];
    res.json({
      count: flights.length,
      source: flightCache.source,
      cached: Date.now() - flightCache.timestamp,
      flights: flights.slice(0, MAX_FLIGHTS)
    });
  });

  app.get('/api/flights/:icao', async (req, res) => {
    const flights = flightCache.data?.flights || [];
    const f = flights.find(f => f.icao.toLowerCase() === req.params.icao.toLowerCase());
    if (!f) return res.status(404).json({ error: 'Not found' });
    res.json({ flight: f, source: flightCache.source, cached: Date.now() - flightCache.timestamp });
  });

  app.get('/api/stats', async (req, res) => {
    const flights = flightCache.data?.flights || [];
    const alts = flights.map(f => f.altitude).filter(a => a !== null);
    const speeds = flights.map(f => f.speed).filter(s => s !== null);
    res.json({
      total: flights.length,
      source: flightCache.source,
      cached: Date.now() - flightCache.timestamp,
      onGround: flights.filter(f => f.onGround).length,
      avgAltitude: alts.length ? Math.round(alts.reduce((a,b) => a+b, 0) / alts.length) : null,
      avgSpeed: speeds.length ? Math.round(speeds.reduce((a,b) => a+b, 0) / speeds.length) : null,
      topOrigins: Object.entries(flights.reduce((a,f) => { a[f.origin] = (a[f.origin] || 0) + 1; return a; }, {})).sort((a,b) => b[1] - a[1]).slice(0, 10)
    });
  });

  app.get('/', (req, res) => {
    res.json({
      name: 'KimiN8N MCP Server + Plane Tracker (WebSocket)',
      version: '1.3.0',
      mode: 'sse+ws',
      tools: ALL_TOOLS.map((t) => t.name),
      planeTracker: true,
      maxFlights: MAX_FLIGHTS,
      wsEndpoint: `ws://localhost:${PORT}/flights`,
      endpoints: ['/api/flights', '/api/flights/:icao', '/api/stats', '/sse', '/messages', '/flights'],
      status: 'running',
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      planeTracker: true,
      wsClients: wsClients.size,
      maxFlights: MAX_FLIGHTS,
      currentFlights: flightCache.data?.flights?.length || 0
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`🌀 KimiN8N MCP Server + Plane Tracker (WS) on http://localhost:${PORT}`);
    console.log(`   Max flights:   ${MAX_FLIGHTS}`);
    console.log(`   SSE endpoint:  http://localhost:${PORT}/sse`);
    console.log(`   WS endpoint:   ws://localhost:${PORT}/flights`);
    console.log(`   Messages:      http://localhost:${PORT}/messages?sessionId=<id>`);
    console.log(`   Plane Tracker: http://localhost:${PORT}/`);
    console.log(`   For Continue.dev/Claude: node server.js --stdio`);
  });
}