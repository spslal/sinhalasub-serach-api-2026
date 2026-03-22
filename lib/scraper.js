// lib/scraper.js  –  sinhalasub.lk scraper core

const axios  = require('axios');
const cheerio = require('cheerio');

// ── Browser-like headers ────────────────────────────────────────────────────
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 11; 220233L2G) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/97.0.4692.98 Mobile Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,' +
    'image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language':     'en-GB,en-US;q=0.9,en;q=0.8',
  'Referer':             'https://sinhalasub.lk/',
  'Upgrade-Insecure-Requests': '1',
  'sec-ch-ua':           '" Not;A Brand";v="99", "Google Chrome";v="97"',
  'sec-ch-ua-mobile':    '?1',
  'sec-fetch-dest':      'document',
  'sec-fetch-mode':      'navigate',
  'sec-fetch-site':      'same-origin',
  'sec-fetch-user':      '?1',
};

// ── Fetch HTML ──────────────────────────────────────────────────────────────
async function fetchHTML(url) {
  const res = await axios.get(url, {
    headers: HEADERS,
    timeout: 20000,
    maxRedirects: 10,
    validateStatus: s => s < 400,
  });
  return res.data;
}

// ── Resolve sinhalasub /links/XXXXX/ → real download URL ───────────────────
async function resolveLink(redirectUrl) {
  try {
    const res = await axios.get(redirectUrl, {
      headers: HEADERS,
      timeout: 15000,
      maxRedirects: 10,
      validateStatus: s => s < 400,
    });

    // 1. Check if final URL already redirected
    if (res.request && res.request.res && res.request.res.responseUrl) {
      const finalUrl = res.request.res.responseUrl;
      if (finalUrl !== redirectUrl) return finalUrl;
    }

    const html = res.data;

    // 2. Meta refresh
    const metaMatch = html.match(/content=["']\d+;\s*url=([^"']+)["']/i);
    if (metaMatch) return metaMatch[1].trim();

    // 3. JS window.location
    const jsMatch = html.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
    if (jsMatch) return jsMatch[1].trim();

    // 4. Cheerio — find any external link in page
    const $ = cheerio.load(html);
    let found = null;
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && (
        href.includes('pixeldrain.com') ||
        href.includes('mega.nz') ||
        href.includes('mediafire.com') ||
        href.includes('drive.google.com') ||
        href.includes('gofile.io') ||
        href.includes('1fichier.com') ||
        href.includes('terabox.com') ||
        href.includes('t.me')
      )) {
        found = href;
        return false; // break
      }
    });
    if (found) return found;

    // 5. Return original if nothing found
    return redirectUrl;
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

// ── Main scrape function ────────────────────────────────────────────────────
async function scrapeMovie(url) {
  const html = await fetchHTML(url);
  const $    = cheerio.load(html);
  const result = { source_url: url };

  // ── Title ─────────────────────────────────────────────────────────────────
  const titleEl = $('div.info-details h3').first() ||
                  $('h1').first();
  result.title = $('title').text().split('|')[0].trim() || '';
  if ($('div.info-details h3').length)
    result.title = $('div.info-details h3').first().text().trim();

  // ── Poster ────────────────────────────────────────────────────────────────
  const posterImg = $('img[src*="image.tmdb.org"], img[src*="wp-content/uploads"]').first();
  if (posterImg.length)
    result.poster = posterImg.attr('src') || posterImg.attr('data-src') || '';

  // ── Post ID ───────────────────────────────────────────────────────────────
  const pidMatch = html.match(/\?p=(\d+)/);
  if (pidMatch) result.post_id = pidMatch[1];

  // ── Details block ─────────────────────────────────────────────────────────
  const detailsBlock = $('div.info-details, div.singledata').first();
  if (detailsBlock.length) {
    const blockText = detailsBlock.text().replace(/\s+/g, ' ').trim();

    const imdb = blockText.match(/IMDb\s*[:\-]?\s*([\d.]+)/i);
    if (imdb) result.imdb_rating = imdb[1];

    const dur = blockText.match(/(\d+)\s*min/i);
    if (dur) result.duration_min = dur[1];

    const yr = blockText.match(/\b(20\d{2})\b/);
    if (yr) result.year = yr[1];

    const genres = [];
    detailsBlock.find('a[href*="/genre/"]').each((_, el) => genres.push($(el).text().trim()));
    if (genres.length) result.genres = genres;

    const fields = [
      ['language',        /Language\s*[:\-]\s*(.+?)(?:Subtitle|Director|Stars|Year|$)/is],
      ['director',        /Director\s*[:\-]\s*(.+?)(?:Stars|Language|Year|$)/is],
      ['stars',           /Stars\s*[:\-]\s*(.+?)(?:Year|Language|Director|$)/is],
      ['subtitle_author', /Subtitle Author\s*[:\-]\s*(.+?)(?:Subtitle Site|Director|$)/is],
      ['subtitle_site',   /Subtitle Site\s*[:\-]\s*(.+?)(?:Director|Stars|$)/is],
    ];
    for (const [key, rx] of fields) {
      const m = blockText.match(rx);
      if (m) result[key] = m[1].replace(/\s+/g,' ').trim().slice(0, 150);
    }

    const paras = [];
    detailsBlock.find('p').each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 30) paras.push(t);
    });
    if (paras.length) result.description = paras.sort((a,b) => b.length - a.length)[0];
  }

  if (!result.year) {
    const ym = url.match(/\b(20\d{2})\b/);
    if (ym) result.year = ym[1];
  }

  // ── Download + Subtitle Tables ────────────────────────────────────────────
  const tabLabels = [];
  $('ul.links-tabs li a[data-tabid]').each((_, el) => {
    tabLabels.push($(el).attr('data-tabid'));
  });

  const downloadGroups = [];
  const subtitleLinks  = [];

  $('table.links-table').each((i, table) => {
    const label = tabLabels[i] || `Group_${i}`;
    const entries = [];

    $(table).find('tr').slice(1).each((_, row) => {
      const cols   = $(row).find('td');
      const aTag   = $(row).find('a[href]').first();
      if (!aTag.length) return;

      const href    = aTag.attr('href');
      const quality = cols.eq(1).text().trim();
      const size    = cols.eq(2).text().trim();
      const clicks  = cols.eq(3).text().trim();

      entries.push({ quality, size, clicks, redirect_url: href });
    });

    if (label.toLowerCase() === 'subtitles') {
      entries.forEach(e => subtitleLinks.push({ quality: e.quality, redirect_url: e.redirect_url }));
    } else if (entries.length) {
      downloadGroups.push({ host: label, links: entries });
    }
  });

  result.download_links = downloadGroups;
  result.subtitle_links  = subtitleLinks;

  // ── Player Options ────────────────────────────────────────────────────────
  const playerOpts = [];
  $('li.zetaflix_player_option').each((_, el) => {
    playerOpts.push({
      type:       $(el).attr('data-type'),
      post_id:    $(el).attr('data-post'),
      player_num: $(el).attr('data-nume'),
      label:      $(el).find('.opt-name').text().trim(),
    });
  });
  result.player_options = playerOpts;
  result.player_api      = 'https://sinhalasub.lk/wp-json/zetaplayer/v2/';

  return result;
}

module.exports = { scrapeMovie, resolveLink };
