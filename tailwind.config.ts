import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        indigo: {
          600: '#4F46E5',
        },
      },
    },
  },
  plugins: [],
};

export default config;
