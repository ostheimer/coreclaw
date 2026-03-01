import { ipcBus } from "../ipc.js";
import type { IpcEvent, IpcEventType } from "../ipc.js";
import type { ConductorRole, ConductorResult } from "../types.js";
import { loadPersonality, generateSystemPrompt } from "../personality/index.js";
import type { OperationMode } from "../personality/index.js";

export interface ConductorOptions {
  rulesPath?: string;
}

/**
 * Base class for all conductors. Conductors are specialized orchestration roles
 * that manage different aspects of agent work.
 */
export abstract class BaseConductor {
  readonly role: ConductorRole;
  protected readonly unsubscribers: Array<() => void> = [];
  private running = false;

  constructor(role: ConductorRole) {
    this.role = role;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.registerSubscriptions();
    console.log(`[${this.role}] Conductor started`);
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
    console.log(`[${this.role}] Conductor stopped`);
  }

  protected on<T>(type: IpcEventType, handler: (event: IpcEvent<T>) => void): void {
    const unsub = ipcBus.subscribe<T>(type, handler);
    this.unsubscribers.push(unsub);
  }

  protected publish<T>(type: IpcEventType, payload: T, target?: string): void {
    ipcBus.publish(type, this.role, payload, target);
  }

  protected abstract registerSubscriptions(): void;

  /** Returns the current system prompt generated from personality config. */
  protected getSystemPrompt(): string {
    return generateSystemPrompt(loadPersonality());
  }

  /** Returns the current operation mode. */
  protected getMode(): OperationMode {
    return loadPersonality().mode;
  }

  /** Returns true if the current mode allows autonomous actions. */
  protected canAct(): boolean {
    return this.getMode() !== "sandbox";
  }

  /** Returns true if the current mode is sandbox (read-only, dry-run only). */
  protected isSandbox(): boolean {
    return this.getMode() === "sandbox";
  }

  protected makeResult(
    success: boolean,
    output: Record<string, unknown>,
    durationMs: number,
  ): ConductorResult {
    return { conductorId: this.role, success, output, durationMs };
  }
}
