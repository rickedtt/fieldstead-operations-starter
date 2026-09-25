import type { Job } from '../packages/fieldstead-domain/src';

export type CalendarMode = 'day' | 'week';
export type CalendarDay = { date: Date; key: string; jobs: Job[] };

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calendarRange(focus: Date, mode: CalendarMode): { start: Date; end: Date } {
  const start = startOfLocalDay(focus);
  if (mode === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + (mode === 'week' ? 7 : 1));
  return { start, end };
}

export function buildCalendarDays(jobs: Job[], focus: Date, mode: CalendarMode): CalendarDay[] {
  const { start, end } = calendarRange(focus, mode);
  const sorted = jobs.filter((job) => job.scheduledFor && new Date(job.scheduledFor) >= start && new Date(job.scheduledFor) < end)
    .sort((left, right) => left.scheduledFor!.localeCompare(right.scheduledFor!) || left.id.localeCompare(right.id));
  const count = mode === 'week' ? 7 : 1;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start); date.setDate(date.getDate() + index); const key = localDayKey(date);
    return { date, key, jobs: sorted.filter((job) => localDayKey(new Date(job.scheduledFor!)) === key) };
  });
}

export function listUnscheduledJobs(jobs: Job[]): Job[] {
  return jobs.filter((job) => !job.scheduledFor && !['Completed', 'Canceled'].includes(job.status))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
}
