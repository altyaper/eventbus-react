import type { EventbusEvent } from "./types";

export type { EventbusEvent } from "./types";

export interface PublisherOptions {
  /** The eventbus base URL, e.g. `https://eventbus.example.com`. */
  url: string;
  /** The application's client ID, from its Credentials page. */
  clientId: string;
  /** The application's client secret. Never ship this to a browser. */
  clientSecret: string;
  /** A `fetch` implementation; defaults to the global one. */
  fetch?: typeof fetch;
}

export interface Publisher {
  /**
   * Publishes `payload` (a JSON object) to `topic` and resolves with the
   * event as broadcast.
   * The topic must belong to the application (`<app-slug>.<anything>`).
   */
  publish<T extends object = Record<string, unknown>>(topic: string, payload: T): Promise<EventbusEvent<T>>;
}

export class EventbusPublishError extends Error {
  constructor(
    message: string,
    /** The HTTP status: 401 bad credentials, 403 another app's topic, 422 invalid name. */
    readonly status: number,
  ) {
    super(message);
    this.name = "EventbusPublishError";
  }
}

/**
 * Publishes events with an application's credentials. For servers only
 * (Node, edge functions, route handlers): the secret would leak if this ran
 * in a browser.
 */
export function createPublisher({
  url,
  clientId,
  clientSecret,
  fetch: fetchImpl = globalThis.fetch,
}: PublisherOptions): Publisher {
  const base = url.replace(/\/+$/, "");
  const authorization = `Basic ${btoa(`${clientId}:${clientSecret}`)}`;

  return {
    async publish<T extends object>(topic: string, payload: T) {
      const response = await fetchImpl(`${base}/api/topics/${encodeURIComponent(topic)}/events`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new EventbusPublishError(body?.error ?? response.statusText, response.status);
      }
      return body as EventbusEvent<T>;
    },
  };
}
