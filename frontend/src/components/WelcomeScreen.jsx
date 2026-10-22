import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

export default function WelcomeScreen({ onSignUp, onSignIn, onBack }) {
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
      {/* Responsive Full-Screen Background Image */}
      <img
        src="/Welcome_Page_Background.jpg"
        alt="Welcome Page Full Background"
        className="welcome-bg-image"
        style={{ filter: 'brightness(0.5) contrast(1.1)' }}
      />

      {/* Soft Mobile Backdrop Overlay for 100% Text Legibility */}
      <div className="welcome-mobile-overlay" />

      {/* Responsive Viewport Content Container */}
      <div className="welcome-viewport">

        {/* Top Header Bar */}
        <header className="welcome-header">
          {/* Circular Back Button */}
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={onBack}
            className="welcome-back-btn"
            title="Back to Landing Page"
          >
            <ChevronLeft size={22} strokeWidth={2.5} />
          </motion.button>
        </header>

        {/* Hero Body Layout: Left Content Column */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: 0,
          margin: '0.25rem 0'
        }}>

          {/* Left Column: Heading, Badge, Copy */}
          <motion.div
            initial={{ opacity: 0, x: -25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '1.25rem',
              maxWidth: '580px'
            }}
          >
            {/* Giant Condensed "WELCOME TO STRATEGIC CHESS" Header */}
            <div>
              <h1 className="welcome-title" style={{ color: '#FFFFFF' }}>
                WELCOME TO<br />
                STRATEGIC<br />
                CHESS
              </h1>
            </div>

            {/* Solid Black Badge: PLAY • LEARN • COMPETE */}
            <div style={{
              display: 'inline-block',
              backgroundColor: '#0A0A0C',
              border: '1px solid #1A1A1D',
              color: '#FFFFFF',
              padding: '0.55rem 1.25rem',
              width: 'max-content'
            }}>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'clamp(0.75rem, 1.2vh, 0.9rem)',
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase'
              }}>
                PLAY • LEARN • COMPETE
              </span>
            </div>

            {/* Sub-headline Copy */}
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'clamp(0.9rem, 1.5vh, 1.1rem)',
              fontWeight: 500,
              color: '#A1A1AA',
              lineHeight: 1.45,
              maxWidth: '420px'
            }}>
              Sharpen your mind, challenge opponents, and become a true chess master.
            </p>

            {/* Triple Horizontal Line Motif Accent */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '45px', marginTop: '0.25rem' }}>
              <div style={{ width: '45px', height: '2px', backgroundColor: '#FFFFFF' }} />
              <div style={{ width: '35px', height: '2px', backgroundColor: '#FFFFFF' }} />
              <div style={{ width: '25px', height: '2px', backgroundColor: '#FFFFFF' }} />
            </div>
          </motion.div>

        </div>

        {/* Bottom CTA Row: Two Pixel-Perfect Seamless Split Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          style={{ width: '100%', zIndex: 20 }}
        >
          <div className="welcome-cta-row">
            
            {/* Option 1: New here? -> SIGN UP */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
              flex: 1,
              minWidth: '240px'
            }}>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#A1A1AA',
                letterSpacing: '0.02em'
              }}>
                New here?
              </span>

              {/* Seamless Unified Split Button Container */}
              <motion.div 
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={onSignUp}
                className="welcome-split-btn"
              >
                <div className="welcome-split-btn-text">
                  SIGN UP
                </div>
                <div className="welcome-split-btn-arrow">
                  →
                </div>
              </motion.div>
            </div>

            {/* Option 2: Already have an account? -> SIGN IN */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
              flex: 1,
              minWidth: '240px'
            }}>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#A1A1AA',
                letterSpacing: '0.02em'
              }}>
                Already have an account?
              </span>

              {/* Seamless Unified Split Button Container */}
              <motion.div 
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={onSignIn}
                className="welcome-split-btn"
              >
                <div className="welcome-split-btn-text">
                  SIGN IN
                </div>
                <div className="welcome-split-btn-arrow">
                  →
                </div>
              </motion.div>
            </div>

          </div>
        </motion.div>

      </div>
    </div>
  );
}
