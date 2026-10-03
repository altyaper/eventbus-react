// A minimal stand-in for phoenix's Socket/Channel that lets tests play the server.
type Callback = (payload?: any) => void;

export class FakePush {
  hooks: Record<string, Callback> = {};
  receive(status: string, cb: Callback) {
    this.hooks[status] = cb;
    return this;
  }
  reply(status: string, payload?: any) {
    this.hooks[status]?.(payload);
  }
}

export class FakeChannel {
  bindings: Record<string, Callback[]> = {};
  errorCallbacks: Callback[] = [];
  joinPush = new FakePush();
  joined = 0;
  left = 0;

  constructor(public topic: string) {}

  on(event: string, cb: Callback) {
    (this.bindings[event] ??= []).push(cb);
    return 1;
  }
  onError(cb: Callback) {
    this.errorCallbacks.push(cb);
  }
  join() {
    this.joined++;
    return this.joinPush;
  }
  leave() {
    this.left++;
  }
  // Test helpers
  emit(event: string, payload: any) {
    this.bindings[event]?.forEach((cb) => cb(payload));
  }
  drop() {
    this.errorCallbacks.forEach((cb) => cb());
  }
}

export class FakeSocket {
  static instances: FakeSocket[] = [];
  channels: FakeChannel[] = [];
  openCallbacks: Callback[] = [];
  closeCallbacks: Callback[] = [];
  connected = false;

  constructor(public url: string, public options?: any) {
    FakeSocket.instances.push(this);
  }
  channel(topic: string) {
    const channel = new FakeChannel(topic);
    this.channels.push(channel);
    return channel;
  }
  onOpen(cb: Callback) {
    this.openCallbacks.push(cb);
    return "open";
  }
  onClose(cb: Callback) {
    this.closeCallbacks.push(cb);
    return "close";
  }
  off() {
    this.openCallbacks = [];
    this.closeCallbacks = [];
  }
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.connected = false;
  }
  // Test helpers
  open() {
    this.openCallbacks.forEach((cb) => cb());
  }
}
