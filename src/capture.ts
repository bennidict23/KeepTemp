import type { PlatformAdapter, Snapshot } from "./model";
export type CaptureStatus =
  "idle" | "saving" | "saved" | "paused" | "skipped" | "error";
export class SessionCapture {
  private queue = Promise.resolve();
  private paused = false;
  constructor(
    private adapter: PlatformAdapter,
    private repository: { capture(s: Snapshot): Promise<boolean> },
    private status: (s: CaptureStatus) => void,
  ) {}
  pause(value: boolean) {
    this.paused = value;
    this.status(value ? "paused" : "idle");
  }
  scan() {
    if (this.paused) return Promise.resolve();
    const snapshot = this.adapter.read();
    this.queue = this.queue.then(async () => {
      if (this.paused) return;
      if (!snapshot || snapshot.temporary !== true) {
        this.status("skipped");
        return;
      }
      this.status("saving");
      try {
        this.status(
          (await this.repository.capture(snapshot)) ? "saved" : "skipped",
        );
      } catch {
        this.status("error");
      } // Do not log content or raw errors.
    });
    return this.queue;
  }
}
