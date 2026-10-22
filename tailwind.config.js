/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--color-canvas)',
        surface: 'var(--color-surface)',
        sunken: 'var(--color-surface-sunken)',
        ink: 'var(--color-text)',
        muted: 'var(--color-text-secondary)',
        faint: 'var(--color-text-tertiary)',
        line: 'var(--color-border)',
        'line-strong': 'var(--color-border-strong)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-active': 'var(--color-accent-active)',
        'accent-soft': 'var(--color-accent-soft)',
        'accent-ink': 'var(--color-accent-text)',
        'on-accent': 'var(--color-on-accent)',
        disabled: 'var(--color-disabled-bg)',
        'disabled-ink': 'var(--color-disabled-text)'
      },
      borderRadius: {
        control: '10px',
        card: '12px',
        composer: '16px'
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'PingFang SC',
          'Hiragino Sans GB',
          'Noto Sans CJK SC',
          'Microsoft YaHei',
          '微软雅黑',
          'sans-serif'
        ]
      },
      fontSize: {
        caption: ['12px', { lineHeight: '1.4' }],
        secondary: ['14px', { lineHeight: '1.45' }],
        body: ['16px', { lineHeight: '1.5' }],
        display: ['28px', { lineHeight: '1.25' }]
      }
    }
  },
  plugins: []
};
