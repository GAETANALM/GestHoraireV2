/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WeekDayId } from '../types';

export const dayIdToLabel: Record<WeekDayId, string> = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche',
};

export const weekDayIds: WeekDayId[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/**
 * Returns the YYYY-MM-DD string for the Monday of the week for a given Date.
 */
export function getMondayOfDate(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  // Adjust so Monday is 0, Sunday is 6
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const dayStr = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

/**
 * Add days to a YYYY-MM-DD string and return new YYYY-MM-DD.
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayStr = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

/**
 * Returns array of 7 days starting from a Monday string.
 */
export function getWeekDays(mondayStr: string): { dayId: WeekDayId; label: string; date: string }[] {
  return weekDayIds.map((dayId, index) => {
    return {
      dayId,
      label: dayIdToLabel[dayId],
      date: addDays(mondayStr, index),
    };
  });
}

/**
 * Returns the WeekDayId corresponding to a date YYYY-MM-DD.
 */
export function getWeekdayIdOfDate(dateStr: string): WeekDayId {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const mapping: Record<number, WeekDayId> = {
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
    0: 'sunday',
  };
  return mapping[day];
}

/**
 * Returns all dates for a given month in YYYY-MM format.
 */
export function getDaysInMonth(monthStr: string): string[] {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  const days: string[] = [];
  while (date.getMonth() === month - 1) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${d}`);
    date.setDate(date.getDate() + 1);
  }
  return days;
}

/**
 * Returns array of days objects for a month.
 */
export function getMonthDays(monthStr: string): { dayId: WeekDayId; label: string; date: string }[] {
  const dates = getDaysInMonth(monthStr);
  return dates.map(date => {
    const dayId = getWeekdayIdOfDate(date);
    return {
      dayId,
      label: dayIdToLabel[dayId],
      date,
    };
  });
}

export const MONTHS_FR_LONG = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

/**
 * Formats YYYY-MM into French, e.g. "Juin 2026"
 */
export function formatFrenchMonth(monthStr: string): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [yearStr, monthStrNum] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStrNum, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return monthStr;
  return `${MONTHS_FR_LONG[month - 1]} ${year}`;
}

export function getPreviousMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getNextMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Calculate decimal hours between "HH:MM" and "HH:MM" minus breakMinutes.
 */
export function calculateHours(start: string, end: string, breakMinutes: number): number {
  if (!start || !end) return 0;
  
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;
  
  let startTotalMinutes = startH * 60 + startM;
  let endTotalMinutes = endH * 60 + endM;
  
  // If end is before start, assume it crosses midnight
  if (endTotalMinutes < startTotalMinutes) {
    endTotalMinutes += 24 * 60;
  }
  
  const totalWorkMinutes = endTotalMinutes - startTotalMinutes - breakMinutes;
  return Math.max(0, totalWorkMinutes / 60);
}

/**
 * Helper to display decimal hours cleanly (e.g. 7.5 -> "7h30")
 */
export function formatHours(hours: number): string {
  if (hours <= 0) return '0h00';
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return `${wholeHours}h${String(minutes).padStart(2, '0')}`;
}

/**
 * Formats YYYY-MM-DD date into long French format
 */
export function formatFrenchDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Find the formatted week range, e.g. "Du 1 Juin au 7 Juin 2026"
 */
export function formatWeekRange(mondayStr: string): string {
  const mon = new Date(mondayStr + 'T00:00:00');
  const sun = new Date(addDays(mondayStr, 6) + 'T00:00:00');
  
  const monDay = mon.getDate();
  const monMonth = mon.toLocaleDateString('fr-FR', { month: 'short' });
  const sunDay = sun.getDate();
  const sunMonth = sun.toLocaleDateString('fr-FR', { month: 'short' });
  const sunYear = sun.getFullYear();
  
  if (mon.getMonth() === sun.getMonth()) {
    return `Du ${monDay} au ${sunDay} ${sunMonth} ${sunYear}`;
  } else {
    return `Du ${monDay} ${monMonth} au ${sunDay} ${sunMonth} ${sunYear}`;
  }
}
