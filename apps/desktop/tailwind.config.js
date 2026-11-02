/** @type {import('tailwindcss').Config} */

/**
 * Colour classes resolve to the CSS variables in src/renderer/src/index.css, so the light theme
 * (`<html data-theme="light">`) swaps every token without touching components. Same names as the admin.
 */
const v = (name) => `var(--${name})`;

module.exports = {
  darkMode: ['class', ':root:not([data-theme="light"])'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        'surface-3': v('surface-3'),
        line: v('line'),
        'line-2': v('line-2'),
        ink: v('ink'),
        'ink-2': v('ink-2'),
        'ink-3': v('ink-3'),
        pri: v('pri'),
        'pri-2': v('pri-2'),
        'pri-soft': v('pri-soft'),
        'on-pri': v('on-pri'),
        green: v('green'),
        'green-text': v('green-text'),
        'green-soft': v('green-soft'),
        amber: v('amber'),
        'amber-text': v('amber-text'),
        'amber-soft': v('amber-soft'),
        'amber-bar': v('amber-bar'),
        red: v('red'),
        'red-text': v('red-text'),
        'red-soft': v('red-soft'),
        blue: v('blue'),
        'blue-text': v('blue-text'),
        'blue-soft': v('blue-soft'),
        violet: v('violet'),
        'violet-text': v('violet-text'),
        'violet-soft': v('violet-soft'),
        gray: v('gray'),
        'gray-soft': v('gray-soft'),
        'gray-bar': v('gray-bar'),
        overlay: v('overlay'),
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '10px',
        modal: '14px',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
        modal: 'var(--shadow-modal)',
        drawer: 'var(--shadow-drawer)',
        btn: 'var(--shadow-btn)',
      },
      fontSize: {
        '2xs': ['10.5px', { lineHeight: '14px', letterSpacing: '0.08em' }],
        xs: ['11.5px', { lineHeight: '16px' }],
        sm: ['12.5px', { lineHeight: '18px' }],
        base: ['13px', { lineHeight: '19px' }],
        md: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '22px' }],
        xl: ['18px', { lineHeight: '24px' }],
        '2xl': ['24px', { lineHeight: '30px', letterSpacing: '-0.01em' }],
        '3xl': ['30px', { lineHeight: '36px', letterSpacing: '-0.015em' }],
        '4xl': ['40px', { lineHeight: '44px', letterSpacing: '-0.02em' }],
      },
    },
  },
  plugins: [],
};
