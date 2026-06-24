/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { User, Timesheet, WeekDayId, DefaultDaySchedule, DayRecord } from '../types';
import { weekDayIds, dayIdToLabel } from '../utils/dateUtils';
import { 
  User as UserIcon, 
  Lock, 
  Clock, 
  Calendar, 
  TrendingUp, 
  Check, 
  AlertCircle, 
  Coffee, 
  RefreshCw, 
  Key,
  ShieldCheck,
  ShieldAlert,
  UserCheck2,
  FileSpreadsheet,
  Download,
  Upload,
  Database,
  Trash2
} from 'lucide-react';

interface UserProfileProps {
  currentUser: User;
  timesheets: Timesheet[];
  allUsers: User[];
  allTimesheets: Timesheet[];
  onImportData: (importedUsers: User[], importedTimesheets: Timesheet[]) => Promise<void> | void;
  onClearTimesheets: () => Promise<void> | void;
  onSaveUser: (updatedUser: User) => Promise<void> | void;
  isFirebaseActive: boolean;
}

export default function UserProfile({ 
  currentUser, 
  timesheets, 
  allUsers,
  allTimesheets,
  onImportData,
  onClearTimesheets,
  onSaveUser,
  isFirebaseActive 
}: UserProfileProps) {
  // Sub-tabs in profile management page
  const [subTab, setSubTab] = useState<'info' | 'schedule' | 'stats' | 'backup'>('info');

  // Input states for account info
  const [name, setName] = useState(currentUser.name);
  const [password, setPassword] = useState(currentUser.password || '');
  const [newPassword, setNewPassword] = useState('');
  const [isValidator, setIsValidator] = useState(currentUser.isValidator ?? (currentUser.role === 'validator'));
  const [isAdmin, setIsAdmin] = useState(currentUser.isAdmin ?? (currentUser.role === 'validator'));
  const [isActive, setIsActive] = useState(currentUser.isActive !== false);
  
  // Schedule state
  const [schedule, setSchedule] = useState<Record<WeekDayId, DefaultDaySchedule>>(
    JSON.parse(JSON.stringify(currentUser.defaultSchedule))
  );

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // States for backup import
  const [importStatus, setImportStatus] = useState<'idle' | 'reading' | 'validated' | 'error' | 'applying' | 'success'>('idle');
  const [importError, setImportError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{ users: User[], timesheets: Timesheet[] } | null>(null);
  const [importMethod, setImportMethod] = useState<'merge' | 'overwrite'>('merge');
  const [dragOver, setDragOver] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // States for stats selection (filtering by chosen year and month)
  const currentYearStr = useMemo(() => String(new Date().getFullYear()), []);
  const currentMonthStr = useMemo(() => String(new Date().getMonth() + 1).padStart(2, '0'), []);
  const [statsYear, setStatsYear] = useState<string>(currentYearStr);
  const [statsMonth, setStatsMonth] = useState<string>(currentMonthStr);

  // Backup files processor
  const processBackupFile = (file: File) => {
    setImportStatus('reading');
    setImportError(null);
    setParsedData(null);
    
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      setImportStatus('error');
      setImportError('Le fichier doit être au format JSON (.json).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Le fichier JSON est invalide ou vide.');
        }

        const usersArray = Array.isArray(parsed.users) ? parsed.users : [];
        const sheetsArray = Array.isArray(parsed.timesheets) ? parsed.timesheets : [];
        
        if (usersArray.length === 0 && sheetsArray.length === 0) {
          throw new Error("Aucune donnée de collaborateur ou de feuille de temps valide n'a été détectée.");
        }

        // Validate basic properties
        const validUsers = usersArray.filter((u: any) => u && typeof u === 'object' && u.id && u.name && u.email);
        const validSheets = sheetsArray.filter((t: any) => t && typeof t === 'object' && t.id && t.userId && t.monthDate);

        if (validUsers.length === 0 && validSheets.length === 0) {
          throw new Error("Le format interne des données est incorrect ou incompatible.");
        }

        setParsedData({ users: validUsers, timesheets: validSheets });
        setImportStatus('validated');
      } catch (err: any) {
        setImportStatus('error');
        setImportError(err.message || 'Erreur lors du décodage du fichier.');
      }
    };
    reader.onerror = () => {
      setImportStatus('error');
      setImportError('Impossible de lire le fichier.');
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processBackupFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processBackupFile(file);
  };

  // Export handling
  const handleExportData = () => {
    try {
      const backupObj = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        users: allUsers,
        timesheets: allTimesheets
      };
      
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupObj, null, 2)
      )}`;
      
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", jsonString);
      
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.setAttribute("download", `gest_horaire_backup_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      
      setMessage({ type: 'success', text: 'Exportation réussie ! Votre fichier de sauvegarde a été téléchargé sous le nom de gest_horaire_backup_' + dateStr + '.json' });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      setMessage({ type: 'error', text: `Échec de l'exportation : ${err.message || err}` });
    }
  };

  // CSV template handling for batch user creation
  const handleDownloadCsvTemplate = () => {
    const csvHeaders = "Nom,Email,Role,Est_Administrateur,Est_Valideur,Actif,Code_PIN";
    const csvRows = [
      "Jean Eude,jean.eude@example.com,employee,non,non,oui,111111",
      "Paul Dupont,paul.dupont@example.com,employee,non,non,oui,567890",
      "Marie Martin,marie.martin@example.com,validator,oui,oui,oui,000000"
    ];
    const csvContent = "\uFEFF" + [csvHeaders, ...csvRows].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `gabarit_import_collaborateurs.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
  };

  // CSV import handling to parse and append/merge users
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error("Le fichier est vide.");

        const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length <= 1) {
          throw new Error("Le fichier CSV doit contenir une ligne d'en-tête et au moins une ligne de données.");
        }

        const header = lines[0].toLowerCase();
        const separator = header.includes(';') ? ';' : ',';
        const columns = lines[0].split(separator).map(col => col.trim().toLowerCase());

        const nameIdx = columns.findIndex(c => c.includes('nom') || c.includes('name'));
        const emailIdx = columns.findIndex(c => c.includes('email') || c.includes('mail'));
        const roleIdx = columns.findIndex(c => c.includes('role'));
        const adminIdx = columns.findIndex(c => c.includes('admin') || c.includes('valideur'));
        const isValIdx = columns.findIndex(c => c.includes('valideur') || c.includes('validator'));
        const activeIdx = columns.findIndex(c => c.includes('actif') || c.includes('active'));
        const pwdIdx = columns.findIndex(c => c.includes('passe') || c.includes('password') || c.includes('pwd'));
        const pinIdx = columns.findIndex(c => c.includes('pin') || c.includes('code'));

        if (nameIdx === -1 || emailIdx === -1) {
          throw new Error("Le fichier CSV est incorrect. Les colonnes 'Nom' et 'Email' sont obligatoires.");
        }

        const importedUsersList: User[] = [];

        for (let i = 1; i < lines.length; i++) {
          const rawRow = lines[i];
          let rowCells: string[] = [];
          
          if (rawRow.includes('"')) {
            let insideQuote = false;
            let currentCell = '';
            for (let charIdx = 0; charIdx < rawRow.length; charIdx++) {
              const char = rawRow[charIdx];
              if (char === '"') {
                insideQuote = !insideQuote;
              } else if (char === separator && !insideQuote) {
                rowCells.push(currentCell.trim());
                currentCell = '';
              } else {
                currentCell += char;
              }
            }
            rowCells.push(currentCell.trim());
          } else {
            rowCells = rawRow.split(separator).map(c => c.trim());
          }

          if (rowCells.length < Math.max(nameIdx, emailIdx) + 1) {
            continue;
          }

          const nameVal = rowCells[nameIdx];
          const emailVal = rowCells[emailIdx];
          if (!nameVal || !emailVal) continue;

          const isTrue = (val?: string) => {
            if (!val) return false;
            const clean = val.toLowerCase();
            return clean === 'oui' || clean === 'true' || clean === 'yes' || clean === '1' || clean === 'y';
          };

          const roleRaw = roleIdx !== -1 ? rowCells[roleIdx]?.toLowerCase() : 'employee';
          const roleVal: 'employee' | 'validator' = (roleRaw === 'validator' || roleRaw === 'valideur') ? 'validator' : 'employee';

          const isAdminVal = adminIdx !== -1 ? isTrue(rowCells[adminIdx]) : (roleVal === 'validator');
          const isValidatorVal = isValIdx !== -1 ? isTrue(rowCells[isValIdx]) : (roleVal === 'validator');
          const isActiveVal = activeIdx !== -1 ? (rowCells[activeIdx] ? isTrue(rowCells[activeIdx]) : true) : true;
          const pinVal = pinIdx !== -1 ? rowCells[pinIdx] : '111111';
          const passwordVal = pwdIdx !== -1 ? rowCells[pwdIdx] : pinVal;

          const userId = 'usr_csv_' + Math.random().toString(36).substring(2, 11);

          const DEFAULT_SCHEDULE_DAY = { active: true, morningHours: 4, afternoonHours: 3.5 };
          const csvUserSchedule = {
            monday: { ...DEFAULT_SCHEDULE_DAY },
            tuesday: { ...DEFAULT_SCHEDULE_DAY },
            wednesday: { ...DEFAULT_SCHEDULE_DAY },
            thursday: { ...DEFAULT_SCHEDULE_DAY },
            friday: { ...DEFAULT_SCHEDULE_DAY, afternoonHours: 3 },
            saturday: { morningHours: 0, afternoonHours: 0, active: false },
            sunday: { morningHours: 0, afternoonHours: 0, active: false },
          };

          const newUser: User = {
            id: userId,
            name: nameVal,
            email: emailVal.toLowerCase(),
            role: roleVal,
            isEmployee: true,
            isValidator: isValidatorVal,
            isAdmin: isAdminVal,
            isActive: isActiveVal,
            password: passwordVal,
            pin: pinVal,
            defaultSchedule: csvUserSchedule
          };

          importedUsersList.push(newUser);
        }

        if (importedUsersList.length === 0) {
          throw new Error("Aucun collaborateur valide n'a pu être extrait du fichier CSV.");
        }

        const mergedUsersMap = new Map<string, User>();
        allUsers.forEach(u => mergedUsersMap.set(u.email.toLowerCase(), u));
        
        importedUsersList.forEach(importedU => {
          const existing = mergedUsersMap.get(importedU.email.toLowerCase());
          if (existing) {
            mergedUsersMap.set(importedU.email.toLowerCase(), {
              ...existing,
              name: importedU.name,
              role: importedU.role,
              isValidator: importedU.isValidator,
              isAdmin: importedU.isAdmin,
              isActive: importedU.isActive,
              password: importedU.password || existing.password,
              pin: importedU.pin || existing.pin
            });
          } else {
            mergedUsersMap.set(importedU.email.toLowerCase(), importedU);
          }
        });

        const finalUsersArray = Array.from(mergedUsersMap.values());
        
        setImportStatus('applying');
        await onImportData(finalUsersArray, allTimesheets);
        setImportStatus('idle');

        setMessage({
          type: 'success',
          text: `Importation CSV réussie ! ${importedUsersList.length} collaborateurs ont été importés et synchronisés.`
        });
        setTimeout(() => setMessage(null), 6000);

      } catch (err: any) {
        setImportStatus('error');
        setImportError(err.message || "Erreur lors de l'importation de la liste CSV.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Import application handling
  const handleImportApply = async () => {
    if (!parsedData) return;
    setImportStatus('applying');
    
    try {
      let finalUsers: User[] = [];
      let finalSheets: Timesheet[] = [];
      
      if (importMethod === 'overwrite') {
        finalUsers = [...parsedData.users];
        finalSheets = [...parsedData.timesheets];
      } else {
        // Merge users
        const userMap = new Map<string, User>();
        allUsers.forEach(u => userMap.set(u.id, u));
        parsedData.users.forEach(u => userMap.set(u.id, u));
        finalUsers = Array.from(userMap.values());
        
        // Merge timesheets
        const sheetMap = new Map<string, Timesheet>();
        allTimesheets.forEach(t => sheetMap.set(t.id, t));
        parsedData.timesheets.forEach(t => sheetMap.set(t.id, t));
        finalSheets = Array.from(sheetMap.values());
      }
      
      await onImportData(finalUsers, finalSheets);
      
      setImportStatus('success');
      setMessage({ 
        type: 'success', 
        text: `Restauration complète effectuée avec succès ! ${parsedData.users.length} collaborateurs et ${parsedData.timesheets.length} fiches ont été importés avec succès (${importMethod === 'overwrite' ? 'remplacement complet' : 'fusion intelligente'}).` 
      });
      setTimeout(() => setMessage(null), 6000);
      setParsedData(null);
      setImportStatus('idle');
    } catch (err: any) {
      setImportStatus('error');
      setImportError(`Erreur d'importation : ${err.message || err}`);
    }
  };

  // Sync state if currentUser changes
  useEffect(() => {
    setName(currentUser.name);
    setPassword(currentUser.password || '');
    setSchedule(JSON.parse(JSON.stringify(currentUser.defaultSchedule)));
    setIsValidator(currentUser.isValidator ?? (currentUser.role === 'validator'));
    setIsAdmin(currentUser.isAdmin ?? (currentUser.role === 'validator'));
    setIsActive(currentUser.isActive !== false);
  }, [currentUser]);

  const handleInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ type: 'error', text: 'Le nom est requis.' });
      return;
    }

    const updated: User = {
      ...currentUser,
      name: name.trim(),
      isEmployee: true,
      isValidator: currentUser.isAdmin ? isValidator : (currentUser.isValidator ?? (currentUser.role === 'validator')),
      isAdmin: currentUser.isAdmin ? isAdmin : (currentUser.isAdmin ?? (currentUser.role === 'validator')),
      isActive: currentUser.isAdmin ? isActive : (currentUser.isActive !== false),
      role: (currentUser.isAdmin ? isValidator : (currentUser.isValidator ?? (currentUser.role === 'validator'))) ? 'validator' : 'employee'
    };

    if (newPassword.trim()) {
      updated.password = newPassword.trim();
      setPassword(newPassword.trim());
      setNewPassword('');
    }

    onSaveUser(updated);
    setMessage({ type: 'success', text: 'Informations de profil mises à jour avec succès !' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDayToggle = (dayId: WeekDayId) => {
    setSchedule(prev => {
      const updated = { ...prev };
      updated[dayId] = {
        ...updated[dayId],
        active: !updated[dayId].active,
      };
      return updated;
    });
  };

  const handleDayDurationChange = (dayId: WeekDayId, field: 'morningHours' | 'afternoonHours', value: number) => {
    setSchedule(prev => {
      const updated = { ...prev };
      updated[dayId] = {
        ...updated[dayId],
        [field]: value,
      };
      return updated;
    });
  };

  const copyMondayToAll = () => {
    const mondayConfig = schedule.monday;
    setSchedule(prev => {
      const updated = { ...prev };
      weekDayIds.forEach(dayId => {
        if (dayId !== 'saturday' && dayId !== 'sunday') {
          updated[dayId] = {
            ...mondayConfig,
            active: true,
          };
        }
      });
      return updated;
    });
    setMessage({ type: 'success', text: 'Horaires du Lundi configurés pour toute la semaine de travail !' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleScheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: User = {
      ...currentUser,
      defaultSchedule: schedule,
    };
    onSaveUser(updated);
    setMessage({ type: 'success', text: 'Grille horaire standard mise à jour ! Vos futurs fiches horaires utiliseront ces valeurs.' });
    setTimeout(() => setMessage(null), 3000);
  };

  // Stats calculation over all timesheets for this user
  const mySheets = timesheets.filter(t => t.userId === currentUser.id);

  // Dynamic list of years represented in the timesheets
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    mySheets.forEach(sheet => {
      if (sheet.monthDate) {
        const parts = sheet.monthDate.split('-');
        if (parts[0]) {
          yearsSet.add(parts[0]);
        }
      }
    });
    // Add current year as a safe fallback
    yearsSet.add(String(new Date().getFullYear()));
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [mySheets]);

  // Filter timesheets according to chosen year & month
  const filteredStatsSheets = useMemo<Timesheet[]>(() => {
    return mySheets.filter(sheet => {
      if (!sheet.monthDate) return false;
      const [y, m] = sheet.monthDate.split('-');
      const yearMatch = statsYear === 'all' || y === statsYear;
      const monthMatch = statsMonth === 'all' || m === statsMonth;
      return yearMatch && monthMatch;
    });
  }, [mySheets, statsYear, statsMonth]);

  const filteredMonthsCount = filteredStatsSheets.length;
  
  let totalHoursWorked = 0;
  let totalOvertimeHours = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let sickLeaveDays = 0;
  let validatedSheetsCount = 0;

  filteredStatsSheets.forEach(sheet => {
    if (sheet.status === 'validated') {
      validatedSheetsCount += 1;
    }
    
    Object.values(sheet.days).forEach((day: DayRecord) => {
      // Calculate regular hours from morning and afternoon duration spent
      if (day.active) {
        totalHoursWorked += (day.morningHours || 0) + (day.afternoonHours || 0);
      }
      
      // Overtime
      if (day.overtimeHours) {
        totalOvertimeHours += day.overtimeHours;
      }

      // Leaves
      if (day.notPresent) {
        const weight = (day.absenceDuration === 'morning' || day.absenceDuration === 'afternoon') ? 0.5 : 1;
        if (day.absenceType === 'paid') paidLeaveDays += weight;
        else if (day.absenceType === 'unpaid') unpaidLeaveDays += weight;
        else if (day.absenceType === 'sick') sickLeaveDays += weight;
      } else {
        if (day.paidLeave === 'full' || day.paidLeave === true) paidLeaveDays += 1;
        else if (day.paidLeave === 'morning' || day.paidLeave === 'afternoon') paidLeaveDays += 0.5;

        if (day.unpaidLeave === 'full' || day.unpaidLeave === true) unpaidLeaveDays += 1;
        else if (day.unpaidLeave === 'morning' || day.unpaidLeave === 'afternoon') unpaidLeaveDays += 0.5;

        if (day.sickLeave === 'full' || day.sickLeave === true) sickLeaveDays += 1;
        else if (day.sickLeave === 'morning' || day.sickLeave === 'afternoon') sickLeaveDays += 0.5;
      }
    });
  });

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-8 animate-fade-in">
      
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-2xl shadow-sm">
            {currentUser.name.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Mon Espace Personnel</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Identifiant : <span className="font-mono text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded-md border border-slate-100">{currentUser.id}</span>
            </p>
          </div>
        </div>
        
        {/* Role badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-extrabold border ${
            currentUser.isActive === false
              ? 'bg-slate-100 text-slate-500 border-slate-200'
              : currentUser.isValidator
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
          }`}>
            <UserCheck2 className="w-3.5 h-3.5" />
            <span>Rôles actifs : {`Salarié${currentUser.isValidator ? ' • Validateur' : ''}${currentUser.isAdmin ? ' • Admin' : ''}${currentUser.isActive === false ? ' • 🔒 Désactivé' : ''}`}</span>
          </span>
        </div>
      </div>

      {/* Profile Section Tab selection */}
      <div className="flex border-b border-slate-100 p-0.5 bg-slate-50 rounded-2xl w-max max-w-full overflow-x-auto shadow-2xs">
        <button
          type="button"
          onClick={() => { setSubTab('info'); setMessage(null); }}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            subTab === 'info'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserIcon className="w-3.5 h-3.5" />
          Informations du compte
        </button>
        <button
          type="button"
          onClick={() => { setSubTab('schedule'); setMessage(null); }}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            subTab === 'schedule'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Mes horaires standards
        </button>
        <button
          type="button"
          onClick={() => { setSubTab('stats'); setMessage(null); }}
          className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
            subTab === 'stats'
              ? 'bg-white text-indigo-600 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Mes statistiques d'activités
        </button>
        {currentUser.isAdmin && (
          <button
            type="button"
            onClick={() => { setSubTab('backup'); setMessage(null); }}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              subTab === 'backup'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Sauvegarde & Importation
          </button>
        )}
      </div>

      {/* Render Alert Box */}
      {message && (
        <div className={`p-4 rounded-2xl text-xs font-extrabold border flex items-center gap-2 animate-fade-in ${
          message.type === 'success'
            ? 'bg-emerald-50 border-emerald-150 text-emerald-800'
            : 'bg-rose-50 border-rose-150 text-rose-800'
        }`}>
          {message.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Subtab content: Account Details */}
      {subTab === 'info' && (
        <form onSubmit={handleInfoSubmit} className="space-y-6 max-w-2xl">
          <div className="max-w-md">
            <label className="block text-xs font-extrabold uppercase text-slate-500 mb-2">Nom Complet</label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 outline-hidden focus:border-indigo-500"
                placeholder="Sophie Dubois"
                disabled={isFirebaseActive} // When firebase is active, display name is managed by Google
              />
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
            {isFirebaseActive && (
              <span className="text-[10px] text-slate-400 block mt-1.5 italic">Synchronisé via votre compte Google</span>
            )}
          </div>

          {!isFirebaseActive && (
            <div className="border-t border-slate-100 pt-6 space-y-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-slate-400" />
                  Sécurité d'accès local
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">En mode démo / hors-ligne, vous pouvez sécuriser ce profil avec un mot de passe local.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-500 mb-2">Mot de passe actuel</label>
                  <input
                    type="text"
                    value={password || "Aucun mot de passe configuré"}
                    disabled
                    className="w-full text-sm border border-slate-100 bg-slate-50 text-slate-500 rounded-xl px-4 py-2.5 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-500 mb-2">Nouveau mot de passe</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Saisir pour modifier..."
                    className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 outline-hidden focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {isFirebaseActive && (
            <div className="bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100/50 flex gap-3 text-xs text-indigo-900 leading-relaxed max-w-xl">
              <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-extrabold block">Sécurité Cloud active</strong>
                Votre compte est authentifié en toute sécurité grâce aux serveurs de Google Identity. Les modifications et la gestion de vos identifiants s'effectuent directement sur votre espace Google Accounts pour garantir une sécurité d'accès maximale.
              </div>
            </div>
          )}

          {/* Rôles et privilèges section de gestion */}
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                Rôles et privilèges du compte
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {currentUser.isAdmin 
                  ? "Tout salarié possède les droits requis pour compléter sa fiche horaire de paie. En tant qu'administrateur, vous pouvez modifier ces rôles délégués."
                  : "Tout salarié possède les droits requis pour compléter sa fiche horaire de paie. Seul un administrateur peut modifier ces rôles délégués."
                }
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Salarié (Défaut, ReadOnly) */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/60 flex items-start gap-3 opacity-90">
                <input
                  type="checkbox"
                  checked={true}
                  disabled
                  className="mt-1 h-4 w-4 text-indigo-600 border-slate-300 rounded-sm focus:ring-indigo-500"
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-800 block">👤 Salarié (de base)</span>
                  <span className="text-[10px] text-slate-500 block mt-1 leading-relaxed">Saisie et complétion de la fiche horaire personnelle pour préparation de la paie.</span>
                </div>
              </div>

              {/* Validateur */}
              <label className={`rounded-2xl p-4 border flex items-start gap-3 select-none transition-colors ${
                currentUser.isAdmin 
                  ? 'bg-white hover:bg-slate-50/50 cursor-pointer border-slate-200' 
                  : 'bg-slate-50/80 border-slate-200 opacity-80 cursor-not-allowed text-slate-600'
              }`}>
                <input
                  type="checkbox"
                  checked={isValidator}
                  disabled={!currentUser.isAdmin}
                  onChange={(e) => setIsValidator(e.target.checked)}
                  className={`mt-1 h-4 w-4 text-rose-650 border-slate-300 rounded-sm ${
                    currentUser.isAdmin ? 'focus:ring-rose-500 cursor-pointer' : 'cursor-not-allowed'
                  }`}
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-800 block flex items-center gap-1">
                    👑 Validateur d'équipe {!currentUser.isAdmin && '🔒'}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1 leading-relaxed">Accès au tableau de validation et à l'historique global des fiches de l'équipe.</span>
                </div>
              </label>

              {/* Administrateur */}
              <label className={`rounded-2xl p-4 border flex items-start gap-3 select-none transition-colors ${
                currentUser.isAdmin 
                  ? 'bg-white hover:bg-slate-50/50 cursor-pointer border-slate-200' 
                  : 'bg-slate-50/80 border-slate-200 opacity-80 cursor-not-allowed text-slate-600'
              }`}>
                <input
                  type="checkbox"
                  checked={isAdmin}
                  disabled={!currentUser.isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className={`mt-1 h-4 w-4 text-indigo-650 border-slate-300 rounded-sm ${
                    currentUser.isAdmin ? 'focus:ring-indigo-500 cursor-pointer' : 'cursor-not-allowed'
                  }`}
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-800 block flex items-center gap-1">
                    ⚙️ Administrateur {!currentUser.isAdmin && '🔒'}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-1 leading-relaxed">Gestion complète de l'effectif des collaborateurs et des données de l'application.</span>
                </div>
              </label>
            </div>
          </div>

          {/* Section Désactivation de compte */}
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                Statut et accès au compte
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {currentUser.isAdmin
                  ? "La désactivation suspend temporairement ou définitivement le compte, tout en conservant scrupuleusement l'ensemble des fiches historiques pour archivage administratif."
                  : "La désactivation de compte suspend l'accès. Seul un administrateur est autorisé à modifier le statut de ce compte."
                }
              </p>
            </div>

            <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all duration-300 ${
              isActive
                ? 'bg-slate-50/50 border-slate-200'
                : 'bg-rose-50/40 border-rose-150 shadow-2xs'
            }`}>
              <div className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm ${
                  isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {isActive ? '🔓' : '🔒'}
                </span>
                <div>
                  <span className="text-xs font-extrabold text-slate-800 block">
                    {isActive ? "Compte actif et opérationnel" : "Compte suspendu et archivé"}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {isActive ? "Le compte est visible sur la pointeuse et peut enregistrer de nouvelles fiches." : "Le compte est masqué. Re-activez à tout moment pour pouvoir pointer."}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={!currentUser.isAdmin}
                onClick={() => setIsActive(!isActive)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all duration-200 shadow-2xs ${
                  !currentUser.isAdmin
                    ? 'bg-slate-100 text-slate-400 border border-slate-250 cursor-not-allowed opacity-60'
                    : isActive
                      ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100/50 hover:border-rose-300/60 cursor-pointer'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 font-bold cursor-pointer'
                }`}
              >
                {isActive ? 'Désactiver le compte' : 'Réactiver mon compte'}
              </button>
            </div>
            
            {!currentUser.isAdmin && (
              <div className="bg-slate-50 text-slate-500 text-[10px] font-bold p-3 rounded-xl border border-slate-200 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-slate-450 shrink-0" />
                <span>Modifications verrouillées : Rôles, privilèges et statut d'accès réservés aux administrateurs.</span>
              </div>
            )}
            
            {currentUser.isAdmin && !isActive && (
              <div className="bg-amber-50 text-amber-800 text-[10px] font-bold p-3 rounded-xl border border-amber-250/60 leading-relaxed">
                ⚠️ Attention : Si vous validez cette modification, votre compte sera désactivé. Vous serez immédiatement déconnecté de la session courante et ne pourrez plus pointer, à moins qu'un administrateur n'active à nouveau votre accès.
              </div>
            )}
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-extrabold text-xs tracking-wide uppercase transition cursor-pointer shadow-xs inline-flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Mettre à jour mon profil
            </button>
          </div>
        </form>
      )}

      {/* Subtab content: Default Schedules */}
      {subTab === 'schedule' && (
        <form onSubmit={handleScheduleSubmit} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Ma Grille Horaire Hebdomadaire Type</h3>
              <p className="text-xs text-slate-500 mt-0.5">Personnalisez ici vos horaires contractuels quotidiens standards pour pré-remplir instantanément vos saisies futures.</p>
            </div>
            
            <button
              type="button"
              onClick={copyMondayToAll}
              className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-extrabold py-2 px-4 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Copier les horaires du lundi sur la semaine
            </button>
          </div>

          <div className="space-y-3">
            {weekDayIds.map((dayId) => {
              const daySched = schedule[dayId];
              return (
                <div
                  key={dayId}
                  className={`grid grid-cols-1 sm:grid-cols-12 gap-4 items-center p-4 rounded-2xl border transition-all ${
                    daySched.active 
                      ? 'border-slate-200 bg-white shadow-2xs' 
                      : 'border-slate-100 bg-slate-50/50 opacity-60'
                  }`}
                >
                  {/* Toggle Active status */}
                  <div className="sm:col-span-3 flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={daySched.active}
                        onChange={() => handleDayToggle(dayId)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                    <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                      {dayIdToLabel[dayId]}
                    </span>
                  </div>

                  {daySched.active ? (
                    <>
                      {/* Hours spent spent duration */}
                      <div className="sm:col-span-6 flex items-center gap-3">
                        <span className="text-xs text-slate-400">Matin (h)</span>
                        <input
                          type="number"
                          min="0"
                          max="12"
                          step="0.5"
                          value={daySched.morningHours ?? 0}
                          onChange={(e) => handleDayDurationChange(dayId, 'morningHours', parseFloat(e.target.value) || 0)}
                          className="w-16 text-xs border border-slate-200 rounded-lg p-1.5 focus:border-indigo-500 font-bold text-slate-800"
                        />
                        <span className="text-xs text-slate-450 font-sans">et</span>
                        <span className="text-xs text-slate-400">Après-midi (h)</span>
                        <input
                          type="number"
                          min="0"
                          max="12"
                          step="0.5"
                          value={daySched.afternoonHours ?? 0}
                          onChange={(e) => handleDayDurationChange(dayId, 'afternoonHours', parseFloat(e.target.value) || 0)}
                          className="w-16 text-xs border border-slate-200 rounded-lg p-1.5 focus:border-indigo-500 font-bold text-slate-800"
                        />
                      </div>

                      {/* Total Net time prediction */}
                      <div className="sm:col-span-3 text-right text-xs font-black text-slate-700">
                        Total : {(daySched.morningHours || 0) + (daySched.afternoonHours || 0)}h
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-9 text-xs text-slate-400 italic font-medium">
                      Jour de repos par défaut
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-extrabold text-xs tracking-wide uppercase transition cursor-pointer shadow-xs inline-flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Sauvegarder ma grille horaire
            </button>
          </div>
        </form>
      )}

      {/* Subtab content: Stats */}
      {subTab === 'stats' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">Mon Activité Globale & Compteurs</h3>
              <p className="text-xs text-slate-500 mt-0.5">Analyses cumulées de vos fiches horaires et de vos soldes d'absences.</p>
            </div>

            {/* Selector Filters for Month & Year */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  id="stats-month-select"
                  aria-label="Sélectionner le mois pour les statistiques"
                  value={statsMonth}
                  onChange={(e) => setStatsMonth(e.target.value)}
                  className="appearance-none text-xs border border-slate-200 hover:border-slate-350 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-550/20 pl-8 pr-8 py-2 rounded-xl bg-slate-50 transition font-bold text-slate-700 font-sans cursor-pointer"
                >
                  <option value="all">📅 Tous les mois</option>
                  <option value="01">Janvier</option>
                  <option value="02">Février</option>
                  <option value="03">Mars</option>
                  <option value="04">Avril</option>
                  <option value="05">Mai</option>
                  <option value="06">Juin</option>
                  <option value="07">Juillet</option>
                  <option value="08">Août</option>
                  <option value="09">Septembre</option>
                  <option value="10">Octobre</option>
                  <option value="11">Novembre</option>
                  <option value="12">Décembre</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <span className="text-[9px]">▼</span>
                </div>
              </div>

              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  id="stats-year-select"
                  aria-label="Sélectionner l'année pour les statistiques"
                  value={statsYear}
                  onChange={(e) => setStatsYear(e.target.value)}
                  className="appearance-none text-xs border border-slate-200 hover:border-slate-350 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-550/20 pl-8 pr-8 py-2 rounded-xl bg-slate-50 transition font-bold text-slate-700 font-sans cursor-pointer"
                >
                  <option value="all">🗓️ Toutes les années</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                  <span className="text-[9px]">▼</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bento stats list */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-5 rounded-3xl border border-slate-200/50 hover:shadow-2xs transition-all flex flex-col justify-between">
              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Fiches traitées</span>
              <div className="mt-4">
                <span className="text-2xl font-black text-slate-800 block">{validatedSheetsCount} / {filteredMonthsCount}</span>
                <span className="text-[10px] text-slate-400 font-semibold block mt-1">mois validés</span>
              </div>
            </div>

            <div className="bg-indigo-50/40 p-5 rounded-3xl border border-indigo-100/30 hover:shadow-2xs transition-all flex flex-col justify-between">
              <span className="text-[9px] uppercase font-bold tracking-wider text-indigo-500">Heures régulières</span>
              <div className="mt-4">
                <span className="text-2xl font-black text-indigo-950 block">{totalHoursWorked.toFixed(1)}h</span>
                <span className="text-[10px] text-indigo-500 font-semibold block mt-1">effectuées cumulé</span>
              </div>
            </div>

            <div className="bg-amber-50/50 p-5 rounded-3xl border border-amber-100/30 hover:shadow-2xs transition-all flex flex-col justify-between">
              <span className="text-[9px] uppercase font-bold tracking-wider text-amber-600">Heures sup.</span>
              <div className="mt-4">
                <span className="text-2xl font-black text-amber-950 block">+{totalOvertimeHours.toFixed(1)}h</span>
                <span className="text-[10px] text-amber-500 font-semibold block mt-1">déclarées validées</span>
              </div>
            </div>

            <div className="bg-slate-900 text-white p-5 rounded-3xl hover:shadow-2xs transition-all flex flex-col justify-between">
              <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Total absences</span>
              <div className="mt-4">
                <span className="text-2xl font-black block">{(paidLeaveDays + unpaidLeaveDays + sickLeaveDays).toFixed(1)} j.</span>
                <span className="text-[10px] text-slate-400 font-semibold block mt-1">tous motifs confondus</span>
              </div>
            </div>
          </div>

          {/* Absence balances detailed table */}
          <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden mt-6">
            <div className="p-5 bg-slate-50/60 border-b border-slate-200/60 font-semibold text-xs uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <span>Détails de mes absences comptabilisées</span>
            </div>

            <div className="divide-y divide-slate-100">
              <div className="p-4 sm:p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🌴</span>
                  <div>
                    <h5 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Congés Payés (CP)</h5>
                    <p className="text-[10px] text-slate-450 mt-0.5">Vacances annuelles régulières, fractionnées ou complètes.</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-slate-800 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-full">{paidLeaveDays} jours</span>
                </div>
              </div>

              <div className="p-4 sm:p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🕒</span>
                  <div>
                    <h5 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Congés sans solde (CSS)</h5>
                    <p className="text-[10px] text-slate-450 mt-0.5">Congés personnels d'agrément non rémunérés.</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-slate-800 bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-full">{unpaidLeaveDays} jours</span>
                </div>
              </div>

              <div className="p-4 sm:p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🩺</span>
                  <div>
                    <h5 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Arrêt Maladie / Accident</h5>
                    <p className="text-[10px] text-slate-450 mt-0.5">Incapacités de travail justifiées par un certificat médical.</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-slate-800 bg-rose-50 text-rose-800 border border-rose-200 px-3 py-1.5 rounded-full">{sickLeaveDays} jours</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'backup' && currentUser.isAdmin && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-extrabold text-slate-800">Outil de Sauvegarde & Restauration de Données</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sauvegardez l'intégralité de vos comptes et de vos fiches horaires. Utile pour basculer d'appareil, prévenir les pertes de données lors d'une mise à jour logicielle, ou résoudre un incident de synchronisation.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* EXPORT PANEL */}
            <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-200 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-550/10 text-indigo-700 rounded-xl">
                    <Download className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800">Exporter les données</h4>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">générer une sauvegarde physique</span>
                  </div>
                </div>
                
                <p className="text-xs text-slate-600 leading-relaxed">
                  Cette action crée un fichier JSON sécurisé contenant toutes les configurations de l'application : comptes salariés, plannings types et l'intégralité de l'historique des fiches d'heures.
                </p>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 bg-white px-3.5 py-2.5 rounded-xl border border-slate-200">
                    <span className="flex items-center gap-2">👤 Salariés enregistrés</span>
                    <span className="font-mono font-bold text-slate-800">{allUsers.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 bg-white px-3.5 py-2.5 rounded-xl border border-slate-200">
                    <span className="flex items-center gap-2">📂 Fiches d'heures stockées</span>
                    <span className="font-mono font-bold text-slate-800">{allTimesheets.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 bg-white px-3.5 py-2.5 rounded-xl border border-slate-200">
                    <span className="flex items-center gap-2">🌐 Source actuelle</span>
                    <span className="font-bold text-indigo-600">
                      {isFirebaseActive ? 'Cloud Live (Firestore)' : 'Stockage Local'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 space-y-2">
                <button
                  type="button"
                  onClick={handleExportData}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wide transition cursor-pointer shadow-xs inline-flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Télécharger le fichier de sauvegarde (.json)
                </button>

                {!showClearConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-2.5 px-4 rounded-xl font-extrabold text-[11px] uppercase tracking-wide transition cursor-pointer inline-flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    Vider toutes les fiches d'heures (Test d'import)
                  </button>
                ) : (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2 mt-2">
                    <p className="text-[10.5px] text-rose-800 font-extrabold uppercase tracking-wide leading-tight">
                      ⚠️ SUPPRIMER TOUTES LES FICHES D'HEURES ?
                    </p>
                    <p className="text-[11px] text-rose-700 leading-relaxed">
                      Cette action est irréversible et effacera toutes les fiches d’heures locales et Cloud pour vous permettre de tester l'importation de votre JSON.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await onClearTimesheets();
                            setMessage({ type: 'success', text: "Toutes les fiches d'heures ont été effacées ! Vous pouvez maintenant tester l'importation de votre JSON pour vérifier la restauration." });
                            setTimeout(() => setMessage(null), 6000);
                          } catch (err: any) {
                            setMessage({ type: 'error', text: `Erreur lors de la suppression : ${err.message || err}` });
                          } finally {
                            setShowClearConfirm(false);
                          }
                        }}
                        className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold py-2 px-3 rounded-lg uppercase tracking-wide cursor-pointer transition text-center"
                      >
                        Oui, Vider
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowClearConfirm(false)}
                        className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-extrabold py-2 px-3 rounded-lg uppercase tracking-wide cursor-pointer transition text-center"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* IMPORT PANEL */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800">Restaurer / Importer les données</h4>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Charger un fichier de sauvegarde</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Sélectionnez ou glissez-déposez un fichier de sauvegarde précédemment exporté au format <span className="font-mono">.json</span> pour recharger la base de données.
                </p>

                {importStatus === 'idle' || importStatus === 'reading' ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
                      dragOver 
                        ? 'border-indigo-500 bg-indigo-50/30' 
                        : 'border-slate-250 hover:border-slate-400 bg-slate-50/50'
                    }`}
                  >
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileChange}
                      className="hidden"
                      id="backup-file-input"
                    />
                    <label htmlFor="backup-file-input" className="cursor-pointer block space-y-2.5">
                      <div className="text-slate-400 text-2xl">📥</div>
                      <div>
                        <span className="text-xs font-extrabold text-indigo-650 block">Glissez votre fichier ici</span>
                        <span className="text-[10px] text-slate-450 block mt-1">ou cliquez pour parcourir vos dossiers</span>
                      </div>
                    </label>
                  </div>
                ) : null}

                {/* STATUS PARSED & VALIDATED */}
                {importStatus === 'validated' && parsedData && (
                  <div className="bg-emerald-50 border border-emerald-150 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                      <span>✓ Fichier de sauvegarde validé</span>
                    </div>
                    
                    <div className="text-xs text-emerald-950 space-y-1">
                      <p>Données prêtes à être restaurées :</p>
                      <ul className="list-disc pl-5 font-semibold space-y-0.5">
                        <li>{parsedData.users.length} collaborateur(s)</li>
                        <li>{parsedData.timesheets.length} feuille(s) de présence</li>
                      </ul>
                    </div>

                    <div className="space-y-2 border-t border-emerald-200/50 pt-3">
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wide">Méthode d'importation</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setImportMethod('merge')}
                          className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                            importMethod === 'merge'
                              ? 'bg-indigo-600 text-white border-indigo-700'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          🔗 Fusionner (Recommandé)
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportMethod('overwrite')}
                          className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                            importMethod === 'overwrite'
                              ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          ⚠️ Écraser tout
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 italic mt-1 leading-relaxed">
                        {importMethod === 'merge' 
                          ? 'La fusion ajoute les nouveaux profils/fiches sans supprimer vos données actuelles stables.'
                          : '⚠️ Écraser efface complètement la base active actuelle pour la remplacer par le fichier importé.'}
                      </p>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleImportApply}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold py-2 px-4 rounded-xl transition cursor-pointer"
                      >
                        Appliquer l'Importation de données
                      </button>
                      <button
                        type="button"
                        onClick={() => { setImportStatus('idle'); setParsedData(null); }}
                        className="bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-extrabold py-2 px-4 rounded-xl transition cursor-pointer"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {/* STATUS ERRORS */}
                {importStatus === 'error' && (
                  <div className="bg-rose-50 border border-rose-150 p-4 rounded-2xl space-y-2">
                    <div className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                      <span>⚠️ Fichier incompatible ou corrompu</span>
                    </div>
                    <p className="text-xs text-rose-700 leading-relaxed">{importError}</p>
                    <button
                      type="button"
                      onClick={() => { setImportStatus('idle'); setImportError(null); }}
                      className="text-xs text-indigo-650 hover:text-indigo-800 font-extrabold block mt-2 cursor-pointer"
                    >
                      Essayer un autre fichier de sauvegarde
                    </button>
                  </div>
                )}

                {/* STATUS APPLYING */}
                {importStatus === 'applying' && (
                  <div className="p-8 text-center space-y-3">
                    <div className="inline-block border-2 border-indigo-500 border-t-transparent rounded-full w-8 h-8 animate-spin" />
                    <p className="text-xs font-bold text-slate-700 animate-pulse">Application et synchronisation de la sauvegarde en cours...</p>
                  </div>
                )}
              </div>

              <div>
                {isFirebaseActive && (
                  <div className="bg-indigo-50 text-[10px] font-semibold text-indigo-900 border border-indigo-100 rounded-xl p-3 leading-relaxed">
                    💡 <strong>Précision Cloud :</strong> Comme votre serveur Cloud est actif, tout import appliquera et propagera instantanément les données chargées sur vos conteneurs Firestore, synchronisant immédiatement tout votre effectif.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CSV USER IMPORT PANEL */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4 shadow-sm mt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-750 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800">Gestion des Collaborateurs via CSV</h4>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Ajout de comptes en lot</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Pour ajouter rapidement plusieurs salariés à votre liste de collaborateurs, téléchargez notre formule Excel/CSV structurée (.csv), remplissez les informations puis réimportez-la en un clic.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="bg-slate-50 hover:bg-slate-100 text-slate-705 border border-slate-250 py-3 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wide transition cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4 text-slate-550" />
                Télécharger le gabarit CSV
              </button>

              <div className="relative">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvImport}
                  className="hidden"
                  id="csv-user-import-input"
                />
                <label
                  htmlFor="csv-user-import-input"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl font-extrabold text-xs uppercase tracking-wide transition cursor-pointer shadow-xs inline-flex items-center justify-center gap-2 text-center"
                >
                  <Upload className="w-4 h-4" />
                  Importer un fichier CSV (.csv)
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function calculateHoursFeedback(morning: number, afternoon: number) {
  return `Durée contractuelle : ${(morning || 0) + (afternoon || 0)}h net`;
}
