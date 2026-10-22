import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Newspaper,
  RefreshCw,
  ExternalLink,
  Clock,
  Globe,
  AlertCircle,
  Filter,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { getChessNewsFeed } from '../lib/api';

// Source branding colors for badges
const SOURCE_ACCENTS = {
  'Chess.com News': {
    badgeBg: 'rgba(34, 197, 94, 0.12)',
    badgeBorder: 'rgba(34, 197, 94, 0.3)',
    text: '#22C55E'
  },
  'Lichess Blog': {
    badgeBg: 'rgba(168, 85, 247, 0.12)',
    badgeBorder: 'rgba(168, 85, 247, 0.3)',
    text: '#A855F7'
  },
  'FIDE News': {
    badgeBg: 'rgba(59, 130, 246, 0.12)',
    badgeBorder: 'rgba(59, 130, 246, 0.3)',
    text: '#3B82F6'
  },
  'ChessBase': {
    badgeBg: 'rgba(245, 158, 11, 0.12)',
    badgeBorder: 'rgba(245, 158, 11, 0.3)',
    text: '#F59E0B'
  },
  'The Week in Chess': {
    badgeBg: 'rgba(20, 184, 166, 0.12)',
    badgeBorder: 'rgba(20, 184, 166, 0.3)',
    text: '#14B8A6'
  }
};

// Formats ISO string into friendly relative or absolute date
function formatArticleDate(isoString) {
  if (!isoString) return 'Recent dispatch';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Recent dispatch';

    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
      return `${diffMins}m ago`;
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  } catch (_) {
    return 'Recent dispatch';
  }
}

// Format timestamp of last successful refresh
function formatLastUpdated(isoString) {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}

const CATEGORIES = [
  'ALL',
  'Tournaments',
  'Professional Chess',
  'FIDE & Federations',
  'Chess Events',
  'Chess Technology',
  'General'
];

const PAGE_SIZE = 12;
const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function NewsFeed({ isDarkMode = true }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [sourcesStatus, setSourcesStatus] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [sortMode, setSortMode] = useState('balanced'); // 'balanced' (default) or 'newest'
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshFeedback, setRefreshFeedback] = useState(null); // { type: 'success' | 'info' | 'error', message: string }

  // References to prevent stale closures and manage concurrency
  const pollTimerRef = useRef(null);
  const isFetchingRef = useRef(false);
  const articlesRef = useRef(articles);
  const sortModeRef = useRef(sortMode);

  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  useEffect(() => {
    sortModeRef.current = sortMode;
  }, [sortMode]);

  // Fetch news articles from the backend aggregation endpoint
  const fetchNews = useCallback(async (isManualRefresh = false, activeSort = sortModeRef.current) => {
    // If a manual refresh is already in-flight, ignore duplicate clicks
    if (isManualRefresh && refreshing) return;
    if (!isManualRefresh && isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (isManualRefresh) {
      setRefreshing(true);
      setRefreshFeedback(null);
    }

    try {
      const res = await getChessNewsFeed({
        category: 'ALL',
        sort: activeSort,
        refresh: isManualRefresh,
        limit: 100, // Fetch up to 100 items from backend
        offset: 0
      });

      if (res.success && res.data) {
        const incomingArticles = res.data.articles || [];
        const currentKeys = new Set(articlesRef.current.map((a) => a.id || a.url));
        const newArticlesCount = incomingArticles.filter((a) => !currentKeys.has(a.id || a.url)).length;

        // Apply incoming articles directly to preserve backend balanced ordering
        setArticles(incomingArticles);
        setSourcesStatus(res.data.sourcesStatus || []);
        if (res.data.cachedAt) {
          setLastUpdated(res.data.cachedAt);
        }
        setIsStale(Boolean(res.data.isStale));
        setError(null);

        if (isManualRefresh) {
          const checkTime = res.data.cachedAt
            ? new Date(res.data.cachedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'just now';

          if (res.data.lastRefreshFailed) {
            setRefreshFeedback({
              type: 'error',
              message: 'Sources unreachable — displaying cached feed.'
            });
          } else if (newArticlesCount > 0) {
            setRefreshFeedback({
              type: 'success',
              message: `Updated (+${newArticlesCount} new ${newArticlesCount === 1 ? 'article' : 'articles'}).`
            });
          } else {
            setRefreshFeedback({
              type: 'info',
              message: `No new articles found — sources checked at ${checkTime}.`
            });
          }
          setTimeout(() => setRefreshFeedback(null), 5000);
        }
      } else {
        const errorMsg = res.error?.message || 'Unable to load news feed.';
        if (articlesRef.current.length === 0) {
          setError(errorMsg);
        }
        if (isManualRefresh) {
          setRefreshFeedback({
            type: 'error',
            message: 'Refresh failed: news service returned an error.'
          });
          setTimeout(() => setRefreshFeedback(null), 5000);
        }
      }
    } catch (err) {
      if (articlesRef.current.length === 0) {
        setError(err.message || 'Network error while reaching news server.');
      }
      if (isManualRefresh) {
        setRefreshFeedback({
          type: 'error',
          message: 'Network error while checking news sources.'
        });
        setTimeout(() => setRefreshFeedback(null), 5000);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [refreshing]);

  const handleSortChange = (newMode) => {
    if (newMode === sortMode) return;
    setSortMode(newMode);
    setVisibleCount(PAGE_SIZE);
    fetchNews(false, newMode);
  };

  // Initial load
  useEffect(() => {
    fetchNews(false);
  }, [fetchNews]);

  // Set up 5-minute background polling with page visibility optimization
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab just came back to focus: check if it's been > 5 min since last fetch
        fetchNews(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    pollTimerRef.current = setInterval(() => {
      // Only poll if tab is active
      if (document.visibilityState === 'visible') {
        fetchNews(false);
      }
    }, POLLING_INTERVAL_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [fetchNews]);

  // Filter articles based on active category
  const filteredArticles = useMemo(() => {
    if (selectedCategory === 'ALL') {
      return articles;
    }
    return articles.filter((a) => a.category === selectedCategory);
  }, [articles, selectedCategory]);

  // Slice for continuous browsing / load more
  const displayedArticles = useMemo(() => {
    return filteredArticles.slice(0, visibleCount);
  }, [filteredArticles, visibleCount]);

  const hasMoreArticles = visibleCount < filteredArticles.length;

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  };

  // Identify any partially failing sources
  const failedSources = useMemo(() => {
    return sourcesStatus.filter((s) => s.status === 'error');
  }, [sourcesStatus]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.75rem',
        maxWidth: '1000px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* SECTION HEADER */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          backgroundColor: '#080808',
          border: '1px solid #171717',
          borderRadius: '20px',
          padding: '1.5rem 1.75rem',
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1
                style={{
                  fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                  fontSize: '2.4rem',
                  margin: 0,
                  letterSpacing: '0.5px',
                  color: '#FFFFFF'
                }}
              >
                CHESS NEWS
              </h1>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.18)'
                }}
              >
                Curated Feed
              </span>
            </div>
            <p
              style={{
                color: '#8E8E93',
                fontSize: '0.92rem',
                margin: '0.25rem 0 0 0'
              }}
            >
              Aggregated tournament dispatches, championship reports & federation news from verified journalism sources
            </p>
          </div>

          {/* REFRESH CONTROL & LAST UPDATED BADGE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {lastUpdated && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#8E8E93',
                  backgroundColor: '#121215',
                  border: '1px solid #1A1A1D',
                  padding: '0.4rem 0.75rem',
                  borderRadius: '10px'
                }}
                title={`Last successful aggregation: ${new Date(lastUpdated).toLocaleString()}`}
              >
                <Clock size={13} />
                <span>Updated {formatLastUpdated(lastUpdated)}</span>
                {isStale && (
                  <span
                    style={{
                      color: '#F59E0B',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      backgroundColor: 'rgba(245, 158, 11, 0.12)',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px'
                    }}
                  >
                    Stale
                  </span>
                )}
              </div>
            )}

            <button
              onClick={() => fetchNews(true)}
              disabled={refreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                backgroundColor: '#141418',
                border: '1px solid #1E1E22',
                borderRadius: '10px',
                padding: '0.45rem 0.85rem',
                color: '#FFFFFF',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: refreshing ? 'not-allowed' : 'pointer',
                opacity: refreshing ? 0.75 : 1,
                transition: 'all 0.18s ease'
              }}
              title="Force check all news sources now"
            >
              <RefreshCw
                size={14}
                style={{
                  animation: refreshing ? 'spin 1s linear infinite' : 'none'
                }}
              />
              <span>{refreshing ? 'Checking feeds...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* CATEGORY FILTER CHIPS & SORT SELECTOR */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid #141416'
          }}
        >
          {/* CATEGORIES */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              overflowX: 'auto',
              scrollbarWidth: 'none',
              flex: '1 1 auto'
            }}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              const label = cat === 'ALL' ? 'All Stories' : cat;

              return (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '999px',
                    border: isSelected
                      ? '1px solid rgba(255, 255, 255, 0.45)'
                      : '1px solid #171717',
                    backgroundColor: isSelected
                      ? '#18181D'
                      : '#0C0C0E',
                    color: isSelected
                      ? '#FFFFFF'
                      : '#8E8E93',
                    fontSize: '0.78rem',
                    fontWeight: isSelected ? 800 : 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* DIVERSITY / SORT MODE TOGGLE */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#0C0C0E',
              borderRadius: '999px',
              padding: '0.2rem',
              border: '1px solid #171717',
              gap: '0.2rem',
              flexShrink: 0
            }}
          >
            <button
              onClick={() => handleSortChange('balanced')}
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
                border: 'none',
                backgroundColor: sortMode === 'balanced' ? '#18181D' : 'transparent',
                color: sortMode === 'balanced' ? '#FFFFFF' : '#8E8E93',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Balanced source diversity interleaving"
            >
              Balanced
            </button>
            <button
              onClick={() => handleSortChange('newest')}
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '999px',
                border: 'none',
                backgroundColor: sortMode === 'newest' ? '#18181D' : 'transparent',
                color: sortMode === 'newest' ? '#FFFFFF' : '#8E8E93',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Strict chronological newest first"
            >
              Newest first
            </button>
          </div>
        </div>
      </div>

      {/* REFRESH FEEDBACK BANNER (HONEST STATUS) */}
      {refreshFeedback && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            padding: '0.65rem 1rem',
            borderRadius: '12px',
            backgroundColor:
              refreshFeedback.type === 'success'
                ? (isDarkMode ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)')
                : refreshFeedback.type === 'error'
                ? (isDarkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)')
                : (isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.08)'),
            border: `1px solid ${
              refreshFeedback.type === 'success'
                ? 'rgba(34, 197, 94, 0.25)'
                : refreshFeedback.type === 'error'
                ? 'rgba(239, 68, 68, 0.25)'
                : 'rgba(59, 130, 246, 0.25)'
            }`,
            fontSize: '0.8rem',
            fontWeight: 600,
            color:
              refreshFeedback.type === 'success'
                ? '#22C55E'
                : refreshFeedback.type === 'error'
                ? '#EF4444'
                : (isDarkMode ? '#60A5FA' : '#2563EB')
          }}
        >
          {refreshFeedback.type === 'success' ? (
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          ) : refreshFeedback.type === 'error' ? (
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
          ) : (
            <Clock size={16} style={{ flexShrink: 0 }} />
          )}
          <span>{refreshFeedback.message}</span>
        </div>
      )}

      {/* PARTIAL SOURCE FAILURE NOTICE (UNOBTRUSIVE) */}
      {failedSources.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.65rem 1rem',
            borderRadius: '12px',
            backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.05)',
            border: isDarkMode ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(245, 158, 11, 0.2)',
            fontSize: '0.78rem',
            color: isDarkMode ? '#FCD34D' : '#B45309'
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>
            Notice: {failedSources.map((s) => s.name).join(', ')}{' '}
            {failedSources.length === 1 ? 'is' : 'are'} temporarily slow to respond; displaying verified dispatches from the remaining active sources.
          </span>
        </div>
      )}

      {/* FEED CONTENT AREA */}
      {loading && articles.length === 0 ? (
        /* LOADING SKELETON STATE */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              style={{
                backgroundColor: '#080808',
                border: '1px solid #171717',
                borderRadius: '16px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                animation: 'pulse 1.5s infinite ease-in-out'
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', width: '30%', height: '14px', backgroundColor: '#141418', borderRadius: '4px' }} />
              <div style={{ width: '80%', height: '22px', backgroundColor: '#141418', borderRadius: '6px' }} />
              <div style={{ width: '95%', height: '14px', backgroundColor: '#141418', borderRadius: '4px' }} />
              <div style={{ width: '60%', height: '14px', backgroundColor: '#141418', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      ) : error && articles.length === 0 ? (
        /* TOTAL FAILURE ERROR STATE */
        <div
          style={{
            backgroundColor: '#080808',
            border: '1px solid #171717',
            borderRadius: '20px',
            padding: '3rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <AlertCircle size={24} />
          </div>
          <div>
            <h3
              style={{
                fontFamily: "'Anton', 'Bebas Neue', sans-serif",
                fontSize: '1.6rem',
                margin: 0,
                color: '#FFFFFF'
              }}
            >
              NEWS SOURCES TEMPORARILY UNAVAILABLE
            </h3>
            <p
              style={{
                color: '#8E8E93',
                fontSize: '0.88rem',
                maxWidth: '460px',
                margin: '0.4rem auto 0 auto'
              }}
            >
              {error}
            </p>
          </div>
          <button
            onClick={() => fetchNews(true)}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#000000',
              border: 'none',
              borderRadius: '10px',
              padding: '0.65rem 1.35rem',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer'
            }}
          >
            Retry Connection
          </button>
        </div>
      ) : displayedArticles.length === 0 ? (
        /* EMPTY CATEGORY STATE */
        <div
          style={{
            backgroundColor: '#080808',
            border: '1px solid #171717',
            borderRadius: '20px',
            padding: '3rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.85rem'
          }}
        >
          <Newspaper size={32} color="#6B7280" />
          <h3
            style={{
              fontFamily: "'Anton', sans-serif",
              fontSize: '1.4rem',
              margin: 0,
              color: '#FFFFFF'
            }}
          >
            NO ARTICLES IN {selectedCategory.toUpperCase()}
          </h3>
          <p style={{ color: '#8E8E93', fontSize: '0.88rem', margin: 0 }}>
            No recent dispatches found for this category. Switch to "All Stories" to see all verified news.
          </p>
          <button
            onClick={() => setSelectedCategory('ALL')}
            style={{
              backgroundColor: '#141418',
              color: '#FFFFFF',
              border: '1px solid #1E1E22',
              borderRadius: '8px',
              padding: '0.5rem 1rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: '0.5rem'
            }}
          >
            Show All Stories
          </button>
        </div>
      ) : (
        /* SUBSTACK-STYLE ARTICLE STREAM */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {displayedArticles.map((article) => {
            const sourceStyle = SOURCE_ACCENTS[article.source] || {
              badgeBg: 'rgba(107, 114, 128, 0.12)',
              badgeBorder: 'rgba(107, 114, 128, 0.3)',
              text: '#9CA3AF'
            };

            return (
              <article
                key={article.id}
                style={{
                  backgroundColor: '#080808',
                  border: '1px solid #171717',
                  borderRadius: '16px',
                  padding: '1.35rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  transition: 'border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.85)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#171717';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
                }}
              >
                {/* METADATA BAR (SOURCE, DATE, CATEGORY) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        backgroundColor: sourceStyle.badgeBg,
                        color: sourceStyle.text,
                        border: `1px solid ${sourceStyle.badgeBorder}`,
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        letterSpacing: '0.4px',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '6px'
                      }}
                    >
                      {article.source}
                    </span>

                    {article.category && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: '#8E8E93',
                          backgroundColor: '#121215',
                          border: '1px solid #1A1A1D',
                          padding: '0.18rem 0.5rem',
                          borderRadius: '6px'
                        }}
                      >
                        {article.category}
                      </span>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: '#71717A',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <Clock size={12} />
                    {formatArticleDate(article.publishedAt)}
                  </span>
                </div>

                {/* MAIN ARTICLE BODY (HEADLINE + OPTIONAL THUMBNAIL) */}
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        textDecoration: 'none',
                        color: 'inherit'
                      }}
                    >
                      <h3
                        style={{
                          fontFamily: "'Anton', sans-serif",
                          fontSize: '1.45rem',
                          lineHeight: 1.22,
                          letterSpacing: '0.3px',
                          margin: 0,
                          color: '#FFFFFF',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#93C5FD';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#FFFFFF';
                        }}
                      >
                        {article.title}
                      </h3>
                    </a>

                    <p
                      style={{
                        fontSize: '0.88rem',
                        lineHeight: 1.55,
                        color: '#A1A1AA',
                        margin: 0
                      }}
                    >
                      {article.summary}
                    </p>
                  </div>

                  {/* THUMBNAIL (IF GENUINELY AVAILABLE) */}
                  {article.imageUrl && (
                    <div
                      style={{
                        flexShrink: 0,
                        width: '130px',
                        height: '95px',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        backgroundColor: '#121215',
                        border: '1px solid #1A1A1D'
                      }}
                    >
                      <img
                        src={article.imageUrl}
                        alt={article.title}
                        loading="lazy"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        onError={(e) => {
                          // Hide container if image fails to load
                          e.target.parentElement.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* FOOTER ACTION */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '0.65rem',
                    borderTop: '1px solid #141416'
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#71717A', fontWeight: 600 }}>
                    Direct dispatch link
                  </span>

                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      color: '#60A5FA',
                      textDecoration: 'none',
                      transition: 'gap 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.gap = '0.55rem';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.gap = '0.35rem';
                    }}
                  >
                    <span>Read on {article.source}</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </article>
            );
          })}

          {/* CONTINUOUS BROWSING / LOAD MORE BUTTON */}
          {hasMoreArticles && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
              <button
                onClick={handleLoadMore}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: '#141418',
                  border: '1px solid #1E1E22',
                  borderRadius: '12px',
                  padding: '0.75rem 1.6rem',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Load More Stories ({filteredArticles.length - visibleCount} remaining)</span>
                <ChevronDown size={15} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
