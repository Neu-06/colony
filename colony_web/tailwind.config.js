/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        
        ink: {
          DEFAULT: 'var(--color-ink)',
          light: 'var(--color-ink-light)',
        },
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
        },
        secondary: {
          DEFAULT: 'var(--color-secondary)',
          hover: 'var(--color-secondary-hover)',
        },
        
        // El semáforo
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        info: 'var(--color-info)',

        canvasBg: 'var(--color-canvas-bg)',
        canvasGrid: 'var(--color-canvas-grid)',
        swimlaneBorder: 'var(--color-swimlane-border)',
        swimlaneBgAlt: 'var(--color-swimlane-bg-alt)',
        nodeStart: 'var(--color-node-start)',
        nodeTask: 'var(--color-node-task)',
        nodeGateway: 'var(--color-node-gateway)',
        nodeEnd: 'var(--color-node-end)',
        nodeLine: 'var(--color-node-line)',

      }
    },
  },
  plugins: [],
}