import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, upsertUserLink, getUserLinks } from './db.js';

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

    const invited = user.invited_friends_count || 0;
    const effectiveSlots = Math.min(1 + Math.floor(invited / 5), 3);

    return res.json({
      user: {
        telegram_id: user.telegram_id,
        name: user.name,
        username: user.username,
        phone: user.phone,
        main_link: user.main_link,
        description: user.description,
        slots: effectiveSlots,
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

// Slot ma'lumotini yangilash (hozircha faqat 1-slotni tahrirlash uchun ishlatamiz)
app.post('/api/slots', async (req, res) => {
  try {
    const { telegram_id, slot_index, link, description } = req.body || {};

    const telegramId = parseInt(telegram_id, 10);
    const slotIndex = parseInt(slot_index || 1, 10) || 1;

    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id body da kerak' });
    }

    if (!link || typeof link !== 'string' || !link.startsWith('http')) {
      return res.status(400).json({ error: 'link noto‘g‘ri yoki yo‘q' });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }

    const invited = user.invited_friends_count || 0;
    const effectiveSlots = Math.min(1 + Math.floor(invited / 5), 3);

    if (slotIndex > effectiveSlots) {
      return res.status(400).json({ error: 'Bu slot siz uchun hali ochilmagan' });
    }

    await upsertUserLink(telegramId, slotIndex, link, description || null);

    return res.json({ ok: true });
  } catch (e) {
    console.error('/api/slots POST xato:', e);
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

    const invited = user.invited_friends_count || 0;
    const effectiveSlots = Math.min(1 + Math.floor(invited / 5), 3);

    const links = await getUserLinksAll(telegramId);

    return res.json({
      slots: effectiveSlots,
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

// Sizga kelgan almashish takliflari (user2 sifatida)
app.get('/api/exchange/offers', async (req, res) => {
  try {
    const telegramId = parseInt(req.query.telegram_id, 10);
    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id query param kerak' });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }

    // exchanges jadvalidan statusi pending_partner bo'lgan, siz user2 bo'lganlar
    const offers = await new Promise((resolve, reject) => {
      db.all(
        `SELECT e.id as exchange_id, e.user1_id, e.user2_id, e.status,
                u.name as user1_name, u.username as user1_username,
                u.profile_link as user1_profile_link, u.main_link as user1_main_link,
                u.description as user1_description
         FROM exchanges e
         JOIN users u ON e.user1_id = u.telegram_id
         WHERE e.user2_id = ? AND e.status = 'pending_partner'
         ORDER BY e.created_at DESC`,
        [telegramId],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    // Har bir taklif uchun user1 ning slot linklarini ham qo'shamiz
    const detailedOffers = await Promise.all(
      offers.map(async (offer) => {
        let slots = [];
        try {
          const links = await getUserLinks(offer.user1_id);
          slots = links.map((l) => ({
            slot_index: l.slot_index,
            link: l.link,
            description: l.description
          }));
        } catch (e) {
          console.error('/api/exchange/offers getUserLinks xato:', e);
        }

        return {
          exchange_id: offer.exchange_id,
          status: offer.status,
          from_user: {
            telegram_id: offer.user1_id,
            name: offer.user1_name,
            username: offer.user1_username,
            profile_link: offer.user1_profile_link,
            main_link: offer.user1_main_link,
            description: offer.user1_description
          },
          slots
        };
      })
    );

    return res.json({ offers: detailedOffers });
  } catch (e) {
    console.error('/api/exchange/offers xato:', e);
    return res.status(500).json({ error: 'Server xatosi' });
  }
});

app.listen(PORT, () => {
  console.log(`HTTP server ishga tushdi: http://localhost:${PORT}`);
});
