import type * as MonacoNamespace from 'monaco-editor';

function parseHex(hex: string): { r: number; g: number; b: number; a: number } | null {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16) / 255,
      g: parseInt(hex[1] + hex[1], 16) / 255,
      b: parseInt(hex[2] + hex[2], 16) / 255,
      a: 1,
    };
  }
  if (hex.length === 4) {
    return {
      r: parseInt(hex[0] + hex[0], 16) / 255,
      g: parseInt(hex[1] + hex[1], 16) / 255,
      b: parseInt(hex[2] + hex[2], 16) / 255,
      a: parseInt(hex[3] + hex[3], 16) / 255,
    };
  }
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: 1,
    };
  }
  if (hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: parseInt(hex.slice(6, 8), 16) / 255,
    };
  }
  return null;
}

function parseRgb(str: string): { r: number; g: number; b: number; a: number } | null {
  const match = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!match) return null;
  return {
    r: Math.min(255, Math.max(0, parseFloat(match[1]))) / 255,
    g: Math.min(255, Math.max(0, parseFloat(match[2]))) / 255,
    b: Math.min(255, Math.max(0, parseFloat(match[3]))) / 255,
    a: match[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(match[4]))) : 1,
  };
}

function parseHsl(str: string): { r: number; g: number; b: number; a: number } | null {
  const match = str.match(/hsla?\(\s*([\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!match) return null;
  const h = (parseFloat(match[1]) % 360) / 360;
  const s = Math.min(100, Math.max(0, parseFloat(match[2]))) / 100;
  const l = Math.min(100, Math.max(0, parseFloat(match[3]))) / 100;
  const a = match[4] !== undefined ? Math.min(1, Math.max(0, parseFloat(match[4]))) : 1;

  if (s === 0) {
    return { r: l, g: l, b: l, a };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3),
    g: hue2rgb(p, q, h),
    b: hue2rgb(p, q, h - 1 / 3),
    a,
  };
}

export function registerColorProviders(monaco: typeof MonacoNamespace) {
  const languages = ['css', 'scss', 'less', 'html', 'javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'json'];

  languages.forEach((lang) => {
    monaco.languages.registerColorProvider(lang, {
      provideDocumentColors(model: MonacoNamespace.editor.ITextModel) {
        const text = model.getValue();
        const colors: MonacoNamespace.languages.IColorInformation[] = [];

        // Match Hex colors (#fff, #ffffff, #ffffff80)
        const hexRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
        let match: RegExpExecArray | null;
        while ((match = hexRegex.exec(text)) !== null) {
          const parsed = parseHex(match[0]);
          if (parsed) {
            const startPos = model.getPositionAt(match.index);
            const endPos = model.getPositionAt(match.index + match[0].length);
            colors.push({
              range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
              color: { red: parsed.r, green: parsed.g, blue: parsed.b, alpha: parsed.a },
            });
          }
        }

        // Match rgb / rgba
        const rgbRegex = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)/gi;
        while ((match = rgbRegex.exec(text)) !== null) {
          const parsed = parseRgb(match[0]);
          if (parsed) {
            const startPos = model.getPositionAt(match.index);
            const endPos = model.getPositionAt(match.index + match[0].length);
            colors.push({
              range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
              color: { red: parsed.r, green: parsed.g, blue: parsed.b, alpha: parsed.a },
            });
          }
        }

        // Match hsl / hsla
        const hslRegex = /hsla?\(\s*[\d.]+(?:deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+)?\s*\)/gi;
        while ((match = hslRegex.exec(text)) !== null) {
          const parsed = parseHsl(match[0]);
          if (parsed) {
            const startPos = model.getPositionAt(match.index);
            const endPos = model.getPositionAt(match.index + match[0].length);
            colors.push({
              range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
              color: { red: parsed.r, green: parsed.g, blue: parsed.b, alpha: parsed.a },
            });
          }
        }

        return colors;
      },

      provideColorPresentations(
        _model: MonacoNamespace.editor.ITextModel,
        colorInfo: MonacoNamespace.languages.IColorInformation
      ) {
        const { red, green, blue, alpha } = colorInfo.color;
        const r255 = Math.round(red * 255);
        const g255 = Math.round(green * 255);
        const b255 = Math.round(blue * 255);

        const hexR = r255.toString(16).padStart(2, '0');
        const hexG = g255.toString(16).padStart(2, '0');
        const hexB = b255.toString(16).padStart(2, '0');
        const hexA = Math.round(alpha * 255).toString(16).padStart(2, '0');

        const hexStr = alpha === 1 ? `#${hexR}${hexG}${hexB}` : `#${hexR}${hexG}${hexB}${hexA}`;
        const rgbStr = alpha === 1 ? `rgb(${r255}, ${g255}, ${b255})` : `rgba(${r255}, ${g255}, ${b255}, ${alpha.toFixed(2)})`;

        return [
          { label: hexStr },
          { label: rgbStr },
        ];
      },
    });
  });
}
