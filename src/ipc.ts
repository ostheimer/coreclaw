import { EventEmitter } from "events";
import { randomUUID } from "crypto";

/**
 * Simple in-process IPC bus for conductor-to-conductor and conductor-to-queue
 * communication. Intentionally thin — conductors communicate via typed events,
 * not shared mutable state.
 */

export type IpcEventType =
  | "task:created"
  | "task:completed"
  | "task:failed"
  | "task:escalated"
  | "message:received"
  | "message:processed"
  | "conductor:briefing"
  | "conductor:review-request"
  | "conductor:review-result"
  | "conductor:context-ready"
  | "conductor:workflow-planned"
  | "conductor:feedback";

export interface IpcEvent<T = unknown> {
  id: string;
  type: IpcEventType;
  source: string;
  target?: string;
  payload: T;
  timestamp: Date;
}

class IpcBus extends EventEmitter {
  publish<T>(type: IpcEventType, source: string, payload: T, target?: string): void {
    const event: IpcEvent<T> = {
      id: randomUUID(),
      type,
      source,
      payload,
      target,
      timestamp: new Date(),
    };
    this.emit(type, event);
    this.emit("*", event);
  }

  subscribe<T>(type: IpcEventType, listener: (event: IpcEvent<T>) => void): () => void {
    const wrapper = (event: IpcEvent<T>): void => {
      listener(event);
    };
    this.on(type, wrapper);
    return () => this.off(type, wrapper);
  }

  subscribeAll(listener: (event: IpcEvent) => void): () => void {
    this.on("*", listener);
    return () => this.off("*", listener);
  }
}

export const ipcBus = new IpcBus();
ipcBus.setMaxListeners(50);
