// api/index.js  –  Vercel Serverless Function
//
// Endpoints:
//   GET /api?url=<movie_url>                       → scrape movie details
//   GET /api?url=<movie_url>&resolve=true          → scrape + resolve real download URLs
//   GET /api?url=<movie_url>&resolve=true&pixeldrain=true → Pixeldrain links only
//   GET /api?s=<query>                             → search movies
//   GET /api?s=2024                                → browse by year
//   GET /api?s=<query>&year=2024                   → search + filter by year
//   GET /api?s=<query>&page=2                      → paginate results
//   GET /api/resolve?url=<sinhalasub_link>         → resolve single /links/ redirect

const { scrapeMovie, resolveLink } = require('../lib/scraper');
const { search }                   = require('../lib/search');

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, resolve, pixeldrain, s, q, page, year, genre, limit } = req.query;
  const path = req.url || '';

  // ── /resolve route ───────────────────────────────────────────────────────
  if (path.includes('/resolve') || (resolve && resolve.startsWith('http'))) {
    const linkUrl = path.includes('/resolve') ? url : resolve;
    if (!linkUrl) return res.status(400).json({ error: 'url required' });
    try {
      const realUrl = await resolveLink(linkUrl);
      return res.status(200).json({ status: 'ok', redirect_url: linkUrl, real_url: realUrl });
    } catch (err) {
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }

  // ── Search route: ?s= or ?q= or ?year= or ?genre= ───────────────────────
  const query = (s || q || '').trim();
  if (query || year || genre) {
    try {
      const data = await search(query || year || genre, {
        page:  parseInt(page || '1', 10),
        year:  year  || null,
        genre: genre || null,
      });

      let results = data.results;
      if (limit) results = results.slice(0, parseInt(limit, 10));
      if (year && data.source !== 'year_browse') {
        results = results.filter(r => r.year === year);
      }

      return res.status(200).json({
        status:      'ok',
        query:       query || year || genre,
        page:        parseInt(page || '1', 10),
        total_pages: data.total_pages,
        source:      data.source,
        count:       results.length,
        results,
      });
    } catch (err) {
      return res.status(500).json({ status: 'error', message: err.message });
    }
  }

  // ── Movie scrape route: ?url= ────────────────────────────────────────────
  if (url) {
    try {
      const data = await scrapeMovie(url);

      if (resolve === 'true' || resolve === '1') {
        for (const group of data.download_links) {
          group.links = await Promise.all(
            group.links.map(async link => ({
              ...link,
              real_url: await resolveLink(link.redirect_url),
            }))
          );
        }
        data.subtitle_links = await Promise.all(
          data.subtitle_links.map(async sub => ({
            ...sub,
            real_url: await resolveLink(sub.redirect_url),
          }))
        );
      }

      if (pixeldrain === 'true' || pixeldrain === '1') {
        data.download_links = data.download_links.filter(
          g => g.host.toLowerCase().includes('pixeldrain')
        );
      }

      return res.status(200).json({ status: 'ok', data });
    } catch (err) {
      return res.status(500).json({ status: 'error', message: err.message, url });
    }
  }

  // ── Help / index ─────────────────────────────────────────────────────────
  return res.status(200).json({
    service: 'sinhalasub.lk Scraper API v3',
    endpoints: {
      'GET /api?s=<keyword>':                         'Search movies by title',
      'GET /api?s=2024':                              'Browse movies by year',
      'GET /api?s=<keyword>&year=2024':               'Search + filter by year',
      'GET /api?s=<keyword>&page=2':                  'Paginate results',
      'GET /api?genre=action':                        'Browse by genre',
      'GET /api?url=<movie_url>':                     'Scrape movie details',
      'GET /api?url=<movie_url>&resolve=true':        'Scrape + real download URLs',
      'GET /api?url=<movie_url>&resolve=true&pixeldrain=true': 'Pixeldrain links only',
      'GET /api/resolve?url=<sinhalasub_links_url>':  'Resolve single redirect',
    },
    examples: [
      '/api?s=honey',
      '/api?s=2024',
      '/api?s=spider+man&year=2024',
      '/api?genre=horror&page=2',
      '/api?url=https://sinhalasub.lk/movies/honey-2026-sinhala-subtitles/&resolve=true&pixeldrain=true',
      '/api/resolve?url=https://sinhalasub.lk/links/wtn0gvr18x/',
    ],
  });
};
