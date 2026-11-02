import { describe, it, expect } from 'vitest';
import { localWallToUtc, scheduledWindow, resolveAttendanceDate, isWorkday, localDateOf, nextWorkday, addLocalDays } from '../src/attendance/schedule.util';

const office = { workdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', graceMinutes: 10, halfDayPercent: 50 };
const night = { ...office, startTime: '20:00', endTime: '04:00' };

describe('schedule.util: wall time to UTC', () => {
  it('converts Asia/Karachi (UTC+5, no DST)', () => {
    expect(localWallToUtc('2026-11-02', '09:00', 'Asia/Karachi').toISOString()).toBe('2026-11-02T04:00:00.000Z');
    expect(localDateOf(new Date('2026-11-02T20:30:00.000Z'), 'Asia/Karachi')).toBe('2026-11-03');
  });

  it('converts Europe/Berlin across the spring DST day', () => {
    expect(localWallToUtc('2026-03-28', '09:00', 'Europe/Berlin').toISOString()).toBe('2026-03-28T08:00:00.000Z');
    expect(localWallToUtc('2026-03-29', '09:00', 'Europe/Berlin').toISOString()).toBe('2026-03-29T07:00:00.000Z');
    // 02:30 does not exist on 2026-03-29: resolve to the instant after the gap.
    expect(localWallToUtc('2026-03-29', '02:30', 'Europe/Berlin').toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('converts Europe/Berlin across the autumn DST day', () => {
    expect(localWallToUtc('2026-10-24', '09:00', 'Europe/Berlin').toISOString()).toBe('2026-10-24T07:00:00.000Z');
    expect(localWallToUtc('2026-10-25', '09:00', 'Europe/Berlin').toISOString()).toBe('2026-10-25T08:00:00.000Z');
    // Window spanning the fall-back night is one hour longer in UTC.
    const w = scheduledWindow(night, 'Europe/Berlin', '2026-10-24');
    expect(w.start.toISOString()).toBe('2026-10-24T18:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });

  it('puts the end on the next day when endTime <= startTime', () => {
    const w = scheduledWindow(night, 'Asia/Karachi', '2026-11-02');
    expect(w.start.toISOString()).toBe('2026-11-02T15:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-02T23:00:00.000Z');
    const d = scheduledWindow(office, 'Asia/Karachi', '2026-11-02');
    expect(d.end.getTime()).toBeGreaterThan(d.start.getTime());
    expect(d.end.toISOString()).toBe('2026-11-02T13:00:00.000Z');
  });
});

describe('schedule.util: workdays and attendance date (F8)', () => {
  it('isWorkday uses ISO weekdays of the local date', () => {
    expect(isWorkday('2026-11-02', office)).toBe(true); // Monday
    expect(isWorkday('2026-11-07', office)).toBe(false); // Saturday
    expect(addLocalDays('2026-11-30', 1)).toBe('2026-12-01');
  });

  it('binds a start within 4 h before / 8 h after the scheduled start to that date', () => {
    const early = resolveAttendanceDate(new Date('2026-11-02T03:30:00.000Z'), office, 'Asia/Karachi');
    expect(early).toMatchObject({ date: '2026-11-02', unscheduled: false });
    const late = resolveAttendanceDate(new Date('2026-11-02T11:00:00.000Z'), office, 'Asia/Karachi');
    expect(late).toMatchObject({ date: '2026-11-02', unscheduled: false });
  });

  it('binds a night shift that starts after midnight to the scheduled start date', () => {
    const r = resolveAttendanceDate(new Date('2026-11-02T20:30:00.000Z'), night, 'Asia/Karachi'); // 01:30 local on Nov 3
    expect(r.date).toBe('2026-11-02');
    expect(r.unscheduled).toBe(false);
    expect(r.window?.start.toISOString()).toBe('2026-11-02T15:00:00.000Z');
  });

  it('falls back to the local start date with unscheduled outside the window or without schedule', () => {
    const tooEarly = resolveAttendanceDate(new Date('2026-11-01T23:00:00.000Z'), office, 'Asia/Karachi'); // 04:00 local, 5 h before
    expect(tooEarly).toMatchObject({ date: '2026-11-02', unscheduled: true, window: null });
    const weekend = resolveAttendanceDate(new Date('2026-11-07T05:00:00.000Z'), office, 'Asia/Karachi');
    expect(weekend).toMatchObject({ date: '2026-11-07', unscheduled: true });
    const none = resolveAttendanceDate(new Date('2026-11-02T05:00:00.000Z'), null, 'Asia/Karachi');
    expect(none).toMatchObject({ date: '2026-11-02', unscheduled: true });
  });

  it('nextWorkday skips weekends and holidays within 14 days', () => {
    expect(nextWorkday('2026-11-06', office, new Set(['2026-11-09']))).toBe('2026-11-10');
    expect(nextWorkday('2026-11-06', { workdays: [] }, new Set())).toBeNull();
  });
});
