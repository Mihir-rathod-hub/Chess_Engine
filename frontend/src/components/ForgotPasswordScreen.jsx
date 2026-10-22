import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function ForgotPasswordScreen({ onGoToSignIn }) {
  const [sent, setSent] = useState(false);

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
      backgroundColor: '#050505',
      display: 'flex',
      flexDirection: 'column',
      padding: '6.5rem 1.5rem 2rem 1.5rem'
    }}>
      <main style={{
        maxWidth: '460px',
        width: '100%',
        margin: '0 auto',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '1.75rem'
      }}>
        <div>
          <h1 style={{
            fontFamily: "var(--font-title)",
            fontSize: 'clamp(2.5rem, 5vw, 3.5rem)',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#FFFFFF',
            marginBottom: '0.5rem'
          }}>
            FORGOT PASSWORD?
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>
            No worries! Enter your email and we'll send you instructions to reset your password.
          </p>
        </div>

        {sent ? (
          <div style={{
            backgroundColor: '#0F0F11',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            padding: '1.5rem',
            textAlign: 'center'
          }}>
            <h3 style={{ color: '#FFFFFF', marginBottom: '0.5rem' }}>Reset Link Sent!</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              Check your inbox for instructions to reset your password.
            </p>
            <button onClick={onGoToSignIn} className="btn-primary" style={{ width: '100%' }}>
              BACK TO SIGN IN
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
                EMAIL
              </label>
              <input
                type="email"
                placeholder="Enter your email address"
                required
                style={{
                  width: '100%',
                  padding: '0.9rem 1rem',
                  backgroundColor: '#0F0F11',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: '#FFFFFF',
                  fontSize: '0.95rem',
                  outline: 'none'
                }}
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              className="btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              <span>SEND RESET LINK</span>
              <span>→</span>
            </motion.button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button onClick={onGoToSignIn} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer' }}>
            ← BACK TO SIGN IN
          </button>
        </div>
      </main>
    </div>
  );
}
