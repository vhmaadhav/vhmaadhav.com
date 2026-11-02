# maadhav-site

Personal portfolio for Maadhav V H, live at [vhmaadhav.com](https://vhmaadhav.com). It is a buildless static page with a braille hero, GitHub and LeetCode contribution heatmaps, and a prerendered HTML copy of the content for search engines and LLM crawlers. `index.html` loads `dist/content.json`, which `dist/app.js` renders with `dist/style.css`. A small Cloudflare Worker (`worker/index.js`) serves the LeetCode snapshot and the static files in `dist/`.

## Build

```
node build.mjs
```

No dependencies. The build prerenders `dist/index.html` from `dist/content.json` and `src/index.template.html`, with static content, the SEO head and JSON-LD. It also regenerates `dist/robots.txt`, `dist/sitemap.xml` and `dist/llms.txt`, and fetches the LeetCode snapshot into `dist/leetcode.json` (see `lib/leetcode.mjs`). If the fetch fails, the last file is kept. Run the build after every content change.

## Run locally

From the repo root:

```
python3 -m http.server 4173 --directory dist
```

Then open http://localhost:4173.

## Deploy (Cloudflare Workers)

The site is a Cloudflare Worker with static assets. `wrangler.jsonc` serves `dist/` as assets and runs `worker/index.js` first. The Worker serves `/api/leetcode` with the same normalisation as the build, cached for six hours, and redirects `www.vhmaadhav.com` to `vhmaadhav.com`. Every other path is served from `dist/`. The page falls back to `dist/leetcode.json`, then to a plain link.

Create the Worker from this GitHub repo with Workers Builds:

- Build command: `node build.mjs`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

Custom domains: add `vhmaadhav.com` and `www.vhmaadhav.com` under the Worker's Settings → Domains & Routes. The canonical URL, og:url, sitemap, llms.txt and JSON-LD all derive from `site.url` in `dist/content.json`, which is already `https://vhmaadhav.com`.

Local preview, including `/api/leetcode`: `npx wrangler dev` (optional).

## Edit

All content lives in `dist/content.json`:

- `profile`: name, role, bio lines, location, header links (`github`, `linkedin`, `email`, `resume`). `handle` is the GitHub username used for the contribution heatmap.
- `experience`: `start` and `end` as `YYYY-MM`. Omit `end` for a current role. Durations are computed automatically.
- `wins`: newest first. `highlight: true` bolds the title.
- `projects`: add `url` only for public repos. Private projects get a `note` and no link.
- `education`, `credentials`: plain entries.
- `skills`: `label` plus an optional `icon`, a devicon class from the pinned devicon v2.16.0 stylesheet. Entries without an icon show as text-only chips.

Markup lives in `dist/render.js`, which both `build.mjs` and the browser use, so the static page and any client refresh always match. Behaviour (braille point cloud, section dividers, GitHub heatmap, experience durations) is in `dist/app.js`, and layout is in `dist/style.css`. The page template is `src/index.template.html`. The resume is `dist/Maadhav_VH_Resume.pdf`.

## License

Code is MIT, see [LICENSE](LICENSE).

Content (text, resume) © Maadhav V H — not covered by the MIT license.
