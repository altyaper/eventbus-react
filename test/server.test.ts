import { createPublisher, EventbusPublishError } from "../src/server";

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

test("POSTs the payload with basic auth and returns the event", async () => {
  const event = { topic: "app.logs", payload: { a: 1 }, published_at: "2026-10-03T00:00:00Z" };
  const fetch = respond(202, event);
  const publisher = createPublisher({
    url: "https://bus.example.com/",
    clientId: "id",
    clientSecret: "secret",
    fetch,
  });

  await expect(publisher.publish("app.logs", { a: 1 })).resolves.toEqual(event);

  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://bus.example.com/api/topics/app.logs/events");
  expect(init.method).toBe("POST");
  expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa("id:secret")}`);
  expect(init.body).toBe(JSON.stringify({ a: 1 }));
});

test("throws EventbusPublishError with the server's message and status", async () => {
  const publisher = createPublisher({
    url: "https://bus.example.com",
    clientId: "id",
    clientSecret: "secret",
    fetch: respond(403, { error: "topic belongs to another application" }),
  });

  const error = await publisher.publish("other.logs", {}).catch((e) => e);
  expect(error).toBeInstanceOf(EventbusPublishError);
  expect(error.status).toBe(403);
  expect(error.message).toBe("topic belongs to another application");
});
