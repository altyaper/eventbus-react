/** The envelope eventbus wraps every published payload in. */
export interface EventbusEvent<T = unknown> {
  topic: string;
  payload: T;
  /** ISO 8601 timestamp set by the server when the event was published. */
  published_at: string;
}

/** State of the websocket connection to the eventbus. */
export type ConnectionStatus = "connecting" | "open" | "closed";

/**
 * State of a topic subscription.
 *
 * - `joining`: waiting for the server to accept the join (also while
 *   rejoining after the connection drops).
 * - `joined`: receiving events.
 * - `error`: the server refused the join (see `error` for the reason, e.g.
 *   `"origin not allowed"`). Refusals are permanent, so it doesn't retry.
 */
export type TopicStatus = "joining" | "joined" | "error";

/** Same rule as the server: lowercase letters, digits, `.`, `_` and `-`. */
const TOPIC_NAME = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;

export function isValidTopicName(name: string): boolean {
  return TOPIC_NAME.test(name);
}
