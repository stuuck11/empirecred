import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';

// Components
import Registration from './components/Registration';
import Dashboard from './components/Dashboard';
import LoanSimulation from './components/LoanSimulation';
import FacialVerification from './components/FacialVerification';
import AdminPanel from './components/AdminPanel';
import LandingPage from './components/LandingPage';
import EmailVerification from './components/EmailVerification';
import Profile from './components/Profile';
import Statement from './components/Statement';
import ReservaEmpireCred from './components/ReservaEmpireCred';
import PinScreen from './components/PinScreen';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfUse from './components/TermsOfUse';

function PageLoader() {
  const location = useLocation();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 1200); // Slightly longer to see the animation
    return () => clearTimeout(timer);
  }, [location.pathname]);

  if (!loading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/90 backdrop-blur-md">
      <div className="flex flex-col items-center space-y-4">
        <div className="relative w-20 h-20">
          {/* The "spinning green bar" */}
          <div className="absolute inset-0 border-[3px] border-emerald-500/20 rounded-full"></div>
          <motion.div 
            className="absolute inset-0 border-[3px] border-emerald-500 border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] animate-pulse">Carregando...</p>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [registrationFinished, setRegistrationFinished] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        setUser(firebaseUser);
        setIsEmailVerified(firebaseUser.emailVerified);
        
        // Listen to profile changes in real-time
        const profileRef = doc(db, 'users', firebaseUser.uid);
        unsubscribeProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching profile:", error);
          setLoading(false);
        });
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const updateLastSeen = async () => {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          lastSeen: new Date().toISOString()
        });
      } catch (e) {
        console.error("Error updating lastSeen:", e);
      }
    };
    updateLastSeen();
    const interval = setInterval(updateLastSeen, 60000); // Every minute
    return () => clearInterval(interval);
  }, [user]);

  const loginLocal = (userData: any, profileData: UserProfile) => {
    setUser(userData);
    setProfile(profileData);
    setIsEmailVerified(userData.emailVerified);
    setRegistrationFinished(true);
  };

  const logoutLocal = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 border-[3px] border-emerald-500/20 rounded-full"></div>
            <motion.div 
              className="absolute inset-0 border-[3px] border-emerald-500 border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] animate-pulse">Carregando EmpireCred...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <PageLoader />
      <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
        {user && profile && profile.fullName && !pinVerified ? (
          <PinScreen profile={profile} onVerified={() => setPinVerified(true)} onLogout={logoutLocal} />
        ) : (
          <Routes>
            <Route path="/" element={!user ? <LandingPage onLogin={loginLocal} /> : <Navigate to="/dashboard" />} />
            <Route path="/register" element={user && profile && profile.fullName ? <Navigate to="/dashboard" /> : <Registration onRegister={loginLocal} />} />
            
            <Route 
              path="/dashboard" 
              element={user ? (
                profile && profile.fullName ? (
                  <Dashboard profile={profile} onLogout={logoutLocal} setProfile={setProfile} />
                ) : (
                  <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
                    <div className="flex flex-col items-center space-y-6 max-w-sm text-center">
                      <div className="relative w-20 h-20">
                        <div className="absolute inset-0 border-[3px] border-emerald-500/20 rounded-full"></div>
                        <motion.div 
                          className="absolute inset-0 border-[3px] border-emerald-500 border-t-transparent rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em] animate-pulse">Finalizando seu cadastro...</p>
                        <p className="text-xs text-zinc-500">Isso pode levar alguns instantes enquanto configuramos sua conta com segurança.</p>
                      </div>
                      
                      <div className="pt-4 border-t border-zinc-100 w-full">
                        <p className="text-[10px] text-zinc-400 mb-4">Se demorar mais de 30 segundos, pode haver um problema de conexão ou permissão.</p>
                        <button 
                          onClick={logoutLocal}
                          className="text-xs font-bold text-red-500 hover:text-red-600 transition-colors"
                        >
                          Sair e tentar novamente
                        </button>
                      </div>
                    </div>
                  </div>
                )
              ) : <Navigate to="/" />} 
            />
            
            <Route 
              path="/simulate" 
              element={user && profile ? <LoanSimulation profile={profile} setProfile={setProfile} /> : <Navigate to="/" />} 
            />
            
            <Route 
              path="/verification" 
              element={user && profile ? <FacialVerification profile={profile} setProfile={setProfile} /> : <Navigate to="/" />} 
            />

            <Route 
              path="/profile" 
              element={user && profile ? <Profile profile={profile} onLogout={logoutLocal} /> : <Navigate to="/" />} 
            />

            <Route 
              path="/statement" 
              element={user && profile ? <Statement profile={profile} /> : <Navigate to="/" />} 
            />

            <Route 
              path="/reserva" 
              element={user && profile ? <ReservaEmpireCred profile={profile} /> : <Navigate to="/" />} 
            />

            <Route 
              path="/change-pin" 
              element={user && profile ? <PinScreen profile={profile} onVerified={() => setPinVerified(true)} onLogout={logoutLocal} initialMode="change_request" /> : <Navigate to="/" />} 
            />
            
            <Route 
              path="/admin" 
              element={user && (profile?.role === 'admin' || user.email === 'sophiabeginsky@gmail.com' || user.email === 'mjpelma.cardoso75@gmail.com') ? <AdminPanel profile={profile} /> : <Navigate to="/dashboard" />} 
            />

            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfUse />} />
          </Routes>
        )}
      </div>
    </Router>
  );
}
