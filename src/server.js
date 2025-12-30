import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Botlarni ishga tushiramiz (side-effect imports)
import './all_bots.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Static fayllar (WebApp)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// / yoki /webapp da WebApp ochish
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/webapp', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`HTTP server ishga tushdi: http://localhost:${PORT}`);
});
