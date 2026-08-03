/**
 * get_data_source tool — mirrors Kimi's finance/academic/data capabilities
 */
export const dataSourceTool = {
  name: 'get_data_source',
  description:
    'Fetch data from external APIs: yahoo_finance, arxiv, world_bank, binance, scholar, stock_finance, imf, yuandian_law. Call get_data_source_desc first to discover APIs.',
  inputSchema: {
    type: 'object',
    properties: {
      data_source_name: {
        type: 'string',
        enum: [
          'yahoo_finance',
          'arxiv',
          'world_bank_open_data',
          'binance_crypto',
          'scholar',
          'stock_finance_data',
          'imf',
          'yuandian_law',
        ],
      },
      api_name: { type: 'string' },
      params: { type: 'object' },
    },
    required: ['data_source_name', 'api_name'],
  },
};

export async function handleDataSource(args) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            action: 'DATA_SOURCE_FETCH',
            ...args,
            note: 'Route to n8n HTTP Request or custom node. For yahoo_finance use query1.finance.yahoo.com/v8/finance/chart/',
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
  };
}