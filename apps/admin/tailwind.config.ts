import type { Config } from 'tailwindcss';

/**
 * Colour classes resolve to the CSS variables in app/globals.css, so the dark theme
 * (`<html data-theme="dark">`) swaps every token without touching components.
 */
const v = (name: string) => `var(--${name})`;

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/pages/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}', './src/app/**/*.{js,ts,jsx,tsx,mdx}'],
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
        'series-1': v('series-1'),
        'series-2': v('series-2'),
        'series-3': v('series-3'),
        'series-4': v('series-4'),
        'series-5': v('series-5'),
        'series-6': v('series-6'),
        'series-7': v('series-7'),
        'series-8': v('series-8'),
      },
      fontFamily: {
        sans: ['IBM Plex Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
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
      },
    },
  },
  plugins: [],
};

export default config;
