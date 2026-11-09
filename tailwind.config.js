/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#0b0b0f',
        card: '#16161c',
        card2: '#1f1f27',
        line: '#2a2a33',
        muted: '#8e8e99',
        accent: '#34d399',
        warn: '#fbbf24',
        danger: '#f87171',
      },
      keyframes: {
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        pop: { '0%': { transform: 'scale(0.97)' }, '100%': { transform: 'scale(1)' } },
      },
      animation: {
        'sheet-in': 'sheet-in 0.28s cubic-bezier(0.32,0.72,0,1)',
        'fade-in': 'fade-in 0.2s ease-out',
        pop: 'pop 0.18s ease-out',
      },
    },
  },
  plugins: [],
};
