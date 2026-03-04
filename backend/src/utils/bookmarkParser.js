/**
 * Netscape Bookmark Format Parser
 *
 * Security hardened:
 *   - Tokenizer uses a linear character-scanner (no regex on tag content)
 *     to eliminate the ReDoS risk from alternation inside repetition.
 *   - decodeHTMLEntities decodes &amp; LAST so double-unescaping cannot
 *     smuggle encoded characters past a sanitised &amp;xx; sequence.
 *   - URL scheme check covers javascript:, data:, and vbscript:
 *     (case-insensitive, leading-whitespace tolerant).
 */

// ── Security: URL allow-list ──────────────────────────────────────────────────
const BLOCKED_SCHEMES = ['javascript:', 'data:', 'vbscript:'];

function isSafeUrl(url) {
  if (!url) return false;
  // Decode percent-encoding and collapse whitespace before checking
  let normalised;
  try { normalised = decodeURIComponent(url).trim().toLowerCase(); }
  catch { normalised = url.trim().toLowerCase(); }
  for (const scheme of BLOCKED_SCHEMES) {
    if (normalised.startsWith(scheme)) return false;
  }
  return true;
}

// ── Security: HTML entity decoder ─────────────────────────────────────────────
// &amp; is decoded LAST so that "&amp;lt;" → "&lt;" (literal), not "<".
function decodeHTMLEntities(str) {
  if (!str) return '';
  return str
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&amp;/g,  '&');   // ← MUST be last
}

// ── Tokenizer: linear scanner, no regex on tag content ───────────────────────
//
// The previous implementation used a regex with the pattern
//   ((?:[^>]|"[^"]*"|'[^']*')*?)
// inside a global match loop. That alternation-inside-repetition pattern is
// vulnerable to ReDoS on inputs like '<a """"""...' because the engine can
// match the empty string between each pair of quotes in exponentially many ways.
//
// This replacement scans the input one character at a time. It is O(n) in all
// cases and cannot backtrack.

function tokenize(html) {
  const tokens = [];
  const len = html.length;
  let i = 0;

  while (i < len) {
    if (html[i] !== '<') {
      // Text node — collect until next '<'
      let start = i;
      while (i < len && html[i] !== '<') i++;
      const text = html.slice(start, i).trim();
      if (text) tokens.push({ type: 'text', value: text });
      continue;
    }

    // Opening '<' — collect the full tag linearly
    i++; // skip '<'
    let closing = false;
    if (i < len && html[i] === '/') { closing = true; i++; }

    // Read tag name
    let tagName = '';
    while (i < len && html[i] !== '>' && html[i] !== ' ' && html[i] !== '\t' && html[i] !== '\n' && html[i] !== '\r' && html[i] !== '/') {
      tagName += html[i++];
    }
    tagName = tagName.toUpperCase();

    // Only keep tags we care about
    const KEEP = new Set(['DL', 'DT', 'H3', 'A', 'H1', 'H2', 'P']);
    if (!KEEP.has(tagName)) {
      // Skip to end of tag
      while (i < len && html[i] !== '>') {
        if (html[i] === '"') { i++; while (i < len && html[i] !== '"') i++; }
        else if (html[i] === "'") { i++; while (i < len && html[i] !== "'") i++; }
        i++;
      }
      if (i < len) i++; // skip '>'
      continue;
    }

    // Collect attributes linearly
    const attrMap = {};
    while (i < len && html[i] !== '>' && html[i] !== '/') {
      // Skip whitespace
      while (i < len && (html[i] === ' ' || html[i] === '\t' || html[i] === '\n' || html[i] === '\r')) i++;
      if (i >= len || html[i] === '>' || html[i] === '/') break;

      // Read attribute name
      let attrName = '';
      while (i < len && html[i] !== '=' && html[i] !== '>' && html[i] !== ' ' && html[i] !== '\t' && html[i] !== '\n' && html[i] !== '\r') {
        attrName += html[i++];
      }
      if (!attrName) { i++; continue; }

      let attrVal = '';
      if (i < len && html[i] === '=') {
        i++; // skip '='
        if (i < len && html[i] === '"') {
          i++; // skip opening "
          while (i < len && html[i] !== '"') attrVal += html[i++];
          if (i < len) i++; // skip closing "
        } else if (i < len && html[i] === "'") {
          i++; // skip opening '
          while (i < len && html[i] !== "'") attrVal += html[i++];
          if (i < len) i++; // skip closing '
        } else {
          // Unquoted value
          while (i < len && html[i] !== '>' && html[i] !== ' ' && html[i] !== '\t') attrVal += html[i++];
        }
      }
      if (attrName) attrMap[attrName.toUpperCase()] = attrVal;
    }

    // Skip to end of tag
    while (i < len && html[i] !== '>') i++;
    if (i < len) i++; // skip '>'

    if (closing) {
      tokens.push({ type: 'close', tag: tagName });
    } else {
      tokens.push({ type: 'open', tag: tagName, attrs: attrMap });
    }
  }

  return tokens;
}

// ── Tree parser ───────────────────────────────────────────────────────────────

function parseDL(tokens, pos) {
  const items = [];

  while (pos.i < tokens.length) {
    const tok = tokens[pos.i];

    if (tok.type === 'close' && tok.tag === 'DL') {
      pos.i++;
      break;
    }

    if (tok.type === 'open' && tok.tag === 'DL') {
      pos.i++;
      const children = parseDL(tokens, pos);
      if (items.length > 0 && items[items.length - 1].type === 'folder') {
        items[items.length - 1].children.push(...children);
      }
      continue;
    }

    if (tok.type === 'open' && tok.tag === 'DT') {
      pos.i++;
      while (pos.i < tokens.length) {
        const inner = tokens[pos.i];

        if (inner.type === 'open' && inner.tag === 'H3') {
          pos.i++;
          let name = '';
          while (pos.i < tokens.length) {
            const t = tokens[pos.i];
            if (t.type === 'text') { name += t.value; pos.i++; }
            else if (t.type === 'close' && t.tag === 'H3') { pos.i++; break; }
            else break;
          }
          const folder = { type: 'folder', name: decodeHTMLEntities(name.trim()), children: [] };
          items.push(folder);

          while (pos.i < tokens.length) {
            const peek = tokens[pos.i];
            if (peek.type === 'open' && peek.tag === 'DL') {
              pos.i++;
              folder.children = parseDL(tokens, pos);
              break;
            }
            if ((peek.type === 'open' && peek.tag === 'DT') ||
                (peek.type === 'close' && peek.tag === 'DL')) break;
            pos.i++;
          }
          break;
        }

        if (inner.type === 'open' && inner.tag === 'A') {
          // Decode the raw HREF value, then check scheme safety
          const rawHref = inner.attrs['HREF'] || '';
          const url = decodeHTMLEntities(rawHref);
          pos.i++;
          let title = '';
          while (pos.i < tokens.length) {
            const t = tokens[pos.i];
            if (t.type === 'text') { title += t.value; pos.i++; }
            else if (t.type === 'close' && t.tag === 'A') { pos.i++; break; }
            else break;
          }
          if (isSafeUrl(url)) {
            items.push({ type: 'bookmark', title: decodeHTMLEntities(title.trim()) || url, url });
          }
          break;
        }

        pos.i++;
        break;
      }
      continue;
    }

    pos.i++;
  }

  return items;
}

function parseBookmarkHTML(html) {
  const tokens = tokenize(html);
  const pos = { i: 0 };
  while (pos.i < tokens.length) {
    const tok = tokens[pos.i];
    if (tok.type === 'open' && tok.tag === 'DL') {
      pos.i++;
      return parseDL(tokens, pos);
    }
    pos.i++;
  }
  return [];
}

module.exports = { parseBookmarkHTML };
