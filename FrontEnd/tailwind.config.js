/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts,scss}"],
  theme: {
    extend: {
      colors: {
        // Cinematic Wedding Photography Color Palette
        primary: {
          50: '#fdf2f1',
          100: '#fce4e1',
          200: '#f9ccc6',
          300: '#f5a99e',
          400: '#f08676',
          500: '#e2725b', // Main terracotta
          600: '#d65a43',
          700: '#b84a36',
          800: '#9a3d2d',
          900: '#7c3124',
          950: '#4d1e16'
        },
        secondary: {
          50: '#f6f7f4',
          100: '#e9ebe4',
          200: '#d4d7c7',
          300: '#b8bca4',
          400: '#9c9f84', // Main sage green
          500: '#83866d',
          600: '#6b6e5a',
          700: '#56584a',
          800: '#484a3e',
          900: '#3d3f35',
          950: '#20211c'
        },
        accent: {
          50: '#f7f7f7',
          100: '#e3e3e3',
          200: '#c8c8c8',
          300: '#a4a4a4',
          400: '#818181',
          500: '#666666',
          600: '#515151',
          700: '#434343',
          800: '#383838',
          900: '#333333', // Main charcoal
          950: '#1a1a1a'
        },
        neutral: {
          50: '#fefdfb',
          100: '#fdf9f2',
          200: '#faf2e3',
          300: '#f5e6c7',
          400: '#f5f5dc', // Main cream
          500: '#d8c3a5', // Soft beige
          600: '#c4a882',
          700: '#a68f68',
          800: '#8a7555',
          900: '#6f5f46',
          950: '#3a3124'
        },
        // Additional cinematic tones
        warm: {
          50: '#fdf8f6',
          100: '#f2e8e5',
          200: '#eaddd7',
          300: '#e0cec7',
          400: '#d2bab0',
          500: '#bfa094',
          600: '#a18072',
          700: '#977669',
          800: '#846358',
          900: '#6d4c41',
          950: '#3c2b24'
        },
        cool: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617'
        }
      },
      fontFamily: {
        'cinematic': ['Playfair Display', 'serif'],
        'sans': ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-cinematic': 'linear-gradient(135deg, #f5f5dc 0%, #d8c3a5 100%)',
        'gradient-warm': 'linear-gradient(135deg, #e2725b 0%, #9c9f84 100%)',
      }
    },
  },
  plugins: [],
}

