import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';

// Botlarni ishga tushiramiz (side-effect imports)
import './all_bots.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

// --- DB helperlar (bot.js dagi bilan bir xil mantiq) ---
function findUserByTelegramId(telegramId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function getUserLinksAll(telegramId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM user_links WHERE telegram_id = ? ORDER BY slot_index',
      [telegramId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

function getFriendsForUser(telegramId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT u.* FROM friendships f
       JOIN users u ON f.friend_id = u.telegram_id
       WHERE f.user_id = ?`,
      [telegramId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

// --- API endpointlar ---

// Profil va asosiy statistika
app.get('/api/me', async (req, res) => {
  try {
    const telegramId = parseInt(req.query.telegram_id, 10);
    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id query param kerak' });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }

    return res.json({
      user: {
        telegram_id: user.telegram_id,
        name: user.name,
        username: user.username,
        phone: user.phone,
        main_link: user.main_link,
        description: user.description,
        slots: user.slots,
        used_slots: user.used_slots,
        invited_friends_count: user.invited_friends_count,
        total_exchanges: user.total_exchanges
      }
    });
  } catch (e) {
    console.error('/api/me xato:', e);
    return res.status(500).json({ error: 'Server xatosi' });
  }
});

// Slotlar ro'yxati
app.get('/api/slots', async (req, res) => {
  try {
    const telegramId = parseInt(req.query.telegram_id, 10);
    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id query param kerak' });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }

    const links = await getUserLinksAll(telegramId);

    return res.json({
      slots: user.slots || 1,
      links
    });
  } catch (e) {
    console.error('/api/slots xato:', e);
    return res.status(500).json({ error: 'Server xatosi' });
  }
});

// Do'stlar ro'yxati
app.get('/api/friends', async (req, res) => {
  try {
    const telegramId = parseInt(req.query.telegram_id, 10);
    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id query param kerak' });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }

    const friends = await getFriendsForUser(telegramId);
    return res.json({ friends });
  } catch (e) {
    console.error('/api/friends xato:', e);
    return res.status(500).json({ error: 'Server xatosi' });
  }
});

app.listen(PORT, () => {
  console.log(`HTTP server ishga tushdi: http://localhost:${PORT}`);
});
