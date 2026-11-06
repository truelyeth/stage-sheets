// Serverless function: search Ultimate Guitar by name, or fetch one chord page, and return clean JSON.
// Reads the JSON that UG embeds in its own pages (the same data their page renders from).
// GET /api/ug?q=creep radiohead      -> { results:[{title,artist,url,rating,votes,version,type}] }
// GET /api/ug?url=https://tabs.ultimate-guitar.com/tab/...  -> { title,artist,key,capo,bpm,body }
// UG sits behind bot protection; when a fetch is challenged this answers 502 {error:"blocked"} and the app falls back to the bookmark.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function unescapeHtml(s) {
  return s.replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#x27;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/gi, '/').replace(/&amp;/g, '&');
}

async function ugStore(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow' });
  const html = await r.text();
  const m = html.match(/class="js-store"[^>]*data-content="([^"]*)"/);
  if (!m) {
    const blocked = r.status === 403 || r.status === 429 || r.status === 503 || /cf-chl|challenge-platform|Just a moment/i.test(html);
    const e = new Error(blocked ? 'blocked' : 'nostore'); e.status = r.status; throw e;
  }
  return JSON.parse(unescapeHtml(m[1]));
}

const g = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);

async function search(q) {
  const url = 'https://www.ultimate-guitar.com/search.php?search_type=title&value=' + encodeURIComponent(q);
  const j = await ugStore(url);
  const data = g(j, ['store', 'page', 'data']) || {};
  const raw = [].concat(data.results || [], data.other_tabs || []);
  const results = raw
    .filter(t => t && t.tab_url && /chords/i.test(t.type || '') && !t.marketing_type)
    .map(t => ({ title: t.song_name || '', artist: t.artist_name || '', url: t.tab_url, rating: +(t.rating || 0), votes: +(t.votes || 0), version: +(t.version || 1), type: t.type || '' }))
    .sort((a, b) => (b.votes - a.votes) || (b.rating - a.rating))
    .slice(0, 20);
  return { results };
}

async function fetchTab(url) {
  const j = await ugStore(url);
  const data = g(j, ['store', 'page', 'data']) || {};
  const tab = data.tab || {}, tv = data.tab_view || {};
  const body = g(tv, ['wiki_tab', 'content']);
  if (!body) throw new Error('nocontent');
  return {
    title: tab.song_name || '', artist: tab.artist_name || '', key: tab.tonality_name || '',
    capo: +(g(tv, ['meta', 'capo']) || 0), bpm: +(g(tv, ['strumming', 0, 'bpm']) || g(tv, ['meta', 'bpm']) || 0),
    body, source: url
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  const q = (req.query.q || '').toString().trim(), url = (req.query.url || '').toString().trim();
  try {
    if (url) {
      if (!/^https:\/\/(tabs\.|www\.)?ultimate-guitar\.com\/tab\//.test(url)) return res.status(400).json({ error: 'bad_url' });
      return res.status(200).json(await fetchTab(url));
    }
    if (q) return res.status(200).json(await search(q));
    return res.status(400).json({ error: 'missing q or url' });
  } catch (e) {
    const code = e.message === 'blocked' ? 'blocked' : e.message === 'nostore' ? 'blocked' : 'failed';
    return res.status(502).json({ error: code, detail: e.message, status: e.status || 0 });
  }
};
