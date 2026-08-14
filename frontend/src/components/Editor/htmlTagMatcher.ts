import type * as MonacoNamespace from 'monaco-editor';

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * Fast and robust HTML/XML matching tag range resolver.
 * Finds both opening and closing tag name ranges for Monaco Linked Editing.
 */
export function findMatchingTagRanges(
  monaco: typeof MonacoNamespace,
  model: MonacoNamespace.editor.ITextModel,
  position: MonacoNamespace.IPosition
): { ranges: MonacoNamespace.IRange[]; wordPattern?: RegExp } | null {
  const text = model.getValue();
  const offset = model.getOffsetAt(position);

  // 1. Find if cursor is currently inside a tag name
  let tagOpenIndex = -1;
  for (let i = offset - 1; i >= 0 && i >= offset - 120; i--) {
    const char = text[i];
    if (char === '>') {
      break;
    }
    if (char === '<') {
      tagOpenIndex = i;
      break;
    }
  }

  if (tagOpenIndex === -1) return null;

  let tagCloseIndex = -1;
  let inQuote: string | null = null;
  for (let i = tagOpenIndex; i < text.length; i++) {
    const char = text[i];
    if (inQuote) {
      if (char === inQuote) inQuote = null;
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === '>') {
      tagCloseIndex = i;
      break;
    } else if (char === '<' && i !== tagOpenIndex) {
      break;
    }
  }

  if (tagCloseIndex === -1) return null;

  const tagSnippet = text.slice(tagOpenIndex, tagCloseIndex + 1);
  const tagMatch = tagSnippet.match(/^<\s*(\/?)\s*([a-zA-Z0-9_:-]+)/);
  if (!tagMatch) return null;

  const isClosing = tagMatch[1] === '/';
  const tagName = tagMatch[2];
  const tagNameLower = tagName.toLowerCase();

  // Void tags or self-closing tags have no partner
  if (VOID_TAGS.has(tagNameLower)) return null;
  if (/\/\s*>$/.test(tagSnippet)) return null;

  // Calculate start & end offset of the tag name
  const nameOffsetInSnippet = tagSnippet.indexOf(tagName, tagMatch[1] ? tagMatch[1].length + 1 : 1);
  const nameStartOffset = tagOpenIndex + nameOffsetInSnippet;
  const nameEndOffset = nameStartOffset + tagName.length;

  // Ensure cursor is placed on the tag name
  if (offset < nameStartOffset || offset > nameEndOffset) {
    return null;
  }

  // 2. Scan document to find matching pair
  if (isClosing) {
    // Scan backward to find matching opening tag
    let depth = 0;
    let index = tagOpenIndex - 1;

    while (index >= 0) {
      const openIdx = text.lastIndexOf('<', index);
      if (openIdx === -1) break;

      let closeIdx = -1;
      let q: string | null = null;
      for (let j = openIdx; j < text.length; j++) {
        const c = text[j];
        if (q) {
          if (c === q) q = null;
        } else if (c === '"' || c === "'") {
          q = c;
        } else if (c === '>') {
          closeIdx = j;
          break;
        } else if (c === '<' && j !== openIdx) {
          break;
        }
      }

      if (closeIdx !== -1 && closeIdx < tagOpenIndex) {
        const snippet = text.slice(openIdx, closeIdx + 1);
        const m = snippet.match(/^<\s*(\/?)\s*([a-zA-Z0-9_:-]+)/);
        if (m) {
          const isClose = m[1] === '/';
          const name = m[2];
          const selfClose = /\/\s*>$/.test(snippet) || VOID_TAGS.has(name.toLowerCase());

          if (name.toLowerCase() === tagNameLower && !selfClose) {
            if (isClose) {
              depth++;
            } else {
              if (depth === 0) {
                // Found matching opening tag
                const matchedNameOffset = snippet.indexOf(name, 1);
                const matchStart = openIdx + matchedNameOffset;
                const matchEnd = matchStart + name.length;

                const openPosStart = model.getPositionAt(matchStart);
                const openPosEnd = model.getPositionAt(matchEnd);
                const closePosStart = model.getPositionAt(nameStartOffset);
                const closePosEnd = model.getPositionAt(nameEndOffset);

                return {
                  ranges: [
                    new monaco.Range(openPosStart.lineNumber, openPosStart.column, openPosEnd.lineNumber, openPosEnd.column),
                    new monaco.Range(closePosStart.lineNumber, closePosStart.column, closePosEnd.lineNumber, closePosEnd.column)
                  ],
                  wordPattern: /[a-zA-Z0-9_:-]+/
                };
              }
              depth--;
            }
          }
        }
      }
      index = openIdx - 1;
    }
  } else {
    // Scan forward to find matching closing tag
    let depth = 0;
    let index = tagCloseIndex + 1;

    while (index < text.length) {
      const openIdx = text.indexOf('<', index);
      if (openIdx === -1) break;

      let closeIdx = -1;
      let q: string | null = null;
      for (let j = openIdx; j < text.length; j++) {
        const c = text[j];
        if (q) {
          if (c === q) q = null;
        } else if (c === '"' || c === "'") {
          q = c;
        } else if (c === '>') {
          closeIdx = j;
          break;
        } else if (c === '<' && j !== openIdx) {
          break;
        }
      }

      if (closeIdx !== -1) {
        const snippet = text.slice(openIdx, closeIdx + 1);
        const m = snippet.match(/^<\s*(\/?)\s*([a-zA-Z0-9_:-]+)/);
        if (m) {
          const isClose = m[1] === '/';
          const name = m[2];
          const selfClose = /\/\s*>$/.test(snippet) || VOID_TAGS.has(name.toLowerCase());

          if (name.toLowerCase() === tagNameLower && !selfClose) {
            if (!isClose) {
              depth++;
            } else {
              if (depth === 0) {
                // Found matching closing tag
                const matchedNameOffset = snippet.indexOf(name, (m[1] ? m[1].length : 0) + 1);
                const matchStart = openIdx + matchedNameOffset;
                const matchEnd = matchStart + name.length;

                const openPosStart = model.getPositionAt(nameStartOffset);
                const openPosEnd = model.getPositionAt(nameEndOffset);
                const closePosStart = model.getPositionAt(matchStart);
                const closePosEnd = model.getPositionAt(matchEnd);

                return {
                  ranges: [
                    new monaco.Range(openPosStart.lineNumber, openPosStart.column, openPosEnd.lineNumber, openPosEnd.column),
                    new monaco.Range(closePosStart.lineNumber, closePosStart.column, closePosEnd.lineNumber, closePosEnd.column)
                  ],
                  wordPattern: /[a-zA-Z0-9_:-]+/
                };
              }
              depth--;
            }
          }
        }
        index = closeIdx + 1;
      } else {
        index = openIdx + 1;
      }
    }
  }

  return null;
}
