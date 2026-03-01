/**
 * SSE event bus for long-running operations (scan, jf-sync).
 * Subscribers receive events until the operation completes.
 */

export interface SseEvent {
  event: string;
  data: unknown;
}

type Subscriber = (event: SseEvent) => void;

export class SseEmitter {
  private subscribers = new Set<Subscriber>();
  public running = false;
  private _abortController: AbortController | null = null;
  /** Recent event buffer — replayed to new subscribers so they don't miss fast-completing jobs */
  private recentEvents: SseEvent[] = [];
  private readonly REPLAY_LIMIT = 200;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  get signal(): AbortSignal | undefined {
    return this._abortController?.signal;
  }

  start(): AbortSignal {
    this.running = true;
    this.recentEvents = [];
    if (this.clearTimer) { clearTimeout(this.clearTimer); this.clearTimer = null; }
    this._abortController = new AbortController();
    return this._abortController.signal;
  }

  cancel(): boolean {
    if (!this.running || !this._abortController) return false;
    this._abortController.abort();
    this.emit('cancelled', { reason: 'User requested cancellation' });
    return true;
  }

  /**
   * Subscribe to events.
   * Immediately replays buffered events so late-connecting clients
   * (e.g. EventSource that connects after a fast scan) don't miss events.
   */
  subscribe(fn: Subscriber): () => void {
    // Replay buffered events to new subscriber first
    for (const ev of this.recentEvents) {
      try { fn(ev); } catch { /* */ }
    }
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  emit(event: string, data: unknown): void {
    const ev: SseEvent = { event, data };
    this.recentEvents.push(ev);
    if (this.recentEvents.length > this.REPLAY_LIMIT) this.recentEvents.shift();
    for (const fn of this.subscribers) {
      try { fn(ev); } catch { /* subscriber gone */ }
    }
  }

  finish(): void {
    this.running = false;
    this._abortController = null;
    // Keep replay buffer for 60s so late SSE connections still get the result
    this.clearTimer = setTimeout(() => {
      this.recentEvents = [];
      this.clearTimer = null;
    }, 60_000);
  }
}

export const scanEmitter = new SseEmitter();
export const syncEmitter = new SseEmitter();
export const disEmitter = new SseEmitter();
export const verifyEmitter = new SseEmitter();
