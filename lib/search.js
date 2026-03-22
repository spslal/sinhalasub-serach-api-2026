// lib/search.js  –  sinhalasub.lk search scraper

const axios   = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 11; 220233L2G) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/97.0.4692.98 Mobile Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
  'Referer':         'https://sinhalasub.lk/',
};

const BASE = 'https://sinhalasub.lk';

// ── Parse movie cards from any sinhalasub.lk listing page ──────────────────
function parseMovieCards($) {
  const results = [];

  // Method 1: .display-item cards (main listing style)
  $('.display-item, .item-box, .result-item').each((_, el) => {
    const $el    = $(el);
    const anchor = $el.find('a[href*="/movies/"]').first();
    const title  =
      $el.find('.data-title, .item-title, h3, .entry-title').first().text().trim() ||
      anchor.attr('title') || anchor.text().trim();
    const url    = anchor.attr('href') || '';
    const poster =
      $el.find('img').first().attr('src') ||
      $el.find('img').first().attr('data-src') || '';
    const year   = (url.match(/\b(20\d{2})\b/) || [])[1] || '';
    const quality = $el.find('.item-quality, .quality, span.quality').first().text().trim();

    if (url && url.includes('/movies/')) {
      results.push({
        title:   title || extractTitleFromUrl(url),
        url:     url.startsWith('http') ? url : BASE + url,
        poster,
        year,
        quality,
      });
    }
  });

  // Method 2: result-item rows (search results page)
  if (results.length === 0) {
    $('.result-item-row, .search-result').each((_, el) => {
      const $el   = $(el);
      const anchor = $el.find('a[href*="/movies/"]').first();
      const title  = $el.find('.result-title, h3').first().text().trim() || anchor.text().trim();
      const url    = anchor.attr('href') || '';
      const poster = $el.find('img').first().attr('src') || '';
      const year   = (url.match(/\b(20\d{2})\b/) || [])[1] || '';

      if (url && url.includes('/movies/')) {
        results.push({
          title:  title || extractTitleFromUrl(url),
          url:    url.startsWith('http') ? url : BASE + url,
          poster,
          year,
          quality: '',
        });
      }
    });
  }

  // Method 3: any anchor to /movies/ (fallback)
  if (results.length === 0) {
    const seen = new Set();
    $('a[href*="/movies/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      if (seen.has(href) || href.includes('/feed/')) return;
      seen.add(href);
      const url  = href.startsWith('http') ? href : BASE + href;
      const year = (url.match(/\b(20\d{2})\b/) || [])[1] || '';
      const title = $(el).text().trim() ||
                    $(el).attr('title') ||
                    extractTitleFromUrl(url);
      if (title.length > 2) {
        results.push({ title, url, poster: '', year, quality: '' });
      }
    });
  }

  return dedupe(results);
}

function extractTitleFromUrl(url) {
  const slug = url.split('/movies/')[1] || '';
  return slug
    .replace(/-sinhala-subtitles\/?$/, '')
    .replace(/-(\d{4})-?/, ' ($1) ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

// ── Approach 1: WordPress /?s= search page ─────────────────────────────────
async function searchWP(query, page = 1) {
  const url = `${BASE}/?s=${encodeURIComponent(query)}&post_type=movies&paged=${page}`;
  const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const $   = cheerio.load(res.data);

  // Get total pages
  const lastPage = (() => {
    let max = 1;
    $('a.page-numbers, .pagination a').each((_, el) => {
      const n = parseInt($(el).text().trim(), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max;
  })();

  return { results: parseMovieCards($), total_pages: lastPage, source: 'wp_search' };
}

// ── Approach 2: Zetaflix REST API ──────────────────────────────────────────
async function searchZetaflix(query) {
  // The zetaflix search API accepts ?s= param
  const url = `${BASE}/wp-json/zetaflix/search/?s=${encodeURIComponent(query)}`;
  const res = await axios.get(url, {
    headers: { ...HEADERS, Accept: 'application/json, */*' },
    timeout: 15000,
    validateStatus: s => s < 500,
  });

  // If it returns JSON array
  if (Array.isArray(res.data)) {
    return res.data.map(item => ({
      title:  item.title || item.post_title || extractTitleFromUrl(item.url || item.link || ''),
      url:    item.url   || item.link || item.permalink || '',
      poster: item.img   || item.thumbnail || item.poster || '',
      year:   item.year  || (((item.url || '').match(/\b(20\d{2})\b/) || [])[1]) || '',
      quality: item.quality || '',
    }));
  }

  // If it returns HTML (some themes do this)
  if (typeof res.data === 'string' && res.data.includes('<')) {
    const $ = cheerio.load(res.data);
    return parseMovieCards($);
  }

  return [];
}

// ── Approach 3: Year/genre browse via /?year= or /movies/?year= ────────────
async function browseByYear(year, page = 1) {
  // WordPress year archive
  const url = `${BASE}/?post_type=movies&year=${year}&paged=${page}`;
  const res  = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const $    = cheerio.load(res.data);

  const lastPage = (() => {
    let max = 1;
    $('a.page-numbers, .pagination a').each((_, el) => {
      const n = parseInt($(el).text().trim(), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max;
  })();

  return { results: parseMovieCards($), total_pages: lastPage, source: 'year_browse' };
}

// ── Approach 4: Genre browse ───────────────────────────────────────────────
async function browseByGenre(genre, page = 1) {
  const url = `${BASE}/genre/${encodeURIComponent(genre)}/page/${page}/`;
  const res  = await axios.get(url, { headers: HEADERS, timeout: 20000 });
  const $    = cheerio.load(res.data);

  const lastPage = (() => {
    let max = 1;
    $('a.page-numbers, .pagination a').each((_, el) => {
      const n = parseInt($(el).text().trim(), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return max;
  })();

  return { results: parseMovieCards($), total_pages: lastPage, source: 'genre_browse' };
}

// ── Main smart search: tries REST API first, falls back to WP search ────────
async function search(query, { page = 1, year = null, genre = null } = {}) {
  // Year-only query: use year browse
  if (year || /^20\d{2}$/.test(query.trim())) {
    const yr = year || query.trim();
    return browseByYear(yr, page);
  }

  // Genre query
  if (genre) {
    return browseByGenre(genre, page);
  }

  // Try zetaflix REST API first (faster, no pagination needed)
  try {
    const ztResults = await searchZetaflix(query);
    if (ztResults.length > 0) {
      return {
        results:     ztResults,
        total_pages: 1,
        source:      'zetaflix_api',
      };
    }
  } catch (_) {}

  // Fallback: WordPress search page scrape
  return searchWP(query, page);
}

module.exports = { search, searchWP, searchZetaflix, browseByYear, browseByGenre };
