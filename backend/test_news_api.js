import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseRssOrAtom,
  cleanHtml,
  extractImageUrl,
  generateArticleId,
  classifyArticle,
  balanceArticles,
  CACHE_TTL_MS
} from './src/services/newsService.js';
import { buildApp } from './src/app.js';

describe('Chess News Service & Aggregator', () => {

  it('1. Correctly parses and normalizes standard RSS 2.0 feed items', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Test RSS Channel</title>
        <item>
          <title><![CDATA[Grandmaster Wins Dramatic Title]]></title>
          <link>https://example.com/chess/title-win</link>
          <pubDate>Mon, 12 Oct 2026 10:00:00 GMT</pubDate>
          <description><![CDATA[<p>Full recap of the final championship round with <b>brilliant</b> tactical play.</p>]]></description>
          <category>Tournaments</category>
        </item>
      </channel>
    </rss>`;

    const source = { id: 'test-rss', name: 'Test RSS', defaultCategory: 'General' };
    const articles = parseRssOrAtom(rssXml, source);

    assert.strictEqual(articles.length, 1);
    const a = articles[0];
    assert.strictEqual(a.title, 'Grandmaster Wins Dramatic Title');
    assert.strictEqual(a.url, 'https://example.com/chess/title-win');
    assert.strictEqual(a.source, 'Test RSS');
    assert.strictEqual(a.category, 'Tournaments');
    assert.ok(a.summary.includes('Full recap of the final championship round'));
    assert.ok(!a.summary.includes('<p>') && !a.summary.includes('<b>'));
    assert.strictEqual(a.publishedAt, '2026-10-12T10:00:00.000Z');
  });

  it('2. Correctly parses and normalizes Atom 1.0 feed entries', () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Test Atom Feed</title>
      <entry>
        <title>New Rapid Arena Announced</title>
        <link rel="alternate" href="https://example.com/atom/arena-announcement" />
        <published>2026-10-11T15:30:00.000Z</published>
        <summary>Join our weekend rapid arena with cash prizes.</summary>
        <category term="Events" label="Events" />
      </entry>
    </feed>`;

    const source = { id: 'test-atom', name: 'Test Atom', defaultCategory: 'Chess Events' };
    const articles = parseRssOrAtom(atomXml, source);

    assert.strictEqual(articles.length, 1);
    const a = articles[0];
    assert.strictEqual(a.title, 'New Rapid Arena Announced');
    assert.strictEqual(a.url, 'https://example.com/atom/arena-announcement');
    assert.strictEqual(a.publishedAt, '2026-10-11T15:30:00.000Z');
    assert.strictEqual(a.summary, 'Join our weekend rapid arena with cash prizes.');
  });

  it('3. Safely handles missing optional fields without crashing', () => {
    const sparseXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Minimal Article Without Date Or Summary</title>
          <link>https://example.com/chess/minimal</link>
        </item>
      </channel>
    </rss>`;

    const source = { id: 'test-sparse', name: 'Test Sparse', defaultCategory: 'General' };
    const articles = parseRssOrAtom(sparseXml, source);

    assert.strictEqual(articles.length, 1);
    const a = articles[0];
    assert.strictEqual(a.title, 'Minimal Article Without Date Or Summary');
    assert.strictEqual(a.url, 'https://example.com/chess/minimal');
    assert.strictEqual(a.publishedAt, null);
    assert.strictEqual(a.imageUrl, null);
    assert.strictEqual(a.summary, 'Open the article to read the full story.');
  });

  it('4. Rejects invalid entries with missing title or unsafe/missing URL', () => {
    const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title></title>
          <link>https://example.com/no-title</link>
        </item>
        <item>
          <title>Missing Link Article</title>
        </item>
        <item>
          <title>Unsafe Protocol Article</title>
          <link>javascript:alert(1)</link>
        </item>
        <item>
          <title>File Protocol Article</title>
          <link>file:///etc/passwd</link>
        </item>
      </channel>
    </rss>`;

    const source = { id: 'test-invalid', name: 'Test Invalid', defaultCategory: 'General' };
    const articles = parseRssOrAtom(invalidXml, source);

    assert.strictEqual(articles.length, 0);
  });

  it('5. Properly cleans HTML entities, CDATA blocks, and strips tags', () => {
    const dirty = '<![CDATA[FIDE &amp; World &quot;Championship&#039;s&quot; <script>bad()</script><b>Highlight</b>]]>';
    const cleaned = cleanHtml(dirty);
    assert.strictEqual(cleaned, "FIDE & World \"Championship's\" bad() Highlight");
  });

  it('6. Correctly extracts media images from various formats', () => {
    const rawWithEnclosure = '<item><enclosure url="https://example.com/photo.jpg" type="image/jpeg" /></item>';
    const rawWithMediaThumb = '<entry><media:thumbnail url="https://example.com/thumb.webp" /></entry>';
    const rawWithImg = '<item><description>&lt;img src="https://example.com/inline.png" /&gt;</description></item>';

    assert.strictEqual(extractImageUrl(rawWithEnclosure), 'https://example.com/photo.jpg');
    assert.strictEqual(extractImageUrl(rawWithMediaThumb), 'https://example.com/thumb.webp');
    assert.strictEqual(extractImageUrl(rawWithImg), 'https://example.com/inline.png');
  });

  it('7. Stable and collision-resistant article IDs', () => {
    const id1 = generateArticleId('https://example.com/news/1', 'Headline');
    const id2 = generateArticleId('https://example.com/news/1', 'Headline');
    const id3 = generateArticleId('https://example.com/news/2', 'Headline');

    assert.strictEqual(id1, id2);
    assert.notStrictEqual(id1, id3);
    assert.strictEqual(typeof id1, 'string');
    assert.strictEqual(id1.length, 16);
  });

  it('8. Accurately classifies topics based on chess terminology and prevents false FIDE classification', () => {
    assert.strictEqual(classifyArticle('FIDE General Assembly Adopts Reforms', '', []), 'FIDE & Federations');
    assert.strictEqual(classifyArticle('World Candidates Tournament Round 5 Recap', '', []), 'Tournaments');
    assert.strictEqual(classifyArticle('Magnus Carlsen Takes Lead in Freestyle Clash', '', []), 'Professional Chess');
    assert.strictEqual(classifyArticle('Streamer Arena and Weekend Blitz Festival', '', []), 'Chess Events');
    assert.strictEqual(classifyArticle('Stockfish 17 Engine Released with Major Updates', '', []), 'Chess Technology');
    // Ensure tournaments with FIDE in summary are classified as Tournaments, not FIDE & Federations
    assert.strictEqual(classifyArticle('The Chess Olympiad that was not: Munich 1936', 'Unofficial olympiad outside FIDE authority', []), 'Tournaments');
    assert.strictEqual(classifyArticle('Maghsoodloo Wins Star-Studded Freestyle Friday', 'Qualifying for the FIDE Freestyle Chess World Championship', []), 'Tournaments');
    assert.strictEqual(classifyArticle('Fabiano Caruana targets fifth consecutive US title', 'US Chess Federation championship race', []), 'Tournaments');
    assert.strictEqual(classifyArticle('Hikaru Nakamura on Speed Chess and Blitz Psychology', 'Grandmaster reflects on match strategies', []), 'Professional Chess');
  });

  it('9. Fastify GET /api/news integration returns success with articles', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/news?limit=10'
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data.articles));
    assert.ok(body.data.articles.length > 0);
    assert.ok(body.data.cachedAt);
    assert.ok(Array.isArray(body.data.sourcesStatus));
    await app.close();
  });

  it('10. Fastify GET /api/news supports category query filtering', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/news?category=Tournaments&limit=10'
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.success, true);
    for (const article of body.data.articles) {
      assert.strictEqual(article.category, 'Tournaments');
    }
    await app.close();
  });

  it('11. Fastify GET /api/news supports pagination with limit and offset', async () => {
    const app = buildApp();
    const page1 = await app.inject({ method: 'GET', url: '/api/news?limit=5&offset=0' });
    const page2 = await app.inject({ method: 'GET', url: '/api/news?limit=5&offset=5' });

    const body1 = JSON.parse(page1.payload);
    const body2 = JSON.parse(page2.payload);

    assert.strictEqual(body1.data.articles.length, 5);
    assert.strictEqual(body2.data.articles.length, 5);
    // Page 1 and Page 2 should contain different articles
    assert.notStrictEqual(body1.data.articles[0].id, body2.data.articles[0].id);
    await app.close();
  });

  it('12. Normal request returns valid cached feed without calling fetcher again', async () => {
    const { _resetCacheForTesting, _setCacheForTesting, getNewsFeed } = await import('./src/services/newsService.js');
    _resetCacheForTesting();

    const seededTime = new Date().toISOString();
    _setCacheForTesting({
      articles: [
        { id: 'art-1', title: 'Cached Article', url: 'https://example.com/cached', category: 'General' }
      ],
      sourcesStatus: [{ id: 'src-1', name: 'Src 1', status: 'ok', count: 1 }],
      cachedAt: seededTime
    });

    let fetchCount = 0;
    const mockFetcher = async () => {
      fetchCount++;
      return { articles: [], sourcesStatus: [] };
    };

    const res = await getNewsFeed({ forceRefresh: false, _customFetcher: mockFetcher });
    assert.strictEqual(fetchCount, 0, 'Fetcher must NOT be called when cache is fresh');
    assert.strictEqual(res.articles.length, 1);
    assert.strictEqual(res.cachedAt, seededTime);
    assert.strictEqual(res.isStale, false);
  });

  it('13. Forced refresh bypasses valid cache and calls source fetcher', async () => {
    const { _resetCacheForTesting, _setCacheForTesting, getNewsFeed } = await import('./src/services/newsService.js');
    _resetCacheForTesting();

    const seededTime = new Date(Date.now() - 30000).toISOString(); // 30s ago
    _setCacheForTesting({
      articles: [
        { id: 'art-1', title: 'Old Article', url: 'https://example.com/old', category: 'General' }
      ],
      sourcesStatus: [{ id: 'src-1', name: 'Src 1', status: 'ok', count: 1 }],
      cachedAt: seededTime
    });

    let fetchCount = 0;
    const mockFetcher = async () => {
      fetchCount++;
      return {
        articles: [
          { id: 'art-2', title: 'Freshly Fetched Article', url: 'https://example.com/fresh', category: 'Tournaments' }
        ],
        sourcesStatus: [{ id: 'src-1', name: 'Src 1', status: 'ok', count: 1 }]
      };
    };

    const res = await getNewsFeed({ forceRefresh: true, _customFetcher: mockFetcher });
    assert.strictEqual(fetchCount, 1, 'Fetcher must be invoked on forceRefresh: true');
    assert.strictEqual(res.articles.length, 1);
    assert.strictEqual(res.articles[0].id, 'art-2');
    assert.notStrictEqual(res.cachedAt, seededTime, 'Cached timestamp must be updated');
    assert.strictEqual(res.isStale, false);
  });

  it('14. Concurrent forced-refresh requests share the same in-flight operation', async () => {
    const { _resetCacheForTesting, getNewsFeed } = await import('./src/services/newsService.js');
    _resetCacheForTesting();

    let fetchCount = 0;
    const mockSlowFetcher = async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 50));
      return {
        articles: [
          { id: 'art-concurrent', title: 'Concurrent Item', url: 'https://example.com/concurrent', category: 'General' }
        ],
        sourcesStatus: [{ id: 'src-1', name: 'Src 1', status: 'ok', count: 1 }]
      };
    };

    const [res1, res2, res3] = await Promise.all([
      getNewsFeed({ forceRefresh: true, _customFetcher: mockSlowFetcher }),
      getNewsFeed({ forceRefresh: true, _customFetcher: mockSlowFetcher }),
      getNewsFeed({ forceRefresh: true, _customFetcher: mockSlowFetcher })
    ]);

    assert.strictEqual(fetchCount, 1, 'Must coalesce concurrent refreshes into exactly one fetch');
    assert.strictEqual(res1.cachedAt, res2.cachedAt);
    assert.strictEqual(res2.cachedAt, res3.cachedAt);
    assert.strictEqual(res1.articles[0].id, 'art-concurrent');
  });

  it('15. Partial source failure still returns articles from successful sources and reports failures', async () => {
    const { _resetCacheForTesting, getNewsFeed } = await import('./src/services/newsService.js');
    _resetCacheForTesting();

    const mockPartialFetcher = async () => {
      return {
        articles: [
          { id: 'art-good', title: 'Good Source Story', url: 'https://example.com/good', category: 'General' }
        ],
        sourcesStatus: [
          { id: 'good-src', name: 'Good Source', status: 'ok', count: 1 },
          { id: 'bad-src', name: 'Bad Source', status: 'error', error: 'HTTP 500 error' }
        ]
      };
    };

    const res = await getNewsFeed({ forceRefresh: true, _customFetcher: mockPartialFetcher });
    assert.strictEqual(res.articles.length, 1);
    assert.strictEqual(res.sourcesStatus.length, 2);
    const failed = res.sourcesStatus.find((s) => s.status === 'error');
    assert.ok(failed);
    assert.strictEqual(failed.id, 'bad-src');
    assert.strictEqual(res.isStale, false);
  });

  it('16. Total refresh failure preserves old data, marks as stale, and does NOT update cachedAt', async () => {
    const { _resetCacheForTesting, _setCacheForTesting, getNewsFeed } = await import('./src/services/newsService.js');
    _resetCacheForTesting();

    const originalTime = '2026-10-12T10:00:00.000Z';
    _setCacheForTesting({
      articles: [
        { id: 'old-1', title: 'Existing Usable Story', url: 'https://example.com/old', category: 'General' }
      ],
      sourcesStatus: [{ id: 'src-1', name: 'Src 1', status: 'ok', count: 1 }],
      cachedAt: originalTime
    });

    const mockTotalFailFetcher = async () => {
      return {
        articles: [],
        sourcesStatus: [
          { id: 'src-1', name: 'Src 1', status: 'error', error: 'Connection refused' },
          { id: 'src-2', name: 'Src 2', status: 'error', error: 'Timeout' }
        ]
      };
    };

    const res = await getNewsFeed({ forceRefresh: true, _customFetcher: mockTotalFailFetcher });
    assert.strictEqual(res.articles.length, 1, 'Must preserve old articles on total failure');
    assert.strictEqual(res.cachedAt, originalTime, 'Must NOT update successful-refresh timestamp');
    assert.strictEqual(res.isStale, true, 'Must clearly mark data as stale');
    assert.strictEqual(res.lastRefreshFailed, true, 'Must indicate refresh failed');
  });

  it('17. Fastify GET /api/news?refresh=true sets no-cache headers and responds 200', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/news?refresh=true&limit=5'
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['cache-control'], 'no-cache, no-store, must-revalidate');
    assert.strictEqual(res.headers['pragma'], 'no-cache');
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.success, true);
    assert.ok(body.data.cachedAt);
    await app.close();
  });

  it('18. balanceArticles interleaves sources during a single-publisher burst', () => {
    const burstArticles = [
      { id: 'f-1', sourceId: 'fide', source: 'FIDE News', title: 'FIDE Story 1', publishedAt: '2026-10-12T13:00:00.000Z' },
      { id: 'f-2', sourceId: 'fide', source: 'FIDE News', title: 'FIDE Story 2', publishedAt: '2026-10-12T12:00:00.000Z' },
      { id: 'f-3', sourceId: 'fide', source: 'FIDE News', title: 'FIDE Story 3', publishedAt: '2026-10-12T11:00:00.000Z' },
      { id: 'c-1', sourceId: 'chess-com', source: 'Chess.com News', title: 'Chess.com Story 1', publishedAt: '2026-10-12T10:00:00.000Z' },
      { id: 'b-1', sourceId: 'chessbase', source: 'ChessBase', title: 'ChessBase Story 1', publishedAt: '2026-10-12T09:00:00.000Z' }
    ];

    const balanced = balanceArticles(burstArticles);
    assert.strictEqual(balanced.length, 5);
    // In chronological order, top 3 would be FIDE, FIDE, FIDE.
    // In balanced order, top 3 must interleave across the 3 distinct publishers:
    assert.strictEqual(balanced[0].sourceId, 'fide');
    assert.strictEqual(balanced[1].sourceId, 'chess-com');
    assert.strictEqual(balanced[2].sourceId, 'chessbase');
    // Then remaining FIDE articles follow
    assert.strictEqual(balanced[3].sourceId, 'fide');
    assert.strictEqual(balanced[4].sourceId, 'fide');
  });

  it('19. Recency protection prevents significantly older stories from overtaking breaking news', () => {
    const recencyArticles = [
      { id: 'breaking-1', sourceId: 'fide', source: 'FIDE News', title: 'Breaking FIDE 1', publishedAt: '2026-10-12T12:00:00.000Z' },
      { id: 'breaking-2', sourceId: 'fide', source: 'FIDE News', title: 'Breaking FIDE 2', publishedAt: '2026-10-12T10:00:00.000Z' },
      { id: 'breaking-3', sourceId: 'fide', source: 'FIDE News', title: 'Breaking FIDE 3', publishedAt: '2026-10-12T08:00:00.000Z' },
      // Lichess blog published 60 days ago:
      { id: 'old-lichess', sourceId: 'lichess', source: 'Lichess Blog', title: 'Old Lichess Feature', publishedAt: '2026-08-12T08:00:00.000Z' }
    ];

    const balanced = balanceArticles(recencyArticles);
    assert.strictEqual(balanced.length, 4);
    // Old Lichess article must NOT be placed ahead of today's breaking news
    assert.strictEqual(balanced[0].id, 'breaking-1');
    assert.strictEqual(balanced[1].id, 'breaking-2');
    assert.strictEqual(balanced[2].id, 'breaking-3');
    assert.strictEqual(balanced[3].id, 'old-lichess');
  });

  it('20. Uneven sources are handled safely without dropping or duplicating articles', () => {
    const uneven = [
      { id: 'lone', sourceId: 'lone-src', source: 'Lone Source', title: 'Only 1 item', publishedAt: '2026-10-12T10:00:00.000Z' }
    ];
    for (let i = 1; i <= 8; i++) {
      uneven.push({
        id: `many-${i}`,
        sourceId: 'prolific-src',
        source: 'Prolific Source',
        title: `Story ${i}`,
        publishedAt: new Date(Date.now() - i * 3600000).toISOString()
      });
    }

    const balanced = balanceArticles(uneven);
    assert.strictEqual(balanced.length, 9);
    const seenIds = new Set(balanced.map(a => a.id));
    assert.strictEqual(seenIds.size, 9, 'All 9 unique articles must be preserved');
  });

  it('21. Fastify GET /api/news supports sort=newest and sort=balanced parameters', async () => {
    const app = buildApp();

    const resBalanced = await app.inject({
      method: 'GET',
      url: '/api/news?sort=balanced&limit=10'
    });
    assert.strictEqual(resBalanced.statusCode, 200);
    const bodyBalanced = JSON.parse(resBalanced.payload);
    assert.strictEqual(bodyBalanced.data.sort, 'balanced');

    const resNewest = await app.inject({
      method: 'GET',
      url: '/api/news?sort=newest&limit=10'
    });
    assert.strictEqual(resNewest.statusCode, 200);
    const bodyNewest = JSON.parse(resNewest.payload);
    assert.strictEqual(bodyNewest.data.sort, 'newest');

    // In sort=newest, each article's publishedAt must be >= the subsequent article's publishedAt
    const newestArticles = bodyNewest.data.articles;
    for (let i = 0; i < newestArticles.length - 1; i++) {
      const tA = new Date(newestArticles[i].publishedAt).getTime();
      const tB = new Date(newestArticles[i + 1].publishedAt).getTime();
      assert.ok(tA >= tB, `Article ${i} (${newestArticles[i].publishedAt}) must be newer or equal to ${i+1} (${newestArticles[i+1].publishedAt})`);
    }

    await app.close();
  });

  it('22. Pagination on balanced feed returns contiguous non-overlapping slices', async () => {
    const app = buildApp();
    const page1 = await app.inject({ method: 'GET', url: '/api/news?sort=balanced&limit=6&offset=0' });
    const page2 = await app.inject({ method: 'GET', url: '/api/news?sort=balanced&limit=6&offset=6' });

    const body1 = JSON.parse(page1.payload);
    const body2 = JSON.parse(page2.payload);

    assert.strictEqual(body1.data.articles.length, 6);
    assert.strictEqual(body2.data.articles.length, 6);

    const ids1 = new Set(body1.data.articles.map(a => a.id));
    for (const a of body2.data.articles) {
      assert.ok(!ids1.has(a.id), `Page 2 article ${a.id} must not appear on Page 1`);
    }

    await app.close();
  });

});
