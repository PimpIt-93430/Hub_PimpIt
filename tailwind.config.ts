import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigo: {
          600: '#4F46E5',
        },
        bg: '#F8F9FB',
        surface: '#FFFFFF',
        border: '#E5E7EB',
        text2: '#6B7280',
        text3: '#9CA3AF',
      },
      borderRadius: {
        card: '10px',
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)',
      },
    },
  },
  plugins: [],
};

export default config;
