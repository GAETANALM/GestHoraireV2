import XLSX from 'xlsx-js-style';
import { DayRecord } from '../types';
import { formatFrenchMonth, formatFrenchDate, getMonthDays } from './dateUtils';

interface QuickStats {
  totalRegular: number;
  totalOvertime: number;
  monthlyRequiredHours: number;
  monthlyWorkedHours: number;
  activeDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  sickLeaveDays: number;
  recoveryDays: number;
  otherLeaveDays: number;
}

export function calculateSheetStats(timesheet: any, userProfile: any): QuickStats {
  let totalRegular = 0;
  let totalOvertime = 0;
  let activeDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let sickLeaveDays = 0;
  let recoveryDays = 0;
  let otherLeaveDays = 0;

  let monthlyRequiredHours = 0;
  let monthlyWorkedHours = 0;

  const defaultSchedule = userProfile?.defaultSchedule || {};
  const daysList = getMonthDays(timesheet.monthDate);

  daysList.forEach((dayInfo) => {
    const defaultDay = defaultSchedule[dayInfo.dayId];
    const rec = (timesheet.days?.[dayInfo.date] || { active: false }) as DayRecord;

    const reqHours = (defaultDay && defaultDay.active) ? (defaultDay.morningHours + defaultDay.afternoonHours) : 0;
    monthlyRequiredHours += reqHours;

    let dayPhysicalWorked = 0;
    if (rec.active) {
      dayPhysicalWorked = (rec.morningHours || 0) + (rec.afternoonHours || 0);
      activeDays++;
    }

    let creditedAbsence = 0;
    if (rec.notPresent) {
      const weight = (rec.absenceDuration === 'morning' || rec.absenceDuration === 'afternoon') ? 0.5 : 1;
      if (rec.absenceType === 'paid') {
        paidLeaveDays += weight;
      } else if (rec.absenceType === 'unpaid') {
        unpaidLeaveDays += weight;
      } else if (rec.absenceType === 'sick') {
        sickLeaveDays += weight;
      } else if (rec.absenceType === 'recovery') {
        recoveryDays += weight;
      } else if (rec.absenceType === 'other') {
        otherLeaveDays += weight;
      }
      
      if (rec.absenceType === 'paid' || rec.absenceType === 'sick' || rec.absenceType === 'recovery' || rec.absenceType === 'unpaid' || rec.absenceType === 'other') {
        if (defaultDay) {
          creditedAbsence = rec.absenceDuration === 'full' 
            ? (defaultDay.morningHours + defaultDay.afternoonHours) 
            : (rec.absenceDuration === 'morning' ? defaultDay.morningHours : defaultDay.afternoonHours);
        }
      }
    }

    const dayStandardHours = dayPhysicalWorked + creditedAbsence;
    const baseStandard = reqHours > 0 ? Math.min(reqHours, dayStandardHours) : dayStandardHours;
    const excessPhysical = reqHours > 0 ? Math.max(0, dayStandardHours - reqHours) : 0;
    const deficit = Math.max(0, reqHours - baseStandard);
    const declaredOvertime = rec.overtimeHours || 0;
    const totalOvertimeForDay = declaredOvertime + excessPhysical;
    const overtimeToComplete = Math.min(deficit, totalOvertimeForDay);

    totalRegular += (baseStandard + overtimeToComplete);
    totalOvertime += (totalOvertimeForDay - overtimeToComplete);
    monthlyWorkedHours += dayPhysicalWorked + declaredOvertime + creditedAbsence;
  });

  return {
    totalRegular,
    totalOvertime,
    monthlyRequiredHours,
    monthlyWorkedHours,
    activeDays,
    paidLeaveDays,
    unpaidLeaveDays,
    sickLeaveDays,
    recoveryDays,
    otherLeaveDays,
  };
}

export function exportSingleTimesheetToExcel(timesheet: any, userProfile: any) {
  const stats = calculateSheetStats(timesheet, userProfile);
  const aoa: any[][] = [];

  // Row 0
  aoa.push(['GESTHORAIREALM']);
  // Row 1
  aoa.push(["Feuille d'heures mensuelle - Portail de Saisie & Validation"]);
  // Row 2
  aoa.push([]); // spacer

  let statusText = 'Brouillon';
  if (timesheet.status === 'validated') statusText = 'VALIDÉ';
  else if (timesheet.status === 'rejected') statusText = 'REFUSÉ';
  else if (timesheet.status === 'submitted') statusText = 'SOUMIS (EN ATTENTE)';

  let totalNightHours = 0;
  if (timesheet.days) {
    Object.values(timesheet.days).forEach((d: any) => {
      totalNightHours += (d.overtimeHours || 0);
    });
  }

  const balance = stats.monthlyWorkedHours - stats.monthlyRequiredHours;
  const balanceStr = `${balance >= 0 ? '+' : ''}${balance} h`;

  // Row 3 (KPI Header Row 1)
  aoa.push([
    'SALARIÉ',
    timesheet.userName || userProfile?.name || 'Collaborateur',
    'REQUIS (CONTRAT)',
    `${stats.monthlyRequiredHours} h`,
    'HEURES SUPP.',
    `${stats.totalOvertime} h`,
    'CONGÉS PAYÉS',
    `${stats.paidLeaveDays} j`
  ]);

  // Row 4 (KPI Header Row 2)
  aoa.push([
    'PÉRIODE',
    formatFrenchMonth(timesheet.monthDate),
    'HEURES NORMALES',
    `${stats.totalRegular} h`,
    'TOTAL EFFECTUÉ',
    `${stats.monthlyWorkedHours} h`,
    'SANS SOLDE',
    `${stats.unpaidLeaveDays} j`
  ]);

  // Row 5 (KPI Header Row 3)
  aoa.push([
    'STATUT',
    statusText,
    'HEURES DE NUIT',
    `${totalNightHours} h`,
    'SOLDE PORTEFEUILLE',
    balanceStr,
    'ARRÊTS MALADIE',
    `${stats.sickLeaveDays} j`
  ]);

  // Row 6 (KPI Header Row 4)
  aoa.push([
    'RÉCUPÉRATION',
    `${stats.recoveryDays} j`,
    'AUTRE ABSENCE',
    `${stats.otherLeaveDays} j`,
    'JOURS TRAVAILLÉS',
    `${stats.activeDays} j`,
    'VALIDÉ PAR',
    timesheet.validatedByName || 'Non validé'
  ]);

  // Row 7
  aoa.push([]); // spacer

  // Row 8 (Table Headers)
  const headers = [
    'Date',
    'Matin',
    'A.-Midi',
    'Nuit',
    'Sup.',
    'Congés',
    'Requis',
    'Effectué',
    'Commentaires, Absences & Notes'
  ];
  aoa.push(headers);

  const daysList = getMonthDays(timesheet.monthDate);
  const defaultSchedule = userProfile?.defaultSchedule || {};

  daysList.forEach((dayInfo) => {
    const defaultDay = defaultSchedule[dayInfo.dayId];
    const rec = (timesheet.days?.[dayInfo.date] || { active: false }) as DayRecord;

    let reqHours = 0;
    if (defaultDay && defaultDay.active) {
      reqHours = defaultDay.morningHours + defaultDay.afternoonHours;
    }

    let morningVal = 0;
    let afternoonVal = 0;
    let nightVal = 0;
    let supVal = 0;
    let absenceCredit = 0;
    let effectueVal = 0;
    let comment = '';

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
      const dayStandardHours = dayPhysicalWorked;
      const excessPhysical = reqHours > 0 ? Math.max(0, dayStandardHours - reqHours) : 0;
      supVal = excessPhysical;

      effectueVal = dayPhysicalWorked + nightVal;
      comment = rec.overtimeNote || '';
    } else {
      comment = "Non travaillé / Repos";
    }

    if (rec.dayNote) {
      comment = comment ? `${comment}\nNote: ${rec.dayNote}` : `Note: ${rec.dayNote}`;
    }

    const formattedDateCell = `${dayInfo.date.split('-')[2]} (${dayInfo.label.substring(0, 3)})`;

    let matinCell: string | number = "-";
    if (rec.notPresent && (rec.absenceDuration === 'full' || rec.absenceDuration === 'morning')) {
      matinCell = "Abs";
    } else if (morningVal > 0) {
      matinCell = `${morningVal}h`;
    }

    let midiCell: string | number = "-";
    if (rec.notPresent && (rec.absenceDuration === 'full' || rec.absenceDuration === 'afternoon')) {
      midiCell = "Abs";
    } else if (afternoonVal > 0) {
      midiCell = `${afternoonVal}h`;
    }

    const row = [
      formattedDateCell,
      matinCell,
      midiCell,
      nightVal > 0 ? `${nightVal}h` : "-",
      supVal > 0 ? `+${supVal}h` : "-",
      absenceCredit > 0 ? `${absenceCredit}h` : "-",
      reqHours > 0 ? `${reqHours}h` : "-",
      effectueVal > 0 ? `${effectueVal}h` : "0h",
      comment
    ];
    aoa.push(row);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Styling properties
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (!cell) continue;

      // Initialize styling block
      const style: any = {
        font: { name: 'Segoe UI', sz: 10 }
      };

      // Header row 0
      if (r === 0) {
        style.font = { name: 'Segoe UI', sz: 16, bold: true, color: { rgb: '0F172A' } };
        style.alignment = { vertical: 'center' };
      }
      // Subtitle row 1
      else if (r === 1) {
        style.font = { name: 'Segoe UI', sz: 10, italic: true, color: { rgb: '64748B' } };
        style.alignment = { vertical: 'center' };
      }
      // KPI rows 3, 4, 5, 6
      else if (r >= 3 && r <= 6) {
        style.fill = { fgColor: { rgb: 'F8FAFC' } };
        style.border = {
          top: { style: 'thin', color: { rgb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
          left: { style: 'thin', color: { rgb: 'E2E8F0' } },
          right: { style: 'thin', color: { rgb: 'E2E8F0' } }
        };

        const isLabel = (c % 2 === 0);
        if (isLabel) {
          style.font = { name: 'Segoe UI', sz: 9, bold: true, color: { rgb: '475569' } };
          style.alignment = { horizontal: 'left', vertical: 'center' };
        } else {
          style.font = { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: '0F172A' } };
          style.alignment = { horizontal: 'left', vertical: 'center' };

          // Highlight status
          if (r === 5 && c === 1) {
            const vStr = String(cell.v);
            if (vStr === 'VALIDÉ') {
              style.fill = { fgColor: { rgb: 'DCFCE7' } };
              style.font.color = { rgb: '15803D' };
            } else if (vStr === 'REFUSÉ') {
              style.fill = { fgColor: { rgb: 'FEE2E2' } };
              style.font.color = { rgb: 'B91C1C' };
            } else if (vStr.includes('SOUMIS')) {
              style.fill = { fgColor: { rgb: 'FEF3C7' } };
              style.font.color = { rgb: 'D97706' };
            } else {
              style.fill = { fgColor: { rgb: 'F1F5F9' } };
              style.font.color = { rgb: '475569' };
            }
          }

          // Total Effectué highlight
          if (r === 4 && c === 5) {
            style.font.color = { rgb: '2563EB' }; // Blue
          }

          // Solde Portefeuille highlight
          if (r === 5 && c === 5) {
            const vStr = String(cell.v);
            if (vStr.startsWith('+')) {
              style.font.color = { rgb: '15803D' }; // Green
            } else if (vStr.startsWith('-')) {
              style.font.color = { rgb: 'B91C1C' }; // Red
            }
          }
        }
      }
      // Main table headers (row 8)
      else if (r === 8) {
        style.fill = { fgColor: { rgb: '1E293B' } };
        style.font = { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: 'FFFFFF' } };
        style.alignment = { horizontal: 'center', vertical: 'center' };
        style.border = {
          top: { style: 'medium', color: { rgb: '0F172A' } },
          bottom: { style: 'medium', color: { rgb: '0F172A' } }
        };
      }
      // Main table data (rows 9+)
      else if (r >= 9) {
        const dateVal = String(ws[XLSX.utils.encode_cell({ r, c: 0 })]?.v || '');
        const isWeekend = dateVal.includes('(Sam)') || dateVal.includes('(Dim)');

        style.border = {
          top: { style: 'thin', color: { rgb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
          left: { style: 'thin', color: { rgb: 'E2E8F0' } },
          right: { style: 'thin', color: { rgb: 'E2E8F0' } }
        };

        if (isWeekend) {
          style.fill = { fgColor: { rgb: 'F1F5F9' } };
          style.font = { name: 'Segoe UI', sz: 9.5, italic: true, color: { rgb: '94A3B8' } };
          style.alignment = { horizontal: c === 8 ? 'left' : 'center', vertical: c === 8 ? 'top' : 'center', wrapText: c === 8 ? true : undefined };
        } else {
          // Standard day
          style.font = { name: 'Segoe UI', sz: 10, color: { rgb: '1E293B' } };
          style.alignment = { horizontal: c === 8 ? 'left' : 'center', vertical: c === 8 ? 'top' : 'center', wrapText: c === 8 ? true : undefined };

          // Highlight Absence text in red
          const valStr = String(cell.v);
          if (valStr === 'Abs' || valStr.startsWith('Abs ')) {
            style.font.bold = true;
            style.font.color = { rgb: 'DC2626' };
          }

          // Nuit color
          if (c === 3 && valStr !== '-') {
            style.font.bold = true;
            style.font.color = { rgb: 'D97706' }; // Amber
          }

          // Sup. color
          if (c === 4 && valStr !== '-') {
            style.font.bold = true;
            style.font.color = { rgb: '15803D' }; // Green
          }

          // Congés color
          if (c === 5 && valStr !== '-') {
            style.font.bold = true;
            style.font.color = { rgb: '4F46E5' }; // Indigo
          }

          // Effectué highlights in Blue
          if (c === 7) {
            style.font.bold = true;
            style.font.color = { rgb: '2563EB' }; // Deep Blue
          }
        }
      }

      cell.s = style;
    }
  }

  // Set widths for a highly professional experience
  ws['!cols'] = [
    { wch: 14 }, // Date
    { wch: 10 }, // Matin
    { wch: 10 }, // A.-Midi
    { wch: 10 }, // Nuit
    { wch: 10 }, // Sup.
    { wch: 10 }, // Congés
    { wch: 10 }, // Requis
    { wch: 10 }, // Effectué
    { wch: 48 }  // Commentaires, Absences & Notes
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Déclaration Horaires");
  const safeName = (timesheet.userName || userProfile?.name || 'Collaborateur').replace(/\s+/g, '_');
  XLSX.writeFile(wb, `declaration_heures_${safeName}_${timesheet.monthDate}.xlsx`);
}

export function exportFilteredSheetsToExcel(sheets: any[], periodName: string) {
  const aoa: any[][] = [];

  aoa.push([`RAPPORT GLOBAL D'EXPORTATION DES HORAIRES ET HEURES SUPPLÉMENTAIRES`]);
  aoa.push([`Période sélectionnée : ${periodName}`]);
  aoa.push([`Généré le : ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')} (GestHoraireALM)`]);
  aoa.push([]); // blank spacing

  const headers = [
    'Salarié',
    'Email',
    'Période',
    'Statut',
    'REQUIS (CONTRAT)',
    'HEURES NORMALES',
    'HEURES DE NUIT',
    'HEURES SUPP.',
    'TOTAL EFFECTUÉ',
    'SOLDE PORTEFEUILLE',
    'CONGÉS PAYÉS (jours)',
    'SANS SOLDE (jours)',
    'ARRÊTS MALADIE (jours)',
    'RÉCUPÉRATION (jours)',
    'AUTRE ABSENCE (jours)',
    'JOURS TRAVAILLÉS',
    'COMMENTAIRES / REMARQUES'
  ];
  aoa.push(headers);

  sheets.forEach((sheet) => {
    const stats = calculateSheetStats(sheet, sheet.userProfile);

    let statusLabel = 'Brouillon';
    if (sheet.status === 'submitted') statusLabel = 'En attente de validation';
    else if (sheet.status === 'validated') statusLabel = 'Validé';
    else if (sheet.status === 'rejected') statusLabel = 'Refusé';

    // Sum night hours
    let totalNightHours = 0;
    if (sheet.days) {
      Object.values(sheet.days).forEach((d: any) => {
        totalNightHours += (d.overtimeHours || 0);
      });
    }

    const notesList: string[] = [];
    Object.entries(sheet.days || {}).forEach(([dayDate, dayVal]) => {
      const day = dayVal as DayRecord;
      const shortDay = dayDate.split('-')[2];
      if (day.overtimeNote) notesList.push(`• Le ${shortDay} (Nuit): ${day.overtimeNote}`);
      if (day.dayNote) notesList.push(`• Le ${shortDay} (Note): ${day.dayNote}`);
      if (day.absenceReason) notesList.push(`• Le ${shortDay} (Absence): ${day.absenceReason}`);
    });
    const globalNotes = notesList.join('\n');

    const balance = stats.monthlyWorkedHours - stats.monthlyRequiredHours;
    const balanceStr = `${balance >= 0 ? '+' : ''}${balance} h`;

    const row = [
      sheet.userName,
      sheet.userProfile?.email || 'N/A',
      formatFrenchMonth(sheet.monthDate),
      statusLabel,
      `${stats.monthlyRequiredHours} h`,
      `${stats.totalRegular} h`,
      `${totalNightHours} h`,
      `${stats.totalOvertime} h`,
      `${stats.monthlyWorkedHours} h`,
      balanceStr,
      `${stats.paidLeaveDays} j`,
      `${stats.unpaidLeaveDays} j`,
      `${stats.sickLeaveDays} j`,
      `${stats.recoveryDays} j`,
      `${stats.otherLeaveDays} j`,
      `${stats.activeDays} j`,
      globalNotes
    ];
    aoa.push(row);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Apply styling properties
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = ws[cellRef];
      if (!cell) continue;

      const style: any = {
        font: { name: 'Segoe UI', sz: 10 }
      };

      if (r === 0) {
        style.font = { name: 'Segoe UI', sz: 14, bold: true, color: { rgb: '0F172A' } };
      } else if (r === 1 || r === 2) {
        style.font = { name: 'Segoe UI', sz: 10, italic: true, color: { rgb: '475569' } };
      } else if (r === 4) {
        // Table Header
        style.fill = { fgColor: { rgb: '1E293B' } };
        style.font = { name: 'Segoe UI', sz: 10, bold: true, color: { rgb: 'FFFFFF' } };
        style.alignment = { horizontal: 'center', vertical: 'center' };
        style.border = {
          top: { style: 'medium', color: { rgb: '0F172A' } },
          bottom: { style: 'medium', color: { rgb: '0F172A' } }
        };
      } else if (r >= 5) {
        // Table Rows
        style.border = {
          top: { style: 'thin', color: { rgb: 'E2E8F0' } },
          bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
          left: { style: 'thin', color: { rgb: 'E2E8F0' } },
          right: { style: 'thin', color: { rgb: 'E2E8F0' } }
        };

        // Alignments
        if (c === 0 || c === 1 || c === 16) {
          style.alignment = { horizontal: 'left', vertical: c === 16 ? 'top' : 'center', wrapText: c === 16 ? true : undefined };
        } else {
          style.alignment = { horizontal: 'center', vertical: 'center' };
        }

        // Color status column (Column 3)
        if (c === 3) {
          const vStr = String(cell.v);
          style.font.bold = true;
          if (vStr === 'Validé') {
            style.font.color = { rgb: '15803D' };
          } else if (vStr === 'Refusé') {
            style.font.color = { rgb: 'B91C1C' };
          } else if (vStr.includes('attente')) {
            style.font.color = { rgb: 'D97706' };
          }
        }

        // Night, Overtime, Total, Solde highlights
        const valStr = String(cell.v);
        if (c === 6 && valStr !== '0 h') {
          style.font.bold = true;
          style.font.color = { rgb: 'D97706' };
        }
        if (c === 7 && valStr !== '0 h') {
          style.font.bold = true;
          style.font.color = { rgb: '15803D' };
        }
        if (c === 8) {
          style.font.bold = true;
          style.font.color = { rgb: '2563EB' };
        }
        if (c === 9) {
          style.font.bold = true;
          if (valStr.startsWith('+')) {
            style.font.color = { rgb: '15803D' };
          } else if (valStr.startsWith('-')) {
            style.font.color = { rgb: 'B91C1C' };
          }
        }
      }

      cell.s = style;
    }
  }

  // Set widths for a highly professional look
  ws['!cols'] = [
    { wch: 18 }, // Salarié
    { wch: 22 }, // Email
    { wch: 12 }, // Période
    { wch: 22 }, // Statut
    { wch: 18 }, // REQUIS
    { wch: 18 }, // NORMALES
    { wch: 18 }, // DE NUIT
    { wch: 18 }, // HEURES SUPP.
    { wch: 18 }, // TOTAL EFFECTUÉ
    { wch: 18 }, // SOLDE PORTEFEUILLE
    { wch: 20 }, // CONGÉS PAYÉS
    { wch: 20 }, // SANS SOLDE
    { wch: 20 }, // ARRÊTS MALADIE
    { wch: 20 }, // RÉCUPÉRATION
    { wch: 20 }, // AUTRE ABSENCE
    { wch: 18 }, // JOURS TRAVAILLÉS
    { wch: 50 }  // COMMENTAIRES
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Rapport global");
  XLSX.writeFile(wb, `rapport_export_heures_${periodName.replace(/\s+/g, '_')}.xlsx`);
}
