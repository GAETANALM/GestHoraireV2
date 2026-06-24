/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, Timesheet } from '../types';
import { getMonthDays } from '../utils/dateUtils';

export const INITIAL_USERS: User[] = [
  {
    id: 'user_sophie',
    name: 'Sophie Dubois',
    email: 'sophie@entreprise.com',
    role: 'validator',
    isEmployee: true,
    isValidator: true,
    isAdmin: true,
    pin: '111111',
    defaultSchedule: {
      monday: { morningHours: 4, afternoonHours: 4, active: true },
      tuesday: { morningHours: 4, afternoonHours: 4, active: true },
      wednesday: { morningHours: 4, afternoonHours: 4, active: true },
      thursday: { morningHours: 4, afternoonHours: 4, active: true },
      friday: { morningHours: 4, afternoonHours: 3, active: true },
      saturday: { morningHours: 0, afternoonHours: 0, active: false },
      sunday: { morningHours: 0, afternoonHours: 0, active: false },
    }
  },
  {
    id: 'user_jean',
    name: 'Jean Dupont',
    email: 'jean@entreprise.com',
    role: 'employee',
    isEmployee: true,
    isValidator: false,
    isAdmin: false,
    pin: '111111',
    defaultSchedule: {
      monday: { morningHours: 4, afternoonHours: 3.5, active: true },
      tuesday: { morningHours: 4, afternoonHours: 3.5, active: true },
      wednesday: { morningHours: 4, afternoonHours: 3, active: true },
      thursday: { morningHours: 4, afternoonHours: 3.5, active: true },
      friday: { morningHours: 4, afternoonHours: 2.5, active: true },
      saturday: { morningHours: 0, afternoonHours: 0, active: false },
      sunday: { morningHours: 0, afternoonHours: 0, active: false },
    }
  },
  {
    id: 'user_marie',
    name: 'Marie Martin',
    email: 'marie@entreprise.com',
    role: 'employee',
    isEmployee: true,
    isValidator: false,
    isAdmin: false,
    pin: '111111',
    defaultSchedule: {
      monday: { morningHours: 4, afternoonHours: 4, active: true },
      tuesday: { morningHours: 4, afternoonHours: 4, active: true },
      wednesday: { morningHours: 3, afternoonHours: 0, active: true }, // Half-day Wed
      thursday: { morningHours: 4, afternoonHours: 4, active: true },
      friday: { morningHours: 4, afternoonHours: 3.5, active: true },
      saturday: { morningHours: 0, afternoonHours: 0, active: false },
      sunday: { morningHours: 0, afternoonHours: 0, active: false },
    }
  },
  {
    id: 'user_lucas',
    name: 'Lucas Bernard',
    email: 'lucas@entreprise.com',
    role: 'employee',
    isEmployee: true,
    isValidator: false,
    isAdmin: false,
    pin: '111111',
    defaultSchedule: {
      monday: { morningHours: 4, afternoonHours: 4, active: true },
      tuesday: { morningHours: 4, afternoonHours: 4, active: true },
      wednesday: { morningHours: 0, afternoonHours: 0, active: false },
      thursday: { morningHours: 0, afternoonHours: 0, active: false },
      friday: { morningHours: 4, afternoonHours: 3.5, active: true },
      saturday: { morningHours: 0, afternoonHours: 0, active: false },
      sunday: { morningHours: 0, afternoonHours: 0, active: false },
    }
  }
];

// Helper to build a timesheet for a given user and month (YYYY-MM)
export function buildEmptyTimesheet(user: User, monthStr: string): Timesheet {
  const days = getMonthDays(monthStr);
  const daysRecord: Record<string, any> = {};
  
  days.forEach((day) => {
    const defaultDay = user.defaultSchedule[day.dayId];
    daysRecord[day.date] = {
      dayId: day.dayId,
      date: day.date,
      active: defaultDay.active,
      morningHours: defaultDay.morningHours,
      afternoonHours: defaultDay.afternoonHours,
      overtimeHours: 0,
      overtimeNote: '',
    };
  });

  return {
    id: `ts_${user.id}_${monthStr}`,
    userId: user.id,
    userName: user.name,
    monthDate: monthStr,
    status: 'draft',
    days: daysRecord,
  };
}

export function generateInitialTimesheets(users: User[]): Timesheet[] {
  const currentMonth = '2026-06'; // June 2026
  const lastMonth = '2026-05'; // May 2026
  
  const sheets: Timesheet[] = [];
  
  users.forEach((user) => {
    // Previous month timesheet - all validated to have historical data
    const lastMonthSheet = buildEmptyTimesheet(user, lastMonth);
    lastMonthSheet.status = 'validated';
    lastMonthSheet.validatedBy = 'user_sophie';
    lastMonthSheet.validatedByName = 'Sophie Dubois';
    lastMonthSheet.validatedAt = '2026-06-01T09:00:00Z';
    sheets.push(lastMonthSheet);
    
    // Current month timesheet - set different statuses for demo
    const currentMonthSheet = buildEmptyTimesheet(user, currentMonth);
    
    if (user.id === 'user_jean') {
      // Jean has submitted his sheet with modified hours and key overtime records
      currentMonthSheet.status = 'submitted';
      
      if (currentMonthSheet.days['2026-06-02']) {
        currentMonthSheet.days['2026-06-02'].afternoonHours = 5.0; // worked extra 1.5h
        currentMonthSheet.days['2026-06-02'].overtimeHours = 1.5;
        currentMonthSheet.days['2026-06-02'].overtimeNote = 'Urgence livraison serveur de production et tests.';
      }
      
      if (currentMonthSheet.days['2026-06-04']) {
        currentMonthSheet.days['2026-06-04'].overtimeHours = 1.0;
        currentMonthSheet.days['2026-06-04'].overtimeNote = 'Assistance technique tardive pour un client.';
      }
      currentMonthSheet.submittedAt = '2026-06-02T17:45:00Z';
    } else if (user.id === 'user_marie') {
      // Marie is in draft, has modified some hours
      currentMonthSheet.status = 'draft';
      if (currentMonthSheet.days['2026-06-01']) {
        currentMonthSheet.days['2026-06-01'].morningHours = 4.5;
        currentMonthSheet.days['2026-06-01'].afternoonHours = 4.5;
      }
    } else if (user.id === 'user_lucas') {
      // Lucas submitted but it was rejected because he forgot the overtime note
      currentMonthSheet.status = 'rejected';
      if (currentMonthSheet.days['2026-06-01']) {
        currentMonthSheet.days['2026-06-01'].overtimeHours = 2.0;
        currentMonthSheet.days['2026-06-01'].overtimeNote = ''; // Empty note - reason for rejection
      }
      currentMonthSheet.rejectionReason = "Merci d'ajouter une note détaillant la raison de tes 2h supplémentaires pour le lundi 1er Juin.";
      currentMonthSheet.submittedAt = '2026-06-02T16:00:00Z';
    } else if (user.id === 'user_sophie') {
      // Sophie is in draft
      currentMonthSheet.status = 'draft';
    }
    
    sheets.push(currentMonthSheet);
  });
  
  return sheets;
}
