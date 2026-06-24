/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, Timesheet, WeekDayId, ensure6DigitPin } from './types';
import { INITIAL_USERS, generateInitialTimesheets, buildEmptyTimesheet } from './data/mockData';
import { formatFrenchMonth, getMonthDays } from './utils/dateUtils';
import UserManagement from './components/UserManagement';
import ValidationPanel from './components/ValidationPanel';
import TimesheetSubmission from './components/TimesheetSubmission';
import UserProfile from './components/UserProfile';
import LoginScreen from './components/LoginScreen';
import HistoryPanel from './components/HistoryPanel';
import { db, auth, googleProvider, isFirebaseConfigured, handleFirestoreError, OperationType } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { 
  Users, 
  FileSpreadsheet, 
  CheckSquare, 
  Clock, 
  UserCheck, 
  Database,
  Briefcase,
  Layers,
  Sparkles,
  Github,
  AlertCircle,
  X,
  History
} from 'lucide-react';

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    return localStorage.getItem('g_current_user_id') || 'user_sophie';
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('g_auth_active') === 'true';
  });
  const [activeTab, setActiveTab] = useState<'submission' | 'validation' | 'history' | 'users' | 'profile'>('submission');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-06');
  
  const [firebaseUser, setFirebaseUser] = useState<any | null>(null);
  const [loadingCloud, setLoadingCloud] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sync state changes to storage
  useEffect(() => {
    localStorage.setItem('g_current_user_id', currentUserId);
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem('g_auth_active', isAuthenticated ? 'true' : 'false');
  }, [isAuthenticated]);

  // Initial load
  useEffect(() => {
    // Current month
    setSelectedMonth('2026-06');

    // Read from localStorage (acts as offline initial state)
    const savedUsers = localStorage.getItem('g_users');
    const savedSheets = localStorage.getItem('g_timesheets');

    let loadedUsers: User[] = [];
    let loadedSheets: Timesheet[] = [];

    if (savedUsers) {
      const parsed = JSON.parse(savedUsers);
      loadedUsers = parsed.map((u: User) => {
        const initialDef = INITIAL_USERS.find(iu => iu.id === u.id);
        const rawPin = initialDef ? initialDef.pin : (u.pin || u.password || '111111');
        const resolvedPin = ensure6DigitPin(rawPin);
        return {
          ...u,
          isEmployee: u.isEmployee ?? true,
          isValidator: u.isValidator ?? (u.role === 'validator'),
          isAdmin: u.isAdmin ?? (u.role === 'validator'),
          isActive: u.isActive ?? true,
          pin: resolvedPin,
          password: resolvedPin,
        };
      });
      localStorage.setItem('g_users', JSON.stringify(loadedUsers));
    } else {
      loadedUsers = INITIAL_USERS;
      localStorage.setItem('g_users', JSON.stringify(INITIAL_USERS));
    }

    if (savedSheets) {
      loadedSheets = JSON.parse(savedSheets);
    } else {
      loadedSheets = generateInitialTimesheets(loadedUsers);
      localStorage.setItem('g_timesheets', JSON.stringify(loadedSheets));
    }

    setUsers(loadedUsers);
    setTimesheets(loadedSheets);
  }, []);

  // Firebase Authentication & Real-time Database synchronization
  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !db) return;

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      setFirebaseUser(user);
      if (user) {
        setLoadingCloud(true);
        setIsAuthenticated(true);
        try {
          // 1. Get or create the user profile document in Firestore
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          const isValidatorUser = user.email === 'digitalatelierlemee2@gmail.com';
          
          let dbUserProfile: User;
          if (!userDoc.exists()) {
            dbUserProfile = {
              id: user.uid,
              name: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
              email: user.email || '',
              role: isValidatorUser ? 'validator' : 'employee',
              isEmployee: true,
              isValidator: isValidatorUser,
              isAdmin: isValidatorUser,
              isActive: true,
              defaultSchedule: {
                monday: { morningHours: 4, afternoonHours: 3.5, active: true },
                tuesday: { morningHours: 4, afternoonHours: 3.5, active: true },
                wednesday: { morningHours: 4, afternoonHours: 3.5, active: true },
                thursday: { morningHours: 4, afternoonHours: 3.5, active: true },
                friday: { morningHours: 4, afternoonHours: 3, active: true },
                saturday: { morningHours: 0, afternoonHours: 0, active: false },
                sunday: { morningHours: 0, afternoonHours: 0, active: false },
              }
            };
            await setDoc(userDocRef, dbUserProfile);
          } else {
            const data = userDoc.data() as User;
            const rawPin = data.pin || data.password || '111111';
            const resolvedPin = ensure6DigitPin(rawPin);
            dbUserProfile = {
              ...data,
              isEmployee: data.isEmployee ?? true,
              isValidator: data.isValidator ?? (data.role === 'validator'),
              isAdmin: data.isAdmin ?? (data.role === 'validator'),
              isActive: data.isActive ?? true,
              pin: resolvedPin,
              password: resolvedPin,
            };
          }

          setCurrentUserId(dbUserProfile.id);

          // 2. See if the DB contains mock users, otherwise seed/bootstrap it
          const usersColRef = collection(db, 'users');
          const usersSnap = await getDocs(usersColRef);
          if (usersSnap.size <= 1) {
            // Seed the rest of users
            for (const initialUser of INITIAL_USERS) {
              if (initialUser.id !== 'user_sophie' || !isValidatorUser) {
                await setDoc(doc(db, 'users', initialUser.id), initialUser);
              }
            }
            // Seed initial timesheets
            const generatedSheets = generateInitialTimesheets(INITIAL_USERS);
            for (const sheet of generatedSheets) {
              await setDoc(doc(db, 'timesheets', sheet.id), sheet);
            }
            console.log('Firebase Cloud Database Bootstrapped Successfully with Initial Data');
          }
        } catch (error) {
          console.error("Error setting up authenticated user:", error);
          handleFirestoreError(error, OperationType.WRITE, 'users');
        } finally {
          setLoadingCloud(false);
        }
      } else {
        // Logged out
      }
    });

    return () => unsubscribeAuth();
  }, [firebaseUser]);

  // Real-time listener for database changes when logged in
  useEffect(() => {
    if (!isFirebaseConfigured || !db || !firebaseUser) return;

    // Real-time synchronization for users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const dbUsers: User[] = [];
      const usersToMigrate: User[] = [];
      snapshot.forEach((snapshotDoc) => {
        const data = snapshotDoc.data() as User;
        const initialDef = INITIAL_USERS.find(iu => iu.id === data.id);
        const rawPin = data.pin || initialDef?.pin || data.password || '111111';
        const resolvedPin = ensure6DigitPin(rawPin);
        
        const updatedUser = {
          ...data,
          isEmployee: data.isEmployee ?? true,
          isValidator: data.isValidator ?? (data.role === 'validator'),
          isAdmin: data.isAdmin ?? (data.role === 'validator'),
          isActive: data.isActive ?? true,
          pin: resolvedPin,
          password: resolvedPin
        };
        dbUsers.push(updatedUser);

        if (!data.pin || data.pin.length !== 6 || data.password !== resolvedPin) {
          usersToMigrate.push(updatedUser);
        }
      });

      if (dbUsers.length > 0) {
        setUsers(dbUsers);
      }

      if (usersToMigrate.length > 0) {
        const currentInMemoryUser = dbUsers.find(u => u.id === firebaseUser.uid);
        if (currentInMemoryUser?.role === 'validator' || currentInMemoryUser?.isValidator || firebaseUser.email === 'digitalatelierlemee2@gmail.com') {
          usersToMigrate.forEach(async (u) => {
            try {
              await setDoc(doc(db, 'users', u.id), u);
              console.log(`Successfully migrated PIN to 6-digit for ${u.name}`);
            } catch (err) {
              console.warn(`Could not auto-migrate PIN for ${u.name}:`, err);
            }
          });
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Real-time synchronization for timesheets
    const unsubTimesheets = onSnapshot(collection(db, 'timesheets'), (snapshot) => {
      const dbSheets: Timesheet[] = [];
      snapshot.forEach((doc) => {
        dbSheets.push(doc.data() as Timesheet);
      });
      setTimesheets(dbSheets);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'timesheets');
    });

    return () => {
      unsubUsers();
      unsubTimesheets();
    };
  }, [firebaseUser]);

  const handleSignIn = async () => {
    if (!auth || !googleProvider) return;
    setAuthError(null);
    try {
      const { signInWithPopup } = await import('firebase/auth');
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Sign in failed:", err);
      // Friendly, structured error descriptions
      if (err?.code === 'auth/popup-closed-by-user' || err?.message?.includes('closed-by-user')) {
        setAuthError("La fenêtre d'authentification a été fermée avant la fin de la connexion. Veuillez cliquer de nouveau et finaliser la connexion Google.");
      } else if (err?.code === 'auth/cancelled-popup-request') {
        setAuthError("La tentative précédente d'authentification a été annulée. Veuillez réessayer.");
      } else if (err?.code === 'auth/popup-blocked') {
        setAuthError("L'affichage de la fenêtre pop-up a été bloqué par votre navigateur. Veuillez autoriser les pop-ups pour ce site et réessayer.");
      } else {
        setAuthError(`Erreur d'authentification : ${err?.message || "Une erreur inattendue est survenue."}`);
      }
    }
  };

  const handleSignOut = async () => {
    setIsAuthenticated(false);
    setCurrentUserId('user_sophie');
    if (!auth) return;
    setAuthError(null);
    try {
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  const currentUser = users.find(u => u.id === currentUserId) || users[0];

  // Auto-generate empty timesheet if none exists for the selected user/month
  useEffect(() => {
    if (!currentUser || !selectedMonth || timesheets.length === 0) return;

    const existingSheet = timesheets.find(
      t => t.userId === currentUser.id && t.monthDate === selectedMonth
    );

    if (!existingSheet) {
      const newSheet = buildEmptyTimesheet(currentUser, selectedMonth);
      const updatedSheets = [...timesheets, newSheet];
      setTimesheets(updatedSheets);
      localStorage.setItem('g_timesheets', JSON.stringify(updatedSheets));
    }
  }, [currentUser, selectedMonth, timesheets]);

  // Handle saving a timesheet (Draft / Submitted)
  const handleSaveTimesheet = async (updatedSheet: Timesheet) => {
    setTimesheets(prev => {
      let list: Timesheet[];
      const exists = prev.some(t => t.id === updatedSheet.id);
      if (exists) {
        list = prev.map(t => t.id === updatedSheet.id ? updatedSheet : t);
      } else {
        list = [...prev, updatedSheet];
      }
      localStorage.setItem('g_timesheets', JSON.stringify(list));
      return list;
    });

    if (isFirebaseConfigured && db && firebaseUser) {
      try {
        await setDoc(doc(db, 'timesheets', updatedSheet.id), updatedSheet);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `timesheets/${updatedSheet.id}`);
      }
    }
  };

  // Handle user creation/modification
  const handleSaveUser = async (savedUser: User) => {
    const finalPin = ensure6DigitPin(savedUser.pin || savedUser.password || '111111');
    const migratedUser: User = {
      ...savedUser,
      pin: finalPin,
      password: finalPin
    };
    let updatedUsers: User[];
    
    if (users.some(u => u.id === migratedUser.id)) {
      updatedUsers = users.map(u => u.id === migratedUser.id ? migratedUser : u);
      
      // Update historicaltimesheets user name cache if renamed!
      const updatedSheets = timesheets.map(t => {
        if (t.userId === migratedUser.id) {
          return { ...t, userName: migratedUser.name };
        }
        return t;
      });
      setTimesheets(updatedSheets);
      localStorage.setItem('g_timesheets', JSON.stringify(updatedSheets));

      if (isFirebaseConfigured && db && firebaseUser) {
        try {
          await setDoc(doc(db, 'users', migratedUser.id), migratedUser);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${migratedUser.id}`);
        }
      }
    } else {
      updatedUsers = [...users, migratedUser];
      if (isFirebaseConfigured && db && firebaseUser) {
        try {
          await setDoc(doc(db, 'users', migratedUser.id), migratedUser);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${migratedUser.id}`);
        }
      }
    }
    
    setUsers(updatedUsers);
    localStorage.setItem('g_users', JSON.stringify(updatedUsers));

    if (migratedUser.id === currentUserId && migratedUser.isActive === false) {
      handleSignOut();
    }
  };

  // Handle full-database JSON importation (restore / fallback migration)
  const handleImportData = async (importedUsers: User[], importedTimesheets: Timesheet[]) => {
    // 1. Update in-memory local state instantly for lightning-fast feedback
    setUsers(importedUsers);
    setTimesheets(importedTimesheets);

    // 2. Persist to standard offline local storage
    localStorage.setItem('g_users', JSON.stringify(importedUsers));
    localStorage.setItem('g_timesheets', JSON.stringify(importedTimesheets));

    // 3. Propagate to active cloud database if connected
    if (isFirebaseConfigured && db && firebaseUser) {
      try {
        setLoadingCloud(true);
        
        // Write all users in parallel
        await Promise.all(
          importedUsers.map(u => setDoc(doc(db!, 'users', u.id), u))
        );
        
        // Write all timesheets in parallel
        await Promise.all(
          importedTimesheets.map(t => setDoc(doc(db!, 'timesheets', t.id), t))
        );
        
        console.log("Import success: all documents mirrored to Firestore Cloud");
      } catch (error) {
        console.error("Error writing imported data to Firestore:", error);
        handleFirestoreError(error, OperationType.WRITE, 'backup_import');
      } finally {
        setLoadingCloud(false);
      }
    }
  };

  // Erase all timesheets from Local Storage & Firestore (useful for backup testing)
  const handleClearTimesheets = async () => {
    setTimesheets([]);
    localStorage.removeItem('g_timesheets');

    if (isFirebaseConfigured && db && firebaseUser) {
      try {
        setLoadingCloud(true);
        const querySnapshot = await getDocs(collection(db, 'timesheets'));
        await Promise.all(
          querySnapshot.docs.map(docSnap => deleteDoc(doc(db!, 'timesheets', docSnap.id)))
        );
        console.log("Deleted all timesheets from Firestore.");
      } catch (error) {
        console.error("Error clearing timesheets from Firestore:", error);
        handleFirestoreError(error, OperationType.WRITE, 'clear_timesheets');
        throw error;
      } finally {
        setLoadingCloud(false);
      }
    }
  };

  // Approver: Approve sheet
  const handleApproveTimesheet = async (timesheetId: string, validatorId: string, validatorName: string) => {
    const originalSheet = timesheets.find(t => t.id === timesheetId);
    if (!originalSheet) return;

    const approvedSheet = {
      ...originalSheet,
      status: 'validated' as const,
      validatedBy: validatorId,
      validatedByName: validatorName,
      validatedAt: new Date().toISOString(),
      rejectionReason: undefined, // Clear out any old reasons
    };

    const list = timesheets.map(t => t.id === timesheetId ? approvedSheet : t);
    setTimesheets(list);
    localStorage.setItem('g_timesheets', JSON.stringify(list));

    if (isFirebaseConfigured && db && firebaseUser) {
      try {
        await setDoc(doc(db, 'timesheets', timesheetId), approvedSheet);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `timesheets/${timesheetId}`);
      }
    }
  };

  // Approver: Reject sheet
  const handleRejectTimesheet = async (timesheetId: string, reason: string) => {
    const originalSheet = timesheets.find(t => t.id === timesheetId);
    if (!originalSheet) return;

    const rejectedSheet = {
      ...originalSheet,
      status: 'rejected' as const,
      rejectionReason: reason,
    };

    const list = timesheets.map(t => t.id === timesheetId ? rejectedSheet : t);
    setTimesheets(list);
    localStorage.setItem('g_timesheets', JSON.stringify(list));

    if (isFirebaseConfigured && db && firebaseUser) {
      try {
        await setDoc(doc(db, 'timesheets', timesheetId), rejectedSheet);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `timesheets/${timesheetId}`);
      }
    }
  };

  // Manual refresh of all timesheets and users to guarantee we have the absolute latest data from Firestore or LocalStorage
  const handleRefreshData = async () => {
    setLoadingCloud(true);
    try {
      if (isFirebaseConfigured && db) {
        // Fetch fresh users
        const usersSnap = await getDocs(collection(db, 'users'));
        const dbUsers: User[] = [];
        usersSnap.forEach((doc) => {
          const data = doc.data() as User;
          const initialDef = INITIAL_USERS.find(iu => iu.id === data.id);
          const rawPin = data.pin || initialDef?.pin || data.password || '111111';
          const resolvedPin = ensure6DigitPin(rawPin);
          dbUsers.push({
            ...data,
            isEmployee: data.isEmployee ?? true,
            isValidator: data.isValidator ?? (data.role === 'validator'),
            isAdmin: data.isAdmin ?? (data.role === 'validator'),
            isActive: data.isActive ?? true,
            pin: resolvedPin,
            password: resolvedPin
          });
        });
        if (dbUsers.length > 0) {
          setUsers(dbUsers);
          localStorage.setItem('g_users', JSON.stringify(dbUsers));
        }

        // Fetch fresh timesheets
        const sheetsSnap = await getDocs(collection(db, 'timesheets'));
        const dbSheets: Timesheet[] = [];
        sheetsSnap.forEach((doc) => {
          dbSheets.push(doc.data() as Timesheet);
        });
        setTimesheets(dbSheets);
        localStorage.setItem('g_timesheets', JSON.stringify(dbSheets));
      } else {
        // Fallback reload from local storage
        const savedUsers = localStorage.getItem('g_users');
        const savedSheets = localStorage.getItem('g_timesheets');
        if (savedUsers) setUsers(JSON.parse(savedUsers));
        if (savedSheets) setTimesheets(JSON.parse(savedSheets));
      }
    } catch (error) {
      console.error("Error manual refreshing:", error);
    } finally {
      setLoadingCloud(false);
    }
  };

  // Find or create current month sheet to send to the Submission element
  const currentSubmissionSheet = timesheets.find(
    t => t.userId === currentUserId && t.monthDate === selectedMonth
  ) || (currentUser ? buildEmptyTimesheet(currentUser, selectedMonth) : null);

  // Statistics summaries for dashboard
  const totalEmployees = users.length;
  const pendingSubmissions = timesheets.filter(t => t.status === 'submitted').length;
  const totalValidatedThisCycle = timesheets.filter(t => t.status === 'validated' && t.monthDate === selectedMonth).length;

  if (!isAuthenticated) {
    return (
      <LoginScreen
        users={users}
        onLogin={(id) => {
          setCurrentUserId(id);
          setIsAuthenticated(true);
        }}
        onSignUp={(newUser) => {
          handleSaveUser(newUser);
          setCurrentUserId(newUser.id);
          setIsAuthenticated(true);
        }}
        onUpdateUser={handleSaveUser}
        isFirebaseActive={isFirebaseConfigured}
        onSignInWithGoogle={handleSignIn}
        authError={authError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-slate-800 flex flex-col font-sans selection:bg-indigo-100">
      
      {/* GLOBAL BANNER */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            
            {/* Logo Group */}
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 text-white p-2 rounded-xl shadow-xs">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-slate-900 text-base block tracking-tight">GestHoraire <span className="text-slate-400 font-normal">Pro</span></span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Portail de Saisie & Validation</span>
              </div>
            </div>

            {/* Profile selection display */}
            <div className="flex items-center gap-4">
              {/* Database indicator */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                <Database className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  {isFirebaseConfigured 
                    ? (firebaseUser ? 'Cloud Actif' : 'Cloud Désactivé (Local)')
                    : 'Stockage Local & Session'}
                </span>
                {isFirebaseConfigured && firebaseUser && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                )}
              </div>

              {/* Global Lougout Button */}
              <button
                id="global-signout-btn"
                onClick={handleSignOut}
                className="text-xs bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800 font-extrabold px-4.5 py-1.5 rounded-xl transition border border-slate-250 cursor-pointer shadow-2xs"
                title="Se déconnecter"
              >
                Déconnexion
              </button>

              {currentUser && (
                <div className="flex items-center gap-3 text-right bg-slate-50 p-2 rounded-xl border border-slate-200/60 mt-0.5">
                  <div className="hidden sm:block">
                    <span className="text-xs font-extrabold text-slate-800 block leading-tight">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase leading-none block mt-1">
                      {`👤 Salarié${currentUser.isValidator ? ' • 👑 Validateur' : ''}${currentUser.isAdmin ? ' • ⚙️ Admin' : ''}${currentUser.isActive === false ? ' • 🔒 Désactivé' : ''}`}
                    </span>
                  </div>
                  
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm border-2 border-indigo-200">
                    {currentUser.name.charAt(0)}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </header>
      {/* MAIN CONTAINER */}
      <main className="grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* AUTHENTICATION ERROR BANNER (Bento Style) */}
        {authError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-3xl flex items-start gap-4 shadow-xs relative transition-all duration-300">
            <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 pr-6">
              <h4 className="font-extrabold text-rose-950 text-sm tracking-tight mb-1">Échec de la connexion</h4>
              <p className="text-xs font-semibold text-rose-800 leading-relaxed max-w-2xl">{authError}</p>
            </div>
            <button
              onClick={() => setAuthError(null)}
              className="absolute top-5 right-5 text-rose-400 hover:text-rose-700 transition-colors p-1.5 rounded-full hover:bg-rose-100/60 cursor-pointer"
              title="Fermer"
            >
              <X className="w-4 h-4 shadow-2xs" />
            </button>
          </div>
        )}
        
        {/* STATS OVERVIEW CARDS (Bento Grid Style) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-300 flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Effectif total</span>
              <span className="text-xl font-black text-slate-800">{totalEmployees} salariés</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-300 flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Saisies à valider</span>
              <span className="text-xl font-black text-slate-800">{pendingSubmissions} en cours</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-300 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Validés ce mois</span>
              <span className="text-xl font-black text-slate-800">{totalValidatedThisCycle} validé(s)</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-300 flex items-center gap-4">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Période active</span>
              <span className="text-sm font-bold text-slate-800 leading-tight block truncate">
                {selectedMonth ? formatFrenchMonth(selectedMonth) : 'Mois en cours'}
              </span>
            </div>
          </div>
        </div>

        {/* TABS SELECTOR (Pill / Bento style bar) */}
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200 flex inline-flex w-max shadow-sm max-w-full overflow-x-auto">
          <button
            id="tab-submission"
            onClick={() => setActiveTab('submission')}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer ${
              activeTab === 'submission'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Saisie de mes Horaires
          </button>
          
          {currentUser?.isValidator && (
            <button
              id="tab-validation"
              onClick={() => setActiveTab('validation')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer ${
                activeTab === 'validation'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              Validation Équipe
              {pendingSubmissions > 0 && (
                <span className="bg-rose-500 text-white rounded-full text-[10px] font-bold px-1.5 py-0.5 shrink-0 animate-pulse ml-1">
                  {pendingSubmissions}
                </span>
              )}
            </button>
          )}

          <button
            id="tab-history"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4 text-indigo-550" />
            {currentUser?.isValidator ? "Historique des fiches" : "Mon Historique"}
          </button>

          {currentUser?.isAdmin && (
            <button
              id="tab-users"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              Collaborateurs
            </button>
          )}

          <button
            id="tab-profile"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Mon Compte
          </button>
        </div>

        {/* TAB VIEWS RENDERING */}
        <div id="active-tab-panel" className="transition-all duration-300">
          
          {activeTab === 'submission' && currentUser && currentSubmissionSheet && (
            <TimesheetSubmission
              currentUser={currentUser}
              timesheet={currentSubmissionSheet}
              onSaveTimesheet={handleSaveTimesheet}
              onSelectMonth={setSelectedMonth}
            />
          )}

          {activeTab === 'validation' && currentUser?.isValidator && (
            <ValidationPanel
              currentUserId={currentUserId}
              timesheets={timesheets}
              users={users}
              onApproveTimesheet={handleApproveTimesheet}
              onRejectTimesheet={handleRejectTimesheet}
            />
          )}

          {activeTab === 'history' && currentUser && (
            <HistoryPanel
              timesheets={timesheets}
              users={users}
              currentUser={currentUser}
              onRefreshData={handleRefreshData}
            />
          )}

          {activeTab === 'users' && currentUser?.isAdmin && (
            <UserManagement
              users={users}
              onSaveUser={handleSaveUser}
            />
          )}

          {activeTab === 'profile' && currentUser && (
            <UserProfile
              currentUser={currentUser}
              timesheets={timesheets}
              allUsers={users}
              allTimesheets={timesheets}
              onImportData={handleImportData}
              onClearTimesheets={handleClearTimesheets}
              onSaveUser={handleSaveUser}
              isFirebaseActive={isFirebaseConfigured && !!firebaseUser}
            />
          )}

        </div>
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>&copy; 2026 GestHoraire. Tous droits réservés.</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-medium text-slate-300">|</span>
            <span className="italic">Destiné à l'usage interne de l'entreprise</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
