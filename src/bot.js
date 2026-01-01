import { Telegraf, Markup } from 'telegraf';
import { message } from 'telegraf/filters';
import { BOT_TOKEN, REQUIRED_CHANNEL, WEBAPP_URL } from './config.js';
import { db, initDb, getSetting, getChannels, recordChannelJoin, upsertUserLink, getUserLinks } from './db.js';

// Admin ID (shu qiymat admin_bot.js dagi ADMIN_ID bilan bir xil bo'lishi kerak)
const ADMIN_ID = 7386008809;

initDb();

const bot = new Telegraf(BOT_TOKEN);

// Global debug middleware: har bir update turini va to'liq update JSON'ini log qilamiz
bot.use((ctx, next) => {
  try {
    console.log('UPDATE:', ctx.updateType, JSON.stringify(ctx.update));
  } catch (e) {
    console.error('UPDATE log xatosi:', e);
  }
  return next();
});

// In-memory state for simple step-by-step flow
const userStates = new Map();
const currentCandidates = new Map();
const previousCandidates = new Map();
const seenCandidates = new Map(); // telegramId -> Set of candidate telegram_ids
const searchSlots = new Map(); // telegramId -> tanlangan slot index (1..3)
const activeExchanges = new Map(); // telegramId -> exchangeId

function channelCheckKeyboard(channel) {
  const channelLink = `https://t.me/${channel.replace('@', '')}`;
  return Markup.inlineKeyboard([
    [Markup.button.url('📢 Kanalga o‘tish', channelLink)],
    [Markup.button.callback('✅ Tekshirish', 'check_sub')]
  ]);
}

function multiChannelKeyboard(channels) {
  const rows = [];

  channels.forEach((ch, idx) => {
    const name = ch.name || `Kanal ${idx + 1}`;
    const link = ch.link || (ch.name ? `https://t.me/${ch.name.replace('@', '')}` : null);
    if (!link) return;

    rows.push([Markup.button.url(name, link)]);
  });

  rows.push([Markup.button.callback('✅ Tekshirish', 'check_sub')]);

  return Markup.inlineKeyboard(rows);
}

async function requireSubscription(ctx) {
  const telegramId = ctx.from && ctx.from.id;
  if (!telegramId) return true;

  // Avval ko'p kanalli konfiguratsiyani (channels jadvali) tekshiramiz
  let channels = [];
  try {
    channels = await getChannels();
  } catch (e) {
    // agar xatolik bo'lsa, pastdagi eski bitta-kanalli rejimga o'tamiz
  }

  if (channels && channels.length > 0) {
    const notSubscribed = [];

    for (const ch of channels) {
      const chatId = ch.name || ch.link;
      if (!chatId) continue;

      try {
        const member = await ctx.telegram.getChatMember(chatId, telegramId);
        const status = member.status;
        if (!['member', 'administrator', 'creator'].includes(status)) {
          notSubscribed.push(ch);
        }
      } catch (e) {
        console.error('Kanalga obuna tekshiruvda xatolik (multi-kanal):', chatId, e.description || e.message || e);
        // Agar chat topilmasa, bu kanalni talab qilmaymiz
        if (e && e.response && e.response.error_code === 400) {
          continue;
        }
        notSubscribed.push(ch);
      }
    }

    if (notSubscribed.length === 0) {
      // Birinchi muvaffaqiyatli o'tishda joined_count ni oshirish
      try {
        for (const ch of channels) {
          await recordChannelJoin(ch.id, telegramId);
        }
      } catch (e) {
        console.error('recordChannelJoin xatosi:', e);
      }

      return true;
    }

    let msg = 'Botdan foydalanish uchun quyidagi kanallarga obuna bo‘lishingiz kerak:';

    await ctx.reply(msg, multiChannelKeyboard(notSubscribed));
    return false;
  }

  // Agar channels jadvalidan hech qanday kanal topilmasa, hozircha obunani majburiy qilmaymiz
  return true;
}

function setState(userId, state, data = {}) {
  userStates.set(userId, { state, data });
}

function getState(userId) {
  return userStates.get(userId) || { state: null, data: {} };
}

function clearState(userId) {
  userStates.delete(userId);
}

function mainMenuKeyboard() {
  return Markup.keyboard([['🧩 Web ilova']]).resize();
}

function exchangeWaitingKeyboard() {
  return Markup.keyboard([['🚪 Chiqib ketish']]).resize();
}

function screenshotPhaseKeyboard() {
  return Markup.keyboard([
    ['📸 Screenshot yubormoqchiman'],
    ['✅ Qabul qilindi', '⏳ Kelmadi hali', '🚪 Chiqib ketish']
  ]).resize();
}

function helpChatKeyboard() {
  return Markup.keyboard([
    ['⏳ Kelmadi hali', '🚪 Chiqib ketish'],
    ['🔚 Suhbatni yakunlash']
  ]).resize();
}

function startRegistrationKeyboard() {
  return Markup.keyboard([
    Markup.button.contactRequest('📱 Telefon raqamni yuborish')
  ]).resize();
}

// Helpers: get or create user in DB
function findUserByTelegramId(telegramId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
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

function addScreenshot(exchangeId, userId, fileId) {
  const now = Date.now();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO exchange_screenshots (exchange_id, user_id, file_id, created_at) VALUES (?, ?, ?, ?)`,
      [exchangeId, userId, fileId, now],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function createUser({ telegram_id, phone, name, username, profile_link, referrer_id = null }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (telegram_id, phone, name, username, profile_link, referrer_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [telegram_id, phone, name, username, profile_link, referrer_id],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, telegram_id, phone, name, username, profile_link, referrer_id });
      }
    );
  });
}

function createExchange(user1Id, user2Id) {
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

function updateExchange(id, fields) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE exchanges SET ${setClause} WHERE id = ?`,
      [...values, id],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

function getExchangeById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM exchanges WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function extractBotNameFromLink(link) {
  if (!link) return null;
  try {
    // Expect formats like https://t.me/BotName?start=.... or https://t.me/BotName
    const url = new URL(link);
    if (!url.hostname.includes('t.me')) return null;
    const path = url.pathname.replace(/^\//, '');
    return path.split('/')[0] || null;
  } catch (e) {
    return null;
  }
}

function getRandomCandidateForUser(telegramId, excludeIds = []) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, currentUser) => {
      if (err) return reject(err);

      const currentMainLink = currentUser && currentUser.main_link ? currentUser.main_link.trim() : null;

      db.all(
        'SELECT * FROM users WHERE main_link IS NOT NULL AND telegram_id != ?',
        [telegramId],
        (err2, rows) => {
          if (err2) return reject(err2);
          if (!rows || rows.length === 0) {
            return resolve(null);
          }

          const filtered = rows.filter((row) => {
            if (excludeIds.includes(row.telegram_id)) return false;

            // Bir xil user bo'lmasligi (zaxira tekshiruv)
            if (row.telegram_id === telegramId) return false;

            // Asosiy linki ham aynan bir xil bo'lmasin
            if (currentMainLink && row.main_link && row.main_link.trim() === currentMainLink) return false;

            return true;
          });

          if (!filtered.length) {
            return resolve(null);
          }

          const randomIndex = Math.floor(Math.random() * filtered.length);
          resolve(filtered[randomIndex]);
        }
      );
    });
  });
}

async function showCandidate(ctx, currentUser, candidate) {
  if (!candidate) {
    await ctx.reply(
      'Hozircha siz uchun mos link topilmadi. Iltimos, birozdan so‘ng qayta urinib ko‘ring.',
      mainMenuKeyboard()
    );
    return;
  }

  const candidateName = candidate.name || '-';
  const candidateUsername = candidate.username ? '@' + candidate.username : '-';
  const candidateProfile = candidate.profile_link || '-';
  const candidateLink = candidate.main_link || '-';
  const candidateDescription = candidate.description || '-';

  const text =
    `🔗 Almashish uchun link:
Egasining ismi: ${candidateName}
Username: ${candidateUsername}
Profil: ${candidateProfile}

Link: ${candidateLink}

Tavsif: ${candidateDescription}`;

  currentCandidates.set(currentUser.telegram_id, candidate.telegram_id);
  // Seen kandidatlar ro'yxatiga qo'shamiz
  const seen = seenCandidates.get(currentUser.telegram_id) || new Set();
  seen.add(candidate.telegram_id);
  seenCandidates.set(currentUser.telegram_id, seen);

  await ctx.reply(
    text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Bor', 'match_yes'),
        Markup.button.callback('⏭ Yo‘q, keyingisi', 'match_no')
      ],
      [Markup.button.callback('🔙 Orqaga qaytish', 'match_back')]
    ])
  );
}

function updateUserLinkAndDescription(telegramId, link, description) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET main_link = ?, description = ? WHERE telegram_id = ?`,
      [link, description, telegramId],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

bot.start(async (ctx) => {
  const telegramId = ctx.from.id;

  // Referal payload: /start ref_123456
  let referrerId = null;
  const payload = ctx.startPayload;
  if (payload && typeof payload === 'string' && payload.startsWith('ref_')) {
    const idPart = parseInt(payload.slice(4), 10);
    if (!Number.isNaN(idPart) && idPart !== telegramId) {
      referrerId = idPart;
    }
  }

  const ok = await requireSubscription(ctx);
  if (!ok) return;

  const existing = await findUserByTelegramId(telegramId);

  if (!existing) {
    await ctx.reply(
      'Start almashish botiga xush kelibsiz!\n\nRo‘yxatdan o‘tish uchun telefon raqamingizni yuboring.',
      startRegistrationKeyboard()
    );
    // referrerId bo'lsa, keyingi bosqichda saqlash uchun state'ga qo'yamiz
    setState(telegramId, 'WAIT_PHONE', { referrerId });
  } else {
    await ctx.reply(
      'Siz ro‘yxatdan o‘tgansiz. Pastdagi tugmalar orqali almashishni boshlashingiz yoki Web ilovani ochishingiz mumkin.',
      mainMenuKeyboard()
    );
    clearState(telegramId);
  }
});

// TEMP DEBUG: barcha callback_query larni ko'ramiz
bot.on('callback_query', async (ctx, next) => {
  try {
    const data = ctx.callbackQuery && ctx.callbackQuery.data ? ctx.callbackQuery.data : '<no data>';
    await ctx.reply(`DEBUG callback: ${data}`);
  } catch (e) {
    // ignore
  }
  if (typeof next === 'function') {
    return next();
  }
});

bot.action('check_sub', async (ctx) => {
  const ok = await requireSubscription(ctx);
  if (ok) {
    await ctx.answerCbQuery('Obuna tasdiqlandi.');
    await ctx.reply('Rahmat! Endi botdan to‘liq foydalanishingiz mumkin.', mainMenuKeyboard());
  } else {
    await ctx.answerCbQuery('Hali obuna bo‘lmadingiz.');
  }
});
bot.on('contact', async (ctx) => {
  const telegramId = ctx.from.id;
  const state = getState(telegramId);

  const ok = await requireSubscription(ctx);
  if (!ok) return;

  if (state.state !== 'WAIT_PHONE') {
    return;
  }

  const contact = ctx.message.contact;
  if (!contact || contact.user_id !== telegramId) {
    await ctx.reply('Iltimos, o‘z telefon raqamingizni yuboring.');
    return;
  }

  const phone = contact.phone_number;
  const name = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
  const username = ctx.from.username || null;
  const profile_link = username ? `https://t.me/${username}` : null;

  const referrerId = state && state.data ? state.data.referrerId : null;

  let user = await findUserByTelegramId(telegramId);
  if (!user) {
    user = await createUser({
      telegram_id: telegramId,
      phone,
      name,
      username,
      profile_link,
      referrer_id: referrerId || null
    });

    // Agar referal orqali kelgan bo'lsa, referrals jadvaliga yozamiz, referrer hisobini oshiramiz
    // va ularni do'stlar ro'yxatiga qo'shamiz
    if (referrerId) {
      const now = Date.now();
      db.serialize(() => {
        db.run(
          'INSERT INTO referrals (referrer_id, new_user_id, created_at) VALUES (?, ?, ?)',
          [referrerId, telegramId, now],
          (err) => {
            if (err) {
              console.error('Referral yozishda xato:', err);
            }
          }
        );

        db.run(
          `UPDATE users
           SET invited_friends_count = invited_friends_count + 1,
               slots = MIN(1 + 2 * ((invited_friends_count + 1) / 5), 3)
           WHERE telegram_id = ?`,
          [referrerId],
          (err) => {
            if (err) {
              console.error('invited_friends_count/slots yangilashda xato:', err);
            }
          }
        );

        // Do'stlikni ikki tomonga ham qo'shamiz (agar mavjud bo'lmasa)
        db.run(
          'INSERT INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, friend_id) DO NOTHING',
          [referrerId, telegramId, now],
          (err) => {
            if (err) {
              console.error('friendships (referrer->new) qo\'shishda xato:', err);
            }
          }
        );

        db.run(
          'INSERT INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, friend_id) DO NOTHING',
          [telegramId, referrerId, now],
          (err) => {
            if (err) {
              console.error('friendships (new->referrer) qo\'shishda xato:', err);
            }
          }
        );
      });
    }
  }
  await ctx.reply(
    'Muvaffaqiyatli ro‘yxatdan o‘tdingiz! ✅\n\nEndi start almashish uchun ishlatiladigan bot/link manzilini yuboring.\nMasalan: https://t.me/yourbot?start=...',
    Markup.removeKeyboard()
  );

  // Keyingi bosqichda linkni qabul qilish uchun holat
  setState(telegramId, 'WAIT_LINK');

  // Agar referal orqali kelgan bo'lsa, taklif qilgan odamga xabar yuboramiz
  if (referrerId) {
    const invitedName = name || '-';
    const invitedUsername = username ? '@' + username : '-';

    const inviterText =
      '🎉 Sizning referal linkingiz orqali yangi foydalanuvchi botga qo‘shildi.\n' +
      `Ism: ${invitedName}\n` +
      `Username: ${invitedUsername}\n\n` +
      'Bu taklif uchun sizga 2 ta yangi slot ochildi.\n\n' +
      'Profilingizdan yangi slotlar uchun link qo‘shishingiz mumkin.';

    try {
      await bot.telegram.sendMessage(
        referrerId,
        inviterText,
        Markup.inlineKeyboard([[Markup.button.callback('👤 Profilga o‘tish', 'open_profile')]])
      );
    } catch (e) {
      // agar xabar yuborishda xato bo'lsa, bot ishini to'xtatmaymiz
    }
  }

  clearState(telegramId);
});

bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id;
  const text = ctx.message.text;
  const state = getState(telegramId);

  const ok = await requireSubscription(ctx);
  if (!ok) return;

  // Yordam chat holati: foydalanuvchilar o'zaro yozishishi uchun
  if (state.state === 'HELP_CHAT') {
    const exchangeId = state.data.exchangeId;
    const ex = await getExchangeById(exchangeId);
    if (!ex) {
      await ctx.reply('Almashish yakunlangan yoki topilmadi. Asosiy menyuga qayting.', mainMenuKeyboard());
      clearState(telegramId);
      return;
    }

    const otherTelegramId = telegramId === ex.user1_id ? ex.user2_id : ex.user1_id;

    // Agar suhbatni yakunlash tugmasi bosilsa
    if (text === '🔚 Suhbatni yakunlash') {
      clearState(telegramId);
      clearState(otherTelegramId);

      // Agar almashish hali screenshot bosqichida bo'lsa, maxsus klaviaturaga qaytamiz,
      // aks holda asosiy menyuga
      const stillEx = await getExchangeById(exchangeId);
      const keyboard = stillEx && stillEx.status === 'waiting_screenshots' ? screenshotPhaseKeyboard() : mainMenuKeyboard();

      await ctx.reply('💬 Suhbat yakunlandi.', keyboard);

      try {
        await bot.telegram.sendMessage(
          otherTelegramId,
          '💬 Suhbatdoshingiz suhbatni yakunladi.',
          keyboard
        );
      } catch (e) {
        // ignore
      }

      return;
    }

    // Agar suhbat davomida screenshot yuborish tugmasi bosilsa, avval suhbatni yakunlashni so'raymiz
    if (text === '📸 Screenshot yubormoqchiman') {
      await ctx.reply('Avval suhbatni yakunlang ("🔚 Suhbatni yakunlash"), so‘ng screenshot yuborishingiz mumkin.', helpChatKeyboard());
      return;
    }

    // Oddiy xabarni sherikka uzatish
    try {
      await bot.telegram.sendMessage(
        otherTelegramId,
        `Suhbatdoshingizdan xabar:\n\n${text}`
      );
    } catch (e) {
      // ignore
    }

    return;
  }

  // Global komandalar
  if (text === '🔁 Almashishni topish') {
    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
      return;
    }

    // Foydalanuvchining slot-linklarini olamiz
    let links = [];
    try {
      links = await getUserLinks(telegramId);
    } catch (e) {
      console.error('user_links o‘qishda xato (search):', e);
    }

    // Faqat mavjud slotlar va linki borlarini hisobga olamiz (1..3)
    const availableSlots = [];
    for (let i = 1; i <= Math.min(user.slots || 1, 3); i++) {
      const slot = links.find((l) => l.slot_index === i && l.link);
      if (slot) {
        availableSlots.push({ index: i, link: slot.link });
      }
    }

    if (!availableSlots.length) {
      await ctx.reply(
        'Hali hech bir slotingiz uchun link kiritilmagan. Avval profilga kirib kamida 1-slot uchun link qo‘ying.',
        mainMenuKeyboard()
      );
      return;
    }

    const buttons = availableSlots.map((s) => [
      Markup.button.callback(`${s.index}-slot: ${s.link}`, `slot_search_${s.index}`)
    ]);

    await ctx.reply(
      'Qaysi slot uchun almashish topmoqchisiz? Slotni tanlang:',
      Markup.inlineKeyboard(buttons)
    );
    return;
  }

  if (text === '👥 Do‘st taklif qilish') {
    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
      return;
    }

    const botUsername = ctx.botInfo && ctx.botInfo.username ? ctx.botInfo.username : null;
    if (!botUsername) {
      await ctx.reply('Bot username topilmadi. Iltimos, keyinroq qayta urinib ko‘ring.', mainMenuKeyboard());
      return;
    }

    const referralLink = `https://t.me/${botUsername}?start=ref_${telegramId}`;

    let msg = '👥 Do‘st taklif qilish\n\n';
    msg += 'Quyidagi referal linkingizni do‘stlaringizga yuboring. Ular shu link orqali botga kirib ro‘yxatdan o‘tsa, sizning takliflaringiz soni oshadi.Agar siz 5 tadan oshiq dost taklif qilsangiz siz uchun yangi 2 ta slot ochiladi link qoyish uchun.\n\n';
    msg += `Sizning linkingiz: ${referralLink}`;

    await ctx.reply(msg, mainMenuKeyboard());
    return;
  }

  if (text === '📚 Do‘stlar') {
    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
      return;
    }

    const friends = await getFriendsForUser(telegramId);

    if (!friends.length) {
      await ctx.reply('Hozircha do‘stlaringiz yo‘q. Almashishlarni yakunlaganingizdan so‘ng “Do‘stlar qatoriga qo‘shish” tugmasidan foydalanishingiz mumkin.', mainMenuKeyboard());
      return;
    }

    let msg = '📚 Sizning do‘stlaringiz:\n\n';
    const buttons = [];

    friends.forEach((f, idx) => {
      const name = f.name || '-';
      const username = f.username ? '@' + f.username : '-';
      const profile = f.profile_link || '-';
      msg += `${idx + 1}. ${name} (${username})\nProfil: ${profile}\n\n`;

      buttons.push([
        Markup.button.callback(`${name || username} bilan almashish`, `friend_ex_${f.telegram_id}`),
        Markup.button.callback('🗑 O‘chirish', `friend_del_${f.telegram_id}`)
      ]);
    });

    await ctx.reply(msg, {
      ...mainMenuKeyboard(),
      ...Markup.inlineKeyboard(buttons)
    });
    return;
  }

  if (text === '👤 Profil') {
    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
      return;
    }

    let msg = '👤 Profil ma‘lumotlari:\n';
    msg += `Ism: ${user.name || '-'}\n`;
    msg += `Username: ${user.username ? '@' + user.username : '-'}\n`;
    msg += `Telefon: ${user.phone || '-'}\n`;
    msg += `Link: ${user.main_link || '-'}\n`;
    msg += `Almashgan odamlar soni: ${user.total_exchanges || 0}\n`;
    msg += `Taklif qilgan do‘stlar soni: ${user.invited_friends_count || 0}\n`;
    msg += `Slotlar: ${user.used_slots || 0}/${user.slots || 1}`;

    // Userning slot-linklarini tekshiramiz
    let links = [];
    try {
      links = await getUserLinks(telegramId);
    } catch (e) {
      console.error('user_links o‘qishda xato:', e);
    }

    const slot1 = links.find((l) => l.slot_index === 1);
    const slot2 = links.find((l) => l.slot_index === 2);
    const slot3 = links.find((l) => l.slot_index === 3);

    const buttons = [];
    // 1-slot uchun tugma: mavjud bo'lsa almashtirish, bo'lmasa qo'yish
    buttons.push([
      Markup.button.callback(
        slot1 ? '1-slot linkni almashtirish' : '1-slot uchun link qo‘yish',
        'slot1_set'
      )
    ]);

    // 2-slot uchun tugma: faqat slots >= 2 bo'lsa ma'noli
    if (user.slots >= 2) {
      buttons.push([
        Markup.button.callback(
          slot2 ? '2-slot linkni almashtirish' : '2-slot uchun link qo‘yish',
          'slot2_set'
        )
      ]);
    }

    // 3-slot uchun tugma: faqat slots >= 3 bo'lsa
    if (user.slots >= 3) {
      buttons.push([
        Markup.button.callback(
          slot3 ? '3-slot linkni almashtirish' : '3-slot uchun link qo‘yish',
          'slot3_set'
        )
      ]);
    }

    const kb = Markup.inlineKeyboard(buttons);

    await ctx.reply(msg, { ...mainMenuKeyboard(), ...kb });
    return;
  }

  if (text === '✉️ Savol va takliflar') {
    await ctx.reply('Savol va takliflaringizni shu yerga yozib qoldiring. (Admin uchun aloqa: @Cyberphantom001)');
    return;
  }

  if (text === '🧩 Web ilova') {
    await ctx.reply(
      'Web ilova ochilmoqda. Agar avtomatik ochilmasa, pastdagi tugma orqali oching.',
      Markup.inlineKeyboard([[Markup.button.webApp('🧩 Web ilova', WEBAPP_URL)]])
    );
    return;
  }

  // Screenshot yuborish niyatini bildiruvchi tugma
  if (text === '📸 Screenshot yubormoqchiman') {
    const exchangeId = activeExchanges.get(telegramId);
    if (!exchangeId) {
      await ctx.reply('Hozir faol almashish yo‘q yoki screenshot yuborish bosqichida emassiz.', mainMenuKeyboard());
      return;
    }

    const ex = await getExchangeById(exchangeId);
    if (!ex || ex.status !== 'waiting_screenshots') {
      await ctx.reply('Hozircha screenshot yuborish bosqichida emassiz.', mainMenuKeyboard());
      return;
    }

    await ctx.reply('Endi botdagi topshiriqlarni bajaring va yakunlangach, screenshotni rasm (photo) sifatida yuboring.', screenshotPhaseKeyboard());
    // State bo'yicha WAIT_SCREENSHOT allaqachon o'rnatilgan, photo handler shuni tekshiradi.
    return;
  }

  // Almashish jarayoniga oid maxsus tugmalar
  if (text === '✅ Qabul qilindi') {
    const exchangeId = activeExchanges.get(telegramId);
    if (!exchangeId) {
      await ctx.reply('Hozir faol almashish yo‘q.', mainMenuKeyboard());
      return;
    }

    const ex = await getExchangeById(exchangeId);
    if (!ex) {
      await ctx.reply('Almashish topilmadi.', mainMenuKeyboard());
      activeExchanges.delete(telegramId);
      return;
    }

    if (telegramId !== ex.user1_id && telegramId !== ex.user2_id) {
      await ctx.reply('Bu almashish sizga tegishli emas.', mainMenuKeyboard());
      return;
    }

    // Qaysi tomon sherikning screenshotini tasdiqlayotgani
    const side = telegramId === ex.user1_id ? '2' : '1';
    const field = side === '1' ? 'user2_approved' : 'user1_approved';
    await updateExchange(exchangeId, { [field]: 1 });
    await ctx.reply('Screenshot qabul qilindi deb belgilandi.', screenshotPhaseKeyboard());

    const otherTelegramId = telegramId === ex.user1_id ? ex.user2_id : ex.user1_id;
    try {
      await bot.telegram.sendMessage(otherTelegramId, 'Siz yuborgan start qabul qilindi ✅');
    } catch (e) {
      // ignore
    }

    const updated = await getExchangeById(exchangeId);
    if (updated.user1_approved && updated.user2_approved) {
      await updateExchange(exchangeId, { status: 'completed' });

      // total_exchanges ++ for both users
      db.run('UPDATE users SET total_exchanges = total_exchanges + 1 WHERE telegram_id IN (?, ?)', [
        updated.user1_id,
        updated.user2_id
      ]);

      const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🤝 Do‘stlar qatoriga qo‘shish', `add_friend_${exchangeId}`)]
      ]);

      try {
        await bot.telegram.sendMessage(
          updated.user1_id,
          'Almashish muvaffaqiyatli yakunlandi! Endi xohlasangiz, bir-biringizni do‘stlar qatoriga qo‘shishingiz mumkin.',
          kb
        );
        await bot.telegram.sendMessage(
          updated.user2_id,
          'Almashish muvaffaqiyatli yakunlandi! Endi xohlasangiz, bir-biringizni do‘stlar qatoriga qo‘shishingiz mumkin.',
          kb
        );

        await bot.telegram.sendMessage(updated.user1_id, 'Asosiy menyu:', mainMenuKeyboard());
        await bot.telegram.sendMessage(updated.user2_id, 'Asosiy menyu:', mainMenuKeyboard());
      } catch (e) {
        // ignore
      }

      activeExchanges.delete(updated.user1_id);
      activeExchanges.delete(updated.user2_id);
    }

    return;
  }

  if (text === '🚪 Chiqib ketish') {
    const exchangeId = activeExchanges.get(telegramId);
    if (!exchangeId) {
      await ctx.reply('Hozir faol almashish yo‘q.', mainMenuKeyboard());
      return;
    }

    const ex = await getExchangeById(exchangeId);
    if (!ex) {
      await ctx.reply('Almashish topilmadi.', mainMenuKeyboard());
      activeExchanges.delete(telegramId);
      return;
    }

    await updateExchange(exchangeId, { status: 'canceled' });

    const otherTelegramId = telegramId === ex.user1_id ? ex.user2_id : ex.user1_id;

    await ctx.reply('Siz almashish jarayonidan chiqib ketdingiz.', mainMenuKeyboard());
    clearState(telegramId);
    activeExchanges.delete(telegramId);

    try {
      await bot.telegram.sendMessage(
        otherTelegramId,
        'Siz bilan almashayotgan foydalanuvchi jarayondan chiqib ketdi. Almashish bekor qilindi.',
        mainMenuKeyboard()
      );
      clearState(otherTelegramId);
      activeExchanges.delete(otherTelegramId);
    } catch (e) {
      // ignore
    }

    return;
  }

  if (text === '⏳ Kelmadi hali') {
    const exchangeId = activeExchanges.get(telegramId);
    if (!exchangeId) {
      await ctx.reply('Hozir faol almashish yo‘q.', mainMenuKeyboard());
      return;
    }

    const ex = await getExchangeById(exchangeId);
    if (!ex) {
      await ctx.reply('Almashish topilmadi.', mainMenuKeyboard());
      activeExchanges.delete(telegramId);
      return;
    }

    const otherTelegramId = telegramId === ex.user1_id ? ex.user2_id : ex.user1_id;

    await ctx.reply('Eslatma yuborildi. Iltimos, biroz kuting.', screenshotPhaseKeyboard());

    const warningText =
      'Sizga start bosish yoki tasdiqlash bo‘yicha eslatma:\n\n' +
      'Iltimos, imkon qadar tezroq startni bosib, barcha shartlarni bajarib skrinshot yuboring. Agar 48 soat ichida jarayon yakunlanmasa, vaqtincha bloklanishingiz mumkin.';

    try {
      await bot.telegram.sendMessage(otherTelegramId, warningText, screenshotPhaseKeyboard());
    } catch (e) {
      // ignore
    }

    return;
  }

  // State-based logika
  if (state.state === 'WAIT_ACCOUNTS') {
    const exchangeId = state.data.exchangeId;
    const side = state.data.side; // 'user1' yoki 'user2'
    const count = parseInt(text.trim(), 10);

    if (Number.isNaN(count) || count <= 0) {
      await ctx.reply('Iltimos, faqat musbat butun son yuboring (masalan, 2, 3, 5).');
      return;
    }

    const field = side === 'user1' ? 'accounts_user1' : 'accounts_user2';
    await updateExchange(exchangeId, { [field]: count });

    const ex = await getExchangeById(exchangeId);

    if (ex.accounts_user1 && ex.accounts_user2) {
      const min = Math.min(ex.accounts_user1, ex.accounts_user2);

      await updateExchange(exchangeId, { status: 'waiting_screenshots' });

      const msg =
        `Rahmat! Siz kiritgan son qabul qilindi.\nBu almashish uchun eng kichik son: ${min} ta akkaunt.\n\nEndi botni aytilganidek qilib bo‘lgach, iltimos, screenshot yuboring.`;

      const otherTelegramId = side === 'user1' ? ex.user2_id : ex.user1_id;

      await ctx.reply(msg, screenshotPhaseKeyboard());
      clearState(telegramId);

      try {
        await bot.telegram.sendMessage(otherTelegramId, msg, screenshotPhaseKeyboard());
        setState(otherTelegramId, 'WAIT_SCREENSHOT', { exchangeId });
      } catch (e) {
        // ignore
      }

      setState(telegramId, 'WAIT_SCREENSHOT', { exchangeId });
      activeExchanges.set(ex.user1_id, exchangeId);
      activeExchanges.set(ex.user2_id, exchangeId);
    } else {
      await ctx.reply(
        'Rahmat! Siz akkauntlaringiz sonini kiritdingiz. Endi ikkinchi tomondan ham son kiritilishi kutilmoqda.',
        mainMenuKeyboard()
      );
      clearState(telegramId);
    }

    return;
  }

  if (state.state === 'WAIT_LINK') {
    const link = text.trim();

    if (!link.startsWith('http')) {
      await ctx.reply('Iltimos, to‘g‘ri bot/link manzilini yuboring (https:// bilan).');
      return;
    }

    await ctx.reply('Bu botni start bosganda foydalanuvchi nima qilish kerak? Qisqacha tushuntirib yozing.', Markup.removeKeyboard());

    setState(telegramId, 'WAIT_DESCRIPTION', { link });
    return;
  }

  if (state.state === 'WAIT_DESCRIPTION') {
    const { link } = state.data;
    const description = text.trim();

    await updateUserLinkAndDescription(telegramId, link, description);

    // 1-slot uchun user_links jadvalini ham yangilaymiz
    try {
      await upsertUserLink(telegramId, 1, link, description);
    } catch (e) {
      console.error('1-slot user_links yangilashda xato:', e);
    }

    await ctx.reply(
      'Linkingiz va tushuntirishingiz saqlandi. ✅\n\nEndi shu chat ostidagi "Open" tugmasini bosib Web ilovani oching va profil hamda slotlaringizni boshqarishingiz mumkin.',
      mainMenuKeyboard()
    );

    clearState(telegramId);
    return;
  }

  // 3-slot uchun yangi link kiritish
  if (state.state === 'WAIT_SLOT3_LINK') {
    const link = text.trim();

    if (!link.startsWith('http')) {
      await ctx.reply('Iltimos, to‘g‘ri bot/link manzilini yuboring (https:// bilan).');
      return;
    }

    await ctx.reply(
      '3-slot uchun ham qisqacha tushuntiring: bu bot sizga nima uchun kerak va u nima qiladi?',
      Markup.removeKeyboard()
    );

    setState(telegramId, 'WAIT_SLOT3_DESCRIPTION', { link });
    return;
  }

  if (state.state === 'WAIT_SLOT3_DESCRIPTION') {
    const { link } = state.data;
    const description = text.trim();

    try {
      await upsertUserLink(telegramId, 3, link, description);
    } catch (e) {
      console.error('3-slot user_links yangilashda xato:', e);
    }

    await ctx.reply(
      '3-slot linkingiz va tushuntirishingiz saqlandi. ✅\n\nEndi almashish jarayonida bu slottan ham foydalanish mumkin bo‘ladi.',
      mainMenuKeyboard()
    );

    clearState(telegramId);
    return;
  }

  // 2-slot uchun yangi link kiritish
  if (state.state === 'WAIT_SLOT2_LINK') {
    const link = text.trim();

    if (!link.startsWith('http')) {
      await ctx.reply('Iltimos, to‘g‘ri bot/link manzilini yuboring (https:// bilan).');
      return;
    }

    await ctx.reply(
      '2-slot uchun ham qisqacha tushuntiring: bu bot sizga nima uchun kerak va u nima qiladi?',
      Markup.removeKeyboard()
    );

    setState(telegramId, 'WAIT_SLOT2_DESCRIPTION', { link });
    return;
  }

  if (state.state === 'WAIT_SLOT2_DESCRIPTION') {
    const { link } = state.data;
    const description = text.trim();

    try {
      await upsertUserLink(telegramId, 2, link, description);
    } catch (e) {
      console.error('2-slot user_links yangilashda xato:', e);
    }

    await ctx.reply(
      '2-slot linkingiz va tushuntirishingiz saqlandi. ✅\n\nEndi almashish jarayonida bu slottan ham foydalanish mumkin bo‘ladi.',
      mainMenuKeyboard()
    );

    clearState(telegramId);
    return;
  }

  if (state.state === 'WAIT_NEW_LINK') {
    const link = text.trim();

    if (!link.startsWith('http')) {
      await ctx.reply('Iltimos, to‘g‘ri bot/link manzilini yuboring (https:// bilan).');
      return;
    }

    await ctx.reply(
      'Yangi linkingiz uchun ham qisqacha tushuntiring: bu bot sizga nima uchun kerak va u nima qiladi?',
      Markup.removeKeyboard()
    );

    setState(telegramId, 'WAIT_NEW_DESCRIPTION', { link });
    return;
  }

  if (state.state === 'WAIT_NEW_DESCRIPTION') {
    const { link } = state.data;
    const description = text.trim();

    await updateUserLinkAndDescription(telegramId, link, description);

    // 1-slot (asosiy slot) uchun link va descriptionni ham yangilaymiz
    try {
      await upsertUserLink(telegramId, 1, link, description);
    } catch (e) {
      console.error('1-slot user_links yangilashda xato (change_link):', e);
    }

    await ctx.reply(
      'Yangi linkingiz va tushuntirishingiz saqlandi. ✅\n\nEndi start almashish va boshqa funksiyalardan yangilangan link bilan foydalanishingiz mumkin.',
      mainMenuKeyboard()
    );

    clearState(telegramId);
    return;
  }

  if (state.state === 'WAIT_SCREENSHOT') {
    await ctx.reply('Iltimos, screenshotni rasm (photo) sifatida yuboring.');
    return;
  }

  // Agar hech bir holatga tushmasa
  await ctx.reply('Asosiy menyudan birini tanlang yoki /start buyrug‘ini yuboring.', mainMenuKeyboard());
})

// WebApp dan kelgan ma'lumotlar (tg.sendData) – message('web_app_data') filtri orqali
bot.on(message('web_app_data'), async (ctx) => {
  const telegramId = ctx.from && ctx.from.id;
  const webAppData = ctx.message && ctx.message.web_app_data;

  if (!webAppData || !webAppData.data) {
    return;
  }

  // TEMP DEBUG: WebApp dan ma'lumot keldi – admin ga yuboramiz
  try {
    await bot.telegram.sendMessage(ADMIN_ID, `DEBUG web_app_data from ${telegramId}: ${webAppData.data}`);
  } catch (e) {
    console.error('DEBUG web_app_data admin ga yuborishda xato:', e);
  }

  const ok = await requireSubscription(ctx);
  if (!ok) return;

  let payload = null;
  try {
    payload = JSON.parse(webAppData.data);
  } catch (e) {
    payload = null;
  }

  if (!payload || !payload.type) {
    return;
  }

  // 1) WebAppdan almashishni boshlash: qaysi slot uchun qidirish
  if (payload.type === 'start_exchange') {
    const user = await findUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
      return;
    }

    let links = [];
    try {
      links = await getUserLinks(telegramId);
    } catch (e) {
      console.error('user_links o‘qishda xato (web_app start):', e);
    }

    const availableSlots = [];
    for (let i = 1; i <= Math.min(user.slots || 1, 3); i++) {
      const slot = links.find((l) => l.slot_index === i && l.link);
      if (slot) {
        availableSlots.push({ index: i, link: slot.link });
      }
    }

    if (!availableSlots.length) {
      await ctx.reply(
        'Hali hech bir slotingiz uchun link kiritilmagan. Avval Web ilovada yoki botdagi profil bo‘limida kamida 1-slot uchun link qo‘ying.',
        mainMenuKeyboard()
      );
      return;
    }

    const buttons = availableSlots.map((s) => [
      Markup.button.callback(`${s.index}-slot: ${s.link}`, `slot_search_${s.index}`)
    ]);

    await ctx.reply(
      'Web ilovadan qaytdingiz. Qaysi slot uchun almashish topmoqchisiz? Slotni tanlang:',
      Markup.inlineKeyboard(buttons)
    );
    return;
  }

  // 2) WebApp ichidagi "Bor" / "Keyingisi" tugmalari
  if (payload.type === 'exchange_action') {
    const action = payload.action;
    const payloadCandidateId = payload.candidate_id || null;

    if (action === 'next') {
      // match_no bilan bir xil mantiq
      const user = await findUserByTelegramId(telegramId);
      if (!user || !user.main_link) {
        return;
      }

      const currentCandidateId = currentCandidates.get(telegramId);
      if (currentCandidateId) {
        const seen = seenCandidates.get(telegramId) || new Set();
        seen.add(currentCandidateId);
        seenCandidates.set(telegramId, seen);
        previousCandidates.set(telegramId, currentCandidateId);
      }

      const seen = seenCandidates.get(telegramId) || new Set();
      const exclude = Array.from(seen);
      const candidate = await getRandomCandidateForUser(telegramId, exclude);

      if (!candidate) {
        await ctx.reply(
          'Hozircha siz uchun mos almashish topilmadi. Iltimos, birozdan keyin qayta kirib ko‘ring.',
          mainMenuKeyboard()
        );
        return;
      }

      await showCandidate(ctx, user, candidate);
      return;
    }

    if (action === 'yes') {
      // match_yes bilan bir xil mantiq
      const user = await findUserByTelegramId(telegramId);
      if (!user) {
        return;
      }

      const candidateTelegramId = payloadCandidateId || currentCandidates.get(telegramId);
      if (!candidateTelegramId) {
        await ctx.reply('Hozircha tanlangan link topilmadi, qaytadan urinib ko‘ring. (candidate_id topilmadi)');
        return;
      }

      // Debug: foydalanuvchiga qaysi kandidat tanlangani haqida qisqa xabar
      try {
        await ctx.reply(`Debug: WebApp dan yes olindi. candidate_id = ${candidateTelegramId}`);
      } catch (e) {
        // ignore
      }
      const candidate = await findUserByTelegramId(candidateTelegramId);
      if (!candidate || !candidate.main_link) {
        await ctx.reply('Bu foydalanuvchi hozircha almashish uchun mos emas.');
        return;
      }

      const exchangeId = await createExchange(telegramId, candidateTelegramId);
      activeExchanges.set(telegramId, exchangeId);
      activeExchanges.set(candidateTelegramId, exchangeId);

      await ctx.reply(
        'Siz bu foydalanuvchi bilan almashish uchun so‘rov yubordingiz. Ikkinchi tomondan javob kutilyapti.',
        mainMenuKeyboard()
      );

      const uName = user.name || '-';
      const uUsername = user.username ? '@' + user.username : '-';
      const uProfile = user.profile_link || (user.username ? `https://t.me/${user.username}` : '-');

      // Tanlangan slotning linkini aniqlaymiz (agar topilmasa, main_linkga qaytamiz)
      let uLink = user.main_link || '-';
      const chosenSlot = searchSlots.get(telegramId);
      if (chosenSlot) {
        try {
          const links = await getUserLinks(telegramId);
          const slotRow = links.find((l) => l.slot_index === chosenSlot && l.link);
          if (slotRow && slotRow.link) {
            uLink = slotRow.link;
          }
        } catch (e) {
          console.error('Tanlangan slot linkini olishda xato (web_app yes):', e);
        }
      }

      const candidateText =
        `Kimdir siz bilan start almashmoqchi.

Sizning quyidagi linkingiz uchun:
${uLink}

Iltimos, pastdagi tugmalar orqali qaror bering.
Agar xohlasangiz, bot chatidagi "🧩 Web ilova" tugmasi orqali WebApp'ni ochib, almashish tafsilotlarini ko'rishingiz mumkin.

Rozimisiz?`;

      await bot.telegram.sendMessage(candidateTelegramId, candidateText);
      return;
    }
  }

  // 3) WebApp dagi takliflar kartasidan kelgan javoblar
  if (payload.type === 'offer_action') {
    const action = payload.action;
    const exchangeId = payload.exchange_id;
    const slotIndex = payload.slot_index;

    if (!exchangeId) {
      return;
    }

    const ex = await getExchangeById(exchangeId);
    if (!ex) {
      await ctx.reply('Bu almashish topilmadi. Iltimos, qayta urinib ko‘ring.');
      return;
    }

    // Faqat user2 (taklif qabul qiluvchi) bu yerga javob bera oladi
    if (ex.user2_id !== telegramId || ex.status !== 'pending_partner') {
      return;
    }

    const user2 = await findUserByTelegramId(telegramId);
    const user1 = await findUserByTelegramId(ex.user1_id);

    if (!user1 || !user2) {
      return;
    }

    if (action === 'reject') {
      await updateExchange(exchangeId, { status: 'rejected' });

      try {
        await bot.telegram.sendMessage(
          ex.user1_id,
          'Siz yuborgan almashish taklifi ikkinchi foydalanuvchi tomonidan rad etildi.'
        );
      } catch (e) {
        // ignore
      }

      await ctx.reply('Siz bu almashish taklifini rad etdingiz.');
      return;
    }

    if (action === 'accept') {
      // Qaysi slot bo‘yicha qabul qilinganini saqlab qo‘yish uchun accounts_user2 maydoniga yozib qo'yamiz
      const accountsUser2 = typeof slotIndex === 'number' ? slotIndex : null;

      await updateExchange(exchangeId, { status: 'pending_accounts', accounts_user2: accountsUser2 });

      const u2Name = user2.name || '-';
      const u2Username = user2.username ? '@' + user2.username : '-';

      try {
        await bot.telegram.sendMessage(
          ex.user1_id,
          `Siz yuborgan almashish taklifiga ikkinchi foydalanuvchi rozilik bildirdi.

Ism: ${u2Name}
Username: ${u2Username}

Endi almashish bo‘yicha keyingi ko‘rsatmalarga amal qiling.`
        );
      } catch (e) {
        // ignore
      }

      await ctx.reply('Siz bu almashish taklifiga rozilik bildirdingiz.');
      return;
    }
  }
});

// Referal xabari ichidagi "👤 Profilga o‘tish" tugmasi uchun callback
bot.action('open_profile', async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await findUserByTelegramId(telegramId);
  if (!user) {
    await ctx.answerCbQuery();
    await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
    return;
  }

  await ctx.answerCbQuery();

  let msg = '👤 Profil maʼlumotlari:\n\n';
  msg += `Ism: ${user.name || '-'}\n`;
  msg += `Username: ${user.username ? '@' + user.username : '-'}\n`;
  msg += `Telefon: ${user.phone || '-'}\n`;
  msg += `Link: ${user.main_link || '-'}\n`;
  msg += `Almashgan odamlar soni: ${user.total_exchanges || 0}\n`;
  msg += `Taklif qilgan do‘stlar soni: ${user.invited_friends_count || 0}\n`;
  msg += `Slotlar: ${user.used_slots || 0}/${user.slots || 1}`;

  let links = [];
  try {
    links = await getUserLinks(telegramId);
  } catch (e) {
    console.error('user_links o‘qishda xato (open_profile):', e);
  }

  const slot1 = links.find((l) => l.slot_index === 1);
  const slot2 = links.find((l) => l.slot_index === 2);

  const buttons = [];
  buttons.push([
    Markup.button.callback(
      slot1 ? '1-slot linkni almashtirish' : '1-slot uchun link qo‘yish',
      'slot1_set'
    )
  ]);

  if (user.slots >= 2) {
    buttons.push([
      Markup.button.callback(
        slot2 ? '2-slot linkni almashtirish' : '2-slot uchun link qo‘yish',
        'slot2_set'
      )
    ]);
  }

  if (user.slots >= 3) {
    buttons.push([
      Markup.button.callback(
        slot3 ? '3-slot linkni almashtirish' : '3-slot uchun link qo‘yish',
        'slot3_set'
      )
    ]);
  }

  const kb = Markup.inlineKeyboard(buttons);

  await ctx.reply(msg, kb);
});

// 1-slot tugmasi change_link oqimini ishga tushiradi (asosiy linkni almashtirish)
bot.action('slot1_set', async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await findUserByTelegramId(telegramId);
  if (!user) {
    await ctx.answerCbQuery();
    await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
    return;
  }

  await ctx.answerCbQuery();
  await ctx.reply(
    '1-slot (asosiy) uchun yangi bot/link manzilingizni yuboring (https:// bilan boshlansin).',
    Markup.removeKeyboard()
  );
  setState(telegramId, 'WAIT_NEW_LINK');
});

// 2-slot tugmasi yangi slot-link oqimini ishga tushiradi
bot.action('slot2_set', async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await findUserByTelegramId(telegramId);
  if (!user) {
    await ctx.answerCbQuery();
    await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
    return;
  }

  if (user.slots < 2) {
    await ctx.answerCbQuery('2-slot hali mavjud emas.');
    return;
  }

  await ctx.answerCbQuery();
  await ctx.reply(
    '2-slot uchun yangi bot/link manzilini yuboring (https:// bilan boshlansin).',
    Markup.removeKeyboard()
  );
  setState(telegramId, 'WAIT_SLOT2_LINK');
});

// 3-slot tugmasi yangi slot-link oqimini ishga tushiradi
bot.action('slot3_set', async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await findUserByTelegramId(telegramId);
  if (!user) {
    await ctx.answerCbQuery();
    await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
    return;
  }

  if (user.slots < 3) {
    await ctx.answerCbQuery('3-slot hali mavjud emas.');
    return;
  }

  await ctx.answerCbQuery();
  await ctx.reply(
    '3-slot uchun yangi bot/link manzilini yuboring (https:// bilan boshlansin).',
    Markup.removeKeyboard()
  );
  setState(telegramId, 'WAIT_SLOT3_LINK');
});

bot.on('photo', async (ctx) => {
  const telegramId = ctx.from.id;
  const state = getState(telegramId);

  if (state.state !== 'WAIT_SCREENSHOT') {
    return;
  }

  const exchangeId = state.data.exchangeId;
  const ex = await getExchangeById(exchangeId);
  if (!ex) {
    await ctx.reply('Bu almashish topilmadi. Iltimos, qaytadan urinib ko‘ring.');
    clearState(telegramId);
    return;
  }

  const photos = ctx.message.photo;
  if (!photos || !photos.length) {
    await ctx.reply('Iltimos, screenshotni rasm sifatida yuboring.');
    return;
  }

  const fileId = photos[photos.length - 1].file_id;

  await addScreenshot(exchangeId, telegramId, fileId);

  const isUser1 = telegramId === ex.user1_id;
  const updateField = isUser1 ? { user1_screenshot_received: 1 } : { user2_screenshot_received: 1 };
  await updateExchange(exchangeId, updateField);

  const otherTelegramId = isUser1 ? ex.user2_id : ex.user1_id;

  await ctx.reply('Screenshot qabul qilindi va ikkinchi tomonga yuborildi.', screenshotPhaseKeyboard());
  clearState(telegramId);

  try {
    await bot.telegram.sendPhoto(
      otherTelegramId,
      fileId,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Qabul qilindi', `scr_ok_${exchangeId}_${isUser1 ? '1' : '2'}`),
          Markup.button.callback('⏳ Hali kelmadi', `scr_wait_${exchangeId}_${isUser1 ? '1' : '2'}`)
        ]
      ])
    );
  } catch (e) {
    // ignore
  }
});

bot.action('match_no', async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await findUserByTelegramId(telegramId);
  if (!user || !user.main_link) {
    await ctx.answerCbQuery();
    return;
  }

  const currentCandidateId = currentCandidates.get(telegramId);
  if (currentCandidateId) {
    const seen = seenCandidates.get(telegramId) || new Set();
    seen.add(currentCandidateId);
    seenCandidates.set(telegramId, seen);
    previousCandidates.set(telegramId, currentCandidateId);
  }

  const seen = seenCandidates.get(telegramId) || new Set();
  const exclude = Array.from(seen);
  const candidate = await getRandomCandidateForUser(telegramId, exclude);
  await ctx.answerCbQuery();
  if (!candidate) {
    await ctx.reply(
      'Hozircha siz uchun mos almashish topilmadi. Iltimos, birozdan keyin qayta kirib ko‘ring.',
      mainMenuKeyboard()
    );
    return;
  }

  await showCandidate(ctx, user, candidate);
});

bot.action('match_back', async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await findUserByTelegramId(telegramId);
  if (!user || !user.main_link) {
    await ctx.answerCbQuery();
    return;
  }

  const prevId = previousCandidates.get(telegramId);
  if (!prevId) {
    await ctx.answerCbQuery('Orqaga qaytish uchun oldingi link topilmadi.');
    return;
  }

  const candidate = await findUserByTelegramId(prevId);
  if (!candidate || !candidate.main_link) {
    await ctx.answerCbQuery('Oldingi link endi mavjud emas.');
    return;
  }

  await ctx.answerCbQuery();
  await showCandidate(ctx, user, candidate);
});

// Slot tanlash tugmalari: slot_search_1, slot_search_2, slot_search_3
bot.action(/slot_search_(\d+)/, async (ctx) => {
  const telegramId = ctx.from.id;
  const slotIndex = parseInt(ctx.match[1], 10);

  const user = await findUserByTelegramId(telegramId);
  if (!user) {
    await ctx.answerCbQuery();
    await ctx.reply('Avval /start buyrug‘i bilan ro‘yxatdan o‘ting.');
    return;
  }

  // Tanlangan slotni eslab qolamiz
  searchSlots.set(telegramId, slotIndex);

  // Yangi sessiya: ko‘rilgan kandidatlar ro‘yxatini tozalaymiz
  seenCandidates.set(telegramId, new Set());
  previousCandidates.delete(telegramId);

  const exclude = [];
  const candidate = await getRandomCandidateForUser(telegramId, exclude);

  await ctx.answerCbQuery();
  await showCandidate(ctx, user, candidate);
});

bot.action('match_yes', async (ctx) => {
  const telegramId = ctx.from.id;
  const user = await findUserByTelegramId(telegramId);
  if (!user) {
    await ctx.answerCbQuery();
    return;
  }

  const candidateTelegramId = currentCandidates.get(telegramId);
  if (!candidateTelegramId) {
    await ctx.answerCbQuery('Hozircha tanlangan link topilmadi, qaytadan urinib ko‘ring.');
    return;
  }
  const candidate = await findUserByTelegramId(candidateTelegramId);
  if (!candidate || !candidate.main_link) {
    await ctx.answerCbQuery('Bu foydalanuvchi hozircha almashish uchun mos emas.');
    return;
  }

  const exchangeId = await createExchange(telegramId, candidateTelegramId);
  activeExchanges.set(telegramId, exchangeId);
  activeExchanges.set(candidateTelegramId, exchangeId);

  await ctx.answerCbQuery('Taklif yuborildi.');
  await ctx.reply(
    'Siz bu foydalanuvchi bilan almashish uchun so‘rov yubordingiz. Ikkinchi tomondan javob kutilyapti.',
    mainMenuKeyboard()
  );

  const uName = user.name || '-';
  const uUsername = user.username ? '@' + user.username : '-';
  const uProfile = user.profile_link || (user.username ? `https://t.me/${user.username}` : '-');

  // Tanlangan slotning linkini aniqlaymiz (agar topilmasa, main_linkga qaytamiz)
  let uLink = user.main_link || '-';
  const chosenSlot = searchSlots.get(telegramId);
  if (chosenSlot) {
    try {
      const links = await getUserLinks(telegramId);
      const slotRow = links.find((l) => l.slot_index === chosenSlot && l.link);
      if (slotRow && slotRow.link) {
        uLink = slotRow.link;
      }
    } catch (e) {
      console.error('Tanlangan slot linkini olishda xato:', e);
    }
  }

  const candidateText =
    `Kimdir siz bilan start almashmoqchi.

Sizning quyidagi linkingiz uchun:
${uLink}

Iltimos, almashish tafsilotlarini Web ilova ichida ko'rib chiqing.
Bot chatidagi "🧩 Web ilova" tugmasi orqali WebApp'ni ochishingiz mumkin.`;

  await bot.telegram.sendMessage(candidateTelegramId, candidateText);
});

bot.action(/ex_accept_(\d+)/, async (ctx) => {
  const telegramId = ctx.from.id;
  const match = ctx.match;
  const exchangeId = parseInt(match[1], 10);
  const ex = await getExchangeById(exchangeId);
  if (!ex) {
    await ctx.answerCbQuery('Bu almashish topilmadi.');
    return;
  }

  if (telegramId !== ex.user2_id) {
    await ctx.answerCbQuery();
    return;
  }

  await updateExchange(exchangeId, { status: 'waiting_accounts' });
  await ctx.answerCbQuery('Siz almashishga rozilik bildirdingiz.');

  const msg = 'Nechta akkauntingiz bor? Iltimos, sonni (masalan, 2, 3, 5) yozib yuboring.';

  activeExchanges.set(ex.user2_id, exchangeId);
  setState(ex.user2_id, 'WAIT_ACCOUNTS', { exchangeId, side: 'user2' });
  await ctx.reply(msg, exchangeWaitingKeyboard());

  activeExchanges.set(ex.user1_id, exchangeId);
  try {
    await bot.telegram.sendMessage(ex.user1_id, msg, exchangeWaitingKeyboard());
    setState(ex.user1_id, 'WAIT_ACCOUNTS', { exchangeId, side: 'user1' });
  } catch (e) {
    // ignore
  }
});

bot.action(/scr_ok_(\d+)_(1|2)/, async (ctx) => {
  const telegramId = ctx.from.id;
  const match = ctx.match;
  const exchangeId = parseInt(match[1], 10);
  const side = match[2];

  const ex = await getExchangeById(exchangeId);
  if (!ex) {
    await ctx.answerCbQuery('Almashish topilmadi.');
    return;
  }

  if (telegramId !== ex.user1_id && telegramId !== ex.user2_id) {
    await ctx.answerCbQuery();
    return;
  }

  const field = side === '1' ? 'user2_approved' : 'user1_approved';
  await updateExchange(exchangeId, { [field]: 1 });
  await ctx.answerCbQuery('Screenshot qabul qilindi deb belgilandi.');

  const otherTelegramId = telegramId === ex.user1_id ? ex.user2_id : ex.user1_id;
  try {
    await bot.telegram.sendMessage(otherTelegramId, 'Siz yuborgan start qabul qilindi ✅');
  } catch (e) {
    // ignore
  }

  const updated = await getExchangeById(exchangeId);
  if (updated.user1_approved && updated.user2_approved) {
    await updateExchange(exchangeId, { status: 'completed' });

    // total_exchanges ++ for both users
    db.run('UPDATE users SET total_exchanges = total_exchanges + 1 WHERE telegram_id IN (?, ?)', [
      updated.user1_id,
      updated.user2_id
    ]);

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('🤝 Do‘stlar qatoriga qo‘shish', `add_friend_${exchangeId}`)]
    ]);

    try {
      await bot.telegram.sendMessage(
        updated.user1_id,
        'Almashish muvaffaqiyatli yakunlandi! Endi xohlasangiz, bir-biringizni do‘stlar qatoriga qo‘shishingiz mumkin.',
        kb
      );
      await bot.telegram.sendMessage(
        updated.user2_id,
        'Almashish muvaffaqiyatli yakunlandi! Endi xohlasangiz, bir-biringizni do‘stlar qatoriga qo‘shishingiz mumkin.',
        kb
      );

      // Asosiy menyuni alohida xabar sifatida ko'rsatamiz
      await bot.telegram.sendMessage(updated.user1_id, 'Asosiy menyu:', mainMenuKeyboard());
      await bot.telegram.sendMessage(updated.user2_id, 'Asosiy menyu:', mainMenuKeyboard());
    } catch (e) {
      // ignore
    }

    // Bu almashishni aktiv ro'yxatdan olib tashlaymiz
    activeExchanges.delete(updated.user1_id);
    activeExchanges.delete(updated.user2_id);
  }
});

bot.action(/scr_wait_(\d+)_(1|2)/, async (ctx) => {
  const telegramId = ctx.from.id;
  const match = ctx.match;
  const exchangeId = parseInt(match[1], 10);

  const ex = await getExchangeById(exchangeId);
  if (!ex) {
    await ctx.answerCbQuery('Almashish topilmadi.');
    return;
  }

  await ctx.answerCbQuery('Yaxshi, hali kutyapmiz.');

  const otherTelegramId = telegramId === ex.user1_id ? ex.user2_id : ex.user1_id;
  try {
    await bot.telegram.sendMessage(
      otherTelegramId,
      'Siz yuborgan screenshot hozircha qabul qilinmadi. Iltimos, yaxshiroq tekshiring va kerak bo‘lsa qayta yuboring.',
      Markup.inlineKeyboard([
        [Markup.button.callback('❓ Tushunmadim', `help_chat_${exchangeId}`)]
      ])
    );
  } catch (e) {
    // ignore
  }
});

bot.action(/help_chat_(\d+)/, async (ctx) => {
  const telegramId = ctx.from.id;
  const match = ctx.match;
  const exchangeId = parseInt(match[1], 10);

  const ex = await getExchangeById(exchangeId);
  if (!ex) {
    await ctx.answerCbQuery('Almashish topilmadi.');
    return;
  }

  if (telegramId !== ex.user1_id && telegramId !== ex.user2_id) {
    await ctx.answerCbQuery();
    return;
  }

  await ctx.answerCbQuery('Yordam chati ochildi.');

  // Ikkala tomonni ham HELP_CHAT holatiga qo'yamiz
  setState(ex.user1_id, 'HELP_CHAT', { exchangeId });
  setState(ex.user2_id, 'HELP_CHAT', { exchangeId });

  try {
    await bot.telegram.sendMessage(
      ex.user1_id,
      '💬 Siz almashish bo‘yicha suhbat rejimidasiz. Savollaringizni bu yerda yozishingiz mumkin. Yozganlaringiz bevosita sherigingizga boradi.\n⚠️ Diqqat: "🔚 Suhbatni yakunlash" tugmasini bosmaguningizcha, yakuniy qabul qilish jarayoni tugallanmaydi.',
      helpChatKeyboard()
    );
    await bot.telegram.sendMessage(
      ex.user2_id,
      '💬 Siz almashish bo‘yicha suhbat rejimidasiz. Savollaringizni bu yerda yozishingiz mumkin. Yozganlaringiz bevosita sherigingizga boradi.\n⚠️ Diqqat: "🔚 Suhbatni yakunlash" tugmasini bosmaguningizcha, yakuniy qabul qilish jarayoni tugallanmaydi.',
      helpChatKeyboard()
    );
  } catch (e) {
    // ignore
  }
});

bot.action(/add_friend_(\d+)/, async (ctx) => {
  const telegramId = ctx.from.id;
  const match = ctx.match;
  const exchangeId = parseInt(match[1], 10);
  const ex = await getExchangeById(exchangeId);
  if (!ex) {
    await ctx.answerCbQuery('Almashish topilmadi.');
    return;
  }

  if (telegramId !== ex.user1_id && telegramId !== ex.user2_id) {
    await ctx.answerCbQuery();
    return;
  }

  const me = telegramId;
  const other = telegramId === ex.user1_id ? ex.user2_id : ex.user1_id;

  db.get(
    'SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?',
    [me, other],
    (err, row) => {
      if (err) {
        console.error('Do‘stlikni tekshirishda xato:', err);
        ctx.answerCbQuery('Xatolik yuz berdi, keyinroq urinib ko‘ring.');
        return;
      }

      if (row) {
        ctx.answerCbQuery('Siz allaqachon do‘stsizlar.');
        return;
      }

      db.run(
        'INSERT INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)',
        [me, other, Date.now()],
        (err2) => {
          if (err2) {
            console.error('Do‘stlikni qo‘shishda xato:', err2);
            ctx.answerCbQuery('Xatolik yuz berdi, keyinroq urinib ko‘ring.');
            return;
          }

          ctx.answerCbQuery('Bu foydalanuvchi do‘stlaringiz qatoriga qo‘shildi (siz tomonda).');
        }
      );
    }
  );
});

bot.action(/friend_del_(\d+)/, async (ctx) => {
  const telegramId = ctx.from.id;
  const match = ctx.match;
  const friendTelegramId = parseInt(match[1], 10);

  db.run(
    'DELETE FROM friendships WHERE user_id = ? AND friend_id = ?',
    [telegramId, friendTelegramId],
    (err) => {
      if (err) {
        console.error('Do‘stni o‘chirishda xato:', err);
        ctx.answerCbQuery('Xatolik yuz berdi, keyinroq urinib ko‘ring.');
        return;
      }

      ctx.answerCbQuery('Do‘stlar ro‘yxatidan o‘chirildi.');
    }
  );
});

bot.action(/friend_ex_(\d+)/, async (ctx) => {
  const telegramId = ctx.from.id;
  const match = ctx.match;
  const friendTelegramId = parseInt(match[1], 10);

  if (telegramId === friendTelegramId) {
    await ctx.answerCbQuery();
    return;
  }

  const user = await findUserByTelegramId(telegramId);
  const friend = await findUserByTelegramId(friendTelegramId);

  if (!user || !friend || !user.main_link || !friend.main_link) {
    await ctx.answerCbQuery('Bu do‘st bilan hozircha almashish mumkin emas.');
    return;
  }

  const exchangeId = await createExchange(telegramId, friendTelegramId);
  activeExchanges.set(telegramId, exchangeId);
  activeExchanges.set(friendTelegramId, exchangeId);

  await ctx.answerCbQuery('Do‘st bilan almashish boshlandi.');

  const msg = 'Siz tanlagan do‘st bilan start almashish boshlandi. Ikkalangiz ham almashishga rozimisiz? Nechta akkauntingiz borligini keyingi bosqichda kiritasiz.';
  await ctx.reply(msg, mainMenuKeyboard());

  const friendText = `Sizning do‘stinggiz ${user.name || '@' + (user.username || telegramId)} siz bilan start almashmoqchi. Rozimisiz?`;

  await bot.telegram.sendMessage(
    friendTelegramId,
    friendText,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Ha', `ex_accept_${exchangeId}`),
        Markup.button.callback('❌ Yo‘q', `ex_reject_${exchangeId}`)
      ]
    ])
  );
});

bot.action(/ex_reject_(\d+)/, async (ctx) => {
  const telegramId = ctx.from.id;
  const match = ctx.match;
  const exchangeId = parseInt(match[1], 10);
  const ex = await getExchangeById(exchangeId);
  if (!ex) {
    await ctx.answerCbQuery('Bu almashish topilmadi.');
    return;
  }

  if (telegramId !== ex.user2_id) {
    await ctx.answerCbQuery();
    return;
  }

  await updateExchange(exchangeId, { status: 'rejected' });
  await ctx.answerCbQuery('Siz bu almashuvni rad etdingiz.');

  try {
    await bot.telegram.sendMessage(
      ex.user1_id,
      'Afsuski, siz taklif qilgan almashish so‘rovi ikkinchi foydalanuvchi tomonidan rad etildi.',
      mainMenuKeyboard()
    );
  } catch (e) {
    // ignore
  }
});

bot.launch()
  .then(() => {
    console.log('Bot ishga tushdi');
  })
  .catch((err) => {
    console.error('Botni ishga tushirishda xato (getMe yoki tarmoq):', err);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
