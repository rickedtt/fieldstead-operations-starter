'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { ActivityEvent, Customer as DurableCustomer, Job, OperationalAttachment, ServiceRequest } from '../../packages/fieldstead-domain/src';
import {
  createFieldsteadRepository,
  type FieldsteadRepository,
} from '../../packages/fieldstead-local-store/src';
import {
  importHarborPineOperationsV1,
  type ImportResult,
  type LegacyStorage,
} from '../../packages/fieldstead-local-store/src/migration';

export const FIELDSTEAD_DATABASE_NAME =
  'fieldstead-operations-starter-dogfood-v1';

export type LocalJobsSnapshot = {
  jobs: Job[];
  customers: DurableCustomer[];
  activity: ActivityEvent[];
  loading: boolean;
  error: Error | null;
};

type LocalJobsStoreOptions = {
  fallbackJobs: Job[];
  createRepository?: () => FieldsteadRepository;
  createOperationId?: () => string;
  now?: () => string;
};

function defaultOperationId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `operation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class LocalJobsStore {
  private readonly fallbackJobs: Job[];
  private readonly createRepository: () => FieldsteadRepository;
  private readonly createOperationId: () => string;
  private readonly now: () => string;
  private readonly listeners = new Set<() => void>();
  private repository?: FieldsteadRepository;
  private observation?: { unsubscribe(): void };
  private customerObservation?: { unsubscribe(): void };
  private activityObservation?: { unsubscribe(): void };
  private starting?: Promise<void>;
  private snapshot: LocalJobsSnapshot;

  constructor(options: LocalJobsStoreOptions) {
    this.fallbackJobs = structuredClone(options.fallbackJobs);
    this.createRepository =
      options.createRepository ??
      (() => createFieldsteadRepository(FIELDSTEAD_DATABASE_NAME));
    this.createOperationId = options.createOperationId ?? defaultOperationId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.snapshot = {
      jobs: structuredClone(this.fallbackJobs),
      customers: [],
      activity: [],
      loading: true,
      error: null,
    };
  }

  getSnapshot = (): LocalJobsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(next: LocalJobsSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  start(): Promise<void> {
    if (this.observation) return Promise.resolve();
    if (this.starting) return this.starting;

    this.repository ??= this.createRepository();
    const repository = this.repository;
    this.starting = (async () => {
      try {
        await repository.open();
        await repository.seedJobsIfEmpty(this.fallbackJobs);
        this.observation = repository.observeJobs().subscribe({
          next: (jobs) => this.update({ ...this.snapshot, jobs, loading: false, error: null }),
          error: (error) =>
            this.update({
              ...this.snapshot,
              loading: false,
              error: asError(error),
            }),
        });
        this.customerObservation = repository.observeCustomers().subscribe({
          next: (customers) => this.update({ ...this.snapshot, customers, error: null }),
          error: (error) => this.update({ ...this.snapshot, error: asError(error) }),
        });
        this.activityObservation = repository.observeActivityEvents().subscribe({
          next: (activity) => this.update({ ...this.snapshot, activity, error: null }),
          error: (error) => this.update({ ...this.snapshot, error: asError(error) }),
        });
      } catch (error) {
        this.update({
          ...this.snapshot,
          loading: false,
          error: asError(error),
        });
        throw error;
      } finally {
        this.starting = undefined;
      }
    })();
    return this.starting;
  }

  stop(): void {
    this.observation?.unsubscribe();
    this.customerObservation?.unsubscribe();
    this.activityObservation?.unsubscribe();
    this.observation = undefined;
    this.customerObservation = undefined;
    this.activityObservation = undefined;
  }

  async mutateJob(
    jobId: string,
    changes: Partial<Omit<Job, 'id' | 'createdAt'>>,
    activityEvent?: ActivityEvent,
  ): Promise<Job> {
    const previousJobs = this.snapshot.jobs;
    const occurredAt = this.now();
    const current = previousJobs.find((job) => job.id === jobId);
    if (!current) throw new Error(`Job ${jobId} was not found`);

    const optimistic = {
      ...current,
      ...changes,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: occurredAt,
    };
    this.update({
      ...this.snapshot,
      jobs: previousJobs.map((job) => (job.id === jobId ? optimistic : job)),
      loading: this.snapshot.loading,
      error: null,
    });

    try {
      await this.start();
      const updated = await this.repository!.mutateJob({
        jobId,
        changes,
        operationId: this.createOperationId(),
        occurredAt,
        activityEvent,
      });
      this.update({ ...this.snapshot, error: null });
      return updated;
    } catch (error) {
      this.update({
        ...this.snapshot,
        jobs: previousJobs,
        loading: false,
        error: asError(error),
      });
      throw error;
    }
  }

  async createJob(job: Job, activityEvent?: ActivityEvent): Promise<Job> {
    const previousJobs = this.snapshot.jobs;
    this.update({ ...this.snapshot, jobs: [job, ...previousJobs], loading: false, error: null });

    try {
      await this.start();
      const created = await this.repository!.createJob({
        job,
        operationId: this.createOperationId(),
        occurredAt: this.now(),
        activityEvent,
      });
      this.update({ ...this.snapshot, error: null });
      return created;
    } catch (error) {
      this.update({
        ...this.snapshot,
        jobs: previousJobs,
        loading: false,
        error: asError(error),
      });
      throw error;
    }
  }

  async createCustomer(customer: DurableCustomer, activityEvent: ActivityEvent): Promise<DurableCustomer> {
    const previousCustomers = this.snapshot.customers;
    const previousActivity = this.snapshot.activity;
    this.update({
      ...this.snapshot,
      customers: [customer, ...previousCustomers],
      activity: [activityEvent, ...previousActivity],
      error: null,
    });
    try {
      await this.start();
      return await this.repository!.createCustomerRecord({
        customer,
        activityEvent,
        operationId: this.createOperationId(),
        occurredAt: activityEvent.at,
      });
    } catch (error) {
      this.update({
        ...this.snapshot,
        customers: previousCustomers,
        activity: previousActivity,
        error: asError(error),
      });
      throw error;
    }
  }

  async listDurableCustomers(): Promise<DurableCustomer[]> {
    await this.start();
    return this.repository!.listCustomers();
  }

  async getDurableServiceRequest(serviceRequestId: string): Promise<ServiceRequest | undefined> {
    await this.start();
    return this.repository!.getServiceRequest(serviceRequestId);
  }

  async convertServiceRequestToJob(input: Parameters<FieldsteadRepository['convertServiceRequestToJob']>[0]) {
    await this.start();
    const converted = await this.repository!.convertServiceRequestToJob(input);
    this.update({
      ...this.snapshot,
      jobs: [converted.job, ...this.snapshot.jobs.filter((job) => job.id !== converted.job.id)],
      loading: false,
      error: null,
    });
    return converted;
  }

  async convertEmailIntake(input: Parameters<FieldsteadRepository['convertEmailIntake']>[0]) {
    await this.start();
    return this.repository!.convertEmailIntake(input);
  }

  async recordAttachmentAdded(attachment: OperationalAttachment) {
    await this.start();
    return this.repository!.recordAttachmentAdded({
      attachment, actorId: 'Fieldstead owner', actorRole: 'owner_admin',
      auditEventId: `activity-${this.createOperationId()}`,
    });
  }

  async recordAttachmentDeleted(attachmentId: string) {
    await this.start();
    return this.repository!.recordAttachmentDeleted({
      attachmentId, actorId: 'Fieldstead owner', actorRole: 'owner_admin', occurredAt: this.now(),
      auditEventId: `activity-${this.createOperationId()}`,
    });
  }

  async listAttachments(ownerType: OperationalAttachment['ownerType'], ownerId: string) {
    await this.start();
    return this.repository!.listAttachments(ownerType, ownerId);
  }

  async listPricebookItems() {
    await this.start();
    return this.repository!.listPricebookItems();
  }

  async getEstimateForJob(jobId: string) {
    await this.start();
    return this.repository!.getEstimateForJob(jobId);
  }

  async saveEstimate(input: Parameters<FieldsteadRepository['saveEstimate']>[0]) {
    await this.start();
    return this.repository!.saveEstimate(input);
  }

  async migrateLocalStorage(storage: LegacyStorage): Promise<ImportResult> {
    try {
      await this.start();
      const result = await importHarborPineOperationsV1(this.repository!, storage);
      this.update({ ...this.snapshot, error: null });
      return result;
    } catch (error) {
      this.update({ ...this.snapshot, loading: false, error: asError(error) });
      throw error;
    }
  }

  async restoreSeedJobs(): Promise<void> {
    return this.replaceDemoJobs(this.fallbackJobs);
  }

  async replaceDemoJobs(jobs: Job[]): Promise<void> {
    const previousJobs = this.snapshot.jobs;
    this.update({
      ...this.snapshot,
      jobs: structuredClone(jobs),
      loading: false,
      error: null,
    });
    try {
      await this.start();
      await this.repository!.restoreSeedJobs(jobs);
    } catch (error) {
      this.update({ ...this.snapshot, jobs: previousJobs, loading: false, error: asError(error) });
      throw error;
    }
  }
}

export function useFieldsteadLocalJobs(fallbackJobs: Job[]) {
  const [store] = useState(() => new LocalJobsStore({ fallbackJobs }));
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  useEffect(() => {
    void store.start().catch(() => undefined);
    return () => store.stop();
  }, [store]);

  const migrateLocalStorage = useCallback(() => {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('localStorage is available only in a browser'));
    }
    return store.migrateLocalStorage(window.localStorage);
  }, [store]);

  return {
    ...snapshot,
    mutateJob: store.mutateJob.bind(store),
    createJob: store.createJob.bind(store),
    createCustomer: store.createCustomer.bind(store),
    listDurableCustomers: store.listDurableCustomers.bind(store),
    getDurableServiceRequest: store.getDurableServiceRequest.bind(store),
    convertEmailIntake: store.convertEmailIntake.bind(store),
    convertServiceRequestToJob: store.convertServiceRequestToJob.bind(store),
    recordAttachmentAdded: store.recordAttachmentAdded.bind(store),
    recordAttachmentDeleted: store.recordAttachmentDeleted.bind(store),
    listAttachments: store.listAttachments.bind(store),
    listPricebookItems: store.listPricebookItems.bind(store),
    getEstimateForJob: store.getEstimateForJob.bind(store),
    saveEstimate: store.saveEstimate.bind(store),
    migrateLocalStorage,
    replaceDemoJobs: store.replaceDemoJobs.bind(store),
    restoreSeedJobs: store.restoreSeedJobs.bind(store),
  };
}
