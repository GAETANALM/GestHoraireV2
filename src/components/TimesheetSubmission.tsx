/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { Timesheet, DayRecord, WeekDayId, User } from '../types';
import { exportSingleTimesheetToExcel } from '../utils/excelUtils';
import { 
  getMonthDays, 
  dayIdToLabel, 
  calculateHours, 
  formatHours, 
  formatFrenchMonth, 
  formatFrenchDate,
  weekDayIds,
  addDays,
  getMondayOfDate,
  formatWeekRange
} from '../utils/dateUtils';
import { 
  Save, 
  Send, 
  Clock, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  Calendar,
  ChevronLeft,
  ChevronRight,
  Info,
  Download,
  FileSpreadsheet
} from 'lucide-react';

interface TimesheetSubmissionProps {
  currentUser: User;
  timesheet: Timesheet;
  onSaveTimesheet: (timesheet: Timesheet) => void;
  onSelectMonth: (monthDateStr: string) => void;
}

export default function TimesheetSubmission({
  currentUser,
  timesheet: initialTimesheet,
  onSaveTimesheet,
  onSelectMonth,
}: TimesheetSubmissionProps) {
  // Store the active state of timesheet being edited
  const [timesheet, setTimesheet] = useState<Timesheet>(initialTimesheet);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);

  // Sync state if initialTimesheet changes from parent
  useEffect(() => {
    setTimesheet(initialTimesheet);
    setValidationError(null);
  }, [initialTimesheet]);

  const isReadOnly = timesheet.status === 'submitted' || timesheet.status === 'validated';

  const handleDownloadPdf = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Draw dark rounded square for LM logo at top left
    doc.setFillColor(28, 28, 28);
    doc.roundedRect(15, 12, 14, 14, 2.5, 2.5, 'F');
    
    // Draw white "LM" text centered inside logo
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("LM", 18.5, 21.5);

    // Header titles adjacent to the logo
    doc.setTextColor(28, 28, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("GESTHORAIREALM", 33, 18);
    
    doc.setTextColor(100, 116, 139); // slate-500
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("Feuille d'heures mensuelle - Portail de Saisie & Validation", 33, 23);

    const boxY = 28;
    const boxHeight = 23;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(15, boxY, 180, boxHeight, 'F');
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.rect(15, boxY, 180, boxHeight, 'S');
    
    // Left side metadata texts (Col 1)
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("SALARIÉ", 19, boxY + 5.5);
    doc.text("PÉRIODE", 19, boxY + 11.5);
    doc.text("STATUT", 19, boxY + 17.5);
    
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(currentUser.name, 38, boxY + 5.5);
    doc.text(formatFrenchMonth(timesheet.monthDate), 38, boxY + 11.5);
    
    const statusFr = timesheet.status === 'validated' ? 'VALIDÉ' : timesheet.status === 'submitted' ? 'SOUMIS' : 'BROUILLON';
    if (timesheet.status === 'validated') {
      doc.setTextColor(16, 185, 129); // emerald-500
    } else if (timesheet.status === 'submitted') {
      doc.setTextColor(245, 158, 11); // amber-500
    } else {
      doc.setTextColor(100, 116, 139); // slate-500
    }
    doc.text(statusFr, 38, boxY + 17.5);
    
    // Column 2
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("REQUIS (CONTRAT)", 72, boxY + 5.5);
    doc.text("HEURES NORMALES", 72, boxY + 11.5);
    doc.text("HEURES DE NUIT", 72, boxY + 17.5);
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`${monthlyRequiredHours} h`, 104, boxY + 5.5);
    doc.text(`${totalRegular} h`, 104, boxY + 11.5);
    
    let totalNightHours = 0;
    if (timesheet.days) {
      Object.values(timesheet.days).forEach((d: any) => {
        totalNightHours += (d.overtimeHours || 0);
      });
    }
    doc.text(`${totalNightHours} h`, 104, boxY + 17.5);

    // Column 3
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("HEURES SUPP.", 118, boxY + 5.5);
    doc.text("TOTAL EFFECTUÉ", 118, boxY + 11.5);
    doc.text("SOLDE PORTEFEUILLE", 118, boxY + 17.5);
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`${totalOvertime} h`, 152, boxY + 5.5);
    
    doc.setTextColor(79, 70, 229); // indigo-600
    doc.text(`${monthlyWorkedHours} h`, 152, boxY + 11.5);
    
    const balance = monthlyWorkedHours - monthlyRequiredHours;
    if (balance > 0) doc.setTextColor(16, 185, 129);
    else if (balance < 0) doc.setTextColor(225, 29, 72);
    else doc.setTextColor(100, 116, 139);
    doc.text(`${balance >= 0 ? '+' : ''}${balance} h`, 152, boxY + 17.5);

    // Column 4
    doc.setTextColor(100, 116, 139);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text("CONGÉS PAYÉS", 164, boxY + 5.5);
    doc.text("SANS SOLDE", 164, boxY + 11.5);
    doc.text("ARRÊTS MALADIE", 164, boxY + 17.5);
    
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`${paidLeaveDays} j`, 190, boxY + 5.5);
    doc.text(`${unpaidLeaveDays} j`, 190, boxY + 11.5);
    doc.text(`${sickLeaveDays} j`, 190, boxY + 17.5);

    const monthDaysList = getMonthDays(timesheet.monthDate);
    
    const tableYStart = 54;
    const headerHeight = 6;
    const rHeight = 5.2; // Row height: 5.2mm to fit all 31 days perfectly on a single sheet
    
    // Header row background across the whole 180mm width
    doc.setFillColor(51, 65, 85); // slate-700
    doc.rect(15, tableYStart, 180, headerHeight, 'F');
    
    // Header Texts
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    
    // Header column labels
    doc.text("Date", 16, tableYStart + 4);
    doc.text("Matin", 34, tableYStart + 4);
    doc.text("A.-Midi", 48, tableYStart + 4);
    doc.text("Nuit", 64, tableYStart + 4);
    doc.text("Sup.", 77, tableYStart + 4);
    doc.text("Congés", 90, tableYStart + 4);
    doc.text("Requis", 104, tableYStart + 4);
    doc.text("Effectué", 120, tableYStart + 4);
    doc.text("Commentaires, Absences & Notes", 136, tableYStart + 4);

    // Table rows rendering
    let currentRowY = tableYStart + headerHeight;
    monthDaysList.forEach(({ dayId, label, date }, i) => {
      const rec = timesheet.days[date];
      if (!rec) return;
      
      // Determine day values and comment first so we can split it
      let morningVal = 0;
      let afternoonVal = 0;
      let nightVal = 0;
      let supVal = 0;
      let absenceCredit = 0;
      let reqHours = 0;
      let effectueVal = 0;
      let comment = '';
      
      const defaultDay = currentUser.defaultSchedule[dayId];
      if (defaultDay && defaultDay.active) {
        reqHours = defaultDay.morningHours + defaultDay.afternoonHours;
      }
      
      if (rec.notPresent) {
        const absTypeMap: Record<string, string> = {
          paid: 'Congés payés',
          unpaid: 'Congés sans solde',
          sick: 'Arrêt maladie',
          recovery: 'Récupération',
          other: 'Autre'
        };
        const typeLabel = absTypeMap[rec.absenceType || ''] || 'Absence';
        const durationLabel = rec.absenceDuration === 'morning' ? 'Matin' : rec.absenceDuration === 'afternoon' ? 'Après-Midi' : 'Journée entière';
        comment = `Absence ${durationLabel} [${typeLabel}]`;
        if (rec.absenceReason) {
          comment += ` : ${rec.absenceReason}`;
        }
        
        if (rec.absenceType === 'paid' || rec.absenceType === 'sick' || rec.absenceType === 'recovery' || rec.absenceType === 'unpaid' || rec.absenceType === 'other') {
          if (defaultDay) {
            absenceCredit = rec.absenceDuration === 'full' 
              ? (defaultDay.morningHours + defaultDay.afternoonHours) 
              : (rec.absenceDuration === 'morning' ? defaultDay.morningHours : defaultDay.afternoonHours);
          }
        }
        
        if (rec.absenceDuration === 'morning') {
          afternoonVal = rec.afternoonHours ?? 0;
          morningVal = 0;
        } else if (rec.absenceDuration === 'afternoon') {
          morningVal = rec.morningHours ?? 0;
          afternoonVal = 0;
        } else {
          morningVal = 0;
          afternoonVal = 0;
        }

        nightVal = rec.overtimeHours ?? 0;
        const dayPhysicalWorked = morningVal + afternoonVal;
        const dayStandardHours = dayPhysicalWorked + absenceCredit;
        const excessPhysical = reqHours > 0 ? Math.max(0, dayStandardHours - reqHours) : 0;
        supVal = excessPhysical;
        
        effectueVal = dayPhysicalWorked + nightVal + absenceCredit;
      } else if (rec.active) {
        morningVal = rec.morningHours ?? 0;
        afternoonVal = rec.afternoonHours ?? 0;
        nightVal = rec.overtimeHours ?? 0;
        
        const dayPhysicalWorked = morningVal + afternoonVal;
        const dayStandardHours = dayPhysicalWorked; // active physical hours
        const excessPhysical = reqHours > 0 ? Math.max(0, dayStandardHours - reqHours) : 0;
        supVal = excessPhysical;
        
        effectueVal = dayPhysicalWorked + nightVal;
        comment = rec.overtimeNote || '';
      } else {
        comment = "Non travaillé / Repos";
      }
      
      if (rec.dayNote) {
        comment = comment ? `${comment} | Note: ${rec.dayNote}` : `Note: ${rec.dayNote}`;
      }

      const splitComment = doc.splitTextToSize(comment || '', 58);
      const linesCount = Math.max(1, splitComment.length);
      const rowHeight = linesCount === 1 ? 5.2 : linesCount === 2 ? 7.6 : 4.0 + (linesCount * 2.0);
      
      const rowY = currentRowY;
      
      // Striped background for weekends vs alternating rows
      const dateObj = new Date(date + 'T00:00:00');
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      
      if (isWeekend) {
        doc.setFillColor(241, 245, 249); // slate-100 for weekends
        doc.rect(15, rowY, 180, rowHeight, 'F');
      } else if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250); // slight alternating row bg
        doc.rect(15, rowY, 180, rowHeight, 'F');
      }
      
      // Gray bottom border line
      doc.setDrawColor(241, 245, 249);
      doc.line(15, rowY + rowHeight, 195, rowY + rowHeight);
      
      // Date label
      const formattedDateCell = `${date.split('-')[2]} (${label.substring(0, 3)})`;
      if (isWeekend) {
        doc.setTextColor(148, 163, 184); // slate-400 for weekends
        doc.setFont("helvetica", "italic");
      } else {
        doc.setTextColor(15, 23, 42); // slate-900
        doc.setFont("helvetica", "bold");
      }
      doc.setFontSize(7);
      
      const textY = linesCount === 1 ? rowY + 3.6 : rowY + (rowHeight / 2) + 1.0;
      doc.text(formattedDateCell, 16, textY);
      
      // Value columns
      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85); // slate-700
      
      // Let's draw values for each cell:
      doc.setFontSize(6.5);
      
      // Matin (x=34)
      if (rec.notPresent && (rec.absenceDuration === 'full' || rec.absenceDuration === 'morning')) {
        doc.setTextColor(225, 29, 72); // rose-600
        doc.setFont("helvetica", "bold");
        doc.text("Abs", 34, textY);
      } else {
        doc.setTextColor(51, 65, 85);
        doc.setFont("helvetica", "normal");
        doc.text(morningVal > 0 ? `${morningVal}h` : "-", 34, textY);
      }
      
      // Après-Midi (x=48)
      if (rec.notPresent && (rec.absenceDuration === 'full' || rec.absenceDuration === 'afternoon')) {
        doc.setTextColor(225, 29, 72); // rose-600
        doc.setFont("helvetica", "bold");
        doc.text("Abs", 48, textY);
      } else {
        doc.setTextColor(51, 65, 85);
        doc.setFont("helvetica", "normal");
        doc.text(afternoonVal > 0 ? `${afternoonVal}h` : "-", 48, textY);
      }
      
      // Nuit (x=64)
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      if (nightVal > 0) {
        doc.setTextColor(217, 119, 6); // amber-600
        doc.setFont("helvetica", "bold");
        doc.text(`${nightVal}h`, 64, textY);
      } else {
        doc.text("-", 64, textY);
      }
      
      // Sup (x=77)
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      if (supVal > 0) {
        doc.setTextColor(16, 185, 129); // emerald-500
        doc.setFont("helvetica", "bold");
        doc.text(`+${supVal}h`, 77, textY);
      } else {
        doc.text("-", 77, textY);
      }
      
      // Congés (x=90)
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      if (absenceCredit > 0) {
        doc.setTextColor(225, 29, 72); // rose-600
        doc.setFont("helvetica", "bold");
        doc.text(`${absenceCredit}h`, 90, textY);
      } else {
        doc.text("-", 90, textY);
      }
      
      // Requis (x=104)
      doc.setTextColor(100, 116, 139); // slate-500
      doc.setFont("helvetica", "normal");
      doc.text(reqHours > 0 ? `${reqHours}h` : "-", 104, textY);
      
      // Effectué (x=120)
      doc.setFont("helvetica", "bold");
      if (effectueVal > 0) {
        doc.setTextColor(79, 70, 229); // indigo-600
        doc.text(`${effectueVal}h`, 120, textY);
      } else {
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text("0h", 120, textY);
      }
      
      // Commentaire / Motif (x=136)
      doc.setFont("helvetica", "normal");
      if (rec.notPresent) {
        doc.setTextColor(225, 29, 72); // rose-600
      } else if (isWeekend) {
        doc.setTextColor(148, 163, 184);
      } else {
        doc.setTextColor(71, 85, 105); // slate-600
      }
      
      splitComment.forEach((line: string, lineIndex: number) => {
        let lineY = rowY + 3.6;
        if (linesCount === 2) {
          lineY = rowY + 2.7 + (lineIndex * 2.0);
        } else if (linesCount >= 3) {
          lineY = rowY + 2.4 + (lineIndex * 1.9);
        }
        doc.text(line, 136, lineY);
      });

      currentRowY += rowHeight;
    });

    let footerY = currentRowY + 6;
    
    // Draw thin line before footer
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.line(15, footerY, 195, footerY);
    
    footerY += 5;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Ce document a été généré numériquement et validé électroniquement sur GestHoraireALM.`, 15, footerY);
    doc.text(`Date de génération : ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})} (Fiche validée numériquement)`, 15, footerY + 4);

    doc.save(`declaration_heures_${currentUser.name.replace(/\s+/g, '_')}_${timesheet.monthDate}.pdf`);
  };

  const handleDownloadExcel = () => {
    exportSingleTimesheetToExcel(timesheet, currentUser);
  };

  // Group days of the month by calendar week (Monday to Sunday)
  const daysByWeek = useMemo(() => {
    const monthDays = getMonthDays(timesheet.monthDate);
    const groups: { mondayDateStr: string; days: { dayId: WeekDayId; label: string; date: string }[] }[] = [];
    
    monthDays.forEach(day => {
      const monStr = getMondayOfDate(new Date(day.date + 'T00:00:00'));
      let existingGroup = groups.find(g => g.mondayDateStr === monStr);
      if (!existingGroup) {
        existingGroup = { mondayDateStr: monStr, days: [] };
        groups.push(existingGroup);
      }
      existingGroup.days.push(day);
    });
    
    return groups;
  }, [timesheet.monthDate]);

  // Helper to calculate total hours for a week group
  const calculateWeekTotals = (daysList: { dayId: WeekDayId; label: string; date: string }[]) => {
    let regular = 0;
    let overtime = 0;
    let absentDays = 0;
    let required = 0;
    let declared = 0;
    
    daysList.forEach(({ dayId, date }) => {
      const rec = timesheet.days[date];
      const defaultDay = currentUser.defaultSchedule[dayId];
      const dayRequired = (defaultDay && defaultDay.active) ? (defaultDay.morningHours + defaultDay.afternoonHours) : 0;
      required += dayRequired;

      if (rec) {
        let dayPhysicalWorked = 0;
        if (rec.active) {
          dayPhysicalWorked = (rec.morningHours || 0) + (rec.afternoonHours || 0);
        }

        let creditedAbsence = 0;
        if (rec.notPresent) {
          absentDays += rec.absenceDuration === 'full' ? 1 : 0.5;
          if (rec.absenceType === 'paid' || rec.absenceType === 'sick' || rec.absenceType === 'recovery' || rec.absenceType === 'unpaid' || rec.absenceType === 'other') {
            if (defaultDay) {
              creditedAbsence = rec.absenceDuration === 'full' 
                ? (defaultDay.morningHours + defaultDay.afternoonHours) 
                : (rec.absenceDuration === 'morning' ? defaultDay.morningHours : defaultDay.afternoonHours);
            }
          }
        }

        const dayStandardHours = dayPhysicalWorked + creditedAbsence;
        const baseStandard = dayRequired > 0 ? Math.min(dayRequired, dayStandardHours) : dayStandardHours;
        const excessPhysical = dayRequired > 0 ? Math.max(0, dayStandardHours - dayRequired) : 0;
        const deficit = Math.max(0, dayRequired - baseStandard);
        const declaredOvertime = rec.overtimeHours || 0;
        const totalOvertimeForDay = declaredOvertime + excessPhysical;
        const overtimeToComplete = Math.min(deficit, totalOvertimeForDay);

        regular += (baseStandard + overtimeToComplete);
        overtime += (totalOvertimeForDay - overtimeToComplete);
        declared += dayPhysicalWorked + declaredOvertime + creditedAbsence;
      }
    });
    
    return {
      regular,
      overtime,
      total: regular + overtime,
      absentDays,
      required,
      declared
    };
  };

  const handleDayValueChange = (dayKey: string, field: keyof DayRecord, value: any) => {
    if (isReadOnly) return;
    
    const updatedDays = { ...timesheet.days };
    updatedDays[dayKey] = {
      ...updatedDays[dayKey],
      [field]: value,
    };
    
    const newSheet = {
      ...timesheet,
      days: updatedDays,
    };
    setTimesheet(newSheet);
    onSaveTimesheet(newSheet);
    setValidationError(null);
  };

  const handleActiveToggle = (dayKey: string) => {
    if (isReadOnly) return;
    const currentDay = timesheet.days[dayKey];
    const newActiveState = !currentDay.active;
    
    const updatedDays = { ...timesheet.days };
    const defaultDay = currentUser.defaultSchedule[currentDay.dayId];
    
    if (newActiveState) {
      // Activating the day: notPresent becomes false, restore hours
      updatedDays[dayKey] = {
        ...currentDay,
        active: true,
        notPresent: false,
        absenceDuration: undefined,
        absenceType: undefined,
        absenceReason: undefined,
        morningHours: defaultDay.morningHours,
        afternoonHours: defaultDay.afternoonHours,
      };
    } else {
      // Deactivating the day: notPresent becomes true, absenceDuration becomes 'full', hours become 0
      updatedDays[dayKey] = {
        ...currentDay,
        active: false,
        notPresent: true,
        absenceDuration: 'full',
        absenceType: currentDay.absenceType || 'paid',
        absenceReason: currentDay.absenceReason || '',
        morningHours: 0,
        afternoonHours: 0,
      };
    }
    
    const newSheet = {
      ...timesheet,
      days: updatedDays,
    };
    setTimesheet(newSheet);
    onSaveTimesheet(newSheet);
    setValidationError(null);
  };

  const handleAbsenceChange = (
    dayKey: string,
    updates: {
      notPresent?: boolean;
      absenceDuration?: 'morning' | 'afternoon' | 'full';
      absenceType?: 'paid' | 'unpaid' | 'sick' | 'recovery' | 'other';
      absenceReason?: string;
    }
  ) => {
    if (isReadOnly) return;

    const updatedDays = { ...timesheet.days };
    const currentDay = updatedDays[dayKey];

    const nextNotPresent = updates.notPresent !== undefined ? updates.notPresent : currentDay.notPresent;
    const nextDuration = updates.absenceDuration !== undefined ? updates.absenceDuration : (currentDay.absenceDuration || 'full');
    const nextType = updates.absenceType !== undefined ? updates.absenceType : (currentDay.absenceType || 'paid');
    const nextReason = updates.absenceReason !== undefined ? updates.absenceReason : (currentDay.absenceReason || '');

    const defaultDay = currentUser.defaultSchedule[currentDay.dayId];
    let newMorningHours = currentDay.morningHours;
    let newAfternoonHours = currentDay.afternoonHours;

    if (nextNotPresent) {
      if (nextDuration === 'full') {
        newMorningHours = 0;
        newAfternoonHours = 0;
      } else if (nextDuration === 'morning') {
        newMorningHours = 0;
        newAfternoonHours = defaultDay.afternoonHours;
      } else if (nextDuration === 'afternoon') {
        newMorningHours = defaultDay.morningHours;
        newAfternoonHours = 0;
      }
    } else {
      newMorningHours = defaultDay.morningHours;
      newAfternoonHours = defaultDay.afternoonHours;
    }

    updatedDays[dayKey] = {
      ...currentDay,
      notPresent: nextNotPresent,
      absenceDuration: nextNotPresent ? nextDuration : undefined,
      absenceType: nextNotPresent ? nextType : undefined,
      absenceReason: nextNotPresent ? nextReason : undefined,
      morningHours: newMorningHours,
      afternoonHours: newAfternoonHours,
      active: nextNotPresent && nextDuration === 'full' ? false : true,
    };

    const newSheet = {
      ...timesheet,
      days: updatedDays,
    };
    setTimesheet(newSheet);
    onSaveTimesheet(newSheet);
    setValidationError(null);
  };

  // Switch months
  const navigateMonth = (monthsToShift: number) => {
    const [yearStr, monthStr] = timesheet.monthDate.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10);
    
    month += monthsToShift;
    if (month > 12) {
      month = 1;
      year += 1;
    } else if (month < 1) {
      month = 12;
      year -= 1;
    }
    
    const nextMonthStr = `${year}-${String(month).padStart(2, '0')}`;
    onSelectMonth(nextMonthStr);
  };

  // Reset to default hours
  const resetToProfileDefaults = () => {
    if (isReadOnly) return;
    if (window.confirm("Voulez-vous réinitialiser tous les horaires de ce mois selon votre contrat de travail standard ? Vos modifications actuelles seront échangées/écrasées.")) {
      setTimesheet(prev => {
        const resetDays = { ...prev.days };
        Object.keys(resetDays).forEach(dateStr => {
          const dayId = resetDays[dateStr].dayId;
          const profileDay = currentUser.defaultSchedule[dayId];
          resetDays[dateStr] = {
            ...resetDays[dateStr],
            active: profileDay.active,
            morningHours: profileDay.morningHours,
            afternoonHours: profileDay.afternoonHours,
            overtimeHours: 0,
            overtimeNote: '',
            paidLeave: false,
            unpaidLeave: false,
            sickLeave: false,
            notPresent: false,
            absenceDuration: undefined,
            absenceType: undefined,
            absenceReason: undefined,
          };
        });
        return {
          ...prev,
          days: resetDays,
        };
      });
      setDraftSavedMessage("Paramètres de base restaurés. N'oubliez pas de sauvegarder ou soumettre !");
      setTimeout(() => setDraftSavedMessage(null), 3000);
    }
  };

  // Calculates stats
  let totalRegular = 0;
  let totalOvertime = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let sickLeaveDays = 0;
  let recoveryDays = 0;
  let otherDays = 0;

  let monthlyRequiredHours = 0;
  let monthlyWorkedHours = 0;

  const daysList = getMonthDays(timesheet.monthDate);
  daysList.forEach((dayInfo) => {
    const defaultDay = currentUser.defaultSchedule[dayInfo.dayId];
    const day = (timesheet.days[dayInfo.date] || { active: false }) as DayRecord;

    const reqHours = (defaultDay && defaultDay.active) ? (defaultDay.morningHours + defaultDay.afternoonHours) : 0;
    monthlyRequiredHours += reqHours;

    let dayPhysicalWorked = 0;
    if (day.active) {
      dayPhysicalWorked = (day.morningHours || 0) + (day.afternoonHours || 0);
    }

    // Count absences based on notPresent status and credit appropriate leaves
    let creditedAbsence = 0;
    if (day.notPresent) {
      const weight = day.absenceDuration === 'full' ? 1 : 0.5;
      if (day.absenceType === 'paid') {
        paidLeaveDays += weight;
      } else if (day.absenceType === 'unpaid') {
        unpaidLeaveDays += weight;
      } else if (day.absenceType === 'sick') {
        sickLeaveDays += weight;
      } else if (day.absenceType === 'recovery') {
        recoveryDays += weight;
      } else if (day.absenceType === 'other') {
        otherDays += weight;
      }
      if (defaultDay) {
        creditedAbsence = day.absenceDuration === 'full' 
          ? (defaultDay.morningHours + defaultDay.afternoonHours) 
          : (day.absenceDuration === 'morning' ? defaultDay.morningHours : defaultDay.afternoonHours);
      }
    }

    const dayStandardHours = dayPhysicalWorked + creditedAbsence;
    const baseStandard = reqHours > 0 ? Math.min(reqHours, dayStandardHours) : dayStandardHours;
    const excessPhysical = reqHours > 0 ? Math.max(0, dayStandardHours - reqHours) : 0;
    const deficit = Math.max(0, reqHours - baseStandard);
    const declaredOvertime = day.overtimeHours || 0;
    const totalOvertimeForDay = declaredOvertime + excessPhysical;
    const overtimeToComplete = Math.min(deficit, totalOvertimeForDay);

    totalRegular += (baseStandard + overtimeToComplete);
    totalOvertime += (totalOvertimeForDay - overtimeToComplete);
    monthlyWorkedHours += dayPhysicalWorked + declaredOvertime + creditedAbsence;
  });

  const aggregateHours = monthlyWorkedHours;

  const handleSaveDraft = () => {
    if (isReadOnly) return;
    
    // Change status back to draft if saving and was in rejected/draft
    const docToSave: Timesheet = {
      ...timesheet,
      status: 'draft',
    };
    
    onSaveTimesheet(docToSave);
    setDraftSavedMessage('Brouillon enregistré avec succès dans la base !');
    setTimeout(() => setDraftSavedMessage(null), 3000);
  };

  const handleFinalSubmit = () => {
    if (isReadOnly) return;

    // Validation: Checks if any day has overtime without an overtimeNote
    let missingNotes = false;
    let missingHours = false;
    
    (Object.entries(timesheet.days) as [string, DayRecord][]).forEach(([dayId, day]) => {
      if (day.active) {
        if (day.overtimeHours > 0 && !day.overtimeNote.trim()) {
          missingNotes = true;
        }
        
        // Check if times are correct
        const hours = (day.morningHours || 0) + (day.afternoonHours || 0);
        if (hours <= 0) {
          missingHours = true;
        }
      }
    });

    if (missingHours) {
      setValidationError("Erreur : Un ou plusieurs jours travaillés indiquent un temps de travail nul ou négatif. Veuillez vérifier vos heures saisies.");
      return;
    }

    if (missingNotes) {
      setValidationError("Action requise : Veuillez fournir une explication/note obligatoire pour justifier vos heures supplémentaires déclarées.");
      return;
    }

    const docToSubmit: Timesheet = {
      ...timesheet,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
    };

    onSaveTimesheet(docToSubmit);
    setDraftSavedMessage('Félicitations, votre feuille de temps a été soumise pour validation !');
    setTimeout(() => setDraftSavedMessage(null), 3000);
    
    // Smooth scroll to top of the page/section to display status banner
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const section = document.getElementById("timesheet-submission-section");
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div id="timesheet-submission-section" className="space-y-6">
      
      {/* Banner / Navigation Card (Bento Rounded) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        
        {/* Date Selector */}
        <div className="flex items-center gap-4">
          <button
            id="btn-prev-month"
            onClick={() => navigateMonth(-1)}
            className="p-2 border border-slate-200 rounded-full bg-white hover:bg-slate-50 transition-all cursor-pointer text-slate-500 shadow-2xs hover:scale-105"
            title="Mois précédent"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="text-left font-sans">
            <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">PÉRIODE DU RELEVÉ</span>
            <span className="text-lg font-extrabold text-slate-900 tracking-tight">
              {formatFrenchMonth(timesheet.monthDate)}
            </span>
          </div>
          
          <button
            id="btn-next-month"
            onClick={() => navigateMonth(1)}
            className="p-2 border border-slate-100 rounded-full bg-white hover:bg-slate-50 transition-all cursor-pointer text-slate-500 shadow-2xs hover:scale-105"
            title="Mois suivant"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Current status display */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Statut</span>
            <span className="text-xs font-bold text-slate-700">
              {timesheet.status === 'draft' && 'Brouillon non soumis'}
              {timesheet.status === 'submitted' && 'En attente de validation'}
              {timesheet.status === 'validated' && 'Validé par la direction'}
              {timesheet.status === 'rejected' && 'À corriger d\'urgence'}
            </span>
          </div>

          <span className={`px-4 py-2 rounded-full font-extrabold text-xs uppercase border ${
            timesheet.status === 'draft' ? 'bg-slate-50 text-slate-700 border-slate-200' :
            timesheet.status === 'submitted' ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
            timesheet.status === 'validated' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
            'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {timesheet.status === 'draft' && '🏠 Brouillon'}
            {timesheet.status === 'submitted' && '⌛ Envoyé'}
            {timesheet.status === 'validated' && '✓ Validé'}
            {timesheet.status === 'rejected' && '⚠ Refusé'}
          </span>
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
      {timesheet.status === 'rejected' && (
        <div id="rejection-feedback-banner" className="bg-rose-50 border border-rose-200 rounded-xl p-5 flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-extrabold text-rose-800">Votre feuille de temps a été rejetée</h4>
            <p className="text-xs text-rose-700 mt-1 font-medium leading-relaxed">
              <strong>Motif du refus de la direction :</strong> {timesheet.rejectionReason || "Aucun commentaire founi."}
            </p>
            <p className="text-xs text-rose-600 mt-2 font-bold italic">
              Veuillez corriger vos horaires ou justifier vos heures supp. ci-dessous puis soumettre pour nouvelle validation.
            </p>
          </div>
        </div>
      )}

      {timesheet.status === 'validated' && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex items-start gap-4">
          <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-emerald-800">Heures validées</h4>
            <p className="text-xs text-emerald-700 mt-1">
              Cette feuille mensuelle a été approuvée par {timesheet.validatedByName || 'Sophie Dubois'} et verrouillée pour l'export de paie.
            </p>
          </div>
        </div>
      )}

      {timesheet.status === 'submitted' && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <Info className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800 font-medium">
            Votre relevé a été verrouillé et transmis à la direction. Vous pourrez le remodifier s'il est refusé ou en contactant votre validateur.
          </p>
        </div>
      )}

      {draftSavedMessage && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 text-indigo-800 text-sm font-semibold rounded-lg">
          {draftSavedMessage}
        </div>
      )}

      {validationError && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* CORE DAY-BY-DAY LIST (Bento Card Layout) */}
      <div id="timesheet-form-section" className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-6 bg-slate-50/50 border-b border-slate-250 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-extrabold text-slate-950 tracking-tight">Saisie des horaires quotidiens</h3>
          
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="text-xs text-emerald-700 hover:text-emerald-850 font-extrabold bg-emerald-50 hover:bg-emerald-100 px-4 py-2.5 rounded-full transition-all hover:scale-105 cursor-pointer inline-flex items-center gap-1.5 border border-emerald-250"
            >
              <Download className="w-3.5 h-3.5" />
              Télécharger PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="text-xs text-indigo-700 hover:text-indigo-850 font-extrabold bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-full transition-all hover:scale-105 cursor-pointer inline-flex items-center gap-1.5 border border-indigo-250"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Télécharger Excel
            </button>
            {!isReadOnly && (
              <button
                id="btn-reset-defaults"
                type="button"
                onClick={resetToProfileDefaults}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-extrabold bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-full transition-all hover:scale-105 cursor-pointer"
              >
                Réinitialiser avec horaires par défaut
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {daysByWeek.map(({ mondayDateStr, days }) => {
            const weekTotals = calculateWeekTotals(days);
            return (
              <div key={mondayDateStr} className="divide-y divide-slate-100 bg-white">
                {/* Week Subtotal Header Banner */}
                <div className="bg-slate-50/80 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between border-b border-t first:border-t-0 border-slate-200/60 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 shrink-0"></span>
                    <span className="text-xs font-black text-slate-800 tracking-tight uppercase">
                      {formatWeekRange(mondayDateStr)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {weekTotals.absentDays > 0 && (
                      <div className="text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200/50 font-bold flex gap-1 items-center">
                        Absences: <span className="font-extrabold">{weekTotals.absentDays}j</span>
                      </div>
                    )}
                    <div className="text-xs font-black text-indigo-700 bg-indigo-50/50 px-3.5 py-1.5 rounded-xl border border-indigo-150 flex flex-wrap items-center gap-2">
                      <span>Heures déclarées : {formatHours(weekTotals.declared)}</span>
                      <span className="text-indigo-300 font-normal">|</span>
                      <span className="text-[11px] text-indigo-600/90 font-medium">
                        Heures normales : {formatHours(weekTotals.required)}
                        {weekTotals.overtime > 0 ? ` + ${formatHours(weekTotals.overtime)} supplémentaires` : ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Days of that week */}
                <div className="divide-y-2 divide-slate-200">
                  {days.map(({ dayId, label, date }) => {
                    const rec = timesheet.days[date];
                    if (!rec) return null;
                    const defaultLine = currentUser.defaultSchedule[dayId];
                    
                    return (
                      <div
                        key={date}
                        className={`p-5 transition-all duration-150 ${
                          rec.notPresent
                            ? 'bg-rose-50/15 border-l-4 border-l-rose-500 hover:bg-rose-50/25'
                            : rec.active 
                            ? 'bg-white hover:bg-indigo-50/20 border-l-4 border-l-indigo-600/50' 
                            : 'bg-slate-50/60 border-l-4 border-l-slate-300 opacity-80 hover:bg-slate-100/80 hover:opacity-100'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
                          
                          {/* Left Column: Day info & Worked switch */}
                          <div className="lg:w-1/4 flex items-center gap-4">
                            <label className="relative inline-flex inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={rec.active}
                                disabled={isReadOnly}
                                onChange={() => handleActiveToggle(date)}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                            
                            <div>
                              <span className="text-sm font-extrabold text-slate-800 flex items-center flex-wrap gap-1">
                                {dayIdToLabel[dayId]}
                                {(() => {
                                  const defaultDay = currentUser.defaultSchedule[dayId];
                                  let creditedAbsence = 0;
                                  if (rec.notPresent && (rec.absenceType === 'paid' || rec.absenceType === 'sick' || rec.absenceType === 'recovery' || rec.absenceType === 'unpaid' || rec.absenceType === 'other')) {
                                    if (defaultDay) {
                                      creditedAbsence = rec.absenceDuration === 'full'
                                        ? (defaultDay.morningHours + defaultDay.afternoonHours)
                                        : (rec.absenceDuration === 'morning' ? defaultDay.morningHours : defaultDay.afternoonHours);
                                    }
                                  }
                                  return (rec.notPresent && creditedAbsence > 0) ? (
                                    <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-extrabold border border-emerald-150 uppercase tracking-wide">
                                      +{formatHours(creditedAbsence)} Crédités
                                    </span>
                                  ) : null;
                                })()}
                              </span>
                              <span className="text-[11px] text-slate-400 block font-medium">
                                {formatFrenchDate(rec.date)}
                              </span>
                              {(() => {
                                const defaultDay = currentUser.defaultSchedule[dayId];
                                const reqHours = (defaultDay && defaultDay.active) ? (defaultDay.morningHours + defaultDay.afternoonHours) : 0;
                                
                                let dayPhysicalWorked = 0;
                                if (rec.active) {
                                  dayPhysicalWorked = (rec.morningHours || 0) + (rec.afternoonHours || 0);
                                }
                                
                                let creditedAbsence = 0;
                                if (rec.notPresent && (rec.absenceType === 'paid' || rec.absenceType === 'sick' || rec.absenceType === 'recovery' || rec.absenceType === 'unpaid' || rec.absenceType === 'other')) {
                                  if (defaultDay) {
                                    creditedAbsence = rec.absenceDuration === 'full'
                                      ? (defaultDay.morningHours + defaultDay.afternoonHours)
                                      : (rec.absenceDuration === 'morning' ? defaultDay.morningHours : defaultDay.afternoonHours);
                                  }
                                }
                                
                                const dayWorked = dayPhysicalWorked + (rec.overtimeHours || 0) + creditedAbsence;
                                return (
                                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-500 font-sans leading-none">
                                    <span>Requis: <strong>{formatHours(reqHours)}</strong></span>
                                    <span className="text-slate-300">|</span>
                                    <span className={`font-bold ${
                                      dayWorked > reqHours ? 'text-amber-700' :
                                      dayWorked < reqHours ? 'text-rose-705' : 'text-slate-600'
                                    }`}>
                                      Effectué: <strong>{formatHours(dayWorked)}</strong>
                                    </span>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Right Column: Time entry or Absence configurations */}
                          <div className="lg:w-3/4 flex flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                              {/* Pas present Button */}
                              <button
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => {
                                  const val = !rec.notPresent;
                                  handleAbsenceChange(date, { 
                                    notPresent: val, 
                                    absenceDuration: val ? 'full' : undefined,
                                    absenceType: val ? 'paid' : undefined,
                                    absenceReason: val ? (rec.absenceReason || '') : undefined
                                  });
                                }}
                                className={`text-xs font-black px-4 py-2 rounded-full cursor-pointer transition-all border shrink-0 flex items-center gap-1.5 ${
                                  rec.notPresent
                                    ? 'bg-rose-600 border-rose-700 text-white shadow-md font-extrabold'
                                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-rose-50/10 text-rose-600'
                                } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                <span>❌ Pas présent</span>
                              </button>

                              {/* Working Hours Input or display when NOT fully absent */}
                              {(!rec.notPresent || rec.absenceDuration !== 'full') && (
                                <div className="flex items-center gap-2">
                                  {/* Morning Input (disabled if absent morning) */}
                                  <span className="text-xs text-slate-400">Matin (h)</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="12"
                                    step="0.5"
                                    value={rec.morningHours ?? 0}
                                    disabled={isReadOnly || (rec.notPresent && rec.absenceDuration === 'morning')}
                                    onChange={(e) => handleDayValueChange(date, 'morningHours', parseFloat(e.target.value) || 0)}
                                    className="w-16 text-xs border border-slate-200 rounded-md p-1.5 focus:border-indigo-500 font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                                  />

                                  {/* Afternoon Input (disabled if absent afternoon) */}
                                  <span className="text-xs text-slate-400">A.-M. (h)</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="12"
                                    step="0.5"
                                    value={rec.afternoonHours ?? 0}
                                    disabled={isReadOnly || (rec.notPresent && rec.absenceDuration === 'afternoon')}
                                    onChange={(e) => handleDayValueChange(date, 'afternoonHours', parseFloat(e.target.value) || 0)}
                                    className="w-16 text-xs border border-slate-200 rounded-md p-1.5 focus:border-indigo-500 font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                                  />

                                  {/* Regular Hours Durée badge */}
                                  <div className="text-xs font-bold text-slate-700 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-150 ml-2">
                                    Durée: {formatHours((rec.morningHours || 0) + (rec.afternoonHours || 0))}
                                  </div>
                                </div>
                              )}

                              {/* Overtime in Hours (Only for working days, i.e. not full absent) */}
                              {(!rec.notPresent || rec.absenceDuration !== 'full') && (
                                <div className="flex items-center gap-2 ml-auto">
                                  <span className="text-xs text-amber-700 font-bold whitespace-nowrap bg-amber-50 px-2 py-1 rounded">
                                    Heures de nuit
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="6"
                                    step="0.5"
                                    value={rec.overtimeHours ?? ''}
                                    placeholder="0"
                                    disabled={isReadOnly}
                                    onChange={(e) => handleDayValueChange(date, 'overtimeHours', parseFloat(e.target.value) || 0)}
                                    className="w-16 text-xs border border-amber-300 rounded-md p-1.5 font-bold text-amber-800 focus:border-amber-500 bg-amber-50/20 disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200"
                                  />
                                </div>
                              )}
                            </div>

                            {/* Overtime explanation */}
                            {(!rec.notPresent || rec.absenceDuration !== 'full') && rec.overtimeHours > 0 && (
                              <div className="w-full mt-1 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-col md:flex-row md:items-center gap-3">
                                <label className="text-[11px] font-extrabold text-amber-800 uppercase tracking-wider whitespace-nowrap">
                                  ✏ Raison heure de nuits :
                                </label>
                                <input
                                  type="text"
                                  value={rec.overtimeNote ?? ''}
                                  disabled={isReadOnly}
                                  onChange={(e) => handleDayValueChange(date, 'overtimeNote', e.target.value)}
                                  placeholder="Saisissez la justification obligatoire..."
                                  className={`w-full text-xs border bg-white rounded-md p-1.5 outline-hidden transition ${
                                    !(rec.overtimeNote ?? '').trim() && !isReadOnly
                                      ? 'border-rose-400 focus:ring-1 focus:ring-rose-100 placeholder-rose-300'
                                      : 'border-slate-200 focus:border-indigo-500'
                                  }`}
                                  required
                                />
                              </div>
                            )}

                            {/* Option to add a daily note */}
                            <div className="w-full mt-1 flex flex-col gap-2">
                              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={!!rec.hasDayNote}
                                  disabled={isReadOnly}
                                  onChange={(e) => handleDayValueChange(date, 'hasDayNote', e.target.checked)}
                                  className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                                />
                                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                  Ajouter une note à la journée
                                </span>
                              </label>

                              {rec.hasDayNote && (
                                <div className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col md:flex-row md:items-center gap-3 animate-fade-in">
                                  <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                    📝 Note :
                                  </label>
                                  <input
                                    type="text"
                                    value={rec.dayNote ?? ''}
                                    disabled={isReadOnly}
                                    onChange={(e) => handleDayValueChange(date, 'dayNote', e.target.value)}
                                    placeholder="Saisissez un commentaire ou une note pour cette journée..."
                                    className="w-full text-xs border bg-white border-slate-200 rounded-md p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-150 outline-hidden"
                                  />
                                </div>
                              )}
                            </div>

                            {/* Sub-absence settings panel (Shows if notPresent is active) */}
                            {rec.notPresent && (
                              <div className="w-full mt-2 p-3.5 bg-rose-50/40 border border-rose-200 rounded-2xl flex flex-col gap-3 animate-fade-in text-left">
                                
                                {/* 1. Absence Duration */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider mr-2">DURÉE DE L'ABSENCE :</span>
                                  {[
                                    { value: 'full', label: 'Journée complète' },
                                    { value: 'morning', label: 'Matin uniquement 🌅' },
                                    { value: 'afternoon', label: 'Après-midi uniquement 🌇' }
                                  ].map(opt => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      disabled={isReadOnly}
                                      onClick={() => handleAbsenceChange(date, { absenceDuration: opt.value as any })}
                                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                                        rec.absenceDuration === opt.value
                                          ? 'bg-rose-600 border-rose-700 text-white shadow-xs font-extrabold'
                                          : 'bg-white border-rose-200 hover:border-rose-350 text-rose-700 hover:bg-rose-50/30'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>

                                {/* 2. Absence Type Category */}
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider mr-2">TYPE D'ABSENCE :</span>
                                  {[
                                    { value: 'paid', label: 'Congé payé 🌴' },
                                    { value: 'unpaid', label: 'Congé sans solde ⏳' },
                                    { value: 'sick', label: 'Arrêt 🩺' },
                                    { value: 'recovery', label: 'Récupération ⏰' },
                                    { value: 'other', label: 'Autre 📄' }
                                  ].map(opt => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      disabled={isReadOnly}
                                      onClick={() => handleAbsenceChange(date, { absenceType: opt.value as any })}
                                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                                        rec.absenceType === opt.value
                                          ? 'bg-rose-600 border-rose-700 text-white shadow-xs font-extrabold'
                                          : 'bg-white border-rose-200 hover:border-rose-300 text-rose-700'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>

                                {/* 3. Text field for reason */}
                                <div className="flex flex-col md:flex-row md:items-center gap-2 mt-1">
                                  <label className="text-[10px] font-extrabold text-rose-800 uppercase tracking-widest whitespace-nowrap">
                                    ✍ RAISON / MOTIF DE L'ABSENCE :
                                  </label>
                                  <input
                                    type="text"
                                    value={rec.absenceReason ?? ''}
                                    disabled={isReadOnly}
                                    onChange={(e) => handleAbsenceChange(date, { absenceReason: e.target.value })}
                                    placeholder="Indiquez la raison de cette absence (Congés validés, rdv médical...)"
                                    className="w-full text-xs border border-rose-250 bg-white rounded-md p-1.5 focus:border-rose-500 focus:ring-1 focus:ring-rose-200 text-rose-950 outline-hidden"
                                  />
                                </div>

                              </div>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Aggregate Summary Footer (High-Fidelity Bento Grid Layout) */}
        <div className="p-6 bg-slate-50/50 border-t border-slate-200/60 flex flex-col lg:flex-row gap-6 justify-between items-stretch">
          
          {/* Left panel: details & info list */}
          <div className="flex-1 flex flex-col justify-between py-1">
            <div className="space-y-3">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">RÉCAPITULATIF MENSUEL</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-100/60 p-4 rounded-2xl border border-slate-200/50">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Heures requises sur ce mois</p>
                  <p className="text-sm text-slate-800 font-bold">
                    {formatHours(monthlyRequiredHours)} d'après votre contrat
                  </p>
                </div>
                <div className="bg-amber-50/40 p-4 rounded-2xl border border-amber-100">
                  <p className="text-[10px] uppercase font-bold text-amber-600 mb-1">Heures supplémentaires déclarées</p>
                  <p className="text-sm text-amber-800 font-extrabold flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    +{formatHours(totalOvertime)} à justifier
                  </p>
                </div>
              </div>
              
              {/* Absences summary chips */}
              {(paidLeaveDays > 0 || unpaidLeaveDays > 0 || sickLeaveDays > 0) && (
                <div className="flex flex-wrap items-center gap-2 mt-3 bg-indigo-50/10 p-3 rounded-2xl border border-indigo-100/30">
                  <span className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-widest mr-1">Absences du mois (Créditées comme temps travaillé) :</span>
                  {paidLeaveDays > 0 && (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-850 px-2.5 py-1 rounded-full text-xs font-extrabold border border-emerald-250">
                      🌴 Congés Payés : <strong>{paidLeaveDays} j</strong>
                    </span>
                  )}
                  {unpaidLeaveDays > 0 && (
                    <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-850 px-2.5 py-1 rounded-full text-xs font-extrabold border border-amber-250">
                      🕒 Sans Solde : <strong>{unpaidLeaveDays} j</strong>
                    </span>
                  )}
                  {sickLeaveDays > 0 && (
                    <span className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-850 px-2.5 py-1 rounded-full text-xs font-extrabold border border-rose-250">
                      🩺 Arrêt Maladie : <strong>{sickLeaveDays} j</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div className="text-xs text-slate-400 italic mt-4 lg:mt-0 font-medium">
              ⓘ Les absences autorisées anticipées (Arrêts, Congés, Récupérations) sont créditées comme du temps de travail sur la base de vos horaires planifiés.
            </div>
          </div>

          {/* Right panel: Gorgeous Dark Slate Bento stat widget */}
          <div className="bg-slate-950 text-white rounded-3xl p-6 flex flex-col justify-between shadow-md lg:w-96 shrink-0 relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-widest">Portefeuille Heures Effectuées</p>
                <h4 className="text-4xl font-extrabold tracking-tight mt-1 text-white">
                  {formatHours(monthlyWorkedHours).split('h')[0]}<span className="text-xl font-light text-slate-400">h{formatHours(monthlyWorkedHours).split('h')[1] || '00'}</span>
                </h4>
              </div>
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0 border border-white/5">
                <Clock className="w-5 h-5 text-indigo-400" />
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <div className="flex justify-between text-xs mb-2">
                <span className="text-slate-400 font-medium">Contrat ({formatHours(monthlyRequiredHours || 140)})</span>
                <span className={`font-extrabold ${
                  (monthlyWorkedHours - monthlyRequiredHours) >= 0 ? 'text-emerald-400' : 'text-rose-450'
                }`}>
                  Solde : {(monthlyWorkedHours - monthlyRequiredHours) >= 0 ? '+' : ''}{formatHours(monthlyWorkedHours - monthlyRequiredHours)}
                </span>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.round((monthlyWorkedHours / (monthlyRequiredHours || 140)) * 100))}%` }}
                ></div>
              </div>
            </div>
          </div>

        </div>

        {/* Submission control bar */}
        {!isReadOnly && (
          <div className="p-6 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
            <button
              id="btn-save-draft"
              type="button"
              onClick={handleSaveDraft}
              className="inline-flex items-center justify-center gap-1.5 px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-2xl text-xs font-bold text-slate-700 transition cursor-pointer shadow-xs hover:scale-102 w-full sm:w-auto"
            >
              <Save className="w-4 h-4" />
              Sauvegarder brouillon
            </button>
            <button
              id="btn-submit-timesheet"
              type="button"
              onClick={handleFinalSubmit}
              className="inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-7 py-3 rounded-2xl text-xs font-extrabold transition-all cursor-pointer shadow-md shadow-indigo-150 hover:scale-102 w-full sm:w-auto"
            >
              <Send className="w-4 h-4" />
              Soumettre le mois
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
