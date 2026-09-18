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
  fetcher?: typeof fetch;
};

/** Production client transport for the authenticated Fieldstead sync route. */
export class HttpSyncTransport implements SyncTransport {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: HttpSyncTransportOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async submit(input: OperationBatch): Promise<OperationResult> {
    const batch = parseOperationBatch(input);
    const token = await this.options.getAccessToken();
    if (!token) throw new Error("Fieldstead sync requires an access token.");

    const response = await this.fetcher(this.options.endpoint, {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(batch),
    });
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message =
        typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error
          : "Fieldstead sync failed with HTTP " + response.status + ".";
      const error = new Error(message);
      Object.assign(error, { status: response.status, retryable: response.status >= 500 });
      throw error;
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
