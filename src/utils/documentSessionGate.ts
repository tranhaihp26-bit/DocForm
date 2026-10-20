/**
 * @file documentSessionGate.ts
 * @description Synchronous, monotonic session and AI-request gate for DocForm.
 * Ensures that late AI partition/review responses or stale error/finally blocks
 * from a previous document, regime, or partition state never overwrite state or
 * loading indicators of the active session.
 */

export type SessionRequestKind = "upload" | "partition" | "review" | "draft_restore";
export type AiRequestKind = SessionRequestKind;

export interface SessionRequestToken {
  readonly epoch: number;
  readonly requestId: number;
  readonly kind: SessionRequestKind;
  readonly signal: AbortSignal;
  readonly contextKey?: string;
}
export type AiRequestToken = SessionRequestToken;

export interface DocumentSessionGate {
  begin(kind: SessionRequestKind, contextKey?: string): SessionRequestToken;
  invalidate(): number;
  cancelKind(kind: SessionRequestKind): void;
  isCurrent(token: SessionRequestToken, expectedContextKey?: string): boolean;
  getEpoch(): number;
}

const ALL_REQUEST_KINDS: SessionRequestKind[] = [
  "upload",
  "partition",
  "review",
  "draft_restore",
];

export function createDocumentSessionGate(): DocumentSessionGate {
  let epoch = 1;
  let nextRequestId = 0;

  const activeByKind: Record<
    SessionRequestKind,
    { requestId: number; controller: AbortController; contextKey?: string } | null
  > = {
    upload: null,
    partition: null,
    review: null,
    draft_restore: null,
  };

  const abortKind = (kind: SessionRequestKind) => {
    const entry = activeByKind[kind];
    if (entry) {
      activeByKind[kind] = null;
      try {
        entry.controller.abort();
      } catch {
        // Ignore abort errors
      }
    }
  };

  return {
    begin(kind: SessionRequestKind, contextKey?: string): SessionRequestToken {
      abortKind(kind);
      nextRequestId += 1;
      const controller = new AbortController();
      const requestId = nextRequestId;
      activeByKind[kind] = { requestId, controller, contextKey };

      return {
        epoch,
        requestId,
        kind,
        signal: controller.signal,
        contextKey,
      };
    },

    invalidate(): number {
      epoch += 1;
      for (const kind of ALL_REQUEST_KINDS) {
        abortKind(kind);
      }
      return epoch;
    },

    cancelKind(kind: SessionRequestKind): void {
      abortKind(kind);
    },

    isCurrent(token: SessionRequestToken, expectedContextKey?: string): boolean {
      if (!token || token.epoch !== epoch) {
        return false;
      }
      const active = activeByKind[token.kind];
      if (!active || active.requestId !== token.requestId) {
        return false;
      }
      if (token.signal.aborted) {
        return false;
      }
      if (
        expectedContextKey !== undefined &&
        token.contextKey !== undefined &&
        token.contextKey !== expectedContextKey
      ) {
        return false;
      }
      return true;
    },

    getEpoch(): number {
      return epoch;
    },
  };
}
