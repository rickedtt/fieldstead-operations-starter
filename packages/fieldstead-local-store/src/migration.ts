import {
  parseActivityEvent,
  parseJob,
  type ActivityEvent,
  type Job,
  type JobAssignment,
} from '../../fieldstead-domain/src';
import type { FieldsteadRepository } from './index';

export const HARBOR_PINE_V1_STORAGE_KEY = 'harbor-pine-operations-v1';
const IMPORT_MARKER_KEY = `migration:${HARBOR_PINE_V1_STORAGE_KEY}`;

export type LegacyStorage = Pick<Storage, 'getItem'>;

export type ImportResult =
  | { imported: true; jobs: number; activityEvents: number }
  | { imported: false; reason: 'already-imported' | 'not-found' };

type LegacyState = {
  jobs: Job[];
  activityEvents: ActivityEvent[];
};

function parseLegacyState(serialized: string): LegacyState {
  const value: unknown = JSON.parse(serialized);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Legacy operations state must be an object');
  }

  const state = value as Record<string, unknown>;
  if (!Array.isArray(state.jobs) || !Array.isArray(state.activity)) {
    throw new TypeError('Legacy operations state must contain jobs and activity');
  }

  return {
    jobs: state.jobs.map(parseJob),
    activityEvents: state.activity.map(parseActivityEvent),
  };
}

function legacyAssignments(jobs: Job[]): JobAssignment[] {
  return jobs
    .filter((job) => job.crew !== 'Unassigned')
    .map((job) => ({
      id: `legacy-crew:${job.id}`,
      jobId: job.id,
      assigneeId: `legacy-crew:${job.crew.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`,
      assigneeName: job.crew,
      assignedAt: job.scheduledFor ?? job.updatedAt,
    }));
}

export async function importHarborPineOperationsV1(
  repository: FieldsteadRepository,
  storage: LegacyStorage,
): Promise<ImportResult> {
  if (await repository.metadata.get(IMPORT_MARKER_KEY)) {
    return { imported: false, reason: 'already-imported' };
  }

  const serialized = storage.getItem(HARBOR_PINE_V1_STORAGE_KEY);
  if (serialized === null) return { imported: false, reason: 'not-found' };

  const legacy = parseLegacyState(serialized);
  const imported = await repository.transaction(
    'rw',
    repository.jobs,
    repository.assignments,
    repository.activityEvents,
    repository.metadata,
    async () => {
      if (await repository.metadata.get(IMPORT_MARKER_KEY)) return false;

      await repository.jobs.bulkPut(legacy.jobs);
      await repository.assignments.bulkPut(legacyAssignments(legacy.jobs));
      await repository.activityEvents.bulkPut(legacy.activityEvents);
      await repository.metadata.add({
        key: IMPORT_MARKER_KEY,
        value: {
          source: HARBOR_PINE_V1_STORAGE_KEY,
          jobs: legacy.jobs.length,
          activityEvents: legacy.activityEvents.length,
        },
        updatedAt: new Date().toISOString(),
      });
      return true;
    },
  );

  if (!imported) return { imported: false, reason: 'already-imported' };
  return {
    imported: true,
    jobs: legacy.jobs.length,
    activityEvents: legacy.activityEvents.length,
  };
}
