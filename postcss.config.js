/*
 * Name: postcss.config.js
 * Purpose: PostCSS pipeline configuration for CSS processing.
 * Description: Tailwind CSS processes utility classes. Autoprefixer adds
 *   vendor prefixes for cross-browser compatibility in the Tauri
 *   WebView.
 * Tech Stack: PostCSS, Tailwind CSS, Autoprefixer
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
