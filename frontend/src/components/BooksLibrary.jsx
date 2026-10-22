import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Book, BookOpen, Search, X, ExternalLink, Calendar, 
  Tag, Filter, RotateCcw, AlertCircle, Info, CheckCircle2, ChevronRight
} from 'lucide-react';
import booksData from '../data/books.json';

// Difficulty badge styling helper
const LEVEL_STYLES = {
  Beginner: {
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.3)',
    text: '#10B981'
  },
  Intermediate: {
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
    text: '#F59E0B'
  },
  Advanced: {
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.3)',
    text: '#8B5CF6'
  },
  'All Levels': {
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.3)',
    text: '#3B82F6'
  }
};

function isValidHttpsUrl(string) {
  if (!string || typeof string !== 'string') return false;
  try {
    const url = new URL(string);
    return url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// Stylized cover fallback when coverUrl is null or fails to load
function BookCoverFallback({ book, isDarkMode }) {
  return (
    <div style={{
      width: '100%',
      height: '180px',
      borderRadius: '12px',
      backgroundColor: '#0C0C0E',
      border: '1px solid #1A1A1D',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '1.25rem',
      position: 'relative',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* Decorative Book Spine Bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: '6px',
        backgroundColor: '#FFFFFF'
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{
          fontSize: '0.65rem',
          fontWeight: 800,
          letterSpacing: '1.2px',
          textTransform: 'uppercase',
          color: isDarkMode ? '#9CA3AF' : '#6B7280'
        }}>
          {book.categories?.[0] || 'Chess Classic'}
        </span>
        <BookOpen size={20} color={isDarkMode ? '#6B7280' : '#9CA3AF'} />
      </div>

      <div>
        <h4 style={{
          fontFamily: "'Anton', 'Bebas Neue', sans-serif",
          fontSize: '1.25rem',
          lineHeight: 1.15,
          margin: 0,
          letterSpacing: '0.5px',
          color: isDarkMode ? '#F9FAFB' : '#111827',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {book.title}
        </h4>
        <p style={{
          fontSize: '0.78rem',
          fontWeight: 600,
          color: isDarkMode ? '#9CA3AF' : '#4B5563',
          margin: '0.3rem 0 0 0',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {book.author}
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isDarkMode ? '#6B7280' : '#9CA3AF' }}>
          {book.publicationYear ? `${book.publicationYear}` : 'Classic Edition'}
        </span>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: isDarkMode ? '#9CA3AF' : '#6B7280' }}>
          {book.language || 'English'}
        </span>
      </div>
    </div>
  );
}

export default function BooksLibrary({ isDarkMode = true }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedBook, setSelectedBook] = useState(null);

  // Keyboard shortcut to close modal via Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && selectedBook) {
        setSelectedBook(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBook]);

  // Dynamically derive distinct categories from the loaded catalogue
  const allCategories = useMemo(() => {
    const set = new Set();
    booksData.forEach((book) => {
      if (Array.isArray(book.categories)) {
        book.categories.forEach((cat) => set.add(cat));
      }
    });
    return Array.from(set).sort();
  }, []);

  // Filter books matching search query and filters
  const filteredBooks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return booksData.filter((book) => {
      // 1. Difficulty Level filter
      if (selectedLevel !== 'ALL' && book.level !== selectedLevel) {
        return false;
      }

      // 2. Category / Topic filter
      if (selectedCategory !== 'ALL') {
        if (!Array.isArray(book.categories) || !book.categories.includes(selectedCategory)) {
          return false;
        }
      }

      // 3. Search query filter
      if (query) {
        const titleMatch = (book.title || '').toLowerCase().includes(query);
        const authorMatch = (book.author || '').toLowerCase().includes(query);
        const summaryMatch = (book.summary || '').toLowerCase().includes(query);
        const levelMatch = (book.level || '').toLowerCase().includes(query);
        const langMatch = (book.language || '').toLowerCase().includes(query);
        const categoryMatch = Array.isArray(book.categories) && 
          book.categories.some((cat) => cat.toLowerCase().includes(query));

        if (!titleMatch && !authorMatch && !summaryMatch && !levelMatch && !langMatch && !categoryMatch) {
          return false;
        }
      }

      return true;
    });
  }, [searchQuery, selectedLevel, selectedCategory]);

  const hasActiveFilters = searchQuery.trim() !== '' || selectedLevel !== 'ALL' || selectedCategory !== 'ALL';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedLevel('ALL');
    setSelectedCategory('ALL');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.75rem',
      maxWidth: '1000px',
      margin: '0 auto',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* PAGE HEADER */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        backgroundColor: '#080808',
        border: '1px solid #171717',
        borderRadius: '20px',
        padding: '1.5rem 1.75rem',
        boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{
              fontFamily: "'Anton', 'Bebas Neue', sans-serif",
              fontSize: '2.4rem',
              margin: 0,
              letterSpacing: '0.5px',
              color: '#FFFFFF'
            }}>
              CHESS LIBRARY
            </h1>
            <p style={{
              color: '#8E8E93',
              fontSize: '0.95rem',
              margin: '0.25rem 0 0 0'
            }}>
              Discover essential chess literature, strategy manuals, and master classics
            </p>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#121215',
            border: '1px solid #1A1A1D',
            padding: '0.45rem 0.95rem',
            borderRadius: '12px'
          }}>
            <Book size={16} color="#8E8E93" />
            <span style={{
              fontSize: '0.85rem',
              fontWeight: 800,
              color: '#FFFFFF'
            }}>
              {filteredBooks.length} {filteredBooks.length === 1 ? 'Book' : 'Books'} Available
            </span>
          </div>
        </div>

        {/* SEARCH AND FILTER BAR */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.85rem',
          marginTop: '0.75rem',
          paddingTop: '1rem',
          borderTop: '1px solid #141416'
        }}>
          {/* Search Field */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                color: '#6B7280',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, author, topic..."
              style={{
                width: '100%',
                padding: '0.65rem 2.2rem 0.65rem 2.2rem',
                backgroundColor: '#0C0C0E',
                border: '1px solid #1A1A1D',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '0.88rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  color: '#8E8E93',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Difficulty Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#0C0C0E',
                border: '1px solid #1A1A1D',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '0.88rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Levels</option>
              <option value="Beginner">Beginner</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Advanced">Advanced</option>
              <option value="All Levels">All Levels (Universal)</option>
            </select>
          </div>

          {/* Topic / Category Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#0C0C0E',
                border: '1px solid #1A1A1D',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '0.88rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="ALL">All Topics & Categories</option>
              {allCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                backgroundColor: isDarkMode ? '#3F3F46' : '#E5E7EB',
                color: isDarkMode ? '#FFFFFF' : '#111111',
                border: 'none',
                borderRadius: '10px',
                padding: '0.65rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <RotateCcw size={14} />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* BOOKS GRID */}
      {filteredBooks.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
          gap: '1.25rem'
        }}>
          {filteredBooks.map((book) => {
            const levelStyle = LEVEL_STYLES[book.level] || LEVEL_STYLES['All Levels'];

            return (
              <div
                key={book.id}
                onClick={() => setSelectedBook(book)}
                style={{
                  backgroundColor: '#080808',
                  border: '1px solid #171717',
                  borderRadius: '18px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  cursor: 'pointer',
                  transition: 'transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.6)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.boxShadow = '0 12px 35px rgba(0,0,0,0.85)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = '#171717';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.6)';
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {/* Cover Preview or Fallback */}
                  {book.coverUrl ? (
                    <img
                      src={book.coverUrl}
                      alt={book.title}
                      loading="lazy"
                      style={{
                        width: '100%',
                        height: '180px',
                        borderRadius: '12px',
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        // Switch to fallback if image fails
                        e.target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <BookCoverFallback book={book} isDarkMode={isDarkMode} />
                  )}

                  {/* Level & Topic Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                    <span style={{
                      backgroundColor: levelStyle.bg,
                      color: levelStyle.text,
                      border: `1px solid ${levelStyle.border}`,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '8px',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      letterSpacing: '0.5px'
                    }}>
                      {book.level}
                    </span>

                    {book.categories?.slice(0, 2).map((cat, i) => (
                      <span
                        key={i}
                        style={{
                          backgroundColor: '#121215',
                          border: '1px solid #1A1A1D',
                          color: '#D1D5DB',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '8px'
                        }}
                      >
                        {cat}
                      </span>
                    ))}
                    {book.categories && book.categories.length > 2 && (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: '#8E8E93'
                      }}>
                        +{book.categories.length - 2}
                      </span>
                    )}
                  </div>

                  {/* Title & Author */}
                  <div>
                    <h3 style={{
                      fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                      fontSize: '1.45rem',
                      lineHeight: 1.15,
                      margin: 0,
                      letterSpacing: '0.5px',
                      color: '#FFFFFF'
                    }}>
                      {book.title}
                    </h3>
                    <p style={{
                      fontSize: '0.85rem',
                      color: '#8E8E93',
                      fontWeight: 600,
                      margin: '0.25rem 0 0 0'
                    }}>
                      By {book.author}
                    </p>
                  </div>

                  {/* Summary Snippet (Clamped to 3 lines) */}
                  <p style={{
                    fontSize: '0.82rem',
                    lineHeight: 1.45,
                    color: '#A1A1AA',
                    margin: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {book.summary}
                  </p>
                </div>

                {/* Footer Action */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '0.75rem',
                  borderTop: '1px solid #141416'
                }}>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#8E8E93'
                  }}>
                    {book.sourceName || 'Classic Text'}
                  </span>

                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    color: '#60A5FA'
                  }}>
                    View Details
                    <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* EMPTY RESULTS STATE */
        <div style={{
          backgroundColor: '#080808',
          border: '1px solid #171717',
          borderRadius: '20px',
          padding: '3rem 2rem',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            backgroundColor: '#121215',
            border: '1px solid #1A1A1D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8E8E93'
          }}>
            <Search size={26} />
          </div>

          <div>
            <h3 style={{
              fontFamily: "'Anton', 'Bebas Neue', sans-serif",
              fontSize: '1.6rem',
              margin: 0,
              color: '#FFFFFF'
            }}>
              NO MATCHING BOOKS FOUND
            </h3>
            <p style={{
              color: '#8E8E93',
              fontSize: '0.9rem',
              maxWidth: '420px',
              margin: '0.4rem auto 0 auto'
            }}>
              We couldn't find any books matching your current search criteria or topic filters.
            </p>
          </div>

          <button
            onClick={handleResetFilters}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#000000',
              border: 'none',
              borderRadius: '12px',
              padding: '0.7rem 1.4rem',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginTop: '0.5rem'
            }}
          >
            <RotateCcw size={15} />
            Reset All Filters
          </button>
        </div>
      )}

      {/* FULL BOOK DETAILS MODAL */}
      <AnimatePresence>
        {selectedBook && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedBook(null)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(8px)',
              zIndex: 300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.25rem',
              boxSizing: 'border-box'
            }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 15 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#080808',
                color: '#FFFFFF',
                borderRadius: '24px',
                padding: '2rem',
                maxWidth: '640px',
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.4rem',
                border: '1px solid #1A1A1D',
                boxShadow: '0 24px 60px rgba(0,0,0,0.95)',
                boxSizing: 'border-box'
              }}
            >
              {/* Modal Top Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
                    {(() => {
                      const style = LEVEL_STYLES[selectedBook.level] || LEVEL_STYLES['All Levels'];
                      return (
                        <span style={{
                          backgroundColor: style.bg,
                          color: style.text,
                          border: `1px solid ${style.border}`,
                          padding: '0.2rem 0.65rem',
                          borderRadius: '8px',
                          fontSize: '0.72rem',
                          fontWeight: 800
                        }}>
                          {selectedBook.level}
                        </span>
                      );
                    })()}

                    {selectedBook.categories?.map((cat, idx) => (
                      <span
                        key={idx}
                        style={{
                          backgroundColor: '#121215',
                          border: '1px solid #1A1A1D',
                          color: '#D1D5DB',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.6rem',
                          borderRadius: '8px'
                        }}
                      >
                        {cat}
                      </span>
                    ))}
                  </div>

                  <h2 style={{
                    fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                    fontSize: '2rem',
                    lineHeight: 1.1,
                    margin: '0.4rem 0 0 0',
                    letterSpacing: '0.5px'
                  }}>
                    {selectedBook.title}
                  </h2>
                  <p style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#8E8E93',
                    margin: 0
                  }}>
                    By {selectedBook.author}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedBook(null)}
                  style={{
                    backgroundColor: '#141418',
                    border: '1px solid #1E1E22',
                    borderRadius: '10px',
                    width: '34px',
                    height: '34px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  title="Close details"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Complete Book Summary */}
              <div style={{
                backgroundColor: '#0C0C0E',
                border: '1px solid #171717',
                borderRadius: '16px',
                padding: '1.25rem'
              }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: '#8E8E93',
                  display: 'block',
                  marginBottom: '0.5rem'
                }}>
                  ABOUT THIS WORK & CURRICULUM
                </span>
                <p style={{
                  fontSize: '0.92rem',
                  lineHeight: 1.65,
                  color: '#D1D5DB',
                  margin: 0
                }}>
                  {selectedBook.summary}
                </p>
              </div>

              {/* Publication & Edition Details */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.75rem'
              }}>
                {selectedBook.publicationYear && (
                  <div style={{
                    backgroundColor: '#0C0C0E',
                    border: '1px solid #171717',
                    borderRadius: '12px',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8E8E93' }}>
                      PUBLISHED
                    </span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF' }}>
                      {selectedBook.publicationYear}
                    </span>
                  </div>
                )}

                {selectedBook.language && (
                  <div style={{
                    backgroundColor: '#0C0C0E',
                    border: '1px solid #171717',
                    borderRadius: '12px',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8E8E93' }}>
                      LANGUAGE
                    </span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF' }}>
                      {selectedBook.language}
                    </span>
                  </div>
                )}

                {selectedBook.sourceName && (
                  <div style={{
                    backgroundColor: '#0C0C0E',
                    border: '1px solid #171717',
                    borderRadius: '12px',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8E8E93' }}>
                      SOURCE
                    </span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF' }}>
                      {selectedBook.sourceName}
                    </span>
                  </div>
                )}
              </div>

              {/* Availability Note */}
              {selectedBook.availabilityNote && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.2)'
                }}>
                  <Info size={16} color="#3B82F6" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', color: '#93C5FD', fontWeight: 600 }}>
                    {selectedBook.availabilityNote}
                  </span>
                </div>
              )}

              {/* Modal Actions */}
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '0.75rem',
                marginTop: '0.5rem',
                paddingTop: '1rem',
                borderTop: '1px solid #141416'
              }}>
                <button
                  onClick={() => setSelectedBook(null)}
                  style={{
                    backgroundColor: '#141418',
                    color: '#FFFFFF',
                    border: '1px solid #1E1E22',
                    borderRadius: '12px',
                    padding: '0.75rem 1.25rem',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  Close
                </button>

                {/* Safe Read Book Link Button */}
                {isValidHttpsUrl(selectedBook.url) ? (
                  <a
                    href={selectedBook.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      backgroundColor: '#FFFFFF',
                      color: '#000000',
                      borderRadius: '12px',
                      padding: '0.75rem 1.4rem',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      textDecoration: 'none',
                      boxShadow: '0 4px 15px rgba(255, 255, 255, 0.15)',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    <span>Read on {selectedBook.sourceName || 'Online'}</span>
                    <ExternalLink size={16} />
                  </a>
                ) : (
                  <button
                    disabled
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      backgroundColor: '#121215',
                      color: '#71717A',
                      borderRadius: '12px',
                      padding: '0.75rem 1.4rem',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      border: '1px solid #1A1A1D',
                      cursor: 'not-allowed'
                    }}
                    title="Reading link not yet verified or available"
                  >
                    <span>Reading Link Coming Soon</span>
                    <AlertCircle size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
