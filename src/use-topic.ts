import { useEffect, useRef, useState } from "react";
import { useEventbusContext } from "./provider";
import type { EventbusEvent, TopicStatus } from "./types";

export interface UseTopicOptions<T> {
  /** Called for every event. Can change between renders without rejoining. */
  onEvent?: (event: EventbusEvent<T>) => void;
  /**
   * How many recent events to keep in `events`, newest last. Defaults to 50.
   * Use `0` if you only need `onEvent` or `lastEvent`.
   */
  keep?: number;
}

export interface UseTopicResult<T> {
  status: TopicStatus;
  /** Why the join was refused, when `status` is `"error"`. */
  error: string | null;
  /** Events received since the topic was joined, oldest first. */
  events: EventbusEvent<T>[];
  lastEvent: EventbusEvent<T> | null;
  /** Empties `events` and `lastEvent`. */
  clear: () => void;
}

/**
 * Listens to an eventbus topic, e.g. `useTopic("changologs.logs")`.
 *
 * Events are live only: anything published before the join is not replayed.
 * Pass `null` as the topic to stay idle until it's known. Changing the topic
 * leaves the old one and resets `events`.
 */
export function useTopic<T = unknown>(
  topic: string | null,
  { onEvent, keep = 50 }: UseTopicOptions<T> = {},
): UseTopicResult<T> {
  const hub = useEventbusContext()?.hub ?? null;
  const [status, setStatus] = useState<TopicStatus>("joining");
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventbusEvent<T>[]>([]);
  const [lastEvent, setLastEvent] = useState<EventbusEvent<T> | null>(null);

  const onEventRef = useRef(onEvent);
  const keepRef = useRef(keep);
  onEventRef.current = onEvent;
  keepRef.current = keep;

  useEffect(() => {
    setEvents([]);
    setLastEvent(null);
    if (topic === null || hub === null) {
      setStatus("joining");
      setError(null);
      return;
    }

    return hub.subscribe(topic, {
      onStatus(status, error) {
        setStatus(status);
        setError(error);
      },
      onEvent(event: EventbusEvent<T>) {
        setLastEvent(event);
        const max = keepRef.current;
        if (max > 0) setEvents((prev) => [...prev, event].slice(-max));
        onEventRef.current?.(event);
      },
    });
  }, [hub, topic]);

  const clear = () => {
    setEvents([]);
    setLastEvent(null);
  };

  return { status, error, events, lastEvent, clear };
}
