/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'employee' | 'validator';

export interface DefaultDaySchedule {
  active: boolean;     // whether they usually work this day
  morningHours: number;   // e.g. 4.0
  afternoonHours: number; // e.g. 3.5
}

export type WeekDayId = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isEmployee?: boolean;
  isValidator?: boolean;
  isAdmin?: boolean;
  isActive?: boolean; // toggle active status of the account
  defaultSchedule: Record<WeekDayId, DefaultDaySchedule>;
  password?: string;    // Simulated password for offline auth
  pin?: string;         // PIN code for fast login screen
  failedLoginAttempts?: number; // Number of failed login attempts
  lockedUntil?: string;         // ISO timestamp until which this user is locked
}

export interface DayRecord {
  dayId: WeekDayId;
  date: string;          // YYYY-MM-DD
  active: boolean;       // did work today?
  morningHours: number;  // hours spent in the morning, e.g. 4.0
  afternoonHours: number;// hours spent in the afternoon, e.g. 3.5
  overtimeHours: number; // additional overtime hours
  overtimeNote: string;  // justification for overtime
  paidLeave?: 'morning' | 'afternoon' | 'full' | boolean;   // Congés payés (legacy)
  unpaidLeave?: 'morning' | 'afternoon' | 'full' | boolean; // Congés sans solde (legacy)
  sickLeave?: 'morning' | 'afternoon' | 'full' | boolean;   // Arrêts maladie / Accident (legacy)
  notPresent?: boolean;                                     // "Pas présent" button toggled
  absenceDuration?: 'morning' | 'afternoon' | 'full';       // demi-journée ou journée complète: matin, après-midi, jour complet
  absenceType?: 'paid' | 'unpaid' | 'sick' | 'recovery' | 'other'; // Congés payé, conges sans solde, arrêt, recuperation, autre
  absenceReason?: string;                                   // raison de l'absence
  hasDayNote?: boolean;                                     // case à cocher pour ajouter une note
  dayNote?: string;                                         // note de la journée
}

export type TimesheetStatus = 'draft' | 'submitted' | 'validated' | 'rejected';

export interface Timesheet {
  id: string;
  userId: string;
  userName: string;
  monthDate: string; // YYYY-MM (e.g. "2026-06")
  status: TimesheetStatus;
  days: Record<string, DayRecord>; // Keys are date strings YYYY-MM-DD
  submittedAt?: string;
  validatedAt?: string;
  validatedBy?: string;
  validatedByName?: string;
  rejectionReason?: string;
}

export function ensure6DigitPin(pin: string): string {
  // Set all PIN codes to 111111
  return '111111';
}

