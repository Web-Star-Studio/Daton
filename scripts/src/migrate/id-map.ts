/** Typed wrapper around Map<uuid, serial> for tracking v1→v2 ID mappings */
export class IdMap {
  private map = new Map<string, number>();
  private label: string;

  constructor(label: string) {
    this.label = label;
  }

  set(uuid: string, serial: number): void {
    this.map.set(uuid, serial);
  }

  get(uuid: string): number {
    const id = this.map.get(uuid);
    if (id === undefined) {
      throw new Error(`[${this.label}] UUID not found in id map: ${uuid}`);
    }
    return id;
  }

  tryGet(uuid: string | null | undefined): number | null {
    if (!uuid) return null;
    return this.map.get(uuid) ?? null;
  }

  get size(): number {
    return this.map.size;
  }
}
