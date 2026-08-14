// EmmetEngine.ts

export const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

interface EmmetNode {
  tag?: string;
  id?: string;
  classes: string[];
  attributes: { name: string; value: string }[];
  text?: string;
  multipliers: number;
  children: EmmetNode[];
  siblings: EmmetNode[];
}

class EmmetParser {
  private pos = 0;
  constructor(private input: string) {}

  private peek(): string {
    return this.pos < this.input.length ? this.input[this.pos] : '';
  }

  private advance(): string {
    return this.input[this.pos++];
  }

  private isEOF(): boolean {
    return this.pos >= this.input.length;
  }

  private match(pattern: RegExp): string | null {
    const substr = this.input.slice(this.pos);
    const m = substr.match(pattern);
    if (m && m.index === 0) {
      this.pos += m[0].length;
      return m[0];
    }
    return null;
  }

  public parse(): EmmetNode[] | null {
    try {
      const result = this.parseSequence();
      if (!this.isEOF()) return null; // Unparsed trailing characters
      return result;
    } catch (e) {
      return null;
    }
  }

  private parseSequence(): EmmetNode[] {
    const nodes: EmmetNode[] = [];
    let current = this.parseNode();
    if (!current) throw new Error('Expected node');
    nodes.push(current);

    while (!this.isEOF()) {
      if (this.peek() === '+') {
        this.advance();
        const sibling = this.parseNode();
        if (!sibling) throw new Error('Expected sibling node');
        nodes.push(sibling);
      } else if (this.peek() === '>') {
        this.advance();
        const children = this.parseSequence();
        // The children belong to the LAST node in the current sequence
        nodes[nodes.length - 1].children = children;
      } else if (this.peek() === '^') {
        // Climb up - not strictly in spec but common in Emmet.
        // For strict spec we don't need it, but we'll stop parsing sequence and let caller handle.
        break;
      } else {
        break;
      }
    }
    return nodes;
  }

  private parseNode(): EmmetNode | null {
    if (this.peek() === '(') {
      this.advance();
      const group = this.parseSequence();
      if (this.peek() !== ')') throw new Error('Expected )');
      this.advance();
      
      const node: EmmetNode = { classes: [], attributes: [], multipliers: 1, children: group, siblings: [] };
      if (this.peek() === '*') {
        this.advance();
        const mult = this.match(/^\d+/);
        if (mult) node.multipliers = parseInt(mult, 10);
      }
      return node;
    }

    const node: EmmetNode = { classes: [], attributes: [], multipliers: 1, children: [], siblings: [] };
    let hasElementPart = false;

    // Parse tag name
    const tag = this.match(/^[a-zA-Z0-9:-]+/);
    if (tag) {
      node.tag = tag;
      hasElementPart = true;
    }

    while (!this.isEOF()) {
      const p = this.peek();
      if (p === '#') {
        this.advance();
        const id = this.match(/^[a-zA-Z0-9_-]+/);
        if (!id) throw new Error('Expected id');
        node.id = id;
        hasElementPart = true;
      } else if (p === '.') {
        this.advance();
        const cls = this.match(/^[a-zA-Z0-9_-]+/);
        if (!cls) throw new Error('Expected class');
        node.classes.push(cls);
        hasElementPart = true;
      } else if (p === '[') {
        this.advance();
        while (this.peek() !== ']' && !this.isEOF()) {
          const attrName = this.match(/^[a-zA-Z0-9_-]+/);
          if (!attrName) throw new Error('Expected attribute name');
          let attrValue = '';
          if (this.peek() === '=') {
            this.advance();
            const quote = this.peek();
            if (quote === '"' || quote === "'") {
              this.advance();
              const endQuoteIdx = this.input.indexOf(quote, this.pos);
              if (endQuoteIdx === -1) throw new Error('Unterminated string');
              attrValue = this.input.slice(this.pos, endQuoteIdx);
              this.pos = endQuoteIdx + 1;
            } else {
              const valMatch = this.match(/^[^\]\s]+/);
              if (valMatch) attrValue = valMatch;
            }
          }
          node.attributes.push({ name: attrName, value: attrValue });
          this.match(/^\s+/);
        }
        if (this.peek() === ']') this.advance();
        hasElementPart = true;
      } else if (p === ':') {
        // Pseudo like input:text
        this.advance();
        const type = this.match(/^[a-zA-Z0-9_-]+/);
        if (type) {
           node.attributes.push({ name: 'type', value: type });
           hasElementPart = true;
        }
      } else {
        break;
      }
    }

    if (this.peek() === '{') {
      this.advance();
      const endBrace = this.input.indexOf('}', this.pos);
      if (endBrace === -1) throw new Error('Unterminated text');
      node.text = this.input.slice(this.pos, endBrace);
      this.pos = endBrace + 1;
      hasElementPart = true;
    }

    if (this.peek() === '*') {
      this.advance();
      const mult = this.match(/^\d+/);
      if (mult) node.multipliers = parseInt(mult, 10);
    }

    if (!hasElementPart) return null;
    if (!node.tag) node.tag = 'div'; // default tag

    return node;
  }
}

export function expandHtmlAbbreviation(abbr: string): string | null {
  if (abbr === '!') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
\t<meta charset="UTF-8">
\t<meta name="viewport" content="width=device-width, initial-scale=1.0">
\t<title>\${1:Document}</title>
</head>
<body>
\t\${2}
</body>
</html>`;
  }

  const parser = new EmmetParser(abbr);
  const nodes = parser.parse();
  if (!nodes) return null;

  let placeholderIndex = 1;
  let hasPrimaryPlaceholder = false;

  function renderNodes(nodesToRender: EmmetNode[], indentLevel: number): string {
    let result = '';
    const indent = '\t'.repeat(indentLevel);
    
    for (const node of nodesToRender) {
      for (let i = 0; i < node.multipliers; i++) {
        // Render group
        if (!node.tag) {
           result += renderNodes(node.children, indentLevel);
           continue;
        }

        result += `${indent}<${node.tag}`;
        if (node.id) result += ` id="${node.id}"`;
        if (node.classes.length > 0) result += ` class="${node.classes.join(' ')}"`;
        for (const attr of node.attributes) {
          result += ` ${attr.name}="${attr.value}"`;
        }

        // Add placeholder logic
        let inner = node.text || '';
        
        // Emmet spec: First editable text/attribute location becomes first placeholder.
        // If it's a void tag, the cursor goes after it, unless there's a next element.
        // For simplicity, we just put a placeholder inside empty tags if no children.
        
        const isVoid = VOID_TAGS.has(node.tag.toLowerCase());
        
        if (isVoid) {
          result += '>\n';
        } else {
          result += '>';
          if (node.children.length > 0) {
            result += '\n' + renderNodes(node.children, indentLevel + 1) + indent;
          } else if (inner) {
            result += inner;
          } else if (!hasPrimaryPlaceholder) {
            // Keep one primary editable location per expansion. Creating a
            // placeholder for every empty tag makes simple Emmet expansions
            // require several Tab presses before the user can continue.
            result += `\${${placeholderIndex++}}`;
            hasPrimaryPlaceholder = true;
          }
          result += `</${node.tag}>\n`;
        }
      }
    }
    return result;
  }

  let finalStr = renderNodes(nodes, 0).trim();
  // Always provide one final cursor stop after the primary editable location.
  // This gives a predictable single Tab transition out of the expansion.
  finalStr += '$0';
  return finalStr;
}

export function expandCssAbbreviation(abbr: string): string | null {
  const cssSnippets: Record<string, string> = {
    'df': 'display: flex;',
    'db': 'display: block;',
    'm:a': 'margin: auto;',
    'p10': 'padding: 10px;',
    'm10': 'margin: 10px;',
    'w100': 'width: 100px;',
    'h100': 'height: 100px;',
    'pos:a': 'position: absolute;',
    'tac': 'text-align: center;',
    'fz16': 'font-size: 16px;',
    'fw700': 'font-weight: 700;',
    'bgc': 'background-color: ${1:#fff};',
  };
  return cssSnippets[abbr] ? cssSnippets[abbr] + '$0' : null;
}
