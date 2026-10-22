import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

// Level Metric Indicator Component (3 ascending bars: short, medium, tall)
function LevelBars({ level, isSelected }) {
  const bars = [1, 2, 3];
  
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '18px' }}>
      {bars.map((barIndex) => {
        const isFilled = barIndex <= level;
        const heights = ['8px', '12px', '16px'];
        
        return (
          <div
            key={barIndex}
            style={{
              width: '8px',
              height: heights[barIndex - 1],
              backgroundColor: isFilled
                ? (isSelected ? '#FFFFFF' : '#000000')
                : 'transparent',
              border: isSelected
                ? `1.5px solid ${isFilled ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)'}`
                : `1.5px solid ${isFilled ? '#000000' : 'rgba(0, 0, 0, 0.3)'}`,
              borderRadius: '1px',
              transition: 'all 0.25s ease'
            }}
          />
        );
      })}
    </div>
  );
}

export default function ExperienceScreen({ onSelectExperience, onSkip, onBack }) {
  // Default selected card is Intermediate (matching design mockup)
  const [selectedLevel, setSelectedLevel] = useState('intermediate');

  const experiences = [
    {
      id: 'beginner',
      title: 'BEGINNER',
      levelNumber: 1,
      image: '/Black_pawn_clean.png',
      line1: 'New to chess?',
      line2: 'Start your journey here.'
    },
    {
      id: 'intermediate',
      title: 'INTERMEDIATE',
      levelNumber: 2,
      image: '/Black_Knight.jpg',
      line1: 'You know the basics?',
      line2: 'Level up your skills.'
    },
    {
      id: 'professional',
      title: 'PROFESSIONAL',
      levelNumber: 3,
      image: '/Black_King_clean.png',
      line1: 'For advanced players',
      line2: 'seeking real challenge.'
    }
  ];

  const handleCardClick = (id) => {
    setSelectedLevel(id);
    if (onSelectExperience) {
      setTimeout(() => {
        onSelectExperience(id);
      }, 250);
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
      {/* Full-Screen Background Image */}
      <img
        src="/Experience_Page_BG_Image.jpg"
        alt="Experience Page Background"
        className="experience-bg-image"
        style={{ filter: 'brightness(0.5) contrast(1.1)' }}
      />

      {/* Viewport Layout Container */}
      <div className="experience-viewport">
        
        {/* Top Header Bar */}
        <header className="experience-header">
          {/* Circular Back Button */}
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={onBack}
            className="welcome-back-btn"
            title="Back to Welcome Page"
          >
            <ChevronLeft size={22} strokeWidth={2.5} />
          </motion.button>
        </header>

        {/* 2-Column Split Body Layout (Desktop Left Text, Right Cards) */}
        <div className="experience-body">

          {/* Left Column: Heading + Subtext + Triple Line Accent */}
          <motion.div
            initial={{ opacity: 0, x: -25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="experience-left-col"
          >
            <h1 className="experience-title" style={{ color: '#FFFFFF' }}>
              CHOOSE YOUR<br />
              EXPERIENCE
            </h1>
            <p className="experience-subtitle" style={{ color: '#A1A1AA' }}>
              Select the experience that<br />
              matches your chess level.
            </p>

            {/* Triple Horizontal Line Motif Accent */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '52px', marginTop: '0.35rem' }}>
              <div style={{ width: '52px', height: '2.5px', backgroundColor: '#FFFFFF', borderRadius: '1px' }} />
              <div style={{ width: '40px', height: '2.5px', backgroundColor: '#FFFFFF', borderRadius: '1px' }} />
              <div style={{ width: '28px', height: '2.5px', backgroundColor: '#FFFFFF', borderRadius: '1px' }} />
            </div>
          </motion.div>

          {/* Right Column: Experience Level Cards Stack */}
          <motion.div 
            initial={{ opacity: 0, x: 25 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className="experience-right-col"
          >
            <div className="experience-cards-stack">
              {experiences.map((exp) => {
                const isSelected = selectedLevel === exp.id;

                return (
                  <motion.div
                    key={exp.id}
                    whileHover={{ scale: 1.015, translateY: -3 }}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => handleCardClick(exp.id)}
                    className={`experience-card ${isSelected ? 'selected' : ''}`}
                  >
                    {/* Left Full-Height Chess Piece Box */}
                    <div className="experience-piece-box">
                      <img 
                        src={exp.image} 
                        alt={exp.title}
                        className={`experience-piece-img piece-${exp.id}`}
                      />
                    </div>

                    {/* Center Content Column */}
                    <div className="experience-card-content">
                      {/* Header Row: Level Title + Metric Bars */}
                      <div className="experience-card-header-row">
                        <span className="experience-card-title">
                          {exp.title}
                        </span>
                        <LevelBars level={exp.levelNumber} isSelected={isSelected} />
                      </div>

                      {/* Description Copy */}
                      <div className="experience-card-copy">
                        <div>{exp.line1}</div>
                        <div>{exp.line2}</div>
                      </div>
                    </div>

                    {/* Right Action Arrow */}
                    <div className="experience-card-arrow">
                      →
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

        </div>

        {/* Bottom Footer Bar */}
        <footer className="experience-footer">
          {/* 2x2 Checkerboard Icon */}
          <div className="checker-accent">
            <div className="checker-box" style={{ backgroundColor: '#FFFFFF' }} />
            <div className="checker-box" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <div className="checker-box" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <div className="checker-box" style={{ backgroundColor: '#FFFFFF' }} />
          </div>

          {/* Center Decorative Line */}
          <div style={{ flex: 1, height: '1.5px', backgroundColor: '#FFFFFF', opacity: 0.25, margin: '0 2rem' }} />

          {/* Skip Action Button */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onSkip}
            className="experience-skip-btn"
          >
            SKIP
          </motion.button>
        </footer>

      </div>
    </div>
  );
}
