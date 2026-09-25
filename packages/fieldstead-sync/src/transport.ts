import {
  SYNC_PROTOCOL_VERSION,
  parseOperationBatch,
  parseOperationResult,
  type ConflictRecord,
  type OperationBatch,
  type OperationRejectionCode,
  type OperationResult,
  type RejectedOperation,
  type SyncOperation,
} from './index';

/**
 * Boundary implemented later only by an explicitly configured Fieldstead server route.
 * This package intentionally provides no network endpoint or persistence.
 */
export interface SyncTransport {
  submit(batch: OperationBatch): Promise<OperationResult>;
}

export type HttpSyncTransportOptions = {
  endpoint: string;
  getAccessToken: () => string | undefined | Promise<string | undefined>;
  device: { deviceId: string; sessionId: string; platform: 'windows' | 'linux' | 'macos' | 'web' };
  createRequestId?: () => string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export class SyncTransportError extends Error {
  constructor(message: string, readonly code: 'timeout' | 'network' | 'http', readonly retryable: boolean, readonly status?: number) { super(message); this.name = 'SyncTransportError'; }
}

/** Production client transport for the authenticated Fieldstead sync route. */
export class HttpSyncTransport implements SyncTransport {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: HttpSyncTransportOptions) {
    if (new URL(options.endpoint).protocol !== 'https:') throw new TypeError('Fieldstead sync requires an HTTPS endpoint.');
    this.fetcher = options.fetcher ?? fetch;
  }

  async submit(input: OperationBatch): Promise<OperationResult> {
    const batch = parseOperationBatch(input);
    const token = await this.options.getAccessToken();
    if (!token) throw new Error("Fieldstead sync requires an access token.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);
    let response: Response;
    try {
      response = await this.fetcher(this.options.endpoint, { method: "POST", headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        accept: "application/json",
        "x-request-id": this.options.createRequestId?.() ?? crypto.randomUUID(),
        "x-fieldstead-device-id": this.options.device.deviceId,
        "x-fieldstead-session-id": this.options.device.sessionId,
        "x-fieldstead-platform": this.options.device.platform,
      }, body: JSON.stringify(batch), signal: controller.signal, cache: 'no-store' });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw new SyncTransportError('Fieldstead sync timed out.', 'timeout', true);
      throw new SyncTransportError(error instanceof Error ? error.message : 'Fieldstead sync network failure.', 'network', true);
    } finally { clearTimeout(timeout); }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message =
        typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error
          : "Fieldstead sync failed with HTTP " + response.status + ".";
      throw new SyncTransportError(message, 'http', response.status === 408 || response.status === 429 || response.status >= 500, response.status);
    }
    return parseOperationResult(body);
  }
}

export type OperationDecision =
  | { status: 'accepted' }
  | {
      status: 'rejected';
      code: OperationRejectionCode;
      message: string;
      retryable: boolean;
      conflict?: ConflictRecord;
    };

export type OperationDecider = (
  operation: SyncOperation,
) => OperationDecision | Promise<OperationDecision>;

type StoredDecision = {
  fingerprint: string;
  decision: Promise<OperationDecision>;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function rejection(
  operationId: string,
  code: OperationRejectionCode,
  message: string,
  retryable: boolean,
): RejectedOperation {
  return { operationId, code, message, retryable };
}

/**
 * A deterministic test double for consumers of SyncTransport. Its state is
 * process-local and disposable; it is not a production ingestion service.
 */
export class InMemorySyncTransport implements SyncTransport {
  private readonly outcomes = new Map<string, StoredDecision>();
  private position = 0;

  constructor(private readonly decide: OperationDecider) {}

  async submit(input: OperationBatch): Promise<OperationResult> {
    const batch = parseOperationBatch(input);
    const acceptedOperationIds: string[] = [];
    const rejectedOperations: RejectedOperation[] = [];
    const conflicts: ConflictRecord[] = [];

    for (const operation of batch.operations) {
      const fingerprint = canonicalJson(operation);
      const stored = this.outcomes.get(operation.id);
      let decision: OperationDecision;

      if (stored && stored.fingerprint !== fingerprint) {
        decision = {
          status: 'rejected',
          code: 'idempotency_key_reused',
          message: `Operation id ${operation.id} was already used for different content.`,
          retryable: false,
        };
      } else if (stored) {
        decision = await stored.decision;
      } else {
        const pendingDecision = Promise.resolve().then(() => this.decide(operation));
        this.outcomes.set(operation.id, {
          fingerprint,
          decision: pendingDecision,
        });
        this.position += 1;
        decision = await pendingDecision;
      }

      if (decision.status === 'accepted') {
        acceptedOperationIds.push(operation.id);
      } else {
        rejectedOperations.push(
          rejection(
            operation.id,
            decision.code,
            decision.message,
            decision.retryable,
          ),
        );
        if (decision.conflict) conflicts.push(decision.conflict);
      }
    }

    return parseOperationResult({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      batchId: batch.batchId,
      cursor: { version: SYNC_PROTOCOL_VERSION, position: String(this.position) },
      acceptedOperationIds,
      rejectedOperations,
      conflicts,
    });
  }
}
