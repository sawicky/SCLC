// SCLC - optional local dev server.
//
// The app is fully static: index.html, styles.css, app.js, and
// public/data/items.json. For production you can drop the whole `public/`
// folder onto Supabase Storage / Vercel / Netlify / GitHub Pages and skip
// Node entirely - see DEPLOY.md.
//
// This file is just a convenience for local development with no-cache and a
// nice URL.
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.static(PUBLIC_DIR, { etag: false, maxAge: 0 }));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  SCLC running at http://localhost:${PORT}`);
  console.log(`  Edit public/data/items.json to add or change items - just refresh the browser.\n`);
});
