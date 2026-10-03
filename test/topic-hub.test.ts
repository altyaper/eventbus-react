import type { Socket } from "phoenix";
import { TopicHub, type TopicListener } from "../src/topic-hub";
import { FakeSocket } from "./fake-phoenix";

const listener = (): TopicListener & { statuses: any[]; events: any[] } => {
  const l = {
    statuses: [] as any[],
    events: [] as any[],
    onStatus: (status: string, error: string | null) => l.statuses.push([status, error]),
    onEvent: (event: any) => l.events.push(event),
  };
  return l;
};

const setup = () => {
  const socket = new FakeSocket("ws://test/socket");
  return { socket, hub: new TopicHub(socket as unknown as Socket) };
};

const event = { topic: "app.a", payload: { n: 1 }, published_at: "2026-10-03T00:00:00Z" };

test("joins topic:<name> and fans events out to every subscriber", () => {
  const { socket, hub } = setup();
  const a = listener();
  const b = listener();
  hub.subscribe("app.a", a);
  hub.subscribe("app.a", b);

  expect(socket.channels).toHaveLength(1);
  const [channel] = socket.channels;
  expect(channel.topic).toBe("topic:app.a");

  channel.joinPush.reply("ok");
  channel.emit("event", event);

  expect(a.statuses).toEqual([["joining", null], ["joined", null]]);
  expect(b.events).toEqual([event]);
  expect(a.events).toEqual([event]);
});

test("a late subscriber gets the current status straight away", () => {
  const { socket, hub } = setup();
  hub.subscribe("app.a", listener());
  socket.channels[0].joinPush.reply("ok");

  const late = listener();
  hub.subscribe("app.a", late);
  expect(late.statuses).toEqual([["joined", null]]);
});

test("leaves the channel only when the last subscriber goes", () => {
  const { socket, hub } = setup();
  const offA = hub.subscribe("app.a", listener());
  const offB = hub.subscribe("app.a", listener());
  const [channel] = socket.channels;

  offA();
  expect(channel.left).toBe(0);
  offB();
  expect(channel.left).toBe(1);

  hub.subscribe("app.a", listener());
  expect(socket.channels).toHaveLength(2);
});

test("stops retrying and reports the reason when the join is refused", () => {
  const { socket, hub } = setup();
  const l = listener();
  hub.subscribe("app.a", l);
  const [channel] = socket.channels;

  channel.joinPush.reply("error", { reason: "origin not allowed" });

  expect(channel.left).toBe(1);
  expect(l.statuses.at(-1)).toEqual(["error", "origin not allowed"]);
});

test("goes back to joining while the connection is down", () => {
  const { socket, hub } = setup();
  const l = listener();
  hub.subscribe("app.a", l);
  const [channel] = socket.channels;

  channel.joinPush.reply("ok");
  channel.drop();
  channel.joinPush.reply("ok");

  expect(l.statuses.map(([s]) => s)).toEqual(["joining", "joined", "joining", "joined"]);
});

test("rejects invalid topic names without opening a channel", () => {
  const { socket, hub } = setup();
  const l = listener();
  hub.subscribe("Not Valid", l);

  expect(socket.channels).toHaveLength(0);
  expect(l.statuses).toEqual([["error", "invalid topic name"]]);
});
