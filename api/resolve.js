// api/resolve.js  –  GET /api/resolve?url=<redirect_url>

const { resolveLink } = require('../lib/scraper');

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'url parameter required' });
  }

  try {
    const realUrl = await resolveLink(url);
    return res.status(200).json({
      status:       'ok',
      redirect_url: url,
      real_url:     realUrl,
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
