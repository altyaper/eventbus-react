import type { Channel, Socket } from "phoenix";
import { isValidTopicName, type EventbusEvent, type TopicStatus } from "./types";

export interface TopicListener {
  onEvent(event: EventbusEvent<any>): void;
  onStatus(status: TopicStatus, error: string | null): void;
}

interface Entry {
  channel: Channel | null;
  status: TopicStatus;
  error: string | null;
  listeners: Set<TopicListener>;
}

/**
 * Shares one channel per topic between every subscriber on a socket.
 *
 * Phoenix allows a single join per topic per socket (a second join makes the
 * client leave the first), so two components listening to the same topic
 * must share the channel. It is joined on the first subscribe and left when
 * the last subscriber goes away.
 */
export class TopicHub {
  private entries = new Map<string, Entry>();

  constructor(private socket: Socket) {}

  subscribe(topic: string, listener: TopicListener): () => void {
    let entry = this.entries.get(topic);
    if (!entry) {
      entry = this.open(topic);
      this.entries.set(topic, entry);
    }
    entry.listeners.add(listener);
    listener.onStatus(entry.status, entry.error);

    const current = entry;
    return () => {
      current.listeners.delete(listener);
      if (current.listeners.size === 0 && this.entries.get(topic) === current) {
        this.entries.delete(topic);
        current.channel?.leave();
      }
    };
  }

  private open(topic: string): Entry {
    const entry: Entry = { channel: null, status: "joining", error: null, listeners: new Set() };

    const setStatus = (status: TopicStatus, error: string | null = null) => {
      entry.status = status;
      entry.error = error;
      entry.listeners.forEach((l) => l.onStatus(status, error));
    };

    // Rejected locally so a typo doesn't cost a round trip.
    if (!isValidTopicName(topic)) {
      entry.status = "error";
      entry.error = "invalid topic name";
      return entry;
    }

    const channel = this.socket.channel(`topic:${topic}`, {});
    channel.on("event", (event: EventbusEvent) => {
      entry.listeners.forEach((l) => l.onEvent(event));
    });
    // The socket dropped; phoenix rejoins by itself once it reconnects, and
    // the join push's "ok" hook below fires again.
    channel.onError(() => {
      if (entry.status === "joined") setStatus("joining");
    });
    channel
      .join()
      .receive("ok", () => setStatus("joined"))
      .receive("error", (reply: { reason?: string } | undefined) => {
        // Join refusals (invalid name, origin not allowed) won't change on
        // retry, so stop phoenix from retrying forever.
        channel.leave();
        setStatus("error", reply?.reason ?? "join refused");
      });

    entry.channel = channel;
    return entry;
  }
}
