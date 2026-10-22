import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.15C3.26 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.99-3.15z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.99 3.15c.95-2.85 3.6-4.96 6.72-4.96z" />
    </svg>
  );
}

export default function SignUpScreen({ onBack, onSignIn, onSubmitSignUp, selectedExperience }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Clear inputs on component mount so browser autofill doesn't prefill across sign out / sign up
  React.useEffect(() => {
    setFullName('');
    setEmail('');
    setPassword('');
    setAgreedToTerms(false);
    setErrorMessage('');
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }
    if (password.trim().length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    setLoading(true);
    try {
      // 1. Sign up user via Supabase Auth
      const skillLevelValue = (selectedExperience && selectedExperience !== 'Skip') ? selectedExperience : null;
      
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            skill_level: skillLevelValue,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data?.user) {
        if (onSubmitSignUp) {
          onSubmitSignUp({ user: data.user, session: data.session });
        }
      }
    } catch (err) {
      console.error('Sign Up Error:', err);
      let msg = err.message || 'Failed to create account. Please try again.';
      if (msg.includes('User already registered')) {
        msg = 'An account with this email address already exists. Please Sign In.';
      } else if (msg.includes('Password should be at least')) {
        msg = 'Password should be at least 6 characters.';
      } else if (msg.includes('invalid email')) {
        msg = 'Please enter a valid email address.';
      }
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSignIn = () => {
    const guestUser = {
      id: `guest_${Date.now()}`,
      email: 'guest@strategic-chess.local',
      user_metadata: {
        full_name: fullName.trim() || 'Guest Player',
        skill_level: selectedExperience && selectedExperience !== 'Skip' ? selectedExperience : 'Intermediate',
        rating: 1200
      }
    };
    const guestSession = {
      access_token: `guest_token_${Date.now()}`,
      user: guestUser,
      expires_at: Math.floor(Date.now() / 1000) + 86400 * 7
    };
    const guestProfile = {
      id: guestUser.id,
      full_name: guestUser.user_metadata.full_name,
      skill_level: guestUser.user_metadata.skill_level,
      rating: 1200
    };

    localStorage.setItem('guest_session', JSON.stringify({
      user: guestUser,
      session: guestSession,
      profile: guestProfile
    }));

    if (onSubmitSignUp) {
      onSubmitSignUp({ user: guestUser, session: guestSession });
    }
  };

  const handleGoogleClick = async () => {
    setErrorMessage('');
    if (!isSupabaseConfigured) {
      setErrorMessage(
        'Google Sign-In is unavailable because Supabase is not configured yet in frontend/.env. Set your real VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY to use Google Auth, or click "Continue as Guest" below to play immediately.'
      );
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error('Google OAuth Error:', err);
      let msg = err.message || 'Google Auth failed.';
      if (msg.includes('provider is not enabled') || msg.includes('Unsupported provider')) {
        msg = 'Google Sign-In is not enabled on your Supabase project yet. Please use Email/Password sign-up, or enable Google Provider in Supabase Dashboard (Authentication -> Providers -> Google).';
      }
      setErrorMessage(msg);
    }
  };

  return (
    <div style={{
      width: '100vw',
      minHeight: '100vh',
      minHeight: '100dvh',
      backgroundColor: '#000000',
      color: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflowX: 'hidden'
    }}>
      {/* Left-Side Moving King Video Background (Preserved Exactly on Left) */}
      <div className="signup-video-container">
        <video
          src="/Sign_Up_page_King_Moving.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="signup-video-element"
        />
        <div className="signup-video-overlay" />
      </div>

      {/* Responsive Viewport Content Container */}
      <div className="signup-viewport" style={{ zIndex: 10 }}>

        {/* Top Header Bar */}
        <header className="signup-header">
          {/* Circular Back Button */}
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={onBack}
            className="welcome-back-btn signup-back-btn"
            title="Back"
          >
            <ChevronLeft size={22} strokeWidth={2.5} />
          </motion.button>
        </header>

        {/* 2-Column Body Layout (Left Title/Video, Right Form Partition) */}
        <div className="signup-body">

          {/* Left Column: Heading + Subtitle + Triple Line Accent */}
          <motion.div
            initial={{ opacity: 0, x: -25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="signup-left-col"
          >
            <h1 className="signup-title" style={{ color: '#FFFFFF' }}>
              CREATE<br />
              ACCOUNT
            </h1>
            <p className="signup-subtitle" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
              Join Strategic Chess and start<br />
              improving your skills today.
            </p>

            {/* Triple Horizontal Line Motif Accent */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '52px', marginTop: '0.35rem' }}>
              <div style={{ width: '52px', height: '2.5px', backgroundColor: '#FFFFFF', borderRadius: '1px' }} />
              <div style={{ width: '40px', height: '2.5px', backgroundColor: '#FFFFFF', borderRadius: '1px' }} />
              <div style={{ width: '28px', height: '2.5px', backgroundColor: '#FFFFFF', borderRadius: '1px' }} />
            </div>
          </motion.div>

          {/* Right Column: Form Partition Container */}
          <motion.div
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className="signup-right-col"
          >
            <div className="signup-form-card">
              <form onSubmit={handleSubmit} className="signup-form" autoComplete="none">
                {/* Dummy hidden inputs to intercept Chrome aggressive autofill */}
                <input type="text" name="chrome_prevent_autofill_signup" style={{ display: 'none' }} tabIndex={-1} readOnly />
                <input type="password" name="chrome_prevent_autofill_signup_pass" style={{ display: 'none' }} tabIndex={-1} readOnly />

                {errorMessage && (
                  <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#fca5a5',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                    lineHeight: '1.4'
                  }}>
                    {errorMessage}
                  </div>
                )}


                {/* Field 1: FULL NAME */}
                <div className="signup-field-group">
                  <label className="signup-label">FULL NAME</label>
                  <input
                    type="text"
                    name="chess_signup_fullname_field"
                    autoComplete="new-password"
                    readOnly
                    onFocus={(e) => e.target.removeAttribute('readonly')}
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="signup-input"
                    required
                  />
                </div>

                {/* Field 2: EMAIL */}
                <div className="signup-field-group">
                  <label className="signup-label">EMAIL</label>
                  <input
                    type="email"
                    name="chess_signup_email_field"
                    autoComplete="new-password"
                    readOnly
                    onFocus={(e) => e.target.removeAttribute('readonly')}
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="signup-input"
                    required
                  />
                </div>

                {/* Field 3: PASSWORD */}
                <div className="signup-field-group">
                  <label className="signup-label">PASSWORD</label>
                  <div style={{ position: 'relative', width: '100%' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="chess_signup_password_field"
                      autoComplete="new-password"
                      readOnly
                      onFocus={(e) => e.target.removeAttribute('readonly')}
                      placeholder="Create a password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="signup-input"
                      style={{ paddingRight: '42px' }}
                      required
                    />


                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="signup-password-toggle"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Checkbox: Terms & Privacy Policy */}
                <div className="signup-checkbox-row">
                  <input
                    type="checkbox"
                    id="signup-terms"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="signup-checkbox"
                  />
                  <label htmlFor="signup-terms" className="signup-checkbox-text">
                    I agree to the <span className="signup-link">Terms of Service</span> and <span className="signup-link">Privacy Policy</span>
                  </label>
                </div>

                {/* Primary Action Button */}
                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  type="submit"
                  disabled={loading}
                  className="signup-submit-btn"
                >
                  <span>{loading ? 'CREATING...' : 'CREATE ACCOUNT'}</span>
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>→</span>
                </motion.button>
              </form>

              {/* Separator & Google OAuth Button */}
              <div className="signup-social-section">
                <div className="signup-divider">
                  <span className="signup-divider-line" />
                  <span className="signup-divider-text">OR CONTINUE WITH</span>
                  <span className="signup-divider-line" />
                </div>

                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  type="button"
                  onClick={handleGoogleClick}
                  className="signup-google-btn"
                >
                  <GoogleIcon />
                  <span>Continue with Google</span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  type="button"
                  onClick={handleGuestSignIn}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    marginTop: '0.65rem',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                    color: '#E4E4E7',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    backdropFilter: 'blur(8px)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>♟️</span>
                  <span>Continue as Guest (Instant Play)</span>
                </motion.button>
              </div>
            </div>
          </motion.div>

        </div>

        {/* Bottom Footer Bar */}
        <footer className="signup-footer">
          {/* 2x2 Checkerboard Icon Accent */}
          <div className="checker-accent">
            <div className="checker-box" style={{ backgroundColor: '#FFFFFF' }} />
            <div className="checker-box" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <div className="checker-box" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }} />
            <div className="checker-box" style={{ backgroundColor: '#FFFFFF' }} />
          </div>

          {/* Right Link: ALREADY HAVE AN ACCOUNT? SIGN IN */}
          <div className="signup-footer-signin">
            <span className="signup-footer-text">ALREADY HAVE AN ACCOUNT?</span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSignIn}
              className="signup-signin-btn"
            >
              SIGN IN
            </motion.button>
          </div>
        </footer>

      </div>
    </div>
  );
}
