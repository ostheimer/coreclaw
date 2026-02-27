import { useEffect, useRef, useState, useCallback } from "react";

export interface WsEvent {
  type: string;
  source: string;
  payload: unknown;
  timestamp: string;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<WsEvent[]>([]);
  const listenersRef = useRef<Map<string, Set<(e: WsEvent) => void>>>(new Map());

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data as string) as WsEvent;
        setEvents((prev) => [event, ...prev].slice(0, 100));

        const listeners = listenersRef.current.get(event.type);
        if (listeners) {
          for (const fn of listeners) fn(event);
        }
        const allListeners = listenersRef.current.get("*");
        if (allListeners) {
          for (const fn of allListeners) fn(event);
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const subscribe = useCallback((type: string, fn: (e: WsEvent) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(fn);
    return () => {
      listenersRef.current.get(type)?.delete(fn);
    };
  }, []);

  return { connected, events, subscribe };
}
