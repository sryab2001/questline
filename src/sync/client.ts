// Minimal PocketBase REST client: only what sync needs.

export class PbError extends Error {
  constructor(
    public status: number,
    public data: unknown,
    message: string,
  ) {
    super(message);
  }
}

/** Thrown when the server can't be reached at all (offline, Tailscale off, wrong URL). */
export class NetworkError extends Error {}

export interface PbRecord {
  id: string;
  updated: string;
  [field: string]: unknown;
}

interface ListResult {
  items: PbRecord[];
  page: number;
  totalPages: number;
}

export interface AuthResult {
  token: string;
  record: { id: string; email: string };
}

const TIMEOUT_MS = 15_000;

export function normalizeServerUrl(url: string) {
  return url.trim().replace(/\/+$/, '');
}

export class PbClient {
  constructor(
    private baseUrl: string,
    private token: string | null = null,
  ) {
    this.baseUrl = normalizeServerUrl(baseUrl);
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}${qs}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { Authorization: this.token } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      throw new NetworkError(e instanceof Error ? e.message : 'Network request failed');
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new PbError(res.status, data?.data ?? data, data?.message ?? `HTTP ${res.status}`);
    }
    return data as T;
  }

  authWithPassword(identity: string, password: string) {
    return this.request<AuthResult>('POST', '/api/collections/users/auth-with-password', { identity, password });
  }

  /** Exchanges the current token for a fresh one (extends the session). */
  authRefresh() {
    return this.request<AuthResult>('POST', '/api/collections/users/auth-refresh');
  }

  list(collection: string, page: number, perPage: number, filter: string) {
    return this.request<ListResult>('GET', `/api/collections/${collection}/records`, undefined, {
      page: String(page),
      perPage: String(perPage),
      filter,
      sort: 'updated,id',
      skipTotal: '0',
    });
  }

  create(collection: string, body: Record<string, unknown>) {
    return this.request<PbRecord>('POST', `/api/collections/${collection}/records`, body);
  }

  update(collection: string, id: string, body: Record<string, unknown>) {
    return this.request<PbRecord>('PATCH', `/api/collections/${collection}/records/${encodeURIComponent(id)}`, body);
  }

  health() {
    return this.request<{ code: number }>('GET', '/api/health');
  }
}
