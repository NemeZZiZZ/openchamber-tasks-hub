// The only way UI code reaches the tasks service: through the host proxy
// (`host.serviceRequest`), which adds the bearer itself — the panel never
// sees a token (ci-hub ui/port.ts pattern).
import type { GuestRequest, HostClient } from '@openchamber/sdk';

export class ServiceError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type Svc = <T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) => Promise<T>;

const parse = (text: string): unknown => {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export const createSvc = (host: Pick<HostClient, 'serviceRequest'>): Svc => {
  return async <T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> => {
    const request: GuestRequest = {
      method,
      path,
      query: {},
      body: body === undefined ? undefined : JSON.stringify(body),
    };
    let response: { status: number; body: string };
    try {
      response = await host.serviceRequest(request);
    } catch (err) {
      throw new ServiceError(0, `Tasks service did not answer (${err instanceof Error ? err.message : String(err)}).`);
    }
    const parsed = parse(response.body);
    if (response.status >= 400) {
      const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      const message =
        typeof record.error === 'string' && record.error
          ? record.error
          : typeof parsed === 'string' && parsed
            ? parsed.slice(0, 300)
            : `Tasks service answered ${response.status}.`;
      throw new ServiceError(response.status, message);
    }
    return parsed as T;
  };
};
