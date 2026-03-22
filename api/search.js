// api/search.js  –  GET /api/search?s=<query>
//
// Query params:
//   s        – search keyword or year (required)
//   page     – page number (default: 1)
//   year     – filter by year (e.g. 2024)
//   genre    – filter by genre slug (e.g. action)
//   limit    – max results to return (default: all)

const { search } = require('../lib/search');

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { s, q, page, year, genre, limit } = req.query;

  const query = (s || q || '').trim();

  if (!query && !year && !genre) {
    return res.status(400).json({
      error: 'Query required. Use ?s=<search_term> or ?year=2024 or ?genre=action',
      examples: [
        '/api/search?s=honey',
        '/api/search?s=2024',
        '/api/search?year=2024&page=2',
        '/api/search?genre=action',
        '/api/search?s=spider+man',
      ],
    });
  }

  try {
    const data = await search(query || year || genre, {
      page:  parseInt(page || '1', 10),
      year:  year  || null,
      genre: genre || null,
    });

    let results = data.results;

    // Apply limit
    if (limit) {
      results = results.slice(0, parseInt(limit, 10));
    }

    // Filter by year if s= is a keyword but year param also given
    if (year && data.source !== 'year_browse') {
      results = results.filter(r => r.year === year);
    }

    return res.status(200).json({
      status:      'ok',
      creator: "Suhas-Bro-2026",
      query:       query || year || genre,
      page:        parseInt(page || '1', 10),
      total_pages: data.total_pages,
      source:      data.source,
      count:       results.length,
      results,
    });
  } catch (err) {
    return res.status(500).json({
      status:  'error',
      message: err.message,
    });
  }
};
