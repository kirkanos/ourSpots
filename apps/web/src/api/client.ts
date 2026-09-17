export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Wird ausgelöst, wenn die Sitzung abgelaufen ist. */
export class UnauthorizedError extends ApiError {
  constructor() {
    super(401, 'Nicht angemeldet');
    this.name = 'UnauthorizedError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const isForm = options.body instanceof FormData;

  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    // Die Session steckt in einem httpOnly-Cookie; ohne credentials geht sie
    // bei fetch nicht mit.
    credentials: 'same-origin',
    headers: isForm || options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? (options.body as FormData) : options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (payload && typeof payload.message === 'string' && payload.message) ||
      `Die Anfrage ist fehlgeschlagen (${response.status})`;
    throw new ApiError(response.status, message, payload?.issues);
  }

  return payload as T;
}

export function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
