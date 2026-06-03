type EventHandler = (data: any) => void;

const handlers: Record<string, Set<EventHandler>> = {};

export const wsClient = {
  socket: null as WebSocket | null,
  reconnectTimer: 0,
  reconnectDelay: 1000,
  shouldReconnect: true,

  connect() {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) return;

    this.shouldReconnect = true;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}/ws`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.reconnectDelay = 1000;
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type;
        if (handlers[type]) {
          handlers[type].forEach((fn) => fn(data.data || data));
        }
      } catch { /* ignore */ }
    };

    this.socket.onclose = () => {
      if (!this.shouldReconnect) return;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.reconnectTimer = window.setTimeout(() => this.connect(), this.reconnectDelay);
    };
  },

  on(event: string, fn: EventHandler) {
    if (!handlers[event]) handlers[event] = new Set();
    handlers[event].add(fn);
  },

  off(event: string, fn: EventHandler) {
    handlers[event]?.delete(fn);
  },

  send(data: object) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  },

  disconnect() {
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  },
};
