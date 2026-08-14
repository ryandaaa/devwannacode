export interface SnippetPlaceholder {
  index: number;
  start: number;
  end: number;
  defaultText: string;
  decorationId?: string;
}

export interface SnippetSession {
  placeholders: SnippetPlaceholder[];
  activeIndex: number;
  finalCursor?: number;
  finalDecorationId?: string;
}

/**
 * Parses an LSP snippet string and returns the plain text to insert
 * along with the parsed placeholder positions.
 */
export function parseSnippet(snippetText: string): { plainText: string; session: SnippetSession } {
  let plainText = '';
  const placeholders: SnippetPlaceholder[] = [];
  let finalCursor: number | undefined = undefined;

  let i = 0;
  while (i < snippetText.length) {
    if (snippetText[i] === '\\' && i + 1 < snippetText.length) {
      // Escape character
      plainText += snippetText[i + 1];
      i += 2;
    } else if (snippetText[i] === '$') {
      if (snippetText[i + 1] === '{') {
        // ${1:default} or ${1}
        const closingBrace = snippetText.indexOf('}', i);
        if (closingBrace !== -1) {
          const content = snippetText.slice(i + 2, closingBrace);
          const colonIdx = content.indexOf(':');
          
          let indexStr = content;
          let defaultText = '';
          
          if (colonIdx !== -1) {
            indexStr = content.slice(0, colonIdx);
            defaultText = content.slice(colonIdx + 1);
          }
          
          const index = parseInt(indexStr, 10);
          if (!isNaN(index)) {
            if (index === 0) {
              finalCursor = plainText.length;
            } else {
              placeholders.push({
                index,
                start: plainText.length,
                end: plainText.length + defaultText.length,
                defaultText,
              });
            }
            plainText += defaultText;
          } else {
            // Not a valid placeholder, treat as text
            plainText += snippetText.slice(i, closingBrace + 1);
          }
          i = closingBrace + 1;
        } else {
          // Unclosed brace, treat as text
          plainText += '$';
          i++;
        }
      } else {
        // $1 or $0
        const match = snippetText.slice(i + 1).match(/^(\d+)/);
        if (match) {
          const index = parseInt(match[1], 10);
          if (index === 0) {
            finalCursor = plainText.length;
          } else {
            placeholders.push({
              index,
              start: plainText.length,
              end: plainText.length,
              defaultText: '',
            });
          }
          i += 1 + match[1].length;
        } else {
          plainText += '$';
          i++;
        }
      }
    } else {
      plainText += snippetText[i];
      i++;
    }
  }

  // Sort placeholders by index
  placeholders.sort((a, b) => a.index - b.index);

  return {
    plainText,
    session: {
      placeholders,
      activeIndex: placeholders.length > 0 ? 0 : -1,
      finalCursor,
    },
  };
}
