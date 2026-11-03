# BaliPlex

Cinema-style IPTV browser for watching live channels from the [iptv-org](https://github.com/iptv-org/iptv) playlist. Static HTML/CSS/JS — no build step, ready for GitHub Pages.

## Features

- Channel list with logo, country, and category
- Searchable country and category filters
- Video.js player with previous / next channel controls (`←` `→` or `[` `]`)
- Playlist URL kept out of the UI (configured in `js/config.js`)

## Local preview

Serve the repo root over HTTP (required for module-friendly fetch behavior and some browsers):

```bash
npx --yes serve .
```

Then open the URL shown in the terminal (usually `http://localhost:3000`).

You can also open `index.html` via any simple static server.

## GitHub Pages

1. Push this repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose branch `main` and folder `/ (root)`, then save.
5. After a minute or two, the site is available at  
   `https://<your-username>.github.io/baliplex/`

`.nojekyll` is included so GitHub Pages serves the static files without Jekyll processing.

## Configuration

Default playlist and country metadata URLs live in [`js/config.js`](js/config.js):

```js
PLAYLIST_URL: "https://iptv-org.github.io/iptv/index.m3u"
COUNTRIES_URL: "https://iptv-org.github.io/api/countries.json"
```

Change `PLAYLIST_URL` there if you want a different iptv-org region or category playlist. Use the header refresh button to reload.

## Notes

- Streams are loaded directly in the browser. Many channels fail due to geo-blocking, expired links, or CORS restrictions — that is expected with public IPTV indexes.
- Stream URLs are never shown in the UI; they are only used by the player.
- This project is a viewer for publicly listed IPTV sources. Respect local laws and the terms of the content providers.
