/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hoterra: {
          navy: '#0D1B2A',
          gold: '#D4A017',
          'gold-active': '#E8A317',
          steel: '#294660',
          gray: '#F2F4F7',
          offwhite: '#FAF8FC',
          page: '#F8FAFC',
          sidebar: '#0D1B2A',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        login: '0 20px 50px -12px rgb(0 0 0 / 0.15)',
      },
      backgroundImage: {
        'login-resort':
          'linear-gradient(135deg, rgba(13,27,42,0.92) 0%, rgba(41,70,96,0.85) 100%), url("https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80")',
        'dot-grid':
          'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
      },
      backgroundSize: {
        'dot-grid': '24px 24px',
      },
    },
  },
  plugins: [],
};
