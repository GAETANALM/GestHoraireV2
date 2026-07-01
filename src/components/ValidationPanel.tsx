/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Timesheet, User, WeekDayId } from '../types';
import { 
  getMonthDays, 
  dayIdToLabel, 
  calculateHours, 
  formatHours, 
  formatFrenchMonth, 
  formatFrenchDate,
  weekDayIds
} from '../utils/dateUtils';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  MessageSquare, 
  FileText, 
  Calendar,
  ThumbsUp,
  RotateCcw
} from 'lucide-react';

interface ValidationPanelProps {
  currentUserId: string;
  timesheets: Timesheet[];
  users: User[];
  onApproveTimesheet: (timesheetId: string, validatorId: string, validatorName: string) => void;
  onRejectTimesheet: (timesheetId: string, reason: string) => void;
}

export default function ValidationPanel({
  currentUserId,
  timesheets,
  users,
  onApproveTimesheet,
  onRejectTimesheet,
}: ValidationPanelProps) {
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'validated' | 'rejected'>('submitted');
  const [userFilter, setUserFilter] = useState<string>('all');

  const currentValidator = users.find(u => u.id === currentUserId);

  // Group timesheets and join with user info
  const enrichedSheets = timesheets.map(sheet => {
    const userProfile = users.find(u => u.id === sheet.userId);
    
    let regularHours = 0;
    let overtimeHours = 0;
    let totalNightHours = 0;
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
      const day = (sheet.days[dayInfo.date] || { active: false }) as any;

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
      totalNightHours += declaredOvertime;
      workedHours += dayPhysicalWorked + declaredOvertime + creditedAbsence;
    });

    return {
      ...sheet,
      userProfile,
      regularHours,
      overtimeHours,
      totalNightHours,
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

  // Filter based on status & user
  const filteredSheets = enrichedSheets.filter(sheet => {
    const matchesStatus = statusFilter === 'all' || sheet.status === statusFilter;
    const matchesUser = userFilter === 'all' || sheet.userId === userFilter;
    return matchesStatus && matchesUser;
  });

  const selectedSheet = enrichedSheets.find(s => s.id === selectedSheetId);

  const handleApprove = (sheetId: string) => {
    if (!currentValidator) return;
    onApproveTimesheet(sheetId, currentValidator.id, currentValidator.name);
    // Clear selection if current sheet got approved
    if (selectedSheetId === sheetId) {
      setSelectedSheetId(null);
    }
  };

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSheetId || !rejectionReason.trim()) return;
    onRejectTimesheet(selectedSheetId, rejectionReason.trim());
    setShowRejectModal(false);
    setRejectionReason('');
    setSelectedSheetId(null);
  };

  return (
    <div id="validation-panel-section" className="space-y-8">
      {/* Upper header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Validation des Horaires</h2>
          <p className="text-xs text-slate-500">Approuvez ou refusez les relevés d'heures hebdomadaires soumis par l'équipe.</p>
        </div>
        
        {/* Status filters (Bento Capsule Selector) */}
        <div className="flex bg-white border border-slate-200 p-1.5 rounded-2xl text-xs font-bold self-start shadow-2xs">
          {(['submitted', 'validated', 'rejected', 'all'] as const).map(filter => (
            <button
              key={filter}
              id={`filter-${filter}`}
              onClick={() => {
                setStatusFilter(filter);
                setSelectedSheetId(null);
              }}
              className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                statusFilter === filter
                  ? 'bg-slate-900 text-white shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {filter === 'submitted' && 'À valider'}
              {filter === 'validated' && 'Validés'}
              {filter === 'rejected' && 'Refusés'}
              {filter === 'all' && 'Tous'}
            </button>
          ))}
        </div>
      </div>

      {/* Collaborator filters (Bento Capsule Selector Row) */}
      <div className="flex flex-col gap-2 bg-white/45 p-4 rounded-3xl border border-slate-200/60 shadow-2xs">
        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest block">Filtrer par salarié</span>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <button
            onClick={() => {
              setUserFilter('all');
              setSelectedSheetId(null);
            }}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
              userFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-xs scale-102 font-extrabold'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            Tous les salariés
          </button>
          
          {users.map(user => {
            const isSelected = userFilter === user.id;
            const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2);
            const isInactive = user.isActive === false;
            return (
              <button
                key={user.id}
                onClick={() => {
                  setUserFilter(user.id);
                  setSelectedSheetId(null);
                }}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-700 ring-2 ring-indigo-50/50 shadow-xs'
                    : isInactive
                      ? 'bg-slate-50 border-slate-200 text-slate-400 line-through opacity-70 hover:opacity-100 hover:text-slate-600'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold uppercase border ${
                  isSelected 
                    ? 'bg-indigo-600 border-indigo-500 text-white' 
                    : isInactive
                      ? 'bg-slate-200 border-slate-300 text-slate-500'
                      : 'bg-slate-100 border-slate-200 text-slate-500'
                }`}>
                  {isInactive ? '🔒' : initials}
                </span>
                <span>{user.name} {isInactive ? '(Archivé)' : ''}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: List of Timesheets */}
        <div className={`lg:col-span-4 space-y-4 ${selectedSheetId ? 'hidden lg:block' : 'block'}`}>
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
            Dossiers reçus ({filteredSheets.length})
          </h3>

          {filteredSheets.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-8 text-center shadow-2xs">
              <ThumbsUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-500">Aucun dossier à afficher</p>
              <p className="text-xs text-slate-400 mt-1">Aucune feuille ne correspond au filtre actuel.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1 col-scroll">
              {filteredSheets.map(sheet => {
                const isSelected = selectedSheetId === sheet.id;
                const isOwnSheet = sheet.userId === currentUserId;
                
                return (
                  <button
                    key={sheet.id}
                    id={`sheet-item-${sheet.id}`}
                    onClick={() => setSelectedSheetId(sheet.id)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between cursor-pointer hover:shadow-xs ${
                      isSelected
                        ? 'bg-indigo-50/60 border-indigo-400 ring-2 ring-indigo-50 shadow-md scale-102'
                        : 'bg-white border-slate-200 hover:border-slate-350 hover:scale-101'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-extrabold text-slate-900 text-sm block tracking-tight">
                            {sheet.userProfile?.name || sheet.userName}
                          </span>
                          {isOwnSheet && (
                            <span className="inline-block text-[9px] bg-amber-50 text-amber-700 border border-amber-100 font-semibold px-2 py-0.5 rounded-md mt-1">
                              Votre feuille
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          sheet.status === 'submitted' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                          sheet.status === 'validated' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                          'bg-rose-100 text-rose-800 border-rose-200'
                        }`}>
                          {sheet.status === 'submitted' ? 'Soumis' :
                           sheet.status === 'validated' ? 'Validé' : 'Refusé'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-3 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Mois de {formatFrenchMonth(sheet.monthDate)}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3 font-medium">
                        <span className="font-bold text-slate-800">
                          Total: {formatHours(sheet.totalHours)}
                        </span>
                        {sheet.overtimeHours > 0 && (
                          <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded-md">
                            +{formatHours(sheet.overtimeHours)} sup
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-indigo-600 font-bold hover:underline">
                        Détails &rarr;
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Detailed View & Action Panel */}
        <div className={`lg:col-span-8 ${!selectedSheetId ? 'hidden lg:block' : 'block'}`}>
          {selectedSheet ? (
            <div id="timesheet-detail-card" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300">
              
              {/* Back button on mobile */}
              <div className="lg:hidden p-4 bg-slate-50 border-b border-slate-200 flex items-center">
                <button
                  onClick={() => setSelectedSheetId(null)}
                  className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 font-extrabold bg-white border border-slate-200 px-4 py-2.5 rounded-xl transition cursor-pointer shadow-2xs active:scale-98"
                >
                  &larr; Retour aux dossiers collaborateurs
                </button>
              </div>

              {/* Card Header */}
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h4 className="font-extrabold text-slate-800 text-base">
                      {selectedSheet.userProfile?.name || selectedSheet.userName}
                    </h4>
                    {selectedSheet.userId === currentUserId && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 font-bold px-2 py-0.5 rounded">
                        Auto-validation autorisée
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Feuille de temps du mois : <strong className="text-slate-600">{formatFrenchMonth(selectedSheet.monthDate)}</strong>
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-400">Total mois :</span>
                  <div className="text-xl font-black text-indigo-700">
                    {formatHours(selectedSheet.totalHours)}
                  </div>
                  {selectedSheet.overtimeHours > 0 && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-semibold inline-block mt-0.5">
                      dont {formatHours(selectedSheet.overtimeHours)} supp.
                    </span>
                  )}
                </div>
              </div>

              {/* Récapitulatif Mensuel */}
              <div className="px-6 py-5 bg-slate-50/50 border-b border-slate-200">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Récapitulatif mensuel :</h5>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Heures Minimum */}
                  <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Min. Mensuel Requis</span>
                    <span className="text-lg font-black text-slate-700 mt-1 block">
                      {formatHours(selectedSheet.requiredHours)}
                    </span>
                  </div>

                  {/* Card 2: Heures Effectuées */}
                  <div className="p-4 bg-white rounded-2xl border border-indigo-200 shadow-2xs">
                    <span className="text-[10px] text-indigo-500 font-extrabold uppercase tracking-wider block font-sans">Total Effectué</span>
                    <span className="text-lg font-black text-indigo-700 mt-1 block">
                      {formatHours(selectedSheet.totalHours)}
                    </span>
                  </div>

                  {/* Card 3: Heures Supplémentaires */}
                  <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-wider block">Heures Supplémentaires</span>
                    <span className={`text-lg font-black mt-1 block ${selectedSheet.overtimeHours > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {selectedSheet.overtimeHours > 0 ? `+${formatHours(selectedSheet.overtimeHours)}` : '0.00 h'}
                    </span>
                  </div>

                  {/* Card 4: Heures de Nuit */}
                  <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider block">Heures de Nuit</span>
                    <span className={`text-lg font-black mt-1 block ${selectedSheet.totalNightHours > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {selectedSheet.totalNightHours > 0 ? `${formatHours(selectedSheet.totalNightHours)}` : '0.00 h'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Day-by-Day breakdown */}
              <div className="p-6 space-y-4">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Détails des jours déclarés :</h5>
                 <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                        <th className="py-2.5 px-3">Jour</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Horaires de Travail</th>
                        <th className="py-2.5 px-3 text-center">Durée Nette</th>
                        <th className="py-2.5 px-3">Heures Sup.</th>
                        <th className="py-2.5 px-3">Heures de nuit</th>
                        <th className="py-2.5 px-3">Justifications / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {getMonthDays(selectedSheet.monthDate).map(({ dayId, label, date }) => {
                        const rec = selectedSheet.days[date];
                        if (!rec) return null;
                        const defaultRec = selectedSheet.userProfile?.defaultSchedule[dayId];
                        
                        const isFullAbsence = !rec.active || (rec.notPresent && rec.absenceDuration === 'full') || rec.paidLeave === 'full' || rec.unpaidLeave === 'full' || rec.sickLeave === 'full' || rec.paidLeave === true || rec.unpaidLeave === true || rec.sickLeave === true;
                        
                        if (isFullAbsence) {
                          const isPaidLeave = !!rec.paidLeave || (rec.notPresent && rec.absenceType === 'paid');
                          const isUnpaidLeave = !!rec.unpaidLeave || (rec.notPresent && rec.absenceType === 'unpaid');
                          const isSickLeave = !!rec.sickLeave || (rec.notPresent && rec.absenceType === 'sick');
                          const isRecoveryLeave = (rec.notPresent && rec.absenceType === 'recovery');
                          const isOtherLeave = (rec.notPresent && rec.absenceType === 'other');
                          
                          let labelText = "Non travaillé / Repos";
                          let badgeClass = "text-slate-450 bg-slate-100 border border-slate-200/50";
                          const durationStr = rec.absenceDuration === 'morning' ? 'Matin 🌅' : rec.absenceDuration === 'afternoon' ? 'Après-midi 🌇' : 'Journée complète';
                          
                          if (isPaidLeave) {
                            const term = rec.paidLeave ? (rec.paidLeave === 'morning' ? 'Matin 🌅' : rec.paidLeave === 'afternoon' ? 'Après-midi 🌇' : 'Journée complète') : durationStr;
                            labelText = `🌴 Congés Payés (CP) : ${term}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-emerald-700 bg-emerald-50 border border-emerald-200 font-extrabold";
                          } else if (isUnpaidLeave) {
                            const term = rec.unpaidLeave ? (rec.unpaidLeave === 'morning' ? 'Matin 🌅' : rec.unpaidLeave === 'afternoon' ? 'Après-midi 🌇' : 'Journée complète') : durationStr;
                            labelText = `🕒 Congé Sans Solde (CSS) : ${term}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-amber-700 bg-amber-50 border border-amber-200 font-extrabold";
                          } else if (isSickLeave) {
                            const term = rec.sickLeave ? (rec.sickLeave === 'morning' ? 'Matin 🌅' : rec.sickLeave === 'afternoon' ? 'Après-midi 🌇' : 'Journée complète') : durationStr;
                            labelText = `🩺 Arrêt Maladie : ${term}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-rose-700 bg-rose-50 border border-rose-200 font-extrabold";
                          } else if (isRecoveryLeave) {
                            labelText = `⏰ Récupération : ${durationStr}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-indigo-700 bg-indigo-50 border border-indigo-200 font-extrabold";
                          } else if (isOtherLeave) {
                            labelText = `📄 Autre Absence : ${durationStr}${rec.absenceReason ? ' - ' + rec.absenceReason : ''}`;
                            badgeClass = "text-slate-700 bg-slate-50 border border-slate-200 font-extrabold";
                          }
 
                          return (
                            <tr key={date} className={`italic whitespace-nowrap ${
                              isPaidLeave ? 'bg-emerald-50/10' : 
                              isUnpaidLeave ? 'bg-amber-50/10' : 
                              isSickLeave ? 'bg-rose-50/10' : 'bg-slate-50/30'
                            }`}>
                              <td className="py-3 px-3 font-bold text-slate-800">{dayIdToLabel[dayId]}</td>
                              <td className="py-3 px-3 text-slate-400 font-medium">
                                {formatFrenchDate(rec.date).split(' ').slice(1, 3).join(' ')}
                              </td>
                              <td colSpan={5} className="py-3 px-3">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] uppercase tracking-wide ${badgeClass}`}>
                                  {labelText}
                                </span>
                              </td>
                            </tr>
                          );
                        }
 
                        // Determine if specific day got modified from defaults
                        const dMornChanged = defaultRec && defaultRec.active && defaultRec.morningHours !== rec.morningHours;
                        const dAftChanged = defaultRec && defaultRec.active && defaultRec.afternoonHours !== rec.afternoonHours;
                        const isModified = dMornChanged || dAftChanged;

                        const dayRequired = (defaultRec && defaultRec.active) ? (defaultRec.morningHours + defaultRec.afternoonHours) : 0;
                        let dayPhysicalWorked = (rec.morningHours || 0) + (rec.afternoonHours || 0);

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
                            <td className="py-3.5 px-3 font-semibold text-slate-700">
                              {dayIdToLabel[dayId]}
                            </td>
                            <td className="py-3.5 px-3 text-slate-500 whitespace-nowrap">
                              {formatFrenchDate(rec.date).split(' ').slice(1, 3).join(' ')}
                            </td>
                            <td className="py-3.5 px-3 font-mono text-slate-800">
                              <div className="flex flex-col gap-1">
                                <span className="font-bold">Matin : {rec.morningHours}h / A.-M. : {rec.afternoonHours}h</span>
                                {isModified && (
                                  <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded w-max mt-0.5 font-sans font-semibold">
                                    Modifié
                                  </span>
                                )}
                                
                                {/* Half-day indicators inside validation for active days */}
                                {(rec.paidLeave || (rec.notPresent && rec.absenceType === 'paid' && rec.absenceDuration !== 'full')) && (
                                  <span className="text-[9px] text-emerald-700 bg-emerald-100/50 px-1.5 py-0.5 rounded-full w-max font-extrabold border border-emerald-200 uppercase tracking-wider font-sans">
                                    🌴 CP {rec.paidLeave === 'morning' || rec.absenceDuration === 'morning' ? 'Matin' : 'Apr.-Midi'} {rec.absenceReason ? `(${rec.absenceReason})` : ''}
                                  </span>
                                )}
                                {(rec.unpaidLeave || (rec.notPresent && rec.absenceType === 'unpaid' && rec.absenceDuration !== 'full')) && (
                                  <span className="text-[9px] text-amber-700 bg-amber-100/50 px-1.5 py-0.5 rounded-full w-max font-extrabold border border-amber-200 uppercase tracking-wider font-sans">
                                    🕒 CSS {rec.unpaidLeave === 'morning' || rec.absenceDuration === 'morning' ? 'Matin' : 'Apr.-Midi'} {rec.absenceReason ? `(${rec.absenceReason})` : ''}
                                  </span>
                                )}
                                {(rec.sickLeave || (rec.notPresent && rec.absenceType === 'sick' && rec.absenceDuration !== 'full')) && (
                                  <span className="text-[9px] text-rose-700 bg-rose-100/50 px-1.5 py-0.5 rounded-full w-max font-extrabold border border-rose-200 uppercase tracking-wider font-sans">
                                    🩺 Arrêt {rec.sickLeave === 'morning' || rec.absenceDuration === 'morning' ? 'Matin' : 'Apr.-Midi'} {rec.absenceReason ? `(${rec.absenceReason})` : ''}
                                  </span>
                                )}
                                {(rec.notPresent && rec.absenceType === 'recovery' && rec.absenceDuration !== 'full') && (
                                  <span className="text-[9px] text-indigo-700 bg-indigo-100/50 px-1.5 py-0.5 rounded-full w-max font-extrabold border border-indigo-200 uppercase tracking-wider font-sans">
                                    ⏰ Récup. {rec.absenceDuration === 'morning' ? 'Matin' : 'Apr.-Midi'} {rec.absenceReason ? `(${rec.absenceReason})` : ''}
                                  </span>
                                )}
                                {(rec.notPresent && rec.absenceType === 'other' && rec.absenceDuration !== 'full') && (
                                  <span className="text-[9px] text-slate-700 bg-slate-100/50 px-1.5 py-0.5 rounded-full w-max font-extrabold border border-slate-200 uppercase tracking-wider font-sans">
                                    📄 Autre {rec.absenceDuration === 'morning' ? 'Matin' : 'Apr.-Midi'} {rec.absenceReason ? `(${rec.absenceReason})` : ''}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-3 text-center font-bold text-slate-700 font-mono">
                              <div className="flex flex-col items-center">
                                <span>{formatHours(calculatedStandard)}</span>
                                <span className="text-[10px] text-slate-400 font-normal">Requis: {formatHours(dayRequired)}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-3">
                              {excessPhysical > 0 ? (
                                <span className="inline-flex px-2 py-1 rounded bg-slate-100 text-slate-800 font-extrabold text-xs font-mono">
                                  +{formatHours(excessPhysical)}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="py-3.5 px-3">
                              {declaredOvertime > 0 ? (
                                <span className="inline-flex px-2 py-1 rounded bg-amber-100 text-amber-800 font-extrabold text-xs font-mono">
                                  {formatHours(declaredOvertime)}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-slate-600 max-w-xs break-words">
                              <div className="flex flex-col gap-1.5">
                                {declaredOvertime > 0 && (
                                  <div className="flex items-start gap-1.5 bg-amber-50/70 p-2 border border-amber-100 rounded-md">
                                    <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                    <p className="text-[11px] leading-tight font-medium text-amber-800">{rec.overtimeNote || <span className="italic text-rose-500 font-bold">REQUIS : NOTE MANQUANTE !</span>}</p>
                                  </div>
                                )}

                                {rec.dayNote && (
                                  <div className="flex items-start gap-1.5 bg-indigo-50/40 p-2 border border-indigo-100 rounded-md">
                                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                    <p className="text-[11px] leading-tight font-medium text-indigo-900">{rec.dayNote}</p>
                                  </div>
                                )}

                                {!rec.dayNote && declaredOvertime === 0 && (
                                  <span className="text-slate-400 italic">-</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Historical Audits / Rejection comments */}
                {selectedSheet.rejectionReason && (
                  <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex gap-3 mt-4">
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <h6 className="text-xs font-bold text-rose-800">Précédent motif de refus :</h6>
                      <p className="text-xs text-rose-700 mt-1 leading-relaxed font-semibold">{selectedSheet.rejectionReason}</p>
                    </div>
                  </div>
                )}

                {selectedSheet.status === 'validated' && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex gap-3 mt-4 text-xs text-emerald-800 font-medium">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <span>Validé par {selectedSheet.validatedByName || 'Direction'} le {selectedSheet.validatedAt ? new Date(selectedSheet.validatedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'récemment'}.</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons footer for validators */}
              {selectedSheet.status === 'submitted' ? (
                <div className="p-6 bg-slate-50/50 border-t border-slate-200/60 flex items-center justify-between gap-4 flex-wrap">
                  <div className="text-xs text-slate-500 font-medium">
                    Saisie soumise le {selectedSheet.submittedAt ? new Date(selectedSheet.submittedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Récemment'}
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    <button
                      id="btn-trigger-reject"
                      onClick={() => setShowRejectModal(true)}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-2xl text-xs font-bold transition-all cursor-pointer hover:scale-102"
                    >
                      <XCircle className="w-4 h-4" />
                      Refuser / Demander correction
                    </button>
                    <button
                      id="btn-validate-submit"
                      onClick={() => handleApprove(selectedSheet.id)}
                      className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer shadow-md shadow-indigo-150 hover:scale-102"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Valider et Envoyer en paie
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-50/70 border-t border-slate-100 text-center text-xs text-slate-400 italic">
                  Cette feuille de temps est sous le statut "{selectedSheet.status}". Aucune action requise.
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center h-full flex flex-col justify-center items-center shadow-xs">
              <FileText className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-base font-bold text-slate-600">Sélectionnez un collaborateur</p>
              <p className="text-sm text-slate-400 max-w-sm mt-1">
                Choisissez un dossier dans la colonne de gauche pour détailler ses heures déclarées, notes d'heures supplémentaires, et procéder à la validation.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* REJECTION POPUP WINDOW */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-200/60 bg-slate-50/50 flex items-center justify-between">
              <h4 className="font-extrabold text-slate-950 tracking-tight">Refuser la Feuille de Temps</h4>
              <button
                onClick={() => setShowRejectModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleRejectSubmit}>
              <div className="p-6 space-y-4">
                <div className="flex gap-2.5 bg-rose-50/60 p-3 border border-rose-100 rounded-lg text-xs text-rose-800 leading-relaxed font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>Le collaborateur recevra une demande de correction par email et verra votre motif s'afficher directement sur son espace de saisie.</span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Message de correction (Motif du refus) :</label>
                  <textarea
                    id="input-rejection-reason"
                    rows={4}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Ex : Bonjour Jean, peux-tu stp ajouter la note explicative du temps supplémentaire effectué mardi ? Merci !"
                    className="w-full text-xs border border-slate-200 rounded-lg p-3 outline-hidden focus:border-rose-500 focus:ring-1 focus:ring-rose-100 leading-relaxed font-medium"
                    required
                  ></textarea>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-600 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  id="btn-confirm-rejection"
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Envoyer le refus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
