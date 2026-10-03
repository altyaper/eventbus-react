import { Socket, type SocketConnectOption } from "phoenix";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TopicHub } from "./topic-hub";
import type { ConnectionStatus } from "./types";

interface EventbusContextValue {
  socket: Socket;
  hub: TopicHub;
  status: ConnectionStatus;
}

// `undefined` outside a provider; `null` inside one until its socket exists.
const EventbusContext = createContext<EventbusContextValue | null | undefined>(undefined);

export interface EventbusProviderProps {
  /**
   * The eventbus websocket URL, e.g. `wss://eventbus.example.com/socket`.
   * An `http(s)://` URL also works; phoenix switches the scheme.
   */
  url: string;
  /** Extra options for the underlying phoenix `Socket`. */
  socketOptions?: Partial<SocketConnectOption>;
  children: ReactNode;
}

/**
 * Opens one websocket to the eventbus for everything below it. Put it near
 * the root of the app; every `useTopic` call shares the connection.
 */
export function EventbusProvider({ url, socketOptions, children }: EventbusProviderProps) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  // Options are read when the URL changes, not on every render, so an inline
  // object literal doesn't reconnect. The socket is built here rather than
  // during render, which React may repeat and throw away.
  const optionsRef = useRef(socketOptions);
  optionsRef.current = socketOptions;

  useEffect(() => {
    const socket = new Socket(url, optionsRef.current);
    const refs = [
      socket.onOpen(() => setStatus("open")),
      socket.onClose(() => setStatus("closed")),
    ];
    setStatus("connecting");
    setConnection({ socket, hub: new TopicHub(socket) });
    socket.connect();

    return () => {
      socket.off(refs);
      socket.disconnect();
    };
  }, [url]);

  const value = useMemo(() => connection && { ...connection, status }, [connection, status]);
  return <EventbusContext.Provider value={value}>{children}</EventbusContext.Provider>;
}

interface Connection {
  socket: Socket;
  hub: TopicHub;
}

/** The provider's connection, or `null` during its first render. */
export function useEventbusContext(): EventbusContextValue | null {
  const context = useContext(EventbusContext);
  if (context === undefined) {
    throw new Error("Eventbus hooks must be used inside <EventbusProvider>.");
  }
  return context;
}

/** The state of the websocket connection: `connecting`, `open` or `closed`. */
export function useConnectionStatus(): ConnectionStatus {
  return useEventbusContext()?.status ?? "connecting";
}

/**
 * The underlying phoenix `Socket`, for anything the hooks don't cover.
 * `null` until the provider has mounted.
 */
export function useEventbusSocket(): Socket | null {
  return useEventbusContext()?.socket ?? null;
}
