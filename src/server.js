import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, upsertUserLink, getUserLinks } from './db.js';
import { bot } from './bot.js';

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

function createExchangeRow(user1Id, user2Id) {
  const now = Date.now();
  const deadline = now + 48 * 60 * 60 * 1000; // 48 soat
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO exchanges (user1_id, user2_id, status, created_at, deadline) VALUES (?, ?, 'pending_partner', ?, ?)`,
      [user1Id, user2Id, now, deadline],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function extractBotNameFromLink(link) {
  if (!link) return null;
  try {
    const url = new URL(link);
    if (!url.hostname.includes('t.me')) return null;
    const p = url.pathname.replace(/^\//, '');
    return p.split('/')[0] || null;
  } catch (e) {
    return null;
  }
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

// WebApp'dan "Bor" bosilganda almashishni yaratish va user2 ga xabar yuborish
app.post('/api/exchange/create', async (req, res) => {
  try {
    const { from_telegram_id, candidate_telegram_id } = req.body || {};

    const fromId = parseInt(from_telegram_id, 10);
    const candId = parseInt(candidate_telegram_id, 10);

    if (!fromId || !candId) {
      return res.status(400).json({ error: 'from_telegram_id va candidate_telegram_id body da kerak' });
    }

    const user = await findUserByTelegramId(fromId);
    const candidate = await findUserByTelegramId(candId);

    if (!user) {
      return res.status(404).json({ error: 'from_telegram_id foydalanuvchisi topilmadi' });
    }
    if (!candidate) {
      return res.status(404).json({ error: 'candidate_telegram_id foydalanuvchisi topilmadi' });
    }

    const exchangeId = await createExchangeRow(fromId, candId);

    // user1 dan foydalanib, user2 ga yuboriladigan matn
    let uLink = user.main_link || '-';

    const candidateText =
      `Kimdir siz bilan start almashmoqchi.

Sizning quyidagi linkingiz uchun:
${uLink}

Iltimos, pastdagi tugmalar orqali qaror bering.
Agar xohlasangiz, bot chatidagi "🧩 Web ilova" tugmasi orqali WebApp'ni ochib, almashish tafsilotlarini ko'rishingiz mumkin.

Rozimisiz?`;

    try {
      await bot.telegram.sendMessage(candId, candidateText);
    } catch (e) {
      console.error('/api/exchange/create sendMessage xato:', e);
      // Xabar yuborishda xato bo'lsa ham, exchange yaratilgan bo'ladi
    }

    return res.json({ ok: true, exchange_id: exchangeId });
  } catch (e) {
    console.error('/api/exchange/create xato:', e);
    return res.status(500).json({ error: 'Server xatosi' });
  }
});

// Foydalanuvchi uchun bitta tasodifiy almashish kandidati qaytarish (WebApp kartasi uchun)
app.get('/api/exchange/match', async (req, res) => {
  try {
    const telegramId = parseInt(req.query.telegram_id, 10);
    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id query param kerak' });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user || !user.main_link) {
      return res.json({ candidate: null });
    }

    const currentMainLink = user.main_link ? user.main_link.trim() : null;

    db.all(
      'SELECT * FROM users WHERE main_link IS NOT NULL AND telegram_id != ?',
      [telegramId],
      (err, rows) => {
        if (err) {
          console.error('/api/exchange/match query xato:', err);
          return res.status(500).json({ error: 'Server xatosi' });
        }

        if (!rows || rows.length === 0) {
          return res.json({ candidate: null });
        }

        const filtered = rows.filter((row) => {
          // Bir xil user bo'lmasligi (zaxira)
          if (row.telegram_id === telegramId) return false;

          // Asosiy linki ham aynan bir xil bo'lmasin
          if (currentMainLink && row.main_link && row.main_link.trim() === currentMainLink) return false;

          return true;
        });

        if (!filtered.length) {
          return res.json({ candidate: null });
        }

        const randomIndex = Math.floor(Math.random() * filtered.length);
        const c = filtered[randomIndex];

        return res.json({
          candidate: {
            telegram_id: c.telegram_id,
            name: c.name,
            username: c.username,
            profile_link: c.profile_link,
            main_link: c.main_link,
            description: c.description
          }
        });
      }
    );
  } catch (e) {
    console.error('/api/exchange/match xato:', e);
    return res.status(500).json({ error: 'Server xatosi' });
  }
});

// Foydalanuvchi uchun hozircha boshqa foydalanuvchilar bormi-yo'qligini tekshirish (soddalashtirilgan)
// Asl murakkab filtrlar (o'zi bilan tenglashtirmaslik, bir xil bot/linkni chetga olish) bot ichidagi
// getRandomCandidateForUser funksiyasida ishlaydi. Bu yerda faqat "umuman olganda" sherik bo'lishi
// mumkin bo'lgan boshqa user bor-yo'qligini ko'ramiz.
app.get('/api/exchange/has_candidates', async (req, res) => {
  try {
    const telegramId = parseInt(req.query.telegram_id, 10);
    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id query param kerak' });
    }

    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      return res.json({ has_candidates: false });
    }

    db.all(
      'SELECT telegram_id, main_link FROM users WHERE telegram_id != ? AND main_link IS NOT NULL LIMIT 1',
      [telegramId],
      (err, rows) => {
        if (err) {
          console.error('/api/exchange/has_candidates query xato:', err);
          return res.status(500).json({ error: 'Server xatosi' });
        }

        if (!rows || rows.length === 0) {
          return res.json({ has_candidates: false });
        }

        return res.json({ has_candidates: true });
      }
    );
  } catch (e) {
    console.error('/api/exchange/has_candidates xato:', e);
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

    // Agar 1-slot saqlanayotgan bo'lsa, users jadvalidagi main_link va description ni ham sinxronlashtiramiz,
    // shunda botdagi profil va matching ham aynan shu linkdan foydalanadi.
    if (slotIndex === 1) {
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE users SET main_link = ?, description = ? WHERE telegram_id = ?',
          [link, description || null, telegramId],
          (err) => {
            if (err) return reject(err);
            resolve();
          }
        );
      });
    }

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

// WebApp'dan kelgan taklifga (user2 tomoni) Bor/Yo'q javobini qayta ishlash
app.post('/api/exchange/offer_action', async (req, res) => {
  try {
    const { telegram_id, exchange_id, action } = req.body || {};

    const userId = parseInt(telegram_id, 10);
    const exId = parseInt(exchange_id, 10);

    if (!userId || !exId || !action) {
      return res.status(400).json({ error: 'telegram_id, exchange_id va action body da kerak' });
    }

    const ex = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM exchanges WHERE id = ?', [exId], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });

    if (!ex) {
      return res.status(404).json({ error: 'Almashish topilmadi' });
    }

    // Faqat user2 (taklif qabul qiluvchi) bu yerga javob bera oladi va status pending_partner bo'lishi kerak
    if (ex.user2_id !== userId || ex.status !== 'pending_partner') {
      return res.status(400).json({ error: 'Bu almashish siz uchun amal qilmaydi yoki allaqachon yangilangan' });
    }

    const user1Id = ex.user1_id;
    const user2Id = ex.user2_id;

    const user1 = await findUserByTelegramId(user1Id);
    const user2 = await findUserByTelegramId(user2Id);

    if (!user1 || !user2) {
      return res.status(404).json({ error: 'Foydalanuvchilardan biri topilmadi' });
    }

    if (action === 'accept') {
      await new Promise((resolve, reject) => {
        db.run('UPDATE exchanges SET status = ? WHERE id = ?', ['accepted_partner', exId], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      const uLink = user1.main_link || '-';
      const msg =
        `Siz yuborgan quyidagi linkingiz egasi almashishga ROZI bo'ldi:
${uLink}

Endi almashishni davom ettirish uchun "🧩 Web ilova" tugmasi orqali WebApp'ni ochib, takliflar bo'limini ko'rib chiqing.`;

      try {
        await bot.telegram.sendMessage(user1Id, msg);
      } catch (e) {
        console.error('/api/exchange/offer_action accept sendMessage xato:', e);
      }

      return res.json({ ok: true, status: 'accepted_partner' });
    }

    if (action === 'reject') {
      await new Promise((resolve, reject) => {
        db.run('UPDATE exchanges SET status = ? WHERE id = ?', ['rejected_partner', exId], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      const uLink = user1.main_link || '-';
      const msg =
        `Siz yuborgan quyidagi linkingiz bo'yicha taklif QABUL QILINMADI:
${uLink}

Bu foydalanuvchi almashishni rad etdi. Istasangiz, boshqa sheriklar bilan almashishni davom ettirishingiz mumkin.`;

      try {
        await bot.telegram.sendMessage(user1Id, msg);
      } catch (e) {
        console.error('/api/exchange/offer_action reject sendMessage xato:', e);
      }

      return res.json({ ok: true, status: 'rejected_partner' });
    }

    return res.status(400).json({ error: 'action faqat accept yoki reject bo‘lishi mumkin' });
  } catch (e) {
    console.error('/api/exchange/offer_action xato:', e);
    return res.status(500).json({ error: 'Server xatosi' });
  }
});

app.listen(PORT, () => {
  console.log(`HTTP server ishga tushdi: http://localhost:${PORT}`);
});
