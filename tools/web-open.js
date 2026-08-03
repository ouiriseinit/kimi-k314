/**
 * web_open_url tool — mirrors Kimi's web_open_url capability
 */
export const webOpenTool = {
  name: 'web_open_url',
  description: 'Open and read content from a URL.',
  inputSchema: {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of URLs to fetch',
      },
    },
    required: ['urls'],
  },
};

export async function handleWebOpen(args) {
  const urls = args.urls || [];
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            action: 'WEB_OPEN',
            urls,
            note: 'Route this to n8n HTTP Request node or use n8n-MCP hosted service',
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  };
}