import React from 'react';

interface FileIconProps {
  name: string;
  size?: number;
}

export const FileIcon: React.FC<FileIconProps> = ({ name, size = 14 }) => {
  const lower = name.toLowerCase();
  const extMatch = lower.match(/\.([^.]+)$/);
  const ext = extMatch ? extMatch[1] : '';

  // Specific special filenames
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M14.5 9c-.3-1.8-1.7-2.4-1.7-2.4-.3-1.1-1.2-1.6-1.2-1.6-.9-.1-1.6.4-1.6.4s-.6-1-1.6-1c-.9 0-1.5.6-1.5.6S6.3 4.5 5 4.5C3.7 4.5 2.5 5.5 2.5 7V10c0 2.5 2 4.5 4.5 4.5h4c2.5 0 4.5-2 4.5-4.5v-1z" stroke="#0db7ed" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="4" y="8" width="1.8" height="1.8" rx="0.3" fill="#0db7ed" />
        <rect x="6.5" y="8" width="1.8" height="1.8" rx="0.3" fill="#0db7ed" />
        <rect x="9" y="8" width="1.8" height="1.8" rx="0.3" fill="#0db7ed" />
        <rect x="6.5" y="5.5" width="1.8" height="1.8" rx="0.3" fill="#0db7ed" />
        <rect x="9" y="5.5" width="1.8" height="1.8" rx="0.3" fill="#0db7ed" />
      </svg>
    );
  }

  if (lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M14 6.5L9.5 2a1.5 1.5 0 00-2 0l-5.5 5.5a1.5 1.5 0 000 2l4.5 4.5a1.5 1.5 0 002 0l5.5-5.5a1.5 1.5 0 000-2z" stroke="#F05032" strokeWidth="1.2" strokeLinejoin="round" />
        <circle cx="8" cy="11.5" r="1" fill="#F05032" />
        <circle cx="8" cy="7" r="1" fill="#F05032" />
        <circle cx="10.5" cy="5.5" r="1" fill="#F05032" />
        <path d="M8 8v2.5M8 7l2.5-1.5" stroke="#F05032" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }

  if (lower === 'package.json' || lower === 'package-lock.json') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M8 1.5l5.5 3v7l-5.5 3-5.5-3v-7l5.5-3z" stroke="#CB3837" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M8 1.5v13M2.5 4.5l5.5 3.5 5.5-3.5" stroke="#CB3837" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }

  if (lower.startsWith('.env')) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <rect x="3.5" y="7" width="9" height="7" rx="1.5" stroke="#EBCB8B" strokeWidth="1.2" />
        <path d="M5.5 7V4.5a2.5 2.5 0 015 0V7" stroke="#EBCB8B" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="8" cy="10.5" r="1" fill="#EBCB8B" />
      </svg>
    );
  }

  // Go (.go, go.mod, go.sum)
  if (ext === 'go' || lower === 'go.mod' || lower === 'go.sum') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2.5" width="12" height="11" rx="2" stroke="#00ADD8" strokeWidth="1.2" />
        <text x="8" y="10.5" textAnchor="middle" fill="#00ADD8" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" fontWeight="700">GO</text>
      </svg>
    );
  }

  // Rust (.rs, Cargo.toml)
  if (ext === 'rs' || lower === 'cargo.toml') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2.5" width="12" height="11" rx="2" stroke="#DEA584" strokeWidth="1.2" />
        <text x="8" y="10.5" textAnchor="middle" fill="#DEA584" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" fontWeight="700">RS</text>
      </svg>
    );
  }

  // TypeScript (.ts)
  if (ext === 'ts') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2.5" width="12" height="11" rx="2" stroke="#3178C6" strokeWidth="1.2" />
        <text x="8" y="10.5" textAnchor="middle" fill="#3178C6" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" fontWeight="700">TS</text>
      </svg>
    );
  }

  // TSX / JSX (.tsx, .jsx)
  if (ext === 'tsx' || ext === 'jsx') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="8" cy="8" r="1.5" fill="#61DAFB" />
        <ellipse cx="8" cy="8" rx="6.5" ry="2.5" stroke="#61DAFB" strokeWidth="1.1" />
        <ellipse cx="8" cy="8" rx="6.5" ry="2.5" transform="rotate(60 8 8)" stroke="#61DAFB" strokeWidth="1.1" />
        <ellipse cx="8" cy="8" rx="6.5" ry="2.5" transform="rotate(120 8 8)" stroke="#61DAFB" strokeWidth="1.1" />
      </svg>
    );
  }

  // JavaScript (.js, .mjs, .cjs)
  if (['js', 'mjs', 'cjs'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2.5" width="12" height="11" rx="2" stroke="#F7DF1E" strokeWidth="1.2" />
        <text x="8" y="10.5" textAnchor="middle" fill="#F7DF1E" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" fontWeight="700">JS</text>
      </svg>
    );
  }

  // Python (.py, .ipynb)
  if (ext === 'py' || ext === 'ipynb') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M7.8 2.5c-2.4 0-2.3 1-2.3 1V5h3v.5H4.2S3 5.6 3 7.8c0 2.1 1.2 2.2 1.2 2.2h.8v-1.1c0-1.3 1.1-1.3 1.1-1.3h3.5s1.2 0 1.2-1.2V3.7C10.8 2.7 10 2.5 7.8 2.5zm-1.2 1a.5.5 0 110 1 .5.5 0 010-1z" fill="#387EB8" />
        <path d="M8.2 13.5c2.4 0 2.3-1 2.3-1V11h-3v-.5h4.3s1.2-.1 1.2-2.3c0-2.1-1.2-2.2-1.2-2.2H11v1.1c0 1.3-1.1 1.3-1.1 1.3H6.4s-1.2 0-1.2 1.2v2.7c0 1 .8 1.2 3 1.2zm1.2-1a.5.5 0 110-1 .5.5 0 010 1z" fill="#FFE052" />
      </svg>
    );
  }

  // Java (.java, .class, .jar)
  if (['java', 'class', 'jar'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3.5 6h7.5v4.5a3 3 0 01-3 3h-1.5a3 3 0 01-3-3V6zm7.5 1.5h1.5a1.5 1.5 0 011.5 1.5v0a1.5 1.5 0 01-1.5 1.5H11V7.5z" stroke="#EA2D2E" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M5.5 3.5c.8.6.8 1.4 1.5 2M8.5 3c.8.6.8 1.4 1.5 2" stroke="#F89820" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }

  // HTML (.html, .htm)
  if (['html', 'htm', 'xhtml'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3 2.5l1 10.5 4 1.5 4-1.5 1-10.5H3z" stroke="#E34F26" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M5.5 6l-1.5 2 1.5 2M10.5 6l1.5 2-1.5 2" stroke="#E34F26" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // CSS / SCSS / LESS
  if (['css', 'scss', 'less'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3 2.5l1 10.5 4 1.5 4-1.5 1-10.5H3z" stroke="#2965F1" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M6 6.5h4M5.5 9.5h4.5M6.5 5l-1 6M10.5 5l-1 6" stroke="#2965F1" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }

  // JSON (.json, .jsonc)
  if (['json', 'jsonc'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M5.5 3.5c-1.2 0-1.5.6-1.5 1.5v1.5c0 .8-.6 1.5-1.5 1.5.9 0 1.5.7 1.5 1.5V11c0 .9.3 1.5 1.5 1.5M10.5 3.5c1.2 0 1.5.6 1.5 1.5v1.5c0 .8.6 1.5 1.5 1.5-.9 0-1.5.7-1.5 1.5V11c0 .9-.3 1.5-1.5 1.5" stroke="#F5A623" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // Markdown (.md, .markdown)
  if (['md', 'markdown'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="#88C0D0" strokeWidth="1.2" />
        <path d="M4.5 10.5V5.5l2 2.5 2-2.5v5M12.5 8l-1.5 2.5-1.5-2.5M11 5.5v5" stroke="#88C0D0" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // SQL & Database (.sql, .sqlite, .db)
  if (['sql', 'sqlite', 'db'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <ellipse cx="8" cy="4.5" rx="5" ry="2" stroke="#F29111" strokeWidth="1.2" />
        <path d="M3 4.5v7c0 1.1 2.2 2 5 2s5-.9 5-2v-7M3 8c0 1.1 2.2 2 5 2s5-.9 5-2" stroke="#F29111" strokeWidth="1.2" />
      </svg>
    );
  }

  // C / C++ / Headers (.c, .cpp, .cc, .cxx, .h, .hpp)
  if (['c', 'cpp', 'cc', 'cxx', 'h', 'hpp'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2.5" width="12" height="11" rx="2" stroke="#659AD2" strokeWidth="1.2" />
        <text x="8" y="10.5" textAnchor="middle" fill="#659AD2" fontSize="6.5" fontFamily="'JetBrains Mono', monospace" fontWeight="700">{ext.startsWith('h') ? 'H' : ext.includes('p') ? 'C+' : 'C'}</text>
      </svg>
    );
  }

  // Shell scripts (.sh, .bash, .zsh, .ps1, .bat, .cmd)
  if (['sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="#4EAA25" strokeWidth="1.2" />
        <path d="M4.5 6l2 2-2 2M7.5 10.5h3" stroke="#4EAA25" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // YAML / TOML / Config (.yaml, .yml, .toml, .ini, .cfg, .conf)
  if (['yaml', 'yml', 'toml', 'ini', 'cfg', 'conf'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3 4.5h10M3 8h10M3 11.5h10M6 3v3M10 6.5v3M5 10v3" stroke="#CB171E" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  // Images (.png, .jpg, .jpeg, .gif, .svg, .webp, .ico)
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="#B48EAD" strokeWidth="1.2" />
        <circle cx="5.5" cy="5.5" r="1" fill="#B48EAD" />
        <path d="M3 11.5l3.5-3.5 2.5 2.5 2-2 2 2" stroke="#B48EAD" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // Archives (.zip, .tar, .gz, .7z, .rar)
  if (['zip', 'tar', 'gz', '7z', 'rar', 'bz2'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3.5 2.5h9v11h-9z" stroke="#D08770" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M8 2.5v9M7 4h2M7 6h2M7 8h2M7 10h2" stroke="#D08770" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }

  // Text & Logs (.txt, .log)
  if (['txt', 'log'].includes(ext)) {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M3.5 2.5h6l3 3v8h-9z" stroke="#8892B0" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M9.5 2.5v3h3M5.5 7h5M5.5 9.5h5M5.5 12h3" stroke="#8892B0" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    );
  }

  // Default File
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M3.5 2.5h6l3 3v8h-9z" stroke="#7A828E" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.5 2.5v3h3" stroke="#7A828E" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
};
