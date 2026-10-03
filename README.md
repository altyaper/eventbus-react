# @altyaper/eventbus-react

React hooks for listening to an [eventbus](https://github.com/altyaper/eventbus) server in
real time, plus a small publisher for your backend.

```sh
npm install @altyaper/eventbus-react
```

## Listen from React

Wrap your app once, then call `useTopic` wherever you need events.

```jsx
import { EventbusProvider, useTopic } from "@altyaper/eventbus-react";

export function App() {
  return (
    <EventbusProvider url="wss://eventbus.example.com/socket">
      <Deploys />
    </EventbusProvider>
  );
}

function Deploys() {
  const { status, error, events } = useTopic("changologs.deploys");

  if (status === "error") return <p>Can't listen: {error}</p>;
  return (
    <ul>
      {events.map((e) => (
        <li key={e.published_at}>{e.payload.message}</li>
      ))}
    </ul>
  );
}
```

Every event arrives in the envelope the server publishes:

```ts
{ topic: "changologs.deploys", payload: { /* what was published */ }, published_at: "2026-10-03T12:00:00Z" }
```

Before a browser can listen, add its origin (e.g. `https://myapp.example.com`) on the
application's **Origins** page in eventbus. Without it the join fails with
`error: "origin not allowed"`. Origins added there can only listen to that application's topics.

### `useTopic(topic, options?)`

| Option    | Default | Meaning                                                         |
| --------- | ------- | --------------------------------------------------------------- |
| `onEvent` |         | Called for every event. Can change between renders without rejoining. |
| `keep`    | `50`    | How many recent events `events` holds. `0` keeps none.          |

Returns `{ status, error, events, lastEvent, clear }`:

- `status`: `"joining"`, `"joined"` or `"error"`. It goes back to `"joining"` while the connection
  is down and returns to `"joined"` by itself when it reconnects.
- `error`: why the server refused the join (`"origin not allowed"`, `"invalid topic name"`).
  Refusals are permanent, so the hook stops retrying.
- `events`: events received since joining, oldest first. Events are live only. Nothing published
  before the join is replayed.

Pass `null` as the topic to wait until you know it. Changing the topic leaves the old one and
resets `events`. Any number of components can listen to the same topic. They share one channel.

TypeScript users can type the payload: `useTopic<{ message: string }>("changologs.deploys")`.

### Other hooks

- `useConnectionStatus()`: `"connecting"`, `"open"` or `"closed"`, for a connection indicator.
- `useEventbusSocket()`: the underlying phoenix `Socket` (or `null` before the provider mounts).

`<EventbusProvider>` also takes `socketOptions`, passed to phoenix's `Socket` (e.g. a custom
`reconnectAfterMs`).

## Publish from your server

Browsers only listen. Publishing needs the application's client secret, so do it from your
backend (Node, an edge function, a Next.js route handler):

```js
import { createPublisher } from "@altyaper/eventbus-react/server";

const eventbus = createPublisher({
  url: "https://eventbus.example.com",
  clientId: process.env.EVENTBUS_CLIENT_ID,
  clientSecret: process.env.EVENTBUS_CLIENT_SECRET,
});

await eventbus.publish("changologs.deploys", { message: "v1.4.0 is live" });
```

The payload must be a JSON object. An application can only publish to topics named after it
(`changologs.*` for the `changologs` app). Failures throw `EventbusPublishError` with an HTTP
`status`: `401` bad credentials, `403` another application's topic, `422` invalid topic name.

Never import `@altyaper/eventbus-react/server` in browser code. The secret would ship to every
visitor.

## Develop

```sh
npm test          # vitest
npm run typecheck
npm run build     # dist/ (ESM + CJS + types)
```

## Release

Every push to `main` runs the checks. If `package.json` has a version npm doesn't have yet, it
also publishes to npm (with provenance) and creates a GitHub release. To ship a new version from
an up-to-date, clean `main`:

```sh
npm run release:patch   # 0.1.0 → 0.1.1 (fixes)
npm run release:minor   # 0.1.0 → 0.2.0 (new features)
npm run release:major   # 0.1.0 → 1.0.0 (breaking changes)
```

Each one bumps the version, commits `Release vX.Y.Z`, tags it and pushes. Pushes that don't
change the version only run the checks.

Publishing needs one of:

- **An `NPM_TOKEN` repository secret**: a granular access token from npmjs.com with read and
  write access to this package. The first publish needs this, because npm only lets you set up
  trusted publishing on a package that already exists.
- **npm trusted publishing**: on npmjs.com, under the package's settings, add GitHub Actions
  with repository `altyaper/eventbus-react` and workflow `release.yml`. You can then delete
  the `NPM_TOKEN` secret.
