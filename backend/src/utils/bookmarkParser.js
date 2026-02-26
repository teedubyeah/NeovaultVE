/**
 * Netscape Bookmark Format Parser
 * 
 * Properly handles the nested DL/DT/H3/A structure used by all major browsers.
 * The format looks like:
 *
 *   <DL><p>
 *     <DT><H3>Folder Name</H3>
 *     <DL><p>
 *       <DT><A HREF="https://...">Title</A>
 *       <DT><H3>Subfolder</H3>
 *       <DL><p>
 *         <DT><A HREF="https://...">Title</A>
 *       </DL><p>
 *     </DL><p>
 *     <DT><A HREF="https://...">Title</A>
 *   </DL>
 *
 * The key insight: a <H3> folder tag is immediately followed (as a sibling DT,
 * not nested inside it) by a <DL> block containing its children.
 * Regex approaches fail because they can't correctly match paired DL tags.
 * We use a position-based scanner instead.
 */

function decodeHTMLEntities(str) {
  return (str || '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/**
 * Tokenize the HTML into a flat list of tokens we care about.
 * This is much more robust than trying to use a single regex.
 */
function tokenize(html) {
  const tokens = [];
  // Match tags and text we care about
  const re = /<(\/?)(?:(DL|DT|H3|A|H1|H2|p))((?:[^>]|"[^"]*"|'[^']*')*?)\/?>|([^<]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, closing, tag, attrs, text] = m;
    if (tag) {
      const tagUpper = tag.toUpperCase();
      if (closing) {
        tokens.push({ type: 'close', tag: tagUpper });
      } else {
        const attrMap = {};
        const attrRe = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
        let am;
        while ((am = attrRe.exec(attrs)) !== null) {
          attrMap[am[1].toUpperCase()] = am[2] ?? am[3] ?? am[4] ?? '';
        }
        tokens.push({ type: 'open', tag: tagUpper, attrs: attrMap, raw: attrs });
      }
    } else if (text) {
      const t = text.trim();
      if (t) tokens.push({ type: 'text', value: t });
    }
  }
  return tokens;
}

/**
 * Parse tokenized output into a tree of { type:'folder'|'bookmark', name, url, children }
 * pos is a mutable cursor object { i } so we can advance through tokens recursively.
 */
function parseDL(tokens, pos) {
  const items = [];

  while (pos.i < tokens.length) {
    const tok = tokens[pos.i];

    if (tok.type === 'close' && tok.tag === 'DL') {
      pos.i++; // consume </DL>
      break;
    }

    if (tok.type === 'open' && tok.tag === 'DL') {
      // Unexpected nested DL without an H3 before it — skip
      pos.i++;
      const children = parseDL(tokens, pos);
      if (items.length > 0 && items[items.length - 1].type === 'folder') {
        items[items.length - 1].children.push(...children);
      }
      continue;
    }

    if (tok.type === 'open' && tok.tag === 'DT') {
      pos.i++; // consume <DT>
      // Look at what follows: H3 (folder) or A (bookmark)
      while (pos.i < tokens.length) {
        const inner = tokens[pos.i];

        if (inner.type === 'open' && inner.tag === 'H3') {
          // Folder — collect the text content
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

          // The <DL> for this folder's children should come soon —
          // skip whitespace tokens and <p> tags until we find it
          while (pos.i < tokens.length) {
            const peek = tokens[pos.i];
            if (peek.type === 'open' && peek.tag === 'DL') {
              pos.i++; // consume <DL>
              folder.children = parseDL(tokens, pos);
              break;
            }
            // If we hit another DT or the end of the parent DL, stop looking
            if ((peek.type === 'open' && peek.tag === 'DT') ||
                (peek.type === 'close' && peek.tag === 'DL')) {
              break;
            }
            pos.i++; // skip <p>, whitespace, etc.
          }
          break; // done with this DT
        }

        if (inner.type === 'open' && inner.tag === 'A') {
          const url   = decodeHTMLEntities(inner.attrs['HREF'] || '');
          pos.i++;
          let title = '';
          while (pos.i < tokens.length) {
            const t = tokens[pos.i];
            if (t.type === 'text') { title += t.value; pos.i++; }
            else if (t.type === 'close' && t.tag === 'A') { pos.i++; break; }
            else break;
          }
          if (url && !url.startsWith('javascript:') && url !== 'about:blank') {
            items.push({ type: 'bookmark', title: decodeHTMLEntities(title.trim()) || url, url });
          }
          break; // done with this DT
        }

        // Anything else inside DT — skip
        pos.i++;
        break;
      }
      continue;
    }

    // Skip anything else (text nodes at DL level, <p> tags, etc.)
    pos.i++;
  }

  return items;
}

/**
 * Main entry point.
 * Returns a tree: Array<{ type:'folder', name, children } | { type:'bookmark', title, url }>
 */
function parseBookmarkHTML(html) {
  const tokens = tokenize(html);
  // Find the first root <DL>
  let pos = { i: 0 };
  while (pos.i < tokens.length) {
    const tok = tokens[pos.i];
    if (tok.type === 'open' && tok.tag === 'DL') {
      pos.i++; // consume opening <DL>
      return parseDL(tokens, pos);
    }
    pos.i++;
  }
  return [];
}

module.exports = { parseBookmarkHTML };
