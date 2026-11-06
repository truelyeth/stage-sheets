// Serverless function: find chord sheets by name, or fetch one page, and return clean JSON.
//   GET /api/ug?q=<query>      -> { results:[{title,artist,url,rating,votes,version,source}] }
//                                 Hebrew queries search tab4u first, then Ultimate Guitar; others the reverse.
//   GET /api/ug?url=<page url> -> { title,artist,key,capo,bpm,body,source }   (ultimate-guitar.com or tab4u.com)
// Sites may block server fetches; then this answers 502 {error:"blocked"} and the app offers the bookmark instead.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const HEB = /[֐-׿]/;

function decodeEntities(s) {
  return s.replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#x27;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x2F;/gi, '/').replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
}
async function getHtml(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'he-IL,he;q=0.9,en-US,en;q=0.8' }, redirect: 'follow' });
  const html = await r.text();
  const blocked = r.status === 403 || r.status === 429 || r.status === 503 || /cf-chl|challenge-platform|Just a moment/i.test(html);
  if (blocked) { const e = new Error('blocked'); e.status = r.status; throw e; }
  if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e; }
  return html;
}
const g = (o, p) => p.reduce((a, k) => (a == null ? a : a[k]), o);

/* ---------------- Ultimate Guitar ---------------- */
async function ugStore(url) {
  const html = await getHtml(url);
  const m = html.match(/class="js-store"[^>]*data-content="([^"]*)"/);
  if (!m) throw new Error('nostore');
  return JSON.parse(decodeEntities(m[1]));
}
async function ugSearch(q) {
  const j = await ugStore('https://www.ultimate-guitar.com/search.php?search_type=title&value=' + encodeURIComponent(q));
  const data = g(j, ['store', 'page', 'data']) || {};
  return [].concat(data.results || [], data.other_tabs || [])
    .filter(t => t && t.tab_url && /chords/i.test(t.type || '') && !t.marketing_type)
    .map(t => ({ title: t.song_name || '', artist: t.artist_name || '', url: t.tab_url, rating: +(t.rating || 0), votes: +(t.votes || 0), version: +(t.version || 1), source: 'UG' }))
    .sort((a, b) => (b.votes - a.votes) || (b.rating - a.rating)).slice(0, 20);
}
async function ugTab(url) {
  const j = await ugStore(url);
  const data = g(j, ['store', 'page', 'data']) || {};
  const tab = data.tab || {}, tv = data.tab_view || {};
  const body = g(tv, ['wiki_tab', 'content']);
  if (!body) throw new Error('nocontent');
  return { title: tab.song_name || '', artist: tab.artist_name || '', key: tab.tonality_name || '', capo: +(g(tv, ['meta', 'capo']) || 0),
    bpm: +(g(tv, ['strumming', 0, 'bpm']) || g(tv, ['meta', 'bpm']) || 0), body, source: 'UG' };
}

/* ---------------- tab4u (Hebrew) ---------------- */
const CHORD_RE = /^\(?[A-G](?:#|b)?(?:m|M|maj|min|dim|aug|sus|add|°|ø|\+|-)?\d{0,2}(?:(?:sus|add|maj|M|b|#|\+|-)\d{1,2})*(?:\/[A-G](?:#|b)?)?\)?[*]?$/;
const FILLER_RE = /^(\||\|\||\/|-|–|—|%|x\d+|\(x\d+\)|N\.?C\.?|\.{2,}|…|\(|\)|,)$/i;
function isChordLine(line) { const t = line.trim().split(/\s+/).filter(Boolean); if (!t.length) return false; let n = 0; for (const x of t) { if (CHORD_RE.test(x)) n++; else if (!FILLER_RE.test(x)) return false; } return n > 0; }
function tab4uNameFromUrl(href) {
  // /tabs/songs/2137_עברי_לידר_-_יותר_טוב_כלום.html  -> artist "עברי לידר", song "יותר טוב כלום"
  const m = href.match(/\/tabs\/songs\/\d+_([^?#]*?)\.html/); if (!m) return null;
  let s; try { s = decodeURIComponent(m[1]); } catch (e) { s = m[1]; }
  const parts = s.split('_-_');
  const clean = x => x.replace(/_/g, ' ').trim();
  return parts.length >= 2 ? { artist: clean(parts[0]), title: clean(parts.slice(1).join(' - ')) } : { artist: '', title: clean(s) };
}
async function tab4uSearch(q) {
  const html = await getHtml('https://www.tab4u.com/resultsSimple?tab=songs&q=' + encodeURIComponent(q));
  const seen = new Set(), out = [];
  const re = /href="([^"]*\/tabs\/songs\/\d+_[^"]*\.html[^"]*)"/g; let m;
  while ((m = re.exec(html))) {
    let href = decodeEntities(m[1]).replace(/[?#].*$/, '');
    if (!/^https?:/.test(href)) href = 'https://www.tab4u.com/' + href.replace(/^\/+/, '');
    if (seen.has(href)) continue; seen.add(href);
    const n = tab4uNameFromUrl(href); if (!n) continue;
    out.push({ title: n.title, artist: n.artist, url: href, rating: 0, votes: 0, version: 1, source: 'tab4u' });
  }
  return out.slice(0, 20);
}
function sliceElement(html, idAttr) {
  // take the inner HTML of the element with this id, by counting div depth
  const start = html.search(new RegExp('<[a-z]+[^>]*\\bid="' + idAttr + '"[^>]*>', 'i')); if (start < 0) return null;
  const open = html.indexOf('>', start) + 1; const tag = html.slice(start, open).match(/^<([a-z]+)/i)[1].toLowerCase();
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); re.lastIndex = open; let depth = 1, m;
  while ((m = re.exec(html))) { depth += m[1] ? -1 : 1; if (depth === 0) return html.slice(open, m.index); }
  return html.slice(open);
}
function htmlToText(h) {
  return decodeEntities(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(tr|div|p|h\d|li|table)>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/ /g, ' ').replace(/\r/g, '');
}
async function tab4uTab(url) {
  const html = await getHtml(url);
  const inner = sliceElement(html, 'songContentTPL'); if (!inner) throw new Error('nocontent');
  const lines = htmlToText(inner).replace(/לחץ לתצוגה נוספת/g, '').split('\n').map(l => l.replace(/\s+$/, ''));
  const kept = []; for (const l of lines) { if (l.trim() === '' && kept.length && kept[kept.length - 1].trim() === '') continue; kept.push(l); }
  // a blank line between a chord line and the lyric under it is markup noise, never intent: close it so the pair stays together
  const tidy = []; for (let i = 0; i < kept.length; i++) {
    const l = kept[i];
    if (l.trim() === '' && i > 0 && i + 1 < kept.length && isChordLine(kept[i - 1]) && kept[i + 1].trim() && !isChordLine(kept[i + 1]) && !/^\s*[\[\(]|:\s*$/.test(kept[i + 1])) continue;
    tidy.push(l);
  }
  const body = tidy.join('\n').replace(/^\n+|\n+$/g, '');
  if (!body.trim()) throw new Error('nocontent');
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]; let artist = '', title = '';
  if (h1) { const t = htmlToText(h1).replace(/\s+/g, ' ').trim(); const i = t.indexOf(' - '); if (i > 0) { artist = t.slice(0, i).trim(); title = t.slice(i + 3).replace(/\(.*$/, '').trim(); } else title = t; }
  if (!title) { const n = tab4uNameFromUrl(url); if (n) { title = n.title; artist = artist || n.artist; } }
  const capo = +((html.match(/קאפו[^0-9]{0,12}(\d+)/) || [])[1] || 0);
  return { title, artist, key: '', capo, bpm: 0, body, source: 'tab4u', rtl: HEB.test(body) };
}

/* ---------------- handler ---------------- */
async function search(q) {
  const order = HEB.test(q) ? [tab4uSearch, ugSearch] : [ugSearch, tab4uSearch];
  let results = [], errors = [];
  for (const fn of order) {
    try { results = results.concat(await fn(q)); } catch (e) { errors.push((fn === ugSearch ? 'UG: ' : 'tab4u: ') + e.message); }
    if (results.length >= 5 && fn === order[0]) break;   // first choice had enough; don't bother the other site
  }
  return { results: results.slice(0, 25), errors };
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  const q = (req.query.q || '').toString().trim(), url = (req.query.url || '').toString().trim();
  try {
    if (url) {
      if (/^https:\/\/(tabs\.|www\.)?ultimate-guitar\.com\/tab\//.test(url)) return res.status(200).json(await ugTab(url));
      if (/^https:\/\/(www\.)?tab4u\.com\/tabs\/songs\//.test(url)) return res.status(200).json(await tab4uTab(url));
      return res.status(400).json({ error: 'bad_url' });
    }
    if (q) { const out = await search(q); if (!out.results.length && out.errors.some(e => /blocked/.test(e))) return res.status(502).json({ error: 'blocked', detail: out.errors.join('; ') }); return res.status(200).json(out); }
    return res.status(400).json({ error: 'missing q or url' });
  } catch (e) {
    const code = /blocked|nostore/.test(e.message) ? 'blocked' : 'failed';
    return res.status(502).json({ error: code, detail: e.message, status: e.status || 0 });
  }
};
