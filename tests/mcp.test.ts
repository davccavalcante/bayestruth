import { describe, expect, it } from 'vitest';
import { isBayesTruthError } from '../src/errors.js';
import type { Observation } from '../src/interceptors/index.js';
import { interceptMcpClient, type McpToolResult } from '../src/mcp/index.js';

function collector() {
  const seen: Observation[] = [];
  return { seen, sink: (o: Observation) => seen.push(o) };
}

describe('interceptMcpClient', () => {
  it('throws when the client has no callTool method', () => {
    try {
      interceptMcpClient({} as never, { sink: () => {} });
      throw new Error('expected throw');
    } catch (error) {
      expect(isBayesTruthError(error)).toBe(true);
      if (isBayesTruthError(error)) {
        expect(error.code).toBe('ERR_INVALID_INPUT');
      }
    }
  });

  it('scores a clean result as success under a per-tool subject', async () => {
    const { seen, sink } = collector();
    const client = {
      callTool: async ({ name }: { name: string }): Promise<McpToolResult> => ({ content: name }),
    };
    const wrapped = interceptMcpClient(client, { sink });
    const result = await wrapped.callTool({ name: 'search' });
    expect(result.content).toBe('search');
    expect(seen[0]).toMatchObject({ subject: 'mcp:search', outcome: 'success' });
  });

  it('scores an isError result as failure without throwing', async () => {
    const { seen, sink } = collector();
    const client = {
      callTool: async (_params: { name: string }): Promise<McpToolResult> => ({ isError: true }),
    };
    const wrapped = interceptMcpClient(client, { sink });
    await wrapped.callTool({ name: 'broken' });
    expect(seen[0]?.outcome).toBe('failure');
  });

  it('scores a thrown call as failure and rethrows', async () => {
    const { seen, sink } = collector();
    const client = {
      callTool: async (_params: { name: string }): Promise<McpToolResult> => {
        throw new Error('network');
      },
    };
    const wrapped = interceptMcpClient(client, { sink });
    await expect(wrapped.callTool({ name: 'down' })).rejects.toThrow('network');
    expect(seen[0]?.outcome).toBe('failure');
  });

  it('honors a custom prefix and success classifier', async () => {
    const { seen, sink } = collector();
    const client = {
      callTool: async (_params: { name: string }): Promise<McpToolResult> => ({
        content: 'partial',
      }),
    };
    const wrapped = interceptMcpClient(client, {
      sink,
      subjectPrefix: 'tool/',
      isSuccess: () => false,
    });
    await wrapped.callTool({ name: 'x' });
    expect(seen[0]).toMatchObject({ subject: 'tool/x', outcome: 'failure' });
  });

  it('passes through other client members transparently', async () => {
    const client = {
      label: 'primary',
      ping: () => 'pong',
      callTool: async (): Promise<McpToolResult> => ({ content: 'ok' }),
    };
    const wrapped = interceptMcpClient(client, { sink: () => {} });
    expect(wrapped.label).toBe('primary');
    expect(wrapped.ping()).toBe('pong');
  });
});
