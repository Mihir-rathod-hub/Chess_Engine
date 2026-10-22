import React from 'react';
import { motion } from 'framer-motion';
import SeamlessVideoBackground from './SeamlessVideoBackground';

export default function LandingScreen({ onStartJourney, onSignIn }) {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      height: '100dvh',
      backgroundColor: '#000000',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      color: '#FFFFFF'
    }}>
      {/* Seamless Dual-Video Crossfade Loop Background */}
      <SeamlessVideoBackground src="/Landing_Page_Animation.mp4" fadeDuration={0.8} />

      {/* Dark Gradient Overlay for Crisp Text Contrast */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at 30% 50%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.85) 100%)',
        zIndex: 2,
        pointerEvents: 'none'
      }} />

      {/* Main Viewport Container (100vh Fits Completely Above Fold) */}
      <div className="landing-viewport" style={{ zIndex: 10 }}>
        
        {/* Top Header Bar */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: '55px',
          zIndex: 20
        }}>
          {/* Brand Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
            <img
              src="/official_logo.png"
              alt="Strategic Chess Logo"
              style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'contain' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.12em', color: '#FFFFFF' }}>
                STRATEGIC
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.18em', color: '#FFFFFF' }}>
                CHESS
              </span>
            </div>
          </div>

          {/* Header Controls */}
          <div>
            <button
              onClick={onSignIn}
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '4px',
                color: '#FFFFFF',
                fontSize: '0.8rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                padding: '0.55rem 1.35rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#FFFFFF';
                e.target.style.background = '#FFFFFF';
                e.target.style.color = '#000000';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                e.target.style.background = 'rgba(0, 0, 0, 0.4)';
                e.target.style.color = '#FFFFFF';
              }}
            >
              SIGN IN
            </button>
          </div>
        </header>

        {/* Hero Body Layout */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 0,
          zIndex: 10,
          margin: '0.5rem 0'
        }}>

          {/* Left-Aligned CHESS Title + Slogan + CTA Container */}
          <motion.div
            initial={{ opacity: 0, x: -25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              height: '100%',
              maxHeight: '68vh',
              gap: '1rem',
              maxWidth: '650px'
            }}
          >
            {/* Left-Aligned Massive "CHESS" Title */}
            <div>
              <h1 className="hero-title">
                CHESS
              </h1>
            </div>

            {/* Tagline Block with Vertical Line Accent */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              paddingLeft: '0.2rem'
            }}>
              <div style={{
                borderLeft: '2.5px solid #FFFFFF',
                paddingLeft: '1.4rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'clamp(1.15rem, 2.4vh, 1.75rem)',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  lineHeight: 1.2,
                  color: '#FFFFFF',
                  textTransform: 'uppercase'
                }}>
                  LOGIC.<br />
                  FOCUS.<br />
                  VICTORY.
                </div>
                <p style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'clamp(0.85rem, 1.4vh, 1rem)',
                  fontWeight: 400,
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.02em'
                }}>
                  Every Move Shapes Your Mind.
                </p>
              </div>

              {/* 2x2 Checkerboard Accent */}
              <div className="checker-accent" style={{ marginLeft: '1.4rem' }}>
                <div className="checker-box checker-white" />
                <div className="checker-box checker-transparent" />
                <div className="checker-box checker-transparent" />
                <div className="checker-box checker-white" />
              </div>
            </div>

            {/* Prominent CTA Button */}
            <div style={{ marginTop: '0.5rem', width: '100%', maxWidth: '480px' }}>
              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={onStartJourney}
                className="btn-primary"
                style={{ width: '100%' }}
              >
                <span>START YOUR JOURNEY</span>
                <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>→</span>
              </motion.button>
            </div>
          </motion.div>

        </div>

      </div>
    </div>
  );
}
