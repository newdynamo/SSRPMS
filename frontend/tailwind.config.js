/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                ocean: {
                    900: '#0B1120', // Deepest background
                    800: '#151e32', // Card background
                    700: '#1e293b', // Hover state
                    600: '#334155', // Borders
                },
                primary: {
                    400: '#38bdf8', // Accent
                    500: '#0ea5e9', // Brand
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
