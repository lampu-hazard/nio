export class PreviewTrigger {
  private consumed = 0;
  shouldRender(automatic: boolean, refresh: number) {
    const manual = refresh !== this.consumed;
    this.consumed = refresh;
    return automatic || manual;
  }
}

export class PreviewRequest {
  private controller?: AbortController;
  private blobUrl?: string;
  private generation = 0;
  constructor(private readonly request: typeof fetch = fetch, private readonly create: (blob: Blob) => string = URL.createObjectURL, private readonly revoke: (url: string) => void = URL.revokeObjectURL) {}

  async render(url: string, body: unknown, display: (url: string) => void) {
    this.controller?.abort();
    const controller = this.controller = new AbortController();
    const generation = ++this.generation;
    try {
      const response = await this.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (controller.signal.aborted || generation !== this.generation) return;
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Preview failed (${response.status}).`);
      }
      const blob = await response.blob();
      if (controller.signal.aborted || generation !== this.generation) return;
      const next = this.create(blob);
      if (this.blobUrl) this.revoke(this.blobUrl);
      this.blobUrl = next;
      display(next);
    } catch (error) { if (!controller.signal.aborted && generation === this.generation) throw error; }
  }

  cancel() { this.generation++; this.controller?.abort(); }
  dispose() { this.cancel(); if (this.blobUrl) this.revoke(this.blobUrl); this.blobUrl = undefined; }
}
