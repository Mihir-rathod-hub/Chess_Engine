import React from 'react';

export default function Header({ onSignInClick, currentScreen }) {
  return (
    <header style={{
      width: '100%',
      padding: '1.5rem 2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'absolute',
      top: 0,
      left: 0,
      zIndex: 50,
      background: 'linear-gradient(to bottom, rgba(5,5,5,0.8), rgba(5,5,5,0))'
    }}>
      {/* Brand Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
        <img
          src="/official_logo.png"
          alt="Strategic Chess Logo"
          style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'contain' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
          <span style={{
            fontSize: '0.95rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            color: '#FFFFFF',
            fontFamily: 'var(--font-body)'
          }}>STRATEGIC</span>
          <span style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: '#FFFFFF',
            fontFamily: 'var(--font-body)'
          }}>CHESS</span>
        </div>
      </div>

      {/* Right Controls: Sign In Button */}
      <div>
        {currentScreen !== 4 && (
          <button 
            onClick={onSignInClick}
            className="btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.55rem 1.35rem' }}
          >
            SIGN IN
          </button>
        )}
      </div>
    </header>
  );
}
