/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import { Timesheet, User, WeekDayId, DayRecord } from '../types';
import { calculateSheetStats, exportSingleTimesheetToExcel, exportFilteredSheetsToExcel } from '../utils/excelUtils';
import { 
  getMonthDays, 
  dayIdToLabel, 
  formatHours, 
  formatFrenchMonth, 
  formatFrenchDate,
  weekDayIds
} from '../utils/dateUtils';
import { 
  Calendar,
  User as UserIcon,
  Search,
  ArrowUpDown,
  Filter,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  Briefcase,
  Layers,
  ChevronRight,
  TrendingUp,
  FileText,
  ThumbsUp,
  X,
  Download,
  RotateCw,
  Moon
} from 'lucide-react';

interface HistoryPanelProps {
  timesheets: Timesheet[];
  users: User[];
  currentUser?: User;
  onRefreshData?: () => Promise<void>;
}

type SortCriteria = 'date_desc' | 'date_asc' | 'employee_asc' | 'employee_desc' | 'hours_desc' | 'hours_asc';

export default function HistoryPanel({ timesheets, users, currentUser, onRefreshData }: HistoryPanelProps) {
  const currentYearStr = useMemo(() => String(new Date().getFullYear()), []);
  const currentMonthStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
  }, []);

  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'validated' | 'rejected' | 'draft'>('all');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>(
    currentUser && !currentUser.isValidator ? currentUser.id : 'all'
  );
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>(currentMonthStr);
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>('date_desc');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setShowRefreshToast(false);
    try {
      if (onRefreshData) {
        await onRefreshData();
      } else {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
      setShowRefreshToast(true);
      setTimeout(() => {
        setShowRefreshToast(false);
      }, 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const monthsOfCurrentYear = useMemo(() => {
    const year = new Date().getFullYear();
    return [
      { value: 'all', label: `Toute l'année ${year}` },
      { value: `${year}-01`, label: `Janvier ${year}` },
      { value: `${year}-02`, label: `Février ${year}` },
      { value: `${year}-03`, label: `Mars ${year}` },
      { value: `${year}-04`, label: `Avril ${year}` },
      { value: `${year}-05`, label: `Mai ${year}` },
      { value: `${year}-06`, label: `Juin ${year}` },
      { value: `${year}-07`, label: `Juillet ${year}` },
      { value: `${year}-08`, label: `Août ${year}` },
      { value: `${year}-09`, label: `Septembre ${year}` },
      { value: `${year}-10`, label: `Octobre ${year}` },
      { value: `${year}-11`, label: `Novembre ${year}` },
      { value: `${year}-12`, label: `Décembre ${year}` },
    ];
  }, []);

  // Enrich timesheets with stats & profiles for historical analysis
  const enrichedSheets = useMemo(() => {
    return timesheets.map(sheet => {
      const userProfile = users.find(u => u.id === sheet.userId);
      
      let regularHours = 0;
      let overtimeHours = 0;
      let activeDays = 0;
      let requiredHours = 0;
      let workedHours = 0;
      let paidLeaveDays = 0;
      let unpaidLeaveDays = 0;
      let sickLeaveDays = 0;
      let recoveryDays = 0;
      let otherDays = 0;
      
      const monthDaysList = getMonthDays(sheet.monthDate);
      monthDaysList.forEach((dayInfo) => {
        const defaultDay = userProfile?.defaultSchedule?.[dayInfo.dayId];
        const day = (sheet.days[dayInfo.date] || { active: false }) as DayRecord;

        const reqHours = (defaultDay && defaultDay.active) ? (defaultDay.morningHours + defaultDay.afternoonHours) : 0;
        requiredHours += reqHours;

        let dayPhysicalWorked = 0;
        if (day.active) {
          dayPhysicalWorked = (day.morningHours || 0) + (day.afternoonHours || 0);
          activeDays++;
        }

        let creditedAbsence = 0;
        if (day.notPresent) {
          const weight = (day.absenceDuration === 'morning' || day.absenceDuration === 'afternoon') ? 0.5 : 1;
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
        } else {
          // Fallbacks for legacy fields
          if (day.paidLeave) {
            const weight = (day.paidLeave === 'full' || day.paidLeave === true) ? 1 : 0.5;
            paidLeaveDays += weight;
            if (defaultDay) {
              creditedAbsence = (day.paidLeave === 'full' || day.paidLeave === true) 
                ? (defaultDay.morningHours + defaultDay.afternoonHours) 
                : 0.5 * (defaultDay.morningHours + defaultDay.afternoonHours);
            }
          }
          if (day.unpaidLeave) {
            const weight = (day.unpaidLeave === 'full' || day.unpaidLeave === true) ? 1 : 0.5;
            unpaidLeaveDays += weight;
            if (defaultDay) {
              creditedAbsence = (day.unpaidLeave === 'full' || day.unpaidLeave === true) 
                ? (defaultDay.morningHours + defaultDay.afternoonHours) 
                : 0.5 * (defaultDay.morningHours + defaultDay.afternoonHours);
            }
          }
          if (day.sickLeave) {
            const weight = (day.sickLeave === 'full' || day.sickLeave === true) ? 1 : 0.5;
            sickLeaveDays += weight;
            if (defaultDay) {
              creditedAbsence = (day.sickLeave === 'full' || day.sickLeave === true) 
                ? (defaultDay.morningHours + defaultDay.afternoonHours) 
                : 0.5 * (defaultDay.morningHours + defaultDay.afternoonHours);
            }
          }
        }

        const dayStandardHours = dayPhysicalWorked + creditedAbsence;
        const baseStandard = reqHours > 0 ? Math.min(reqHours, dayStandardHours) : dayStandardHours;
        const excessPhysical = reqHours > 0 ? Math.max(0, dayStandardHours - reqHours) : 0;
        const deficit = Math.max(0, reqHours - baseStandard);
        const declaredOvertime = day.overtimeHours || 0;
        const totalOvertimeForDay = declaredOvertime + excessPhysical;
        const overtimeToComplete = Math.min(deficit, totalOvertimeForDay);

        regularHours += (baseStandard + overtimeToComplete);
        overtimeHours += (totalOvertimeForDay - overtimeToComplete);
        workedHours += dayPhysicalWorked + declaredOvertime + creditedAbsence;
      });

      return {
        ...sheet,
        userProfile,
        regularHours,
        overtimeHours,
        requiredHours,
        workedHours,
        totalHours: workedHours,
        activeDays,
        paidLeaveDays,
        unpaidLeaveDays,
        sickLeaveDays,
        recoveryDays,
        otherDays,
      };
    });
  }, [timesheets, users]);

  // Filter enriched timesheets
  const filteredAndSortedSheets = useMemo(() => {
    return enrichedSheets
      .filter(sheet => {
        // Status filter
        const matchesStatus = statusFilter === 'all' || sheet.status === statusFilter;
        
        // Employee quick filter
        const matchesUser = selectedUserFilter === 'all' || sheet.userId === selectedUserFilter;
        
        // Month filter
        let matchesMonth = true;
        if (selectedMonthFilter !== 'all') {
          matchesMonth = sheet.monthDate === selectedMonthFilter;
        } else {
          // 'all' filters to target current year
          matchesMonth = sheet.monthDate.startsWith(currentYearStr);
        }
        
        // Search query (names, dates, or note content search)
        const nameMatch = sheet.userName.toLowerCase().includes(searchQuery.toLowerCase());
        const weekMatch = sheet.monthDate.includes(searchQuery) || formatFrenchMonth(sheet.monthDate).toLowerCase().includes(searchQuery.toLowerCase());
        let noteMatch = false;
        (Object.values(sheet.days) as DayRecord[]).forEach(d => {
          if (d.overtimeNote?.toLowerCase().includes(searchQuery.toLowerCase())) {
            noteMatch = true;
          }
        });
        const matchesSearch = nameMatch || weekMatch || noteMatch;

        return matchesStatus && matchesUser && matchesSearch && matchesMonth;
      })
      .sort((a, b) => {
        switch (sortCriteria) {
          case 'date_desc':
            return b.monthDate.localeCompare(a.monthDate);
          case 'date_asc':
            return a.monthDate.localeCompare(b.monthDate);
          case 'employee_asc':
            return a.userName.localeCompare(b.userName);
          case 'employee_desc':
            return b.userName.localeCompare(a.userName);
          case 'hours_desc':
            return b.totalHours - a.totalHours;
          case 'hours_asc':
            return a.totalHours - b.totalHours;
          default:
            return 0;
        }
      });
  }, [enrichedSheets, statusFilter, selectedUserFilter, selectedMonthFilter, searchQuery, sortCriteria, currentYearStr]);

  const selectedSheet = useMemo(() => {
    const s = enrichedSheets.find(s => s.id === selectedSheetId);
    if (s && filteredAndSortedSheets.some(fs => fs.id === s.id)) {
      return s;
    }
    return undefined;
  }, [enrichedSheets, selectedSheetId, filteredAndSortedSheets]);

  const handleDownloadSelectedPdf = () => {
    if (!selectedSheet) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const userProfile = selectedSheet.userProfile || { defaultSchedule: {} };
    const stats = calculateSheetStats(selectedSheet, userProfile);

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
    doc.text(selectedSheet.userName, 38, boxY + 5.5);
    doc.text(formatFrenchMonth(selectedSheet.monthDate), 38, boxY + 11.5);
    
    const statusFr = selectedSheet.status === 'validated' ? 'VALIDÉ' : selectedSheet.status === 'submitted' ? 'SOUMIS' : 'BROUILLON';
    if (selectedSheet.status === 'validated') {
      doc.setTextColor(16, 185, 129); // emerald-500
    } else if (selectedSheet.status === 'submitted') {
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
    doc.text(`${stats.monthlyRequiredHours} h`, 104, boxY + 5.5);
    doc.text(`${stats.totalRegular} h`, 104, boxY + 11.5);
    
    let totalNightHours = 0;
    if (selectedSheet.days) {
      Object.values(selectedSheet.days).forEach((d: any) => {
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
    doc.text(`${stats.totalOvertime} h`, 152, boxY + 5.5);
    
    doc.setTextColor(79, 70, 229); // indigo-600
    doc.text(`${stats.monthlyWorkedHours} h`, 152, boxY + 11.5);
    
    const balance = stats.monthlyWorkedHours - stats.monthlyRequiredHours;
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
    doc.text(`${stats.paidLeaveDays} j`, 190, boxY + 5.5);
    doc.text(`${stats.unpaidLeaveDays} j`, 190, boxY + 11.5);
    doc.text(`${stats.sickLeaveDays} j`, 190, boxY + 17.5);

    const monthDaysList = getMonthDays(selectedSheet.monthDate);
    
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
      const rec = selectedSheet.days[date];
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
      
      const defaultDay = userProfile.defaultSchedule?.[dayId];
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

    const safeName = selectedSheet.userName.replace(/\s+/g, '_');
    doc.save(`declaration_heures_${safeName}_${selectedSheet.monthDate}.pdf`);
  };

  const handleExportSelectedExcel = () => {
    if (!selectedSheet) return;
    exportSingleTimesheetToExcel(selectedSheet, selectedSheet.userProfile);
  };

  const handleExportFilteredExcel = () => {
    if (filteredAndSortedSheets.length === 0) return;
    const periodName = selectedMonthFilter === 'all' ? "Toute l'année" : formatFrenchMonth(selectedMonthFilter);
    exportFilteredSheetsToExcel(filteredAndSortedSheets, periodName);
  };

  // Aggregate stats across filtered history
  const totalHoursWorked = useMemo(() => {
    return filteredAndSortedSheets.reduce((sum, s) => sum + s.totalHours, 0);
  }, [filteredAndSortedSheets]);

  const totalOvertime = useMemo(() => {
    return filteredAndSortedSheets.reduce((sum, s) => sum + s.overtimeHours, 0);
  }, [filteredAndSortedSheets]);

  const countByStatus = useMemo(() => {
    const stats = { draft: 0, submitted: 0, validated: 0, rejected: 0 };
    filteredAndSortedSheets.forEach(s => {
      if (s.status in stats) {
        stats[s.status as keyof typeof stats]++;
      }
    });
    return stats;
  }, [filteredAndSortedSheets]);

  return (
    <div id="history-panel-section" className="space-y-8 animate-fade-in">
      
      {/* 1. Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {currentUser && !currentUser.isValidator ? "Mon Historique de Relevés" : "Historique des Relevés"}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            {currentUser && !currentUser.isValidator 
              ? "Archive complète et consultation de toutes vos feuilles d'heures."
              : "Archive complète et audit de toutes les feuilles d'heures de l'équipe."}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {filteredAndSortedSheets.length > 0 && (
            <button
              type="button"
              onClick={handleExportFilteredExcel}
              className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 text-xs font-extrabold font-sans shadow-xs border border-indigo-500/35"
              title="Exporter tous les relevés filtrés au format Excel (XLSX)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-150" />
              Exporter Rapports Excel
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 text-xs font-bold font-sans shadow-2xs border border-slate-200/80 disabled:opacity-50"
            title="Actualiser et régénérer tous les exports avec les données les plus récentes"
          >
            <RotateCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            {isRefreshing ? 'Actualisation...' : 'Actualiser'}
          </button>

          {/* KPI Metrics Indicator */}
          <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 p-2 rounded-2xl border border-slate-200/60 shadow-xs self-start">
            <div className="px-3 py-1 bg-white rounded-lg shadow-2xs border border-slate-100 flex items-center gap-1.5 font-bold">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-slate-500">Heures cumulées :</span>
              <span className="text-slate-800 font-mono">{formatHours(totalHoursWorked)}</span>
            </div>
            <div className="px-3 py-1 bg-white rounded-lg shadow-2xs border border-slate-100 flex items-center gap-1.5 font-bold">
              <Moon className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-slate-500">Heures de nuit :</span>
              <span className="text-slate-800 font-mono">+{formatHours(totalOvertime)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Controls, Sorting and Filtering (Bento Grid Style) */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs gap-4 grid grid-cols-1 md:grid-cols-12">
        
        {/* Search bar */}
        <div className={`${currentUser && !currentUser.isValidator ? 'md:col-span-6' : 'md:col-span-3'} flex flex-col gap-1.5`}>
          <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-sans">
            Recherche par mot-clé
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="history-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Salarié, date YYYY-MM, note..."
              className="w-full text-xs placeholder:text-slate-400 border border-slate-200 hover:border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 pl-10 pr-4 py-2.5 rounded-xl bg-slate-50/50 transition font-medium"
            />
          </div>
        </div>

        {/* Filter by Salarié */}
        {(!currentUser || currentUser.isValidator) && (
          <div className="md:col-span-3 flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-sans">
              Sélectionner un Salarié
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <select
                id="history-user-select"
                value={selectedUserFilter}
                onChange={(e) => setSelectedUserFilter(e.target.value)}
                className="appearance-none w-full text-xs border border-slate-200 hover:border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 pl-10 pr-8 py-2.5 rounded-xl bg-slate-50/50 transition font-bold text-slate-700 font-sans cursor-pointer"
              >
                <option value="all">👥 Tous les salariés</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.isActive === false ? '🔒 (Archivé / Inactif)' : `(${u.role === 'validator' ? 'Dir' : 'Coll'})`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Filter by Month of Current Year */}
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-sans">
            Mois de l'année
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              id="history-month-select"
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
              className="appearance-none w-full text-xs border border-slate-200 hover:border-slate-350 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 pl-10 pr-8 py-2.5 rounded-xl bg-slate-50/50 transition font-bold text-slate-700 font-sans cursor-pointer"
            >
              <option value="all">📅 Toutes les périodes</option>
              {monthsOfCurrentYear.filter(m => m.value !== 'all').map(m => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter by Status */}
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-sans">
            Statut
          </label>
          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              id="history-status-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="appearance-none w-full text-xs border border-slate-200 hover:border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 pl-10 pr-8 py-2.5 rounded-xl bg-slate-50/50 transition font-bold text-slate-700 font-sans cursor-pointer"
            >
              <option value="all">🔍 Tous les statuts</option>
              <option value="validated">🟢 Validés</option>
              <option value="rejected">🔴 Refusés</option>
              <option value="submitted">🟡 Soumis (En attente)</option>
              <option value="draft">⚪ Brouillons</option>
            </select>
          </div>
        </div>

        {/* Sorting selection (TRI PAR SALARIES OU PAR DATES) */}
        <div className="md:col-span-2 flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block font-sans">
            Trier par
          </label>
          <div className="relative">
            <ArrowUpDown className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <select
              id="history-sorting-select"
              value={sortCriteria}
              onChange={(e) => setSortCriteria(e.target.value as SortCriteria)}
              className="appearance-none w-full text-xs border border-slate-200 hover:border-slate-300 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 pl-10 pr-8 py-2.5 rounded-xl bg-slate-50/50 transition font-bold text-slate-700 font-sans cursor-pointer"
            >
              <option value="date_desc">📅 Date : Du plus récent au plus ancien</option>
              <option value="date_asc">📅 Date : Du plus ancien au plus récent</option>
              <option value="employee_asc">👤 Salarié : A-Z Alphabetique</option>
              <option value="employee_desc">👤 Salarié : Z-A Inverse</option>
              <option value="hours_desc">⚡ Volume Horaires : Décroissant</option>
              <option value="hours_asc">⚡ Volume Horaires : Croissant</option>
            </select>
          </div>
        </div>

      </div>

      {/* 3. Main Data Area: Splits into Columns if sheet is selected */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Matching Historical Timesheets List */}
        <div className={`lg:col-span-5 space-y-4 ${selectedSheetId ? 'hidden lg:block' : 'block'}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
              Résultats trouvés ({filteredAndSortedSheets.length})
            </h3>
            
            {/* Quick status mini legend */}
            <div className="flex gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
              <span>{countByStatus.validated} validated</span>•
              <span>{countByStatus.rejected} rejected</span>
            </div>
          </div>

          {filteredAndSortedSheets.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center shadow-2xs">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-extrabold text-slate-650">Aucun enregistrement</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Aucune fiche n'a été trouvée avec les options de filtrage et de recherche sélectionnées.
              </p>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setSelectedUserFilter(currentUser && !currentUser.isValidator ? currentUser.id : 'all');
                  setSelectedMonthFilter(currentMonthStr);
                }}
                className="mt-4 px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-xl hover:bg-indigo-100 transition duration-300 pointer-events-auto cursor-pointer"
              >
                Réinitialiser les filtres
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1 col-scroll">
              {filteredAndSortedSheets.map(sheet => {
                const isSelected = selectedSheetId === sheet.id;
                
                // Set visual details based on status
                let indicatorColor = "bg-slate-400";
                let badgeText = "Brouillon";
                let badgeStyle = "text-slate-700 bg-slate-100 border border-slate-200";
                
                if (sheet.status === 'submitted') {
                  indicatorColor = "bg-amber-500 animate-pulse";
                  badgeText = "Soumis / À valider";
                  badgeStyle = "text-amber-800 bg-amber-50 border border-amber-250 font-extrabold";
                } else if (sheet.status === 'validated') {
                  indicatorColor = "bg-emerald-500";
                  badgeText = "Validé";
                  badgeStyle = "text-emerald-800 bg-emerald-50 border border-emerald-250 font-extrabold";
                } else if (sheet.status === 'rejected') {
                  indicatorColor = "bg-rose-500";
                  badgeText = "Refusé";
                  badgeStyle = "text-rose-800 bg-rose-50 border border-rose-250 font-extrabold";
                }

                return (
                  <button
                    key={sheet.id}
                    id={`history-sheet-item-${sheet.id}`}
                    onClick={() => setSelectedSheetId(sheet.id)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between cursor-pointer hover:shadow-sm ${
                      isSelected
                        ? 'bg-indigo-50/70 border-indigo-500 ring-2 ring-indigo-50 shadow-xs'
                        : 'bg-white border-slate-200/95 hover:border-slate-350 hover:bg-slate-50/50'
                    }`}
                  >
                    <div>
                      {/* Name & Badge Status Row */}
                      <div className="flex items-center justify-between gap-2 mb-2 w-full">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${indicatorColor}`}></span>
                          <span className="font-bold text-slate-800 text-sm tracking-tight">{sheet.userName}</span>
                        </div>
                        <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeStyle}`}>
                          {badgeText}
                        </span>
                      </div>

                      {/* Date & Values Row */}
                      <div className="flex items-center justify-between mt-3 text-slate-500 font-semibold text-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-450" />
                          <span>{formatFrenchMonth(sheet.monthDate)}</span>
                        </div>
                        
                        <div className="flex items-center gap-2.5 text-slate-700">
                          <div className="text-right">
                            <span className="font-black text-slate-800 font-mono text-xs">{formatHours(sheet.totalHours)}</span>
                            <span className="text-[9px] text-slate-400 uppercase font-black tracking-wider block leading-none">Total</span>
                          </div>
                          {sheet.overtimeHours > 0 && (
                            <div className="text-right border-l border-slate-200 pl-2">
                              <span className="font-extrabold text-amber-700 font-mono text-xs">+{formatHours(sheet.overtimeHours)}</span>
                              <span className="text-[9px] text-amber-500 font-black tracking-wider uppercase block leading-none">Heures Nuit</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Selected Timesheet Deep Details (Read Only Viewer) */}
        <div className="lg:col-span-7">
          {selectedSheet ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full animate-fade-in">
              
              {/* Card top bar */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 border border-indigo-400 flex items-center justify-center font-bold text-xs uppercase text-indigo-50">
                      {selectedSheet.userName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black tracking-tight leading-tight">{selectedSheet.userName}</h4>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          selectedSheet.status === 'validated' ? 'bg-emerald-500/20 text-emerald-350 border border-emerald-500/30' :
                          selectedSheet.status === 'rejected' ? 'bg-rose-500/20 text-rose-350 border border-rose-500/30' :
                          selectedSheet.status === 'submitted' ? 'bg-amber-500/20 text-amber-350 border border-amber-500/30' : 'bg-slate-500/20 text-slate-350 border border-slate-500/30'
                        }`}>
                          {selectedSheet.status === 'validated' && '🟢 Validé'}
                          {selectedSheet.status === 'rejected' && '🔴 Refusé'}
                          {selectedSheet.status === 'submitted' && '🟡 À valider'}
                          {selectedSheet.status === 'draft' && '⚪ Brouillon'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Relevé d'activité historique</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadSelectedPdf}
                    className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 text-xs font-extrabold font-sans shadow-xs border border-emerald-500/35"
                    title="Télécharger cette feuille d'heures au format PDF"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-100" />
                    Télécharger PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSelectedExcel}
                    className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 text-xs font-extrabold font-sans shadow-xs border border-indigo-500/35"
                    title="Exporter cette feuille d'heures au format Excel (XLSX)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-100" />
                    Exporter Excel
                  </button>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl transition cursor-pointer inline-flex items-center gap-1.5 text-xs font-extrabold font-sans shadow-xs border border-slate-700 disabled:opacity-50"
                    title="Actualiser et régénérer cette fiche pour avoir la dernière version à jour"
                  >
                    <RotateCw className={`w-3.5 h-3.5 text-slate-400 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
                    {isRefreshing ? 'Régénération...' : 'Régénérer'}
                  </button>
                  <button
                    onClick={() => setSelectedSheetId(null)}
                    className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg hover:bg-slate-750 transition cursor-pointer"
                    title="Fermer le détails"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              {/* Summary info strip */}
              <div className="bg-slate-50 px-6 py-4.5 border-b border-slate-100 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 text-center divide-x divide-slate-250/50">
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Requis (Contrat)</span>
                  <span className="text-xs font-bold text-slate-700 leading-tight block mt-0.5 font-sans">
                    {formatHours(selectedSheet.requiredHours)}
                  </span>
                </div>
                <div className="border-none sm:border-solid">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Effectué (+ Congés)</span>
                  <span className="text-xs font-black text-slate-800 mt-0.5 block font-mono">
                    {formatHours(selectedSheet.workedHours)}
                  </span>
                </div>
                <div className="border-none md:border-solid">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Heures Sup</span>
                  <span className={`text-xs font-black mt-0.5 block font-mono ${selectedSheet.overtimeHours > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                    +{formatHours(selectedSheet.overtimeHours)}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Heures de nuit</span>
                  <span className={`text-xs font-black mt-0.5 block font-mono ${(Object.values(selectedSheet.days || {}) as any[]).reduce((sum: number, d: any) => sum + (d.overtimeHours || 0), 0) > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                    {formatHours((Object.values(selectedSheet.days || {}) as any[]).reduce((sum: number, d: any) => sum + (d.overtimeHours || 0), 0))}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Solde Portefeuille</span>
                  <span className={`text-xs mt-1 font-extrabold uppercase tracking-widest inline-block ${
                    (selectedSheet.workedHours - selectedSheet.requiredHours) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {(selectedSheet.workedHours - selectedSheet.requiredHours) >= 0 ? '+' : ''}
                    {formatHours(selectedSheet.workedHours - selectedSheet.requiredHours)}
                  </span>
                </div>
              </div>

              {/* Status workflow notes / Signatures */}
              <div className="px-6 py-4 border-b border-slate-100 bg-indigo-50/20">
                <div className="flex flex-col gap-2">
                  <h5 className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">Modérateur / Audit du flux :</h5>
                  
                  {selectedSheet.status === 'validated' ? (
                    <div className="text-xs font-semibold text-emerald-800 bg-emerald-100/50 border border-emerald-200/80 p-3 rounded-xl flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
                      <div>
                        Feuille approuvée par <strong className="text-emerald-950 font-bold">{selectedSheet.validatedByName || 'Validateur'}</strong>.
                        {selectedSheet.validatedAt && (
                          <div className="text-[10px] text-emerald-600 mt-0.5 font-bold">Acté le {formatFrenchDate(selectedSheet.validatedAt.split('T')[0])}</div>
                        )}
                      </div>
                    </div>
                  ) : selectedSheet.status === 'rejected' ? (
                    <div className="text-xs font-semibold text-rose-800 bg-rose-50/80 border border-rose-200 p-3 rounded-xl flex flex-col gap-1">
                      <div className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-605" />
                        <div>
                          Feuille refusée.
                        </div>
                      </div>
                      {selectedSheet.rejectionReason && (
                        <div className="mt-1.5 p-2 bg-white rounded-lg border border-rose-100 text-[11px] font-medium text-rose-900 border-l-4 border-l-rose-500 italic block">
                          <strong>Motif du rejet :</strong> "{selectedSheet.rejectionReason}"
                        </div>
                      )}
                    </div>
                  ) : selectedSheet.status === 'submitted' ? (
                    <div className="text-xs font-semibold text-amber-800 bg-amber-50/60 border border-amber-200 p-3 rounded-xl flex items-start gap-2">
                      <Clock className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 animate-pulse" />
                      <div>
                        Ce dossier a été soumis par le collaborateur et est actuellement en attente de traitement.
                        {selectedSheet.submittedAt && (
                          <div className="text-[10px] text-amber-600 mt-0.5 font-bold">Soumis le {formatFrenchDate(selectedSheet.submittedAt.split('T')[0])}</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-slate-600 bg-slate-100/80 border border-slate-200 p-3 rounded-xl flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-1 text-slate-500" />
                      <div>
                        Cette feuille d'heures est enregistrée en mode brouillon par le salarié et n'a pas encore été transmise à la direction.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Day-by-Day detailed breakdown */}
              <div className="p-6 space-y-4 overflow-y-auto max-h-[380px] grow">
                <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Détail détaillé des journées déclarées</h5>
                
                <div className="overflow-x-auto border border-slate-200/60 rounded-2xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[9px]">
                        <th className="py-2.5 px-3.5">Date</th>
                        <th className="py-2.5 px-3.5">Durées de travail</th>
                        <th className="py-2.5 px-3.5 text-center">Effectué / Requis</th>
                        <th className="py-2.5 px-3.5">Heures Sup.</th>
                        <th className="py-2.5 px-3.5">Heures de nuit</th>
                        <th className="py-2.5 px-3.5">Remarques / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {getMonthDays(selectedSheet.monthDate).map(({ dayId, label, date }) => {
                        const rec = selectedSheet.days[date];
                        if (!rec) return null;

                        // Determiner si absence declaree
                        const isPaidLeave = !!rec.paidLeave || (rec.notPresent && rec.absenceType === 'paid');
                        const isUnpaidLeave = !!rec.unpaidLeave || (rec.notPresent && rec.absenceType === 'unpaid');
                        const isSickLeave = !!rec.sickLeave || (rec.notPresent && rec.absenceType === 'sick');
                        const isRecoveryLeave = (rec.notPresent && rec.absenceType === 'recovery');
                        const isOtherLeave = (rec.notPresent && rec.absenceType === 'other');
                        const isAnyLeave = isPaidLeave || isUnpaidLeave || isSickLeave || isRecoveryLeave || isOtherLeave;
                        const isFullDayLeave = isAnyLeave && (!rec.absenceDuration || rec.absenceDuration === 'full');
                        
                        if (isFullDayLeave) {
                          let labelText = "";
                          let badgeClass = "";
                          const durationStr = rec.absenceDuration === 'morning' ? 'Matin 🌅' : rec.absenceDuration === 'afternoon' ? 'Après-midi 🌇' : 'Journée complète';
                          
                          const defaultRec = selectedSheet.userProfile?.defaultSchedule?.[dayId];
                          const dayRequired = (defaultRec && defaultRec.active) ? (defaultRec.morningHours + defaultRec.afternoonHours) : 0;
                          const hoursCredited = (isPaidLeave || isSickLeave || isRecoveryLeave) ? dayRequired : 0;
                          const creditSuffix = hoursCredited > 0 ? ` (Crédit : ${formatHours(hoursCredited)})` : '';

                          if (isPaidLeave) {
                            const term = rec.paidLeave ? (rec.paidLeave === 'morning' ? 'Matin 🌅' : rec.paidLeave === 'afternoon' ? 'Après-midi 🌇' : 'Journée complète') : durationStr;
                            labelText = `🌴 Congés Payés : ${term}${creditSuffix}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-emerald-700 bg-emerald-50 border border-emerald-200 font-extrabold";
                          } else if (isUnpaidLeave) {
                            const term = rec.unpaidLeave ? (rec.unpaidLeave === 'morning' ? 'Matin 🌅' : rec.unpaidLeave === 'afternoon' ? 'Après-midi 🌇' : 'Journée complète') : durationStr;
                            labelText = `🕒 Sans Solde : ${term}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-amber-700 bg-amber-50 border border-amber-200 font-extrabold";
                          } else if (isSickLeave) {
                            const term = rec.sickLeave ? (rec.sickLeave === 'morning' ? 'Matin 🌅' : rec.sickLeave === 'afternoon' ? 'Après-midi 🌇' : 'Journée complète') : durationStr;
                            labelText = `🩺 Arrêt Maladie : ${term}${creditSuffix}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-rose-700 bg-rose-50 border border-rose-200 font-extrabold";
                          } else if (isRecoveryLeave) {
                            labelText = `⏰ Récupération : ${durationStr}${creditSuffix}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-indigo-700 bg-indigo-50 border border-indigo-200 font-extrabold";
                          } else if (isOtherLeave) {
                            labelText = `📄 Autre absence : ${durationStr}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-slate-700 bg-slate-50 border border-slate-200 font-extrabold";
                          }

                          return (
                            <tr key={date} className="bg-slate-50/40 italic whitespace-nowrap">
                              <td className="py-3 px-3.5 text-slate-500 font-semibold select-none">
                                {formatFrenchDate(rec.date).split(' ').slice(1, 3).join(' ')}
                              </td>
                              <td colSpan={5} className="py-3 px-3.5">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] uppercase tracking-wide ${badgeClass}`}>
                                  {labelText}
                                </span>
                              </td>
                            </tr>
                          );
                        }

                        const defaultRec = selectedSheet.userProfile?.defaultSchedule?.[dayId];
                        const dayRequired = (defaultRec && defaultRec.active) ? (defaultRec.morningHours + defaultRec.afternoonHours) : 0;
                        
                        let morningVal = rec.morningHours || 0;
                        let afternoonVal = rec.afternoonHours || 0;
                        
                        if (rec.notPresent) {
                          if (rec.absenceDuration === 'morning') {
                            afternoonVal = rec.afternoonHours || 0;
                            morningVal = 0;
                          } else if (rec.absenceDuration === 'afternoon') {
                            morningVal = rec.morningHours || 0;
                            afternoonVal = 0;
                          } else {
                            morningVal = 0;
                            afternoonVal = 0;
                          }
                        }

                        let dayPhysicalWorked = morningVal + afternoonVal;
                        let creditedAbsence = 0;
                        if (rec.notPresent && (rec.absenceType === 'paid' || rec.absenceType === 'sick' || rec.absenceType === 'recovery' || rec.absenceType === 'unpaid' || rec.absenceType === 'other')) {
                          if (defaultRec) {
                            creditedAbsence = rec.absenceDuration === 'full' 
                              ? (defaultRec.morningHours + defaultRec.afternoonHours) 
                              : (rec.absenceDuration === 'morning' ? defaultRec.morningHours : defaultRec.afternoonHours);
                          }
                        }

                        const dayStandardHours = dayPhysicalWorked + creditedAbsence;
                        const baseStandard = dayRequired > 0 ? Math.min(dayRequired, dayStandardHours) : dayStandardHours;
                        const excessPhysical = dayRequired > 0 ? Math.max(0, dayStandardHours - dayRequired) : 0;
                        const deficit = Math.max(0, dayRequired - baseStandard);
                        const declaredOvertime = rec.overtimeHours || 0;
                        const totalOvertimeForDay = declaredOvertime + excessPhysical;
                        const overtimeToComplete = Math.min(deficit, totalOvertimeForDay);

                        const calculatedStandard = baseStandard + overtimeToComplete;
                        const calculatedOvertime = totalOvertimeForDay - overtimeToComplete;

                        return (
                          <tr key={date} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3.5 font-bold text-slate-700">
                              <span className="capitalize">{dayIdToLabel[dayId]}</span>
                              <span className="text-[9.5px] text-slate-400 font-semibold block mt-0.5">{formatFrenchDate(rec.date).split(' ').slice(1, 3).join(' ')}</span>
                            </td>
                            
                            <td className="py-3.5 px-3.5 text-slate-650 font-mono text-xs">
                              <div className="flex flex-col gap-0.5">
                                <span>Matin : {rec.notPresent && (rec.absenceDuration === 'full' || rec.absenceDuration === 'morning') ? (
                                  <span className="text-rose-600 font-bold">Abs ({isPaidLeave ? 'CP' : isSickLeave ? 'Maladie' : isRecoveryLeave ? 'Récup' : isUnpaidLeave ? 'CSS' : 'Autre'})</span>
                                ) : (
                                  <strong className="text-slate-800">{morningVal}h</strong>
                                )}</span>
                                <span>A.-M. : {rec.notPresent && (rec.absenceDuration === 'full' || rec.absenceDuration === 'afternoon') ? (
                                  <span className="text-rose-600 font-bold">Abs ({isPaidLeave ? 'CP' : isSickLeave ? 'Maladie' : isRecoveryLeave ? 'Récup' : isUnpaidLeave ? 'CSS' : 'Autre'})</span>
                                ) : (
                                  <strong className="text-slate-800">{afternoonVal}h</strong>
                                )}</span>
                              </div>
                            </td>

                            <td className="py-3.5 px-3.5 text-center font-black text-slate-800 font-mono text-xs select-all">
                              <div className="flex flex-col items-center">
                                <span>{formatHours(calculatedStandard)}</span>
                                <span className="text-[10px] text-slate-450 font-normal">Requis: {formatHours(dayRequired)}</span>
                              </div>
                            </td>

                            <td className="py-3.5 px-3.5 text-slate-700 text-xs font-mono">
                              {calculatedOvertime > 0 ? (
                                <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-xs">
                                  +{formatHours(calculatedOvertime)}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3.5 text-slate-700 text-xs font-mono">
                              {declaredOvertime > 0 ? (
                                <span className="inline-flex px-2 py-0.5 rounded-md bg-amber-100 border border-amber-200 text-amber-850 font-black text-xs">
                                  {formatHours(declaredOvertime)}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3.5 text-slate-550 max-w-xs break-words text-xs leading-relaxed">
                              <div className="flex flex-col gap-1.5">
                                {rec.notPresent && (
                                  <div className={`text-[10px] font-bold px-2 py-1 rounded-md mb-1 inline-block w-fit ${
                                    isPaidLeave ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' :
                                    isUnpaidLeave ? 'text-amber-700 bg-amber-50 border border-amber-200' :
                                    isSickLeave ? 'text-rose-700 bg-rose-50 border border-rose-200' :
                                    isRecoveryLeave ? 'text-indigo-700 bg-indigo-50 border border-indigo-200' :
                                    'text-slate-700 bg-slate-50 border border-slate-200'
                                  }`}>
                                    {isPaidLeave ? '🌴 CP' : isUnpaidLeave ? '🕒 CSS' : isSickLeave ? '🩺 Arrêt' : isRecoveryLeave ? '⏰ Récup' : '📄 Autre'} - {rec.absenceDuration === 'morning' ? 'Matin' : 'Après-midi'}
                                    {rec.absenceReason ? ` : ${rec.absenceReason}` : ''}
                                  </div>
                                )}
                                {declaredOvertime > 0 && rec.overtimeNote ? (
                                  <div className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2 flex flex-col gap-0.5 leading-snug">
                                    <span className="text-[8px] uppercase tracking-wider font-extrabold text-slate-400">Justif :</span>
                                    <span className="font-medium text-slate-755 italic pr-2">"{rec.overtimeNote}"</span>
                                  </div>
                                ) : declaredOvertime > 0 ? (
                                  <span className="text-rose-500 font-bold italic text-[10px]">Justification manquante !</span>
                                ) : null}

                                {rec.dayNote && (
                                  <div className="text-[11px] bg-indigo-50/35 border border-indigo-100 rounded-lg p-2 flex flex-col gap-0.5 leading-snug">
                                    <span className="text-[8px] uppercase tracking-wider font-extrabold text-indigo-500">Note :</span>
                                    <span className="font-medium text-indigo-900/95 italic pr-2">"{rec.dayNote}"</span>
                                  </div>
                                )}

                                {!rec.dayNote && declaredOvertime === 0 && !rec.notPresent && (
                                  <span className="text-slate-400 italic font-medium">Pas de note</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </div>

            </div>
          ) : (
            <div className="bg-slate-50 rounded-3xl border border-dashed border-slate-200/80 p-16 text-center h-full flex flex-col justify-center items-center shadow-2xs select-none">
              <FileText className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm font-extrabold text-slate-650">Aucun relevé d'heures sélectionné</p>
              <p className="text-xs text-slate-450 mt-1 max-w-xs leading-relaxed">
                Cliquez sur une fiche d'heures de la liste à gauche pour consulter ses détails de pointage, ses motifs d'absence, et son statut de validation.
              </p>
            </div>
          )}
        </div>

      </div>

      {showRefreshToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-950 border border-slate-800 text-white py-3 px-5 rounded-2xl shadow-xl flex items-center gap-2.5 animate-bounce font-sans text-xs font-bold">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Données et fiches d'heures actualisées !
        </div>
      )}

    </div>
  );
}
