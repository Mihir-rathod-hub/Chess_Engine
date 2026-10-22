import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import LandingScreen from './components/LandingScreen';
import WelcomeScreen from './components/WelcomeScreen';
import ExperienceScreen from './components/ExperienceScreen';
import SignUpScreen from './components/SignUpScreen';
import SignInScreen from './components/SignInScreen';
import ForgotPasswordScreen from './components/ForgotPasswordScreen';
import DashboardScreen from './components/DashboardScreen';
import ProtectedRoute from './routes/ProtectedRoute';
import PublicRoute from './routes/PublicRoute';

export default function App() {
  const navigate = useNavigate();
  const [userExperience, setUserExperience] = useState(null);

  // Supabase Auth State
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Fetch profile row from public.profiles table with metadata fallback
  const fetchProfile = async (currentUser) => {
    if (!currentUser) return;
    const userId = currentUser.id;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!error && data) {
        setProfile(data);
      } else {
        // If table permissions or network error occurs, fall back to authoritative auth metadata without fabricating ratings
        const metaRating = typeof currentUser.user_metadata?.rating === 'number'
          ? currentUser.user_metadata.rating
          : null;
        setProfile({
          id: userId,
          full_name: currentUser.user_metadata?.full_name || currentUser.email?.split('@')[0] || 'Player',
          skill_level: currentUser.user_metadata?.skill_level || 'Intermediate',
          rating: metaRating
        });
      }
    } catch (err) {
      console.warn('Could not fetch user profile:', err);
    }
  };

  useEffect(() => {
    let mounted = true;

    // Safety timeout: Never stay stuck on loading screen longer than 600ms
    const safetyTimer = setTimeout(() => {
      if (mounted) {
        setLoadingSession(false);
      }
    }, 600);

    // Check for existing guest session in localStorage first
    const savedGuest = localStorage.getItem('guest_session');
    if (savedGuest) {
      try {
        const parsed = JSON.parse(savedGuest);
        if (parsed?.user && parsed?.session) {
          setSession(parsed.session);
          setUser(parsed.user);
          setProfile(parsed.profile || {
            id: parsed.user.id,
            full_name: parsed.user.user_metadata?.full_name || 'Guest Player',
            skill_level: parsed.user.user_metadata?.skill_level || 'Intermediate',
            rating: 1200
          });
          setLoadingSession(false);
          clearTimeout(safetyTimer);
          return;
        }
      } catch (e) {}
    }

    // 1. Initial session check on app load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setSession(session);
        setUser(session.user);
        fetchProfile(session.user);
      }
      setLoadingSession(false);
      clearTimeout(safetyTimer);
    }).catch(err => {
      console.warn("Session check notice:", err);
      if (mounted) {
        setLoadingSession(false);
        clearTimeout(safetyTimer);
      }
    });

    // 2. Auth state listener for sign in / sign out / token refreshes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session) {
        localStorage.removeItem('guest_session');
        setSession(session);
        setUser(session.user);
        await fetchProfile(session.user);
      } else {
        const currentGuest = localStorage.getItem('guest_session');
        if (!currentGuest) {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      }
      setLoadingSession(false);
      clearTimeout(safetyTimer);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const handleStartJourney = () => {
    navigate('/welcome');
  };

  const handleOpenSignIn = () => {
    navigate('/signin');
  };

  const handleSignUp = () => {
    navigate('/experience');
  };

  const handleSelectExperience = (level) => {
    setUserExperience(level);
    navigate('/signup');
  };

  const handleSkipExperience = () => {
    setUserExperience('Skip');
    navigate('/signup');
  };

  const handleSubmitSignUpSuccess = ({ user, session }) => {
    if (session) {
      setSession(session);
      setUser(user);
      fetchProfile(user.id);
      navigate('/dashboard');
    } else {
      alert('Account created! Please check your email if confirmation is required, or sign in.');
      navigate('/signin');
    }
  };

  const handleSignInSuccess = ({ user, session }) => {
    setSession(session);
    setUser(user);
    if (user?.id) {
      fetchProfile(user.id);
    }
    navigate('/dashboard');
  };

  const handleLogout = async () => {
    localStorage.removeItem('guest_session');
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout Error:', err);
    } finally {
      setSession(null);
      setUser(null);
      setProfile(null);
      navigate('/signin');
    }
  };

  return (
    <div style={{ width: '100vw', minHeight: '100vh', minHeight: '100dvh', overflowX: 'hidden' }}>
      <Routes>
        {/* Unauthenticated / Public Routes */}
        <Route element={<PublicRoute session={session} loadingSession={loadingSession} />}>
          <Route 
            path="/" 
            element={
              <LandingScreen 
                onStartJourney={handleStartJourney}
                onSignIn={handleOpenSignIn}
              />
            } 
          />
          <Route 
            path="/welcome" 
            element={
              <WelcomeScreen 
                onSignUp={handleSignUp}
                onSignIn={handleOpenSignIn}
                onBack={() => navigate('/')}
              />
            } 
          />
          <Route 
            path="/experience" 
            element={
              <ExperienceScreen 
                onSelectExperience={handleSelectExperience}
                onSkip={handleSkipExperience}
                onBack={() => navigate('/welcome')}
              />
            } 
          />
          <Route 
            path="/signup" 
            element={
              <SignUpScreen 
                onBack={() => navigate('/experience')}
                onSignIn={handleOpenSignIn}
                onSubmitSignUp={handleSubmitSignUpSuccess}
                selectedExperience={userExperience}
              />
            } 
          />
          <Route 
            path="/signin" 
            element={
              <SignInScreen 
                onBack={() => navigate('/')}
                onGoToSignUp={() => navigate('/experience')}
                onForgotPassword={() => navigate('/forgot-password')}
                onSignInSuccess={handleSignInSuccess}
              />
            } 
          />
          <Route 
            path="/forgot-password" 
            element={
              <ForgotPasswordScreen 
                onGoToSignIn={() => navigate('/signin')}
              />
            } 
          />
        </Route>

        {/* Authenticated / Protected Dashboard Routes */}
        <Route element={<ProtectedRoute session={session} loadingSession={loadingSession} />}>
          <Route 
            path="/dashboard" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/play" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/play/*" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/puzzles" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/puzzles/*" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/learn" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/learn/*" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/books" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/news" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/leaderboard" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/profile" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/settings" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
          <Route 
            path="/tournament/*" 
            element={
              <DashboardScreen 
                user={user}
                profile={profile}
                onLogout={handleLogout}
                onRefreshProfile={() => fetchProfile(user)}
              />
            } 
          />
        </Route>

        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to={session ? "/dashboard" : "/"} replace />} />
      </Routes>
    </div>
  );
}

