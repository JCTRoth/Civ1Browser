/**
 * GameLogger – records every game event (moves, combat, city actions, AI
 * decisions, turn phases) as structured JSON lines and flushes them to the
 * dev server, which persists them to `game-logs/<sessionId>.log`.
 *
 * It is a singleton so the engine hook, AI and UI can all share one buffer.
 * If the dev server is unreachable the lines are kept in memory and can be
 * exported via downloadLog().
 */

interface GameLogEntry {
  ts: string; // ISO timestamp
  round: number;
  player: number;
  event: string;
  message: string;
  detail: Record<string, unknown>;
}

type ContextFn = () => { round: number; player: number };

class GameLogger {
  private sessionId: string | null = null;
  private pending: GameLogEntry[] = [];
  private context: ContextFn = () => ({ round: 0, player: 0 });
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private serverUnreachable = false;

  /** Start a named session (resets the buffer). */
  setSession(id: string): void {
    this.sessionId = id.replace(/[^a-zA-Z0-9._-]/g, '_');
    this.pending = [];
    this.serverUnreachable = false;
  }

  /** Provide the current round/player read from the live engine. */
  setContext(fn: ContextFn): void {
    this.context = fn;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getPendingCount(): number {
    return this.pending.length;
  }

  /**
   * Record a structured log line. `event` is the engine event name (or a
   * synthetic category like 'ai'), `message` a human-readable description.
   */
  log(event: string, message: string, detail: Record<string, unknown> = {}): GameLogEntry {
    const { round, player } = this.context();
    const entry: GameLogEntry = {
      ts: new Date().toISOString(),
      round,
      player,
      event,
      message,
      detail,
    };
    this.pending.push(entry);
    this.scheduleFlush();
    return entry;
  }

  /** Format and record a raw engine event (used as the onStateChange tap). */
  record(event: string, data: any = {}): void {
    const message = this.formatMessage(event, data);
    if (message) {
      this.log(event, message, { data: this.sanitize(data) });
    }
  }

  /** Human-readable message for known engine events. */
  private formatMessage(event: string, data: any): string | null {
    switch (event) {
      case 'TURN_START':
        return `▶ Turn start — civ ${data.civilizationId} (round ${data.roundNumber})`;
      case 'PHASE_CHANGE':
        return `  phase → ${data.phase} (civ ${data.civilizationId})`;
      case 'TURN_END':
        return `■ Turn end — civ ${data.civilizationId} (round ${data.roundNumber})`;
      case 'UNIT_MOVED':
        return `Move: ${data.unit?.type}(${data.unit?.id}) → (${data.targetCol},${data.targetRow})`;
      case 'COMBAT_VICTORY':
        return `⚔ Combat: ${data.attacker?.type} defeated ${data.defender?.type} at (${data.defender?.col},${data.defender?.row})`;
      case 'COMBAT_DEFEAT':
        return `⚔ Combat: ${data.attacker?.type} was defeated by ${data.defender?.type}`;
      case 'UNIT_DEFEATED':
        return `✝ Unit defeated: ${data.unit?.type}(${data.unit?.id})`;
      case 'CITY_FOUNDED':
        return `🏙 City founded: ${data.city?.name} at (${data.city?.col},${data.city?.row})`;
      case 'CITY_CAPTURED':
        return `🚩 City captured: ${data.city?.name} (civ ${data.city?.civilizationId})`;
      case 'CITY_ATTACKED':
        return `💥 City attacked: ${data.city?.name}`;
      case 'UNIT_SKIPPED':
        return `Skip: ${data.unit?.type}(${data.unit?.id})`;
      case 'UNIT_SLEPT':
        return `Sleep: ${data.unit?.type}(${data.unit?.id})`;
      case 'UNIT_FORTIFIED':
        return `Fortify: ${data.unit?.type}(${data.unit?.id})`;
      case 'UNIT_PRODUCED':
        return `🏭 Produced unit: ${data.unit?.type} at ${data.cityId}`;
      case 'BUILDING_COMPLETED':
        return `🏗 Building completed at ${data.cityId}`;
      case 'CITY_PRODUCTION_CHANGED':
        return `Production @ ${data.cityId}: ${data.item?.itemType ?? data.item?.name ?? data.item ?? ''}`;
      case 'RESEARCH_PHASE':
        return `🔬 Research phase — civ ${data.civilizationId}`;
      case 'WAR_DECLARED':
        return `☠ WAR DECLARED: civ ${data.aggressorId ?? data.civilizationId} vs civ ${data.targetId ?? data.targetCivilizationId}`;
      case 'CITY_DESTROYED':
        return `💥 City destroyed: ${data.city?.name} (was civ ${data.city?.civilizationId})`;
      case 'CITY_ATTACKED':
        return `💥 City attacked: ${data.city?.name} by ${data.attacker?.type}`;
      case 'DIPLOMACY_EVENT':
        return `🤝 Diplomacy: ${data.type ?? ''} civ ${data.civilizationId}`;
      case 'AI_FINISHED':
        return `🤖 AI turn finished — civ ${data.civilizationId}`;
      case 'GAME_WON':
        return `🏆 GAME WON by ${data.civName} (${data.reason})`;
      case 'GAME_LOST':
        return `💀 GAME LOST by ${data.civName} (${data.reason})`;
      case 'GAME_LOG':
        return `[${data.category ?? 'log'}] ${data.message ?? ''}`;
      default:
        return null; // skip uninteresting events
    }
  }

  /** Keep detail payloads small & JSON-safe. */
  private sanitize(data: any): any {
    if (data == null) return data;
    if (typeof data !== 'object') return data;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v == null) continue;
      if (['number', 'string', 'boolean'].includes(typeof v)) {
        out[k] = v;
      } else if (Array.isArray(v)) {
        out[k] = `[array:${v.length}]`;
      } else if (typeof v === 'object') {
        out[k] = `{${Object.keys(v).join(',')}}`;
      }
    }
    return out;
  }

  private scheduleFlush(): void {
    if (this.flushTimer || !this.sessionId) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 400);
  }

  async flush(): Promise<void> {
    if (!this.sessionId || this.pending.length === 0) return;
    if (this.serverUnreachable) return; // keep in memory, avoid retry spam
    const batch = this.pending.splice(0, this.pending.length);
    try {
      const res = await fetch('/__game_log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, lines: batch }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      this.serverUnreachable = true;
      // Keep the batch so it is not lost silently.
      this.pending.unshift(...batch);
      console.warn('[GameLogger] dev-server log endpoint unreachable:', err);
    }
  }

  /** Trigger a flush immediately (e.g. before a page reload). */
  async flushNow(): Promise<void> {
    await this.flush();
  }

  /** Download the in-memory buffer as a file (fallback when no server). */
  downloadLog(filename = 'game-log.jsonl'): void {
    const blob = new Blob(
      this.pending.map((l) => JSON.stringify(l) + '\n'),
      { type: 'application/x-ndjson' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const gameLogger = new GameLogger();
