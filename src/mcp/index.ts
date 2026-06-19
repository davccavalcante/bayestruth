/**
 * MCP client interception.
 *
 * Wrap a Model Context Protocol client so every `callTool` invocation is scored as a Bernoulli trial
 * under a per-tool subject. A tool result carrying `isError: true` counts as a failure even though the
 * call resolved, which is exactly how the MCP protocol signals a tool-level error; a thrown call is a
 * failure too. The client is duck-typed (anything with a `callTool` method works), and the wrapper is
 * a transparent Proxy that leaves every other method untouched. This is how BayesTruth builds calibrated
 * reputation for MCP servers, the trust surface the NSA MCP security guidance asks operators to track.
 *
 * @packageDocumentation
 */

import { BayesTruthError } from '../errors.js';
import { type OutcomeSink, observe } from '../interceptors/index.js';
import type { Clock } from '../types.js';

export type { OutcomeSink } from '../interceptors/index.js';

/** The minimal shape of an MCP tool result BayesTruth inspects. */
export interface McpToolResult {
  readonly isError?: boolean;
  readonly content?: unknown;
}

/** The parameters of an MCP `callTool` invocation. */
export interface McpCallParams {
  readonly name: string;
  readonly arguments?: Readonly<Record<string, unknown>>;
}

/** The minimal duck-typed surface of an MCP client. */
export interface McpClientLike {
  callTool(params: McpCallParams, ...rest: unknown[]): Promise<McpToolResult>;
}

/** Options for {@link interceptMcpClient}. */
export interface InterceptMcpOptions {
  /** Where observations are delivered, typically a BayesTruth instance's sink. */
  readonly sink: OutcomeSink;
  readonly clock?: Clock;
  /** Subject prefix for each tool, so MCP tools do not collide with other subjects. Default `mcp:`. */
  readonly subjectPrefix?: string;
  /** Decide success from a result. Default: any result without `isError === true` is a success. */
  readonly isSuccess?: (result: McpToolResult) => boolean;
}

const DEFAULT_PREFIX = 'mcp:';

/**
 * Return a transparent wrapper around an MCP client that observes every `callTool` invocation.
 *
 * @throws {@link BayesTruthError} with code `ERR_INVALID_INPUT` when the client has no `callTool`.
 */
export function interceptMcpClient<C extends McpClientLike>(
  client: C,
  options: InterceptMcpOptions,
): C {
  if (typeof client?.callTool !== 'function') {
    throw new BayesTruthError('ERR_INVALID_INPUT', 'MCP client must expose a callTool method');
  }
  const prefix = options.subjectPrefix ?? DEFAULT_PREFIX;
  const classify = options.isSuccess ?? ((result: McpToolResult) => result?.isError !== true);
  const original = client.callTool.bind(client);

  const patched = (params: McpCallParams, ...rest: unknown[]): Promise<McpToolResult> => {
    const name = typeof params?.name === 'string' ? params.name : 'unknown';
    return observe<McpToolResult>(`${prefix}${name}`, () => original(params, ...rest), {
      sink: options.sink,
      isSuccess: classify,
      ...(options.clock !== undefined ? { clock: options.clock } : {}),
    });
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'callTool') {
        return patched;
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
