/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, WeekDayId, DefaultDaySchedule } from '../types';
import { weekDayIds, dayIdToLabel } from '../utils/dateUtils';
import { UserPlus, Edit2, Check, RefreshCw, X, Eye, EyeOff, Key, Search } from 'lucide-react';

interface UserManagementProps {
  users: User[];
  onSaveUser: (user: User) => void;
}

const DEFAULT_SCHEDULE_DAY: DefaultDaySchedule = {
  active: true,
  morningHours: 4,
  afternoonHours: 3.5,
};

const EMPTY_SCHEDULE: Record<WeekDayId, DefaultDaySchedule> = {
  monday: { ...DEFAULT_SCHEDULE_DAY },
  tuesday: { ...DEFAULT_SCHEDULE_DAY },
  wednesday: { ...DEFAULT_SCHEDULE_DAY },
  thursday: { ...DEFAULT_SCHEDULE_DAY },
  friday: { ...DEFAULT_SCHEDULE_DAY, afternoonHours: 3 }, // Shorter Friday standard (7h)
  saturday: { morningHours: 0, afternoonHours: 0, active: false },
  sunday: { morningHours: 0, afternoonHours: 0, active: false },
};

export default function UserManagement({ users, onSaveUser }: UserManagementProps) {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Filtering and sorting states for collaborators list
  const [showInactive, setShowInactive] = useState(false);
  const [sortByAlphabetical, setSortByAlphabetical] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // State for form
  const [name, setName] = useState('');
  const [role, setRole] = useState<'employee' | 'validator'>('employee');
  const [isEmployee, setIsEmployee] = useState(true);
  const [isValidator, setIsValidator] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [userPin, setUserPin] = useState('');
  const [schedule, setSchedule] = useState<Record<WeekDayId, DefaultDaySchedule>>(JSON.parse(JSON.stringify(EMPTY_SCHEDULE)));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const startCreate = () => {
    setIsCreating(true);
    setEditingUser(null);
    setName('');
    setRole('employee');
    setIsEmployee(true);
    setIsValidator(false);
    setIsAdmin(false);
    setIsActive(true);
    setUserPin('');
    setSchedule(JSON.parse(JSON.stringify(EMPTY_SCHEDULE)));
    setMessage(null);
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setIsCreating(false);
    setName(user.name);
    setRole(user.role);
    setIsEmployee(user.isEmployee ?? true);
    setIsValidator(user.isValidator ?? (user.role === 'validator'));
    setIsAdmin(user.isAdmin ?? (user.role === 'validator'));
    setIsActive(user.isActive !== false);
    setUserPin(user.pin || user.password || '111111');
    setSchedule(JSON.parse(JSON.stringify(user.defaultSchedule)));
    setMessage(null);
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setIsCreating(false);
    setMessage(null);
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
    setMessage({ type: 'success', text: 'Horaires du Lundi copiés sur tous les jours de la semaine (Mardi-Vendredi) !' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ type: 'error', text: 'Le nom de l\'employé est requis.' });
      return;
    }
    if (userPin.trim() && (userPin.trim().length !== 6 || isNaN(Number(userPin)))) {
      setMessage({ type: 'error', text: 'Le code PIN doit comporter exactement 6 chiffres.' });
      return;
    }

    const finalPin = userPin.trim() || '111111';
    const cleanName = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const finalEmail = (editingUser && editingUser.email) ? editingUser.email : `${cleanName || 'salarie'}@entreprise.local`;

    const targetUser: User = {
      id: editingUser ? editingUser.id : `user_${Date.now()}`,
      name: name.trim(),
      email: finalEmail,
      role: isValidator ? 'validator' : 'employee',
      isEmployee: true,
      isValidator: isValidator,
      isAdmin: isAdmin,
      isActive: isActive,
      pin: finalPin,
      password: finalPin, // keep in sync
      defaultSchedule: schedule,
    };

    onSaveUser(targetUser);
    setMessage({
      type: 'success',
      text: editingUser ? 'Collaborateur mis à jour avec succès !' : 'Nouveau collaborateur créé avec succès !',
    });
    
    // Reset state
    if (!editingUser) {
      setName('');
      setUserPin('');
      setSchedule(JSON.parse(JSON.stringify(EMPTY_SCHEDULE)));
    }
    
    setTimeout(() => {
      setMessage(null);
      if (editingUser) {
        setEditingUser(null);
      } else {
        setIsCreating(false);
      }
    }, 1500);
  };

  const filteredAndSortedUsers = [...users]
    .filter(user => showInactive || user.isActive !== false)
    .filter(user => {
      if (!searchQuery.trim()) return true;
      return user.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    })
    .sort((a, b) => {
      if (sortByAlphabetical) {
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
      }
      return 0; // maintain original order
    });

  return (
    <div id="user-management-section" className="space-y-8">
      {/* Upper header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Gestion des Collaborateurs</h2>
          <p className="text-xs text-slate-500">Créez, modifiez et configurez les horaires hebdomadaires standards des salariés.</p>
        </div>
        {!isCreating && !editingUser && (
          <button
            id="btn-add-collaborator"
            onClick={startCreate}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            Ajouter un collaborateur
          </button>
        )}
      </div>

      {notificationBox(message)}

      {/* Main Panel layout */}
      {(isCreating || editingUser) ? (
        <form id="collaboration-form" onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden transition-all duration-300">
          <div className="p-6 bg-slate-50/50 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">
              {editingUser ? `Modifier : ${editingUser.name}` : 'Nouveau Collaborateur'}
            </h3>
            <button
              id="btn-cancel-edit"
              type="button"
              onClick={cancelEdit}
              className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Identity Group */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">Nom Complet</label>
                <input
                  id="input-user-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex : Claire Dufour"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">Code PIN à 6 chiffres (Pointeuse)</label>
                <input
                  id="input-user-pin"
                  type="text"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={userPin}
                  onChange={(e) => setUserPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Ex : 555555"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 font-mono tracking-widest"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">Rôles de l'utilisateur</label>
                <div className="space-y-2 mt-1 bg-slate-50 border border-slate-150 p-2 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-slate-700">👤 Salarié (Défaut)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isValidator}
                      onChange={(e) => setIsValidator(e.target.checked)}
                      className="h-4 w-4 text-rose-600 border-slate-300 rounded focus:ring-rose-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">👑 Validateur</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAdmin}
                      onChange={(e) => setIsAdmin(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">⚙️ Administrateur</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">Statut opérationnel</label>
                <label className="flex items-center gap-2.5 mt-1 bg-slate-50 border border-slate-150 p-3.5 rounded-lg cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="leading-tight">
                    <span className="text-xs font-bold text-slate-700 block">🔓 Compte Actif</span>
                    <span className="text-[10px] text-slate-450 block mt-0.5">Désactiver pour archiver et suspendre la connexion</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Default Schedule Setup */}
            <div className="border-t border-slate-100 pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Horaires Contrat de Base (Hebdomadaire)</h4>
                  <p className="text-xs text-slate-500">Ces horaires rempliront par défaut l'agenda de chaque semaine pour ce salarié.</p>
                </div>
                <button
                  id="btn-copy-monday"
                  type="button"
                  onClick={copyMondayToAll}
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 rounded-md transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Appliquer le Lundi aux autres jours
                </button>
              </div>

              <div id="schedule-days-grid" className="space-y-3">
                {weekDayIds.map((dayId) => {
                  const daySched = schedule[dayId];
                  return (
                    <div
                      key={dayId}
                      className={`grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3 rounded-lg border transition ${
                        daySched.active 
                          ? 'border-slate-200 bg-white' 
                          : 'border-slate-100 bg-slate-50/50 opacity-60'
                      }`}
                    >
                      {/* Active switch & Day Name */}
                      <div className="sm:col-span-3 flex items-center gap-3">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={daySched.active}
                            onChange={() => handleDayToggle(dayId)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                        <span className="text-sm font-medium text-slate-700">
                          {dayIdToLabel[dayId]}
                        </span>
                      </div>

                      {daySched.active ? (
                        <>
                          {/* Hour Inputs */}
                          <div className="sm:col-span-6 flex items-center gap-3 font-sans">
                            <span className="text-xs text-slate-400">Matin (h)</span>
                            <input
                              type="number"
                              min="0"
                              max="12"
                              step="0.5"
                              value={daySched.morningHours ?? 0}
                              onChange={(e) => handleDayDurationChange(dayId, 'morningHours', parseFloat(e.target.value) || 0)}
                              className="w-16 text-xs border border-slate-200 rounded-md p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 font-bold"
                            />
                            <span className="text-xs text-slate-400">Après-midi (h)</span>
                            <input
                              type="number"
                              min="0"
                              max="12"
                              step="0.5"
                              value={daySched.afternoonHours ?? 0}
                              onChange={(e) => handleDayDurationChange(dayId, 'afternoonHours', parseFloat(e.target.value) || 0)}
                              className="w-16 text-xs border border-slate-200 rounded-md p-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 font-bold"
                            />
                          </div>

                          {/* Calculation feedback */}
                          <div className="sm:col-span-3 text-right text-xs font-semibold text-slate-600">
                            Total : {(daySched.morningHours || 0) + (daySched.afternoonHours || 0)}h
                          </div>
                        </>
                      ) : (
                        <div className="sm:col-span-9 text-xs text-slate-400 italic">
                          Non travaillé par défaut
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Form actions */}
          <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              id="btn-form-cancel"
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-sm font-medium transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              id="btn-form-submit"
              type="submit"
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition cursor-pointer shadow-xs"
            >
              <Check className="w-4 h-4" />
              {editingUser ? 'Enregistrer les modifications' : 'Créer l\'utilisateur'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-6">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par nom..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-sm pl-11 pr-10 py-3 bg-white border border-slate-200 hover:border-slate-300 focus:border-indigo-500 rounded-2xl outline-hidden transition-all placeholder:text-slate-400 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-0.5 rounded-lg cursor-pointer"
                title="Effacer la recherche"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Controls for filtering & sorting */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50 border border-slate-200/60 p-4 rounded-2xl">
            <div className="flex flex-wrap items-center gap-6">
              {/* Show inactive checkbox */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="h-4.5 w-4.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <div className="leading-tight">
                  <span className="text-xs font-bold text-slate-700 block">Afficher les comptes inactifs</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">Masqué par défaut</span>
                </div>
              </label>

              {/* Sort alphabetically checkbox */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sortByAlphabetical}
                  onChange={(e) => setSortByAlphabetical(e.target.checked)}
                  className="h-4.5 w-4.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <div className="leading-tight">
                  <span className="text-xs font-bold text-slate-700 block">Trier par ordre alphabétique (A-Z)</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">Filtre alphabétique</span>
                </div>
              </label>
            </div>

            <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider bg-slate-200/60 px-3 py-1.5 rounded-full select-none">
              {filteredAndSortedUsers.length} salarié(s) affiché(s)
            </div>
          </div>

          {filteredAndSortedUsers.length === 0 ? (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-12 text-center">
              <span className="text-2xl block mb-2">🔍</span>
              <p className="text-sm font-bold text-slate-700">Aucun collaborateur trouvé</p>
              <p className="text-xs text-slate-400 mt-1">Essayez d'ajuster votre recherche ou d'autoriser l'affichage des comptes inactifs.</p>
            </div>
          ) : (
            /* Team user grid display */
            <div id="users-grid" className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredAndSortedUsers.map((user) => {
                const workingDaysCount = Object.values(user.defaultSchedule).filter(d => d.active).length;
                return (
                  <div
                    key={user.id}
                    className={`bg-white rounded-3xl border transition-all duration-300 p-6 flex flex-col justify-between hover:scale-[1.01] ${
                      user.isActive === false
                        ? 'border-slate-300 border-dashed bg-slate-50/50 opacity-85 hover:border-slate-400'
                        : 'border-slate-200/90 hover:border-indigo-300 shadow-sm hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className={`font-extrabold text-slate-900 text-base tracking-tight ${user.isActive === false ? 'line-through text-slate-500' : ''}`}>{user.name}</h4>
                          <p className="text-xs text-indigo-600 font-bold mt-2 inline-flex items-center gap-1.5 bg-indigo-55 border border-indigo-100/50 px-3 py-1 rounded-xl">
                            <Key className="w-3.5 h-3.5 text-indigo-500" />
                            Code PIN : <span className="font-black font-mono tracking-widest">{user.pin || user.password || '111111'}</span>
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className={`text-[9px] uppercase tracking-wider font-extrabold px-3 py-1 rounded-full ${
                            (user.isValidator ?? (user.role === 'validator'))
                              ? 'bg-rose-50 text-rose-700 border border-rose-100'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          }`}>
                            {`Salarié${(user.isValidator ?? (user.role === 'validator')) ? ' + Valideur' : ''}${(user.isAdmin ?? (user.role === 'validator')) ? ' + Admin' : ''}`}
                          </span>
                          {user.isActive === false && (
                            <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-200/80 border border-slate-300/60 px-3 py-1 rounded-full">
                              🔒 Archivé (Inactif)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                        <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Planning hebdomadaire type :</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                          {weekDayIds.map((dayId) => {
                            const sched = user.defaultSchedule[dayId];
                            if (!sched.active) return null;
                            return (
                              <div key={dayId} className="bg-slate-50/70 rounded-xl p-2.5 border border-slate-100 text-left">
                                <span className="text-[9px] font-extrabold text-slate-500 uppercase block">{dayIdToLabel[dayId]}</span>
                                <span className="text-xs font-bold text-slate-800 block mt-0.5">
                                  {(sched.morningHours || 0) + (sched.afternoonHours || 0)}h / jour
                                </span>
                                <span className="text-[9px] text-slate-450 block font-medium">
                                  (Matin : {sched.morningHours}h, Ap-M : {sched.afternoonHours}h)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {workingDaysCount === 0 && (
                          <p className="text-xs italic text-slate-400">Aucun horaire par défaut configuré.</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span className="font-extrabold text-slate-600 bg-slate-100 px-3 py-1 rounded-full text-[10px] uppercase tracking-wider">
                        {workingDaysCount} j. travaillés / sem
                      </span>
                      
                      <button
                        id={`btn-edit-user-${user.id}`}
                        onClick={() => startEdit(user)}
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-extrabold bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl transition-all cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Modifier horaires & profil
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function calculateHoursFeedback(morning: number, afternoon: number) {
  return `${(morning || 0) + (afternoon || 0)}h00 net`;
}

function notificationBox(message: { type: 'success' | 'error'; text: string } | null) {
  if (!message) return null;
  const isOk = message.type === 'success';
  return (
    <div className={`p-4 rounded-lg text-sm font-medium border ${
      isOk 
        ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
        : 'bg-rose-50 border-rose-100 text-rose-800'
    }`}>
      {message.text}
    </div>
  );
}
