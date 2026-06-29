/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, UserRole, WeekDayId, DefaultDaySchedule } from '../types';
import { 
  Briefcase, 
  User as UserIcon, 
  Sparkles, 
  Key, 
  PlusCircle, 
  ChevronRight, 
  Check, 
  ArrowLeft, 
  Delete, 
  Lock,
  Users,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface LoginScreenProps {
  users: User[];
  onLogin: (userId: string) => void;
  onSignUp: (newUser: User) => void;
  onUpdateUser?: (updatedUser: User) => void;
  isFirebaseActive: boolean;
  onSignInWithGoogle?: () => Promise<void>;
  authError?: string | null;
}

const DEFAULT_SCHEDULE_DAY: DefaultDaySchedule = {
  morningHours: 4,
  afternoonHours: 3.5,
  active: true,
};

const INITIAL_SIGNUP_SCHEDULE: Record<WeekDayId, DefaultDaySchedule> = {
  monday: { ...DEFAULT_SCHEDULE_DAY },
  tuesday: { ...DEFAULT_SCHEDULE_DAY },
  wednesday: { ...DEFAULT_SCHEDULE_DAY },
  thursday: { ...DEFAULT_SCHEDULE_DAY },
  friday: { ...DEFAULT_SCHEDULE_DAY, afternoonHours: 3 },
  saturday: { morningHours: 0, afternoonHours: 0, active: false },
  sunday: { morningHours: 0, afternoonHours: 0, active: false },
};

export default function LoginScreen({
  users,
  onLogin,
  onSignUp,
  onUpdateUser,
  isFirebaseActive,
  onSignInWithGoogle,
  authError
}: LoginScreenProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [pinCode, setPinCode] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  
  // Registration States
  const [customPin, setCustomPin] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Monitor the time every second for precise lockout countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const lookupSelectedUserFromProps = users.find(u => u.id === selectedUser?.id) || selectedUser;

  const isLocked = React.useMemo(() => {
    if (!lookupSelectedUserFromProps || !lookupSelectedUserFromProps.lockedUntil) return false;
    return new Date(lookupSelectedUserFromProps.lockedUntil).getTime() > currentTime;
  }, [lookupSelectedUserFromProps, currentTime]);

  const lockoutTimeRemaining = React.useMemo(() => {
    if (!lookupSelectedUserFromProps || !lookupSelectedUserFromProps.lockedUntil) return 0;
    const remaining = new Date(lookupSelectedUserFromProps.lockedUntil).getTime() - currentTime;
    return remaining > 0 ? remaining : 0;
  }, [lookupSelectedUserFromProps, currentTime]);

  const formatLockoutTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} min ${seconds.toString().padStart(2, '0')} s`;
  };

  // Monitor physical keyboard keydowns when PIN entry is active
  useEffect(() => {
    if (!selectedUser || isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleCancelPin();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedUser, pinCode, isLocked]);

  const handleDigitPress = (digit: string) => {
    if (isLocked) {
      setErrorMsg("Ce compte est temporairement bloqué pour 5 minutes.");
      return;
    }
    setErrorMsg(null);
    if (pinCode.length < 6) {
      const newPin = pinCode + digit;
      setPinCode(newPin);
      
      // Auto-validate when 6th digit is keyed in
      if (newPin.length === 6) {
        validatePin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    setErrorMsg(null);
    setPinCode(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setErrorMsg(null);
    setPinCode('');
  };

  const handleCancelPin = () => {
    setSelectedUser(null);
    setPinCode('');
    setErrorMsg(null);
  };

  const validatePin = (codeToTest: string) => {
    if (!lookupSelectedUserFromProps) return;

    // Default pin or stored password/pin
    const targetPin = lookupSelectedUserFromProps.pin || lookupSelectedUserFromProps.password || '111111';

    if (codeToTest === targetPin) {
      // Correct! Reset attempts
      if (lookupSelectedUserFromProps.failedLoginAttempts || lookupSelectedUserFromProps.lockedUntil) {
        const resetUser: User = {
          ...lookupSelectedUserFromProps,
          failedLoginAttempts: 0,
          lockedUntil: undefined
        };
        onUpdateUser?.(resetUser);
      }
      setSuccessMsg(`Connexion réussie ! Bienvenue ${lookupSelectedUserFromProps.name}`);
      setTimeout(() => {
        setSuccessMsg(null);
        onLogin(lookupSelectedUserFromProps.id);
      }, 500);
    } else {
      // Incorrect! Increments attempts
      const currentAttempts = (lookupSelectedUserFromProps.failedLoginAttempts || 0) + 1;
      const willLock = currentAttempts >= 3;
      const lockedUntilValue = willLock 
        ? new Date(Date.now() + 5 * 60 * 1000).toISOString() 
        : undefined;

      const updatedUser: User = {
        ...lookupSelectedUserFromProps,
        failedLoginAttempts: currentAttempts,
        lockedUntil: lockedUntilValue
      };

      onUpdateUser?.(updatedUser);

      if (willLock) {
        setErrorMsg('Compte bloqué pendant 5 minutes après 3 tentatives infructueuses.');
        setPinCode('');
      } else {
        setErrorMsg(`Code PIN incorrect. Tentatives restantes avant blocage : ${3 - currentAttempts}.`);
        setTimeout(() => {
          setPinCode('');
        }, 600);
      }
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg('Le nom complet est obligatoire.');
      return;
    }
    if (customPin.length !== 6 || isNaN(Number(customPin))) {
      setErrorMsg('Le code PIN doit comporter exactement 6 chiffres.');
      return;
    }

    // Check for duplicates
    if (users.some(u => u.name.toLowerCase().trim() === name.toLowerCase().trim())) {
      setErrorMsg('Un compte existe déjà avec ce nom.');
      return;
    }

    const cleanName = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const generatedEmail = `${cleanName || 'salarie'}@entreprise.local`;

    const randomId = `user_${Date.now()}`;
    const newUserObj: User = {
      id: randomId,
      name: name.trim(),
      email: generatedEmail,
      role: role,
      pin: customPin,
      password: customPin, // keep in sync with password for secondary checks
      defaultSchedule: INITIAL_SIGNUP_SCHEDULE,
    };

    onSignUp(newUserObj);
    setSuccessMsg(`Compte de ${name.trim()} créé avec succès avec le code PIN : ${customPin} !`);
    setIsRegistering(false);
    
    // Clear inputs
    setName('');
    setCustomPin('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-8 sm:py-12 font-sans selection:bg-indigo-100">
      
      <div className="max-w-2xl w-full space-y-8 bg-white p-6 sm:p-10 rounded-3xl border border-slate-200/80 shadow-md transition-all duration-300">
        
        {/* Top brand header */}
        <div className="text-center pb-2">
          <div className="inline-flex bg-indigo-600 text-white p-3 rounded-2xl shadow-sm mb-3">
            <Briefcase className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            GestHoraire <span className="text-indigo-600 font-bold">Pro</span>
          </h2>
          <p className="mt-1 text-xs text-slate-400 font-extrabold tracking-widest uppercase">
            Portail Pointeuse & Saisie d'Heures
          </p>
        </div>

        {/* Floating Notifications */}
        {(errorMsg || authError) && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-800 text-xs font-bold flex items-center gap-2.5 animate-bounce">
            <AlertCircle className="w-4.5 h-4.5 shrink-0 text-rose-600" />
            <span>{errorMsg || authError}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-2.5 animate-fade-in animate-pulse">
            <Check className="w-4.5 h-4.5 shrink-0 text-emerald-600 animate-scale-up" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* SCREEN 1: Enter PIN code for a selected employee */}
        {selectedUser ? (
          <div className="space-y-6 max-w-sm mx-auto text-center animate-fade-in">
            {/* Back to list */}
            <div className="flex justify-start">
              <button
                type="button"
                onClick={handleCancelPin}
                className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-500 hover:text-slate-800 py-1.5 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 cursor-pointer transition active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Retour aux salariés
              </button>
            </div>

            {/* Profile Avatar Badge */}
            <div className="space-y-2 mt-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-150 text-indigo-700 font-black text-2xl flex items-center justify-center mx-auto shadow-inner">
                {selectedUser.name.split(' ').map(n => n[0]).join('')}
              </div>
              <h3 className="text-lg font-black text-slate-800 tracking-tight">{selectedUser.name}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Veuillez saisir votre **code PIN individuel** à 6 chiffres.
              </p>
            </div>

            {isLocked ? (
              <div className="p-6 bg-rose-50 border border-rose-100/85 rounded-2xl space-y-3 max-w-[280px] mx-auto animate-fade-in text-center my-4">
                <Lock className="w-8 h-8 text-rose-500 mx-auto animate-pulse" />
                <h4 className="font-extrabold text-sm text-rose-800">Compte bloqué temporairement</h4>
                <p className="text-xs text-rose-600 leading-relaxed">
                  Suite à 3 codes PIN incorrects, ce compte est bloqué pendant 5 minutes.
                </p>
                <div className="bg-white border border-rose-100 px-3 py-1.5 rounded-full inline-block text-xs font-black font-mono text-rose-700">
                  Temps restant : {formatLockoutTime(lockoutTimeRemaining)}
                </div>
              </div>
            ) : (
              <>
                {/* PIN Dots indicators */}
                <div className="flex justify-center gap-3 py-4">
                  {[...Array(6)].map((_, i) => {
                    const filled = pinCode.length > i;
                    return (
                      <div
                        key={i}
                        className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-150 ${
                          filled 
                            ? 'bg-indigo-600 border-indigo-600 scale-110 shadow-lg shadow-indigo-200' 
                            : 'border-slate-300 bg-white'
                        }`}
                      />
                    );
                  })}
                </div>

                {/* Numeric visual PIN Keypad */}
                <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto pt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleDigitPress(num)}
                      disabled={pinCode.length >= 6}
                      className="h-14 w-14 rounded-2xl border border-slate-200 text-lg font-black text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer flex items-center justify-center transition active:scale-90"
                    >
                      {num}
                    </button>
                  ))}
                  
                  {/* Reset/Cancel */}
                  <button
                    type="button"
                    onClick={handleClear}
                    className="h-14 w-14 rounded-2xl text-[11px] font-black tracking-wide text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-slate-100 flex items-center justify-center cursor-pointer transition active:scale-90"
                  >
                    Vider
                  </button>

                  {/* Zero */}
                  <button
                    type="button"
                    onClick={() => handleDigitPress('0')}
                    disabled={pinCode.length >= 6}
                    className="h-14 w-14 rounded-2xl border border-slate-200 text-lg font-black text-slate-800 hover:bg-slate-50 hover:border-slate-300 cursor-pointer flex items-center justify-center transition active:scale-90"
                  >
                    0
                  </button>

                  {/* Backspace icon */}
                  <button
                    type="button"
                    onClick={handleBackspace}
                    className="h-14 w-14 rounded-2xl text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer transition active:scale-90"
                    title="Supprimer"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 pt-2 italic">
                  Vous pouvez également saisir les chiffres sur votre clavier physique (Échap pour annuler).
                </p>
              </>
            )}
          </div>
        ) : isRegistering ? (
          /* SCREEN 2: Register a new collaborator */
          <form onSubmit={handleRegisterSubmit} className="space-y-5 animate-fade-in max-w-md mx-auto">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <button
                type="button"
                onClick={() => setIsRegistering(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition mr-1 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-base font-black text-slate-850">Ajouter un nouveau salarié</h3>
                <p className="text-xs text-slate-400">Enregistrez un nouveau profil avec son code PIN.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-400 mb-1.5">Nom & Prénom</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex : Martin Bernard ou Claire Dufour"
                    className="w-full text-sm border border-slate-200 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2.5 outline-hidden font-bold text-slate-800 bg-slate-50/50"
                  />
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-400 mb-1.5">Code PIN secret (6 chiffres)</label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      placeholder="Ex : 555555"
                      required
                      value={customPin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        setCustomPin(val);
                      }}
                      className="w-full text-sm border border-slate-200 focus:border-indigo-500 rounded-xl pl-9 pr-4 py-2.5 outline-hidden font-black tracking-widest text-slate-800 bg-slate-50/50"
                    />
                    <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-400 mb-1.5">Rôle / Accès</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full text-xs font-extrabold border border-slate-200 rounded-xl px-3 py-2.5 bg-white outline-hidden focus:border-indigo-500"
                  >
                    <option value="employee">👤 Collaborateur (Saisie)</option>
                    <option value="validator">👑 Directeur / Validateur (Admin)</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs tracking-wider uppercase px-4 py-3 rounded-2xl shadow-md transition hover:scale-[1.01] cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Créer le profil salarié</span>
            </button>
          </form>
        ) : (
          /* SCREEN 3: Grid of buttons for each employee */
          <div className="space-y-6 animate-fade-in">

            <div className="text-center space-y-1">
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center justify-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-600" />
                Sélectionnez votre nom
              </h3>
              <p className="text-xs text-slate-400">Cliquez ou appuyez sur votre nom pour saisir votre code PIN.</p>
            </div>

            {/* Grid of active employees buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[380px] overflow-y-auto pr-1">
              {users.filter(user => user.isActive !== false).map(user => {
                const initials = user.name.split(' ').map(n => n[0]).join('');
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(user);
                      setPinCode('');
                      setErrorMsg(null);
                    }}
                    className="group w-full text-left p-4 rounded-2xl border border-slate-200/80 hover:border-indigo-500 bg-white hover:bg-indigo-50/20 flex items-center justify-between transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-xs active:scale-98"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-indigo-100 text-slate-700 group-hover:text-indigo-700 font-black text-sm flex items-center justify-center transition">
                        {initials}
                      </div>
                      <div>
                        <span className="text-sm font-black text-slate-800 block group-hover:text-indigo-950 transition">
                          {user.name}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        user.role === 'validator' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {user.role === 'validator' ? 'Dir' : 'Salarié'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-350 group-hover:text-indigo-500 transition group-hover:translate-x-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer triggers */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold">
              <span className="text-[11px] text-slate-400 font-sans">
                Pointeuse centralisée : {users.filter(u => u.isActive !== false).length} salarié(s) actif(s)
              </span>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
