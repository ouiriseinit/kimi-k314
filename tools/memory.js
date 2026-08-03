/**
 * memory_read / memory_write tools — persistent memory for n8n workflows
 */
export const memoryReadTool = {
  name: 'memory_read',
  description: 'Read from persistent memory store (KV cache for n8n workflows).',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Memory key to read' },
    },
    required: ['key'],
  },
};

export const memoryWriteTool = {
  name: 'memory_write',
  description: 'Write to persistent memory store (KV cache for n8n workflows).',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      value: { type: 'string' },
      ttl: { type: 'number', description: 'Time-to-live in seconds (optional)' },
    },
    required: ['key', 'value'],
  },
};

// Simple in-memory store (replace with Redis/DB in production)
const memoryStore = new Map();

export async function handleMemory(mode, args) {
  if (mode === 'read') {
    const val = memoryStore.get(args.key);
    return {
      content: [
        {
          type: 'text',
          text: val !== undefined ? val : `Key "${args.key}" not found.`,
        },
      ],
    };
  }

  if (mode === 'write') {
    memoryStore.set(args.key, args.value);
    if (args.ttl) {
      setTimeout(() => memoryStore.delete(args.key), args.ttl * 1000);
    }
    return {
      content: [
        {
          type: 'text',
          text: `Stored "${args.key}" = ${args.value.substring(0, 100)}${
            args.value.length > 100 ? '...' : ''
          }`,
        },
      ],
    };
  }
}