import crypto from 'crypto';

/**
 * Verified Legitimate Chess News Feeds
 */
export const NEWS_SOURCES = [
  {
    id: 'chess-com',
    name: 'Chess.com News',
    url: 'https://www.chess.com/rss/news',
    defaultCategory: 'Professional Chess'
  },
  {
    id: 'lichess',
    name: 'Lichess Blog',
    url: 'https://lichess.org/blog.atom',
    defaultCategory: 'Chess Events'
  },
  {
    id: 'fide',
    name: 'FIDE News',
    url: 'https://fide.com/feed',
    defaultCategory: 'FIDE & Federations'
  },
  {
    id: 'chessbase',
    name: 'ChessBase',
    url: 'https://en.chessbase.com/feed',
    defaultCategory: 'Tournaments'
  },
  {
    id: 'twic',
    name: 'The Week in Chess',
    url: 'https://theweekinchess.com/twic-rss-feed',
    defaultCategory: 'Tournaments'
  }
];

// 5-minute cache TTL (in milliseconds)
export const CACHE_TTL_MS = 5 * 60 * 1000;

// Internal in-memory cache state
let cacheState = {
  articles: [],
  sourcesStatus: [],
  cachedAt: null,
  nextRefreshAt: null,
  isStale: false,
  lastRefreshFailed: false
};

// In-flight refresh promise coalescing lock
let inFlightRefreshPromise = null;
let fetchSequence = 0;
let lastCompletedSequence = 0;

/**
 * Sanitize raw XML/HTML into clean plain text
 */
export function cleanHtml(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract image URL from XML item block
 */
export function extractImageUrl(rawBlock) {
  if (!rawBlock) return null;
  const decoded = rawBlock.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  const imgMatch =
    decoded.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i) ||
    decoded.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*medium=["']image/i) ||
    decoded.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i) ||
    decoded.match(/<img[^>]+src=["']([^"']+)["']/i);

  if (imgMatch && imgMatch[1]) {
    const url = imgMatch[1].replace(/&amp;/g, '&').trim();
    if (url.startsWith('https://') || url.startsWith('http://')) {
      return url;
    }
  }
  return null;
}

/**
 * Generate a stable, collision-resistant identifier
 */
export function generateArticleId(url, title) {
  return crypto.createHash('sha256').update(`${url || ''}|${title || ''}`).digest('hex').slice(0, 16);
}

/**
 * Categorize article based on headline, summary, and feed tags
 */
export function classifyArticle(title, summary, tags = [], defaultCat = 'General') {
  const titleText = (title || '').toLowerCase();
  const tagText = (tags || []).join(' ').toLowerCase();
  const summaryText = (summary || '').toLowerCase();
  const fullText = `${titleText} ${summaryText} ${tagText}`;

  // 1. Tournaments & Championships (High priority based on title and tournament keywords)
  if (
    titleText.includes('championship') ||
    titleText.includes('tournament') ||
    titleText.includes('olympiad') ||
    titleText.includes('candidates') ||
    titleText.includes('grand swiss') ||
    titleText.includes('bundesliga') ||
    titleText.includes('world cup') ||
    titleText.includes('tata steel') ||
    titleText.includes('masters') ||
    titleText.includes('bullet brawl') ||
    titleText.includes('round ') ||
    fullText.includes('championship') ||
    fullText.includes('tournament') ||
    fullText.includes('olympiad') ||
    fullText.includes('candidates') ||
    fullText.includes('grand swiss') ||
    fullText.includes('bundesliga') ||
    fullText.includes('tata steel')
  ) {
    return 'Tournaments';
  }

  // 2. Professional Chess / Grandmaster profiles / Match play
  if (
    fullText.includes('magnus') ||
    fullText.includes('carlsen') ||
    fullText.includes('caruana') ||
    fullText.includes('hikaru') ||
    fullText.includes('nakamura') ||
    fullText.includes('gukesh') ||
    fullText.includes('ding liren') ||
    fullText.includes('pragg') ||
    fullText.includes('praggnanandhaa') ||
    fullText.includes('grandmaster') ||
    fullText.includes('gm ') ||
    fullText.includes('superbet') ||
    fullText.includes('freestyle') ||
    fullText.includes('speed chess')
  ) {
    return 'Professional Chess';
  }

  // 3. Chess Technology (Engines, anti-cheat, platform updates, AI)
  if (
    fullText.includes('stockfish') ||
    fullText.includes('engine') ||
    fullText.includes('anti-cheat') ||
    fullText.includes('cheat') ||
    fullText.includes('feature') ||
    fullText.includes('update') ||
    fullText.includes('rating system') ||
    fullText.includes(' ai ') ||
    fullText.includes('ai-powered')
  ) {
    return 'Chess Technology';
  }

  // 4. Chess Events (Arenas, festivals, rapid/blitz broadcasts)
  if (
    fullText.includes('streamer') ||
    fullText.includes('arena') ||
    fullText.includes('broadcast') ||
    fullText.includes('festival') ||
    fullText.includes('blitz') ||
    fullText.includes('rapid')
  ) {
    return 'Chess Events';
  }

  // 5. FIDE & Federations (Governance, Council, General Assembly, Regulations, Elections)
  if (
    titleText.includes('fide') ||
    titleText.includes('federation') ||
    fullText.includes('general assembly') ||
    fullText.includes('council meeting') ||
    fullText.includes('presidential') ||
    fullText.includes('commission nominations') ||
    fullText.includes('regulations') ||
    fullText.includes('fide ethics') ||
    fullText.includes('fide congress') ||
    defaultCat === 'FIDE & Federations'
  ) {
    return 'FIDE & Federations';
  }

  return defaultCat || 'General';
}

/**
 * Normalize and parse raw RSS (2.0) or Atom (1.0) XML
 */
export function parseRssOrAtom(xml, source) {
  if (!xml || typeof xml !== 'string') return [];
  const articles = [];
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');

  if (isAtom) {
    const entries = xml.match(/<entry[\s>].*?<\/entry>/gs) || [];
    for (const entry of entries) {
      const titleMatch = entry.match(/<title[^>]*>(.*?)<\/title>/s);
      const title = cleanHtml(titleMatch ? titleMatch[1] : '');

      const linkMatch =
        entry.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i) ||
        entry.match(/<link>(.*?)<\/link>/i);
      const url = linkMatch ? (linkMatch[1] || linkMatch[0]).trim() : '';

      const dateMatch =
        entry.match(/<published[^>]*>(.*?)<\/published>/s) ||
        entry.match(/<updated[^>]*>(.*?)<\/updated>/s);
      let publishedAt = null;
      if (dateMatch) {
        try {
          const d = new Date(dateMatch[1].trim());
          if (!isNaN(d.getTime())) publishedAt = d.toISOString();
        } catch (_) {}
      }

      const summaryMatch =
        entry.match(/<summary[^>]*>(.*?)<\/summary>/s) ||
        entry.match(/<content[^>]*>(.*?)<\/content>/s);
      let summary = cleanHtml(summaryMatch ? summaryMatch[1] : '');
      if (!summary) {
        summary = 'Open the article to read the full story.';
      } else if (summary.length > 280) {
        summary = summary.slice(0, 277).trim() + '...';
      }

      const imageUrl = extractImageUrl(entry);
      const catMatches = [...entry.matchAll(/<category[^>]+(?:term|label)=["']([^"']+)["']/gi)].map(m => cleanHtml(m[1]));
      const category = classifyArticle(title, summary, catMatches, source.defaultCategory);

      // Validate required headline and safe HTTP/HTTPS URL
      if (title && url && (url.startsWith('https://') || url.startsWith('http://'))) {
        articles.push({
          id: generateArticleId(url, title),
          title,
          url,
          source: source.name,
          sourceId: source.id,
          publishedAt,
          summary,
          imageUrl,
          category
        });
      }
    }
  } else {
    // RSS 2.0 format
    const items = xml.match(/<item[\s>].*?<\/item>/gs) || [];
    for (const item of items) {
      const titleMatch = item.match(/<title[^>]*>(.*?)<\/title>/s);
      const title = cleanHtml(titleMatch ? titleMatch[1] : '');

      const linkMatch = item.match(/<link[^>]*>(.*?)<\/link>/s);
      const url = linkMatch ? cleanHtml(linkMatch[1]) : '';

      const dateMatch =
        item.match(/<pubDate[^>]*>(.*?)<\/pubDate>/s) ||
        item.match(/<dc:date[^>]*>(.*?)<\/dc:date>/s);
      let publishedAt = null;
      if (dateMatch) {
        try {
          const d = new Date(cleanHtml(dateMatch[1]));
          if (!isNaN(d.getTime())) publishedAt = d.toISOString();
        } catch (_) {}
      }

      const summaryMatch =
        item.match(/<description[^>]*>(.*?)<\/description>/s) ||
        item.match(/<content:encoded[^>]*>(.*?)<\/content:encoded>/s);
      let summary = cleanHtml(summaryMatch ? summaryMatch[1] : '');
      if (!summary) {
        summary = 'Open the article to read the full story.';
      } else if (summary.length > 280) {
        summary = summary.slice(0, 277).trim() + '...';
      }

      const imageUrl = extractImageUrl(item);
      const catMatches = [...item.matchAll(/<category[^>]*>(.*?)<\/category>/gs)].map(m => cleanHtml(m[1]));
      const category = classifyArticle(title, summary, catMatches, source.defaultCategory);

      // Validate required headline and safe HTTP/HTTPS URL
      if (title && url && (url.startsWith('https://') || url.startsWith('http://'))) {
        articles.push({
          id: generateArticleId(url, title),
          title,
          url,
          source: source.name,
          sourceId: source.id,
          publishedAt,
          summary,
          imageUrl,
          category
        });
      }
    }
  }

  return articles;
}

/**
 * Fetch and aggregate news from all configured sources
 */
export async function fetchFromAllSources(sources = NEWS_SOURCES) {
  const fetchResults = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) StrategicChessNews/1.0',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
          'Cache-Control': 'no-cache, no-store',
          'Pragma': 'no-cache'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status} from ${source.name}`);
      }

      const xml = await response.text();
      const articles = parseRssOrAtom(xml, source);
      return {
        source,
        articles
      };
    })
  );

  const aggregated = [];
  const sourcesStatus = [];

  fetchResults.forEach((res, index) => {
    const src = sources[index];
    if (res.status === 'fulfilled') {
      aggregated.push(...res.value.articles);
      sourcesStatus.push({
        id: src.id,
        name: src.name,
        status: 'ok',
        count: res.value.articles.length
      });
    } else {
      sourcesStatus.push({
        id: src.id,
        name: src.name,
        status: 'error',
        error: res.reason?.message || 'Failed to fetch source'
      });
    }
  });

  // Deduplicate by normalized URL
  const seenUrls = new Set();
  const deduped = [];
  for (const article of aggregated) {
    const normalizedUrl = article.url.toLowerCase().replace(/\/$/, '');
    if (!seenUrls.has(normalizedUrl)) {
      seenUrls.add(normalizedUrl);
      deduped.push(article);
    }
  }

  // Sort chronologically (newest first)
  deduped.sort((a, b) => {
    if (a.publishedAt && b.publishedAt) {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    }
    if (a.publishedAt) return -1;
    if (b.publishedAt) return 1;
    return 0;
  });

  return {
    articles: deduped,
    sourcesStatus
  };
}

/**
 * Interleave articles across publishers while strictly preserving recency.
 * Uses a sliding recency window (default 36 hours): at each cycle, any publisher
 * whose head article was published within 36 hours of the newest available story
 * is interleaved in a round-robin turn.
 */
export function balanceArticles(articles, maxAgeDiffMs = 36 * 60 * 60 * 1000) {
  if (!Array.isArray(articles) || articles.length <= 1) {
    return Array.isArray(articles) ? [...articles] : [];
  }

  // 1. Group articles by sourceId (or source as fallback), maintaining chronological order within each queue
  const sourceQueues = new Map();
  for (const article of articles) {
    const key = article.sourceId || article.source || 'unknown';
    if (!sourceQueues.has(key)) {
      sourceQueues.set(key, []);
    }
    sourceQueues.get(key).push(article);
  }

  // Ensure each queue is sorted newest first
  for (const queue of sourceQueues.values()) {
    queue.sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });
  }

  const result = [];
  const totalCount = articles.length;

  while (result.length < totalCount) {
    // Find the newest timestamp among all non-empty queue heads
    let globalLatestTime = -Infinity;
    for (const queue of sourceQueues.values()) {
      if (queue.length > 0) {
        const t = queue[0].publishedAt ? new Date(queue[0].publishedAt).getTime() : 0;
        if (t > globalLatestTime) {
          globalLatestTime = t;
        }
      }
    }

    if (globalLatestTime === -Infinity) break;

    // Identify sources eligible for this round:
    // A source is eligible if its head article is within maxAgeDiffMs of globalLatestTime
    const eligibleSources = [];
    for (const [sourceId, queue] of sourceQueues.entries()) {
      if (queue.length > 0) {
        const headTime = queue[0].publishedAt ? new Date(queue[0].publishedAt).getTime() : 0;
        if (globalLatestTime === 0 || (globalLatestTime - headTime <= maxAgeDiffMs)) {
          eligibleSources.push({
            sourceId,
            headTime
          });
        }
      }
    }

    // Sort eligible sources so the source with the newest article picks first
    eligibleSources.sort((a, b) => b.headTime - a.headTime);

    if (eligibleSources.length === 0) break;

    // Pop one article from each eligible source in this round
    for (const { sourceId } of eligibleSources) {
      const queue = sourceQueues.get(sourceId);
      if (queue && queue.length > 0) {
        result.push(queue.shift());
      }
    }
  }

  return result;
}

/**
 * Get News Feed with 5-minute caching and request coalescing
 */
export async function getNewsFeed({
  forceRefresh = false,
  category = 'ALL',
  sort = 'balanced',
  limit = 30,
  offset = 0,
  _customFetcher = null
} = {}) {
  const now = Date.now();
  const isCacheExpired = !cacheState.cachedAt || (now - new Date(cacheState.cachedAt).getTime() > CACHE_TTL_MS);

  // If cache is fresh, not forcing refresh, and cache has articles, return immediately from cache
  if (!forceRefresh && !isCacheExpired && cacheState.articles.length > 0 && !cacheState.isStale) {
    return filterAndPaginate(cacheState, category, sort, limit, offset, false, false);
  }

  // Coalesce concurrent requests into a single in-flight fetch promise
  if (!inFlightRefreshPromise) {
    const currentSeq = ++fetchSequence;
    const fetchFn = _customFetcher || fetchFromAllSources;

    inFlightRefreshPromise = fetchFn()
      .then((fresh) => {
        // Discard older fetches if a newer one completed already
        if (currentSeq < lastCompletedSequence) {
          return cacheState;
        }
        lastCompletedSequence = currentSeq;

        const successCount = fresh.sourcesStatus.filter(s => s.status === 'ok').length;

        // If at least one source succeeded, update the cache with fresh data
        if (successCount > 0) {
          const fetchTime = new Date();
          cacheState = {
            articles: fresh.articles,
            sourcesStatus: fresh.sourcesStatus,
            cachedAt: fetchTime.toISOString(),
            nextRefreshAt: new Date(fetchTime.getTime() + CACHE_TTL_MS).toISOString(),
            isStale: false,
            lastRefreshFailed: false
          };
        } else {
          // If all sources failed and we have no cached data, throw error
          if (cacheState.articles.length === 0) {
            const err = new Error('All configured news feeds are currently unavailable.');
            err.code = 'FEEDS_UNAVAILABLE';
            throw err;
          }
          // Retain usable stale cache, but DO NOT update cachedAt, and record failure
          cacheState = {
            ...cacheState,
            sourcesStatus: fresh.sourcesStatus,
            isStale: true,
            lastRefreshFailed: true
          };
        }
        return cacheState;
      })
      .finally(() => {
        inFlightRefreshPromise = null;
      });
  }

  const resultState = await inFlightRefreshPromise;
  return filterAndPaginate(
    resultState,
    category,
    sort,
    limit,
    offset,
    Boolean(resultState.isStale),
    Boolean(resultState.lastRefreshFailed)
  );
}

/**
 * Apply category filter, source diversity sorting, and slice for pagination
 */
function filterAndPaginate(state, category, sort = 'balanced', limit = 30, offset = 0, isStale = false, lastRefreshFailed = false) {
  let processed = state.articles;

  // 1. Filter by category if requested
  if (category && category !== 'ALL') {
    processed = processed.filter(a => a.category === category);
  }

  // 2. Apply chosen sort mode (balanced diversity vs newest-first chronological)
  if (sort === 'balanced') {
    processed = balanceArticles(processed);
  } else {
    // Strict chronological descending order
    processed = [...processed].sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });
  }

  // 3. Paginate the consistently ordered collection
  const paginatedArticles = processed.slice(offset, offset + limit);

  return {
    articles: paginatedArticles,
    totalAvailable: processed.length,
    totalUnfiltered: state.articles.length,
    hasMore: offset + limit < processed.length,
    cachedAt: state.cachedAt,
    nextRefreshAt: state.nextRefreshAt,
    sourcesStatus: state.sourcesStatus,
    isStale,
    lastRefreshFailed,
    sort: sort === 'newest' ? 'newest' : 'balanced'
  };
}

/**
 * Reset cache helper (useful for deterministic testing)
 */
export function _resetCacheForTesting() {
  cacheState = {
    articles: [],
    sourcesStatus: [],
    cachedAt: null,
    nextRefreshAt: null,
    isStale: false,
    lastRefreshFailed: false
  };
  inFlightRefreshPromise = null;
  fetchSequence = 0;
  lastCompletedSequence = 0;
}

/**
 * Set custom cache state (useful for deterministic testing)
 */
export function _setCacheForTesting(customState) {
  cacheState = {
    articles: customState.articles || [],
    sourcesStatus: customState.sourcesStatus || [],
    cachedAt: customState.cachedAt || new Date().toISOString(),
    nextRefreshAt: customState.nextRefreshAt || new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    isStale: Boolean(customState.isStale),
    lastRefreshFailed: Boolean(customState.lastRefreshFailed)
  };
}

