/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
    theme: {
        extend: {
            colors: {
                'bg-deep': '#050810',
                'bg-surface': '#0a0f1a',
                'coral-bright': '#ff4d4d',
                'coral-mid': '#e63946',
                'coral-dark': '#991b1b',
                'cyan-bright': '#00e5cc',
            },
            fontFamily: {
                'display': ['Clash Display', 'system-ui', 'sans-serif'],
                'body': ['Satoshi', 'system-ui', 'sans-serif'],
                'mono': ['SF Mono', 'Fira Code', 'JetBrains Mono', 'monospace'],
            }
        },
    },
    plugins: [],
}
