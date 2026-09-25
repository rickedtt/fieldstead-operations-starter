import {
  SYNC_PROTOCOL_VERSION,
  parseOperationBatch,
  parseOperationResult,
  parseSyncOperation,
  type OperationResult,
  type SyncCursor,
  type SyncOperation,
} from './index';
import type { SyncTransport } from './transport';

export interface SyncOutbox {
  getCursor(): Promise<SyncCursor | undefined>;
  listPendingOperations(limit?: number): Promise<SyncOperation[]>;
  markInFlight(operationIds: string[]): Promise<void>;
  markRetryable(operationIds: string[], message?: string): Promise<void>;
  applyResult(result: OperationResult): Promise<void>;
}

export type SyncClientOptions = {
  clientId: string;
  createBatchId: () => string;
  outbox: SyncOutbox;
  transport: SyncTransport;
  batchSize?: number;
};

export class SyncClient {
  private inFlight?: Promise<OperationResult | null>;

  constructor(private readonly options: SyncClientOptions) {}

  syncPending(): Promise<OperationResult | null> {
    if (this.inFlight) return this.inFlight;

    const request = this.drainPending();
    this.inFlight = request.finally(() => {
      if (this.inFlight === request) this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async drainPending(): Promise<OperationResult | null> {
    const operations = (await this.options.outbox.listPendingOperations(this.options.batchSize ?? 100)).map(
      parseSyncOperation,
    );
    if (operations.length === 0) return null;
    const operationIds = operations.map(({ id }) => id);
    await this.options.outbox.markInFlight(operationIds);

    const batch = parseOperationBatch({
      protocolVersion: SYNC_PROTOCOL_VERSION,
      batchId: this.options.createBatchId(),
      clientId: this.options.clientId,
      cursor: await this.options.outbox.getCursor(),
      operations,
    });
    let result: OperationResult;
    try {
      result = parseOperationResult(await this.options.transport.submit(batch));
    } catch (error) {
      await this.options.outbox.markRetryable(operationIds, error instanceof Error ? error.message : 'Sync transport failed.');
      throw error;
    }
    try {
      if (result.batchId !== batch.batchId) {
        throw new TypeError("OperationResult.batchId does not match the submitted batch");
      }
      await this.options.outbox.applyResult(result);
    } catch (error) {
      await this.options.outbox.markRetryable(operationIds, error instanceof Error ? error.message : 'Sync result could not be applied.');
      throw error;
    }
    return result;
  }
}
