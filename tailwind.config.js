/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hoterra: {
          navy: '#0D1B2A',
          gold: '#D4A017',
          steel: '#294660',
          gray: '#F2F4F7',
          offwhite: '#FAF8FC',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
