/*
 * Title: postcss.config.js
 * Tech Stack: PostCSS, Tailwind CSS, Autoprefixer
 * Description: PostCSS pipeline configuration for CSS processing.
 * Important Details: Tailwind CSS processes utility classes. Autoprefixer adds vendor
 *   prefixes for cross-browser compatibility in the Tauri WebView.
 */

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
