export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * A workspace's API, called with a session. A hosted workspace's session lasts an hour, so the
 * owner of this object can give it `renew`: when the workspace refuses the session the request
 * is made again, once, with the new one. Everyone who holds this object sees the new token.
 */
export class MuseApi {
  /** Asked for a new session when the workspace refuses this one; resolves with its token, or null if there is none. */
  renew?: () => Promise<string | null>;
  private renewing: Promise<string | null> | null = null;
  constructor(
    public token: string,
    readonly baseUrl: string,
  ) {}

  private send(path: string, body: unknown, method?: string) {
    return fetch(`${this.baseUrl}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined || body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  /** One renewal at a time, however many requests were refused together. */
  private renewToken(): Promise<string | null> {
    if (!this.renewing) {
      const renewal = this.renew ? this.renew() : Promise.resolve(null);
      this.renewing = renewal
        .then((token) => {
          if (token) this.token = token;
          return token;
        })
        .catch(() => null)
        .finally(() => {
          this.renewing = null;
        });
    }
    return this.renewing;
  }

  async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    let response = await this.send(path, body, method);
    // The request was turned away before anything was done, so making it again is safe.
    if (response.status === 401 && this.renew && (await this.renewToken()))
      response = await this.send(path, body, method);
    const payload = await response.json();
    if (!response.ok)
      throw new ApiError(
        typeof payload.error === "string" ? payload.error : `Request failed (${response.status})`,
        response.status,
      );
    return payload;
  }

  url(path: string) {
    return path.startsWith("http") ? path : `${this.baseUrl}${path}`;
  }
}
