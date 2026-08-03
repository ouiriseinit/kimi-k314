/**
 * execute_code tool — run JS/Python in isolated environment
 */
export const codeRunTool = {
  name: 'execute_code',
  description:
    'Execute code for computation, data analysis, or charts. Supports JavaScript and Python.',
  inputSchema: {
    type: 'object',
    properties: {
      language: { type: 'string', enum: ['javascript', 'python'] },
      code: { type: 'string', description: 'Code to execute' },
      restart: { type: 'boolean', description: 'Restart environment (optional)' },
    },
    required: ['language', 'code'],
  },
};

export async function handleCodeRun(args) {
  // In production, sandbox this (vm2, isolated-vm, or Docker)
  // For n8n integration, route to n8n Code node or external sandbox
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            action: 'CODE_EXECUTION',
            language: args.language,
            code: args.code,
            note:
              'Route to n8n Code node for JS, or spawn Python process in Docker for safety',
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  };
}