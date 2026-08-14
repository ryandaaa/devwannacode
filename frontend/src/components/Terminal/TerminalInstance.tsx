import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import * as runtime from '../../../wailsjs/runtime/runtime';
import * as App from '../../../wailsjs/go/main/App';

interface TerminalInstanceProps {
  id: string;
  isVisible: boolean;
  theme: string;
  onExit: (exitCode: number) => void;
}

function buildTheme(themeName: string) {
  if (themeName === 'nord') {
    return {
      background: '#2E3440',
      foreground: '#D8DEE9',
      cursor: '#88C0D0',
      cursorAccent: '#2E3440',
      selectionBackground: '#434C5E',
      black: '#3B4252',
      red: '#BF616A',
      green: '#A3BE8C',
      yellow: '#EBCB8B',
      blue: '#81A1C1',
      magenta: '#B48EAD',
      cyan: '#88C0D0',
      white: '#E5E9F0',
      brightBlack: '#4C566A',
      brightRed: '#BF616A',
      brightGreen: '#A3BE8C',
      brightYellow: '#EBCB8B',
      brightBlue: '#81A1C1',
      brightMagenta: '#B48EAD',
      brightCyan: '#8FBCBB',
      brightWhite: '#ECEFF4',
    };
  }

  if (themeName === 'monochrome') {
    return {
      background: '#000000',
      foreground: '#FFFFFF',
      cursor: '#FFFFFF',
      cursorAccent: '#000000',
      selectionBackground: '#333333',
      black: '#000000',
      red: '#FFFFFF',
      green: '#FFFFFF',
      yellow: '#FFFFFF',
      blue: '#FFFFFF',
      magenta: '#FFFFFF',
      cyan: '#FFFFFF',
      white: '#FFFFFF',
      brightBlack: '#666666',
      brightRed: '#FFFFFF',
      brightGreen: '#FFFFFF',
      brightYellow: '#FFFFFF',
      brightBlue: '#FFFFFF',
      brightMagenta: '#FFFFFF',
      brightCyan: '#FFFFFF',
      brightWhite: '#FFFFFF',
    };
  }

  if (themeName === 'warm') {
    return {
      background: '#FDFBF7',
      foreground: '#2D2B2A',
      cursor: '#D97757',
      cursorAccent: '#FDFBF7',
      selectionBackground: '#E0DBD1',
      black: '#2D2B2A',
      red: '#C56344',
      green: '#4A6D50',
      yellow: '#B58C36',
      blue: '#4A6C9B',
      magenta: '#8A5D7C',
      cyan: '#487D7D',
      white: '#F6F4EF',
      brightBlack: '#8A8782',
      brightRed: '#D97757',
      brightGreen: '#5A8062',
      brightYellow: '#CBA248',
      brightBlue: '#5C80B0',
      brightMagenta: '#9E6C8E',
      brightCyan: '#599191',
      brightWhite: '#FFFFFF',
    };
  }

  const isDark = themeName === 'dark';
  return {
    background: isDark ? '#080808' : '#F8F9FA',
    foreground: isDark ? '#EDEDED' : '#000000',
    cursor: isDark ? '#EDEDED' : '#000000',
    cursorAccent: isDark ? '#080808' : '#F8F9FA',
    selectionBackground: isDark ? '#2A2A2A' : '#CED4DA',
    black: isDark ? '#151515' : '#000000',
    red: isDark ? '#F85149' : '#D73A49',
    green: isDark ? '#3FB950' : '#22863A',
    yellow: isDark ? '#E3B341' : '#B08800',
    blue: isDark ? '#58A6FF' : '#0366D6',
    magenta: isDark ? '#BC8CFF' : '#6F42C1',
    cyan: isDark ? '#39C5CF' : '#1B7C83',
    white: isDark ? '#EDEDED' : '#000000',
    brightBlack: isDark ? '#4A4A4A' : '#586069',
    brightRed: isDark ? '#FFA198' : '#CB2431',
    brightGreen: isDark ? '#56D364' : '#28A745',
    brightYellow: isDark ? '#E3B341' : '#DBAB09',
    brightBlue: isDark ? '#79C0FF' : '#2188FF',
    brightMagenta: isDark ? '#D2A8FF' : '#8A63D2',
    brightCyan: isDark ? '#56D4DD' : '#3192AA',
    brightWhite: isDark ? '#FFFFFF' : '#404040',
  };
}

export const TerminalInstance: React.FC<TerminalInstanceProps> = ({
  id,
  isVisible,
  theme,
  onExit,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);   // outer visibility shell
  const mountRef  = useRef<HTMLDivElement>(null);    // where xterm is opened
  const termRef   = useRef<XTerm | null>(null);
  const fitRef    = useRef<FitAddon | null>(null);
  const rafRef    = useRef<number>(0);

  // ── Fit with double-RAF to let the browser finish layout ────────────────────
  const doFit = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        const term = termRef.current;
        const fit  = fitRef.current;
        const el   = mountRef.current;
        if (!term || !fit || !el) return;
        // Only fit if container has real dimensions
        if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
        try {
          fit.fit();
          App.ResizeTerminal(id, term.cols, term.rows);
        } catch {
          // ignore layout errors
        }
      });
    });
  }, [id]);

  // ── Mount xterm once ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace",
      fontSize: 10,
      lineHeight: 1.2,
      theme: buildTheme(theme),
      allowTransparency: false,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    termRef.current = term;
    fitRef.current  = fitAddon;

    // Open into mount div (always visible via CSS trick below)
    term.open(el);

    // Forward keystrokes / paste → PTY
    const dataDispose = term.onData((data) => App.WriteTerminal(id, data));

    // PTY output → xterm
    const dataEv = `terminal:data:${id}`;
    runtime.EventsOn(dataEv, (chunk: string) => term.write(chunk));

    // Process exit
    const exitEv = `terminal:exit:${id}`;
    runtime.EventsOn(exitEv, (code: number) => {
      term.writeln(`\r\n[Process exited with code ${code}]`);
      onExit(code);
    });

    // ResizeObserver on the MOUNT element — has stable dimensions
    const ro = new ResizeObserver(() => doFit());
    ro.observe(el);

    // Initial fit after first paint
    doFit();

    return () => {
      cancelAnimationFrame(rafRef.current);
      dataDispose.dispose();
      runtime.EventsOff(dataEv);
      runtime.EventsOff(exitEv);
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current  = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Focus + refit when tab becomes active ───────────────────────────────────
  useEffect(() => {
    if (!isVisible) return;
    doFit();
    // Focus after fit settles (double-RAF ensures DOM is ready)
    const r1 = requestAnimationFrame(() =>
      requestAnimationFrame(() => termRef.current?.focus())
    );
    return () => cancelAnimationFrame(r1);
  }, [isVisible, doFit]);

  // ── Theme live-update ───────────────────────────────────────────────────────
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = buildTheme(theme);
    }
  }, [theme]);

  // ── Render ──────────────────────────────────────────────────────────────────
  // Outer wrapper controls visibility.
  // Inner mountRef div is ALWAYS rendered with real dimensions so FitAddon works.
  // We use clip + pointer-events instead of display:none to avoid zero-size issues.
  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        inset: 0,
        padding: '12px 16px',
        boxSizing: 'border-box',
        visibility: isVisible ? 'visible' : 'hidden',
        pointerEvents: isVisible ? 'auto' : 'none',
        zIndex: isVisible ? 1 : 0,
      }}
    >
      <div
        ref={mountRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
};
