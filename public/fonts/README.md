# Bundled web fonts

Fraunces and Manrope WOFF2 subsets are the original files previously downloaded by this app's `next/font/google` configuration, recovered from its development asset cache. They are unchanged. `src/app/fonts.css` retains the original weights, Unicode ranges and fallback metrics.

Bundling these files removes the Google Fonts network dependency from production builds. Both fonts use SIL Open Font License 1.1; the copyright notices and full licenses are included beside the files.

- Fraunces: https://github.com/undercasetype/Fraunces
- Manrope: https://github.com/googlefonts/manrope
- License sources: https://github.com/google/fonts/tree/main/ofl/fraunces and https://github.com/google/fonts/tree/main/ofl/manrope
