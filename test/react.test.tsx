import { act, render, renderHook, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { FakeSocket } from "./fake-phoenix";

vi.mock("phoenix", async () => ({ Socket: (await import("./fake-phoenix")).FakeSocket }));

const { EventbusProvider, useConnectionStatus, useTopic } = await import("../src/index");

const wrapper = ({ children }: { children: ReactNode }) => (
  <EventbusProvider url="ws://test/socket">{children}</EventbusProvider>
);

const lastSocket = () => FakeSocket.instances.at(-1)!;
const ev = (n: number) => ({ topic: "app.a", payload: { n }, published_at: "2026-10-03T00:00:00Z" });

beforeEach(() => {
  FakeSocket.instances = [];
});

test("the provider connects on mount and disconnects on unmount", () => {
  const { result, unmount } = renderHook(() => useConnectionStatus(), { wrapper });
  const socket = lastSocket();

  expect(socket.url).toBe("ws://test/socket");
  expect(socket.connected).toBe(true);
  expect(result.current).toBe("connecting");

  act(() => socket.open());
  expect(result.current).toBe("open");

  unmount();
  expect(socket.connected).toBe(false);
});

test("useTopic collects events, keeps the newest `keep` and calls onEvent", () => {
  const onEvent = vi.fn();
  const { result } = renderHook(() => useTopic("app.a", { keep: 2, onEvent }), { wrapper });
  const [channel] = lastSocket().channels;

  expect(result.current.status).toBe("joining");
  act(() => channel.joinPush.reply("ok"));
  expect(result.current.status).toBe("joined");

  act(() => [1, 2, 3].forEach((n) => channel.emit("event", ev(n))));

  expect(result.current.events.map((e) => e.payload)).toEqual([{ n: 2 }, { n: 3 }]);
  expect(result.current.lastEvent).toEqual(ev(3));
  expect(onEvent).toHaveBeenCalledTimes(3);

  act(() => result.current.clear());
  expect(result.current.events).toEqual([]);
  expect(result.current.lastEvent).toBeNull();
});

test("changing the topic leaves the old channel and resets events", () => {
  const { result, rerender } = renderHook(({ topic }) => useTopic(topic), {
    wrapper,
    initialProps: { topic: "app.a" as string | null },
  });
  const [first] = lastSocket().channels;
  act(() => first.emit("event", ev(1)));
  expect(result.current.events).toHaveLength(1);

  rerender({ topic: "app.b" });
  expect(first.left).toBe(1);
  expect(lastSocket().channels.at(-1)!.topic).toBe("topic:app.b");
  expect(result.current.events).toEqual([]);

  rerender({ topic: null });
  expect(lastSocket().channels.at(-1)!.left).toBe(1);
});

test("two components on the same topic share one channel", () => {
  function Feed({ id }: { id: string }) {
    const { events } = useTopic<{ n: number }>("app.a");
    return <p data-testid={id}>{events.length}</p>;
  }

  render(
    <StrictMode>
      <EventbusProvider url="ws://test/socket">
        <Feed id="one" />
        <Feed id="two" />
      </EventbusProvider>
    </StrictMode>,
  );

  const socket = lastSocket();
  const live = socket.channels.filter((c) => c.left === 0);
  expect(FakeSocket.instances.filter((s) => s.connected)).toHaveLength(1);
  expect(live).toHaveLength(1);

  act(() => live[0].emit("event", ev(1)));
  expect(screen.getByTestId("one").textContent).toBe("1");
  expect(screen.getByTestId("two").textContent).toBe("1");
});

test("hooks throw a helpful error outside the provider", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => renderHook(() => useTopic("app.a"))).toThrow(/inside <EventbusProvider>/);
});
