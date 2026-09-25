import { describe, expect, it } from 'vitest';
import type { Job } from '../packages/fieldstead-domain/src';
import { buildCalendarDays, calendarRange, listUnscheduledJobs } from './dispatch-calendar';

function job(id: string, scheduledFor?: string): Job {
  return { id, customerId: `customer-${id}`, service: 'Service', description: '', quoteStatus: 'Approved', quoteAmount: 100, scheduledFor, durationHours: 2, crew: 'Crew A', status: scheduledFor ? 'Scheduled' : 'Quoted', invoiceStatus: 'Not created', invoiceAmount: 100, createdAt: '2026-09-25T12:00:00.000Z', updatedAt: '2026-09-25T12:00:00.000Z' };
}

describe('dispatch calendar view model', () => {
  it('creates local day and Monday-start week ranges as ISO instants', () => {
    const focus = new Date(2026, 8, 30, 12);
    const day = calendarRange(focus, 'day');
    expect(day.end.getTime() - day.start.getTime()).toBe(24 * 60 * 60 * 1000);
    const week = calendarRange(focus, 'week');
    expect(week.start.getDay()).toBe(1);
    expect(week.end.getTime() - week.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('sorts calendar jobs deterministically and groups them by local day', () => {
    const jobs = [job('B', '2026-09-28T14:00:00.000Z'), job('A', '2026-09-28T14:00:00.000Z'), job('C', '2026-09-29T14:00:00.000Z')];
    const days = buildCalendarDays(jobs, new Date(2026, 8, 28, 12), 'week');
    expect(days[0]?.jobs.map((item) => item.id)).toEqual(['A', 'B']);
    expect(days[1]?.jobs.map((item) => item.id)).toEqual(['C']);
  });

  it('keeps only open jobs without a schedule in the queue', () => {
    expect(listUnscheduledJobs([job('A'), job('B', '2026-09-28T14:00:00.000Z'), job('C', undefined), job('D', undefined)]).map((item) => item.id)).toEqual(['A', 'C', 'D']);
  });
});
