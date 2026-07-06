import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  prefix: 'tw-',
  theme: { extend: {} },
  plugins: [],
} satisfies Config
