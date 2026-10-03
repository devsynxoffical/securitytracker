/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F5F6F3',
        surface: '#FFFFFF',
        'surface-2': '#FAFBF9',
        line: '#E4E7E1',
        'line-2': '#EEF0EC',
        ink: '#151A1E',
        'ink-2': '#4A535B',
        'ink-3': '#8A939B',
        pri: '#0F6B5C',
        'pri-2': '#0B5548',
        'pri-soft': '#E3F1EE',
        green: '#1E8E5A',
        'green-soft': '#E4F4EB',
        amber: '#B26A00',
        'amber-soft': '#FCF0DA',
        'amber-bar': '#E0921A',
        red: '#C2362B',
        'red-soft': '#FBE7E4',
        blue: '#2459C4',
        'blue-soft': '#E6EDFB',
        violet: '#6B46C1',
        'violet-soft': '#EEE8FA',
        gray: '#5C666E',
        'gray-soft': '#ECEEEB',
        'gray-bar': '#B5BCC2',
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
        card: '0 1px 2px rgba(21, 26, 30, 0.05)',
        modal: '0 20px 60px rgba(0, 0, 0, 0.22)',
        drawer: '-10px 0 40px rgba(0, 0, 0, 0.15)',
      },
    },
  },
  plugins: [],
};
