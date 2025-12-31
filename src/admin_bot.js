import { Telegraf, Markup } from 'telegraf';
import { ADMIN_BOT_TOKEN, REQUIRED_CHANNEL } from './config.js';
import { db, getSetting, setSetting, getChannels, addOrUpdateChannel } from './db.js';

// Sizning admin Telegram ID'ingiz
const ADMIN_ID = 7386008809;

if (!ADMIN_BOT_TOKEN) {
  console.warn('ADMIN_BOT_TOKEN .env faylida topilmadi, admin bot ishga tushirilmaydi');
} else {
  const adminBot = new Telegraf(ADMIN_BOT_TOKEN);
  const adminStates = new Map(); // faqat admin uchun oddiy state

  function adminMainKeyboard() {
    return Markup.keyboard([
      ['📊 Obunalar', '➕ Kanal qo‘shish'],
      ['❌ Kanalni olib tashlash'],
      ['🧹 Foydalanuvchilarni o‘chirish'],
      ['🚫 Bloklanganlar ro‘yxati']
    ]).resize();
  }

  adminBot.start((ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
      return ctx.reply('Bu bot faqat admin uchun mo‘ljallangan.');
    }

    return ctx.reply('👨‍💻 Admin panelga xush kelibsiz.', adminMainKeyboard());
  });

  // Asosiy admin text handler
  adminBot.on('text', async (ctx) => {
  const fromId = ctx.from.id;
  const text = ctx.message.text;

  // Agar xabarni o'zingiz (admin) yozsangiz, admin menyu komandalarini qayta ishlaymiz
  if (fromId === ADMIN_ID) {
    const aState = adminStates.get(fromId);

    // Avval kanal kiritish holatini tekshiramiz
    if (aState && aState.state === 'WAIT_CHANNEL') {
      let raw = text.trim();
      let link = text.trim();

      // URL bo'lsa, username ni ajratib olamiz
      if (raw.startsWith('http')) {
        try {
          const url = new URL(raw);
          const path = url.pathname.replace(/^\//, '');
          const usernamePart = path.split('/')[0];
          raw = '@' + usernamePart;
          link = `https://t.me/${usernamePart}`;
        } catch (e) {
          // agar URL noto'g'ri bo'lsa, xuddi oddiy matn sifatida ishlaymiz
        }
      }

      if (!raw.startsWith('@')) {
        raw = '@' + raw;
      }

      // Bazaga kanalni saqlaymiz: nom (@kanal) va link
      await addOrUpdateChannel(raw, link.startsWith('http') ? link : `https://t.me/${raw.replace('@', '')}`);

      // Eski dinamik sozlama sifatida ham saqlab qo'yamiz (agar kerak bo'lsa)
      await setSetting('required_channel', raw);
      adminStates.delete(fromId);

      await ctx.reply(
        `✅ Kanal saqlandi: ${raw}\n\nEndi asosiy bot aynan shu kanalga obuna bo'lishni tekshiradi.\nEslatma: shu kanalga ham asosiy botni, ham admin botni admin qilib qo'yishni unutmang.`,
        adminMainKeyboard()
      );

      return;
    }

    // ❌ Kanalni olib tashlash: channels jadvalidagi barcha kanallar ro'yxati va o'chirish tugmalari
    if (text === '❌ Kanalni olib tashlash') {
      const channels = await getChannels();

      if (!channels.length) {
        await ctx.reply('Hozircha ulangan kanallar yo‘q.', adminMainKeyboard());
        return;
      }

      let msg = '📋 Ulangan kanallar ro‘yxati (o‘chirish uchun pastdagi tugmalardan foydalaning):\n\n';
      const buttons = [];

      channels.forEach((ch, idx) => {
        const name = ch.name || '-';
        const link = ch.link || '-';
        msg += `${idx + 1}) ${name} – ${link}\n`;
        buttons.push([Markup.button.callback(`❌ O‘chirish (${name})`, `delchan_${ch.id}`)]);
      });

      await ctx.reply(msg, {
        ...adminMainKeyboard(),
        ...Markup.inlineKeyboard(buttons)
      });

      return;
    }

    // 📊 Obunalar: ulangan kanallar ro'yxati va har biri bo'yicha HOZIRDA kanalda bor userlar soni
    if (text === '📊 Obunalar') {
      const channels = await getChannels();

      db.get('SELECT COUNT(*) as cnt FROM users', async (err, row) => {
        const totalUsers = !err && row ? row.cnt : 'nomaʼlum';

        if (!channels.length) {
          await ctx.reply(
            `📊 Obuna statistikasi:\n\n` +
              `Ulangan kanallar hozircha yo‘q.\n` +
              `Botda ro‘yxatdan o‘tgan foydalanuvchilar: ${totalUsers}`,
            adminMainKeyboard()
          );
          return;
        }

        let msg = '📊 Obuna statistikasi:\n\n';
        for (let i = 0; i < channels.length; i++) {
          const ch = channels[i];
          const name = ch.name || '-';
          const link = ch.link || '-';

          // Ushbu kanal bo'yicha bot orqali o'tgan userlarni olamiz
          let joins = [];
          try {
            joins = await new Promise((resolve, reject) => {
              db.all(
                'SELECT telegram_id FROM channel_joins WHERE channel_id = ?',
                [ch.id],
                (e2, rows2) => {
                  if (e2) return reject(e2);
                  resolve(rows2 || []);
                }
              );
            });
          } catch (e2) {
            console.error('channel_joins o\'qishda xato:', e2);
            joins = [];
          }

          let liveCount = 0;
          for (const j of joins) {
            try {
              const member = await ctx.telegram.getChatMember(name || link, j.telegram_id);
              const status = member.status;
              if (['member', 'administrator', 'creator'].includes(status)) {
                liveCount++;
              }
            } catch (e3) {
              // chat not found yoki user left bo'lsa, sanamaymiz
            }
          }

          msg += `${i + 1}) ${name} – ${link} – ${liveCount} ta user\n`;
        }

        msg += `\nBotda ro‘yxatdan o‘tgan foydalanuvchilar: ${totalUsers}`;

        await ctx.reply(msg, adminMainKeyboard());
      });

      return;
    }

    if (text === '➕ Kanal qo‘shish') {
      adminStates.set(fromId, { state: 'WAIT_CHANNEL' });
      await ctx.reply(
        'Kanal username yoki linkini yuboring (masalan, @xavsiz_almash yoki https://t.me/xavsiz_almash).\nEslatma: kanalga ham asosiy botni, ham admin botni admin qilib qo‘yishni unutmang.',
        adminMainKeyboard()
      );
      return;
    }

    // 🧹 Foydalanuvchilarni o‘chirish: ro'yxatdan bitta-bitta tanlab o'chirish
    if (text === '🧹 Foydalanuvchilarni o‘chirish') {
      db.all('SELECT telegram_id, name, username FROM users ORDER BY rowid DESC LIMIT 30', async (err, rows) => {
        if (err) {
          console.error('Foydalanuvchilar ro‘yxati xatosi:', err);
          await ctx.reply('Foydalanuvchilar ro‘yxatini olishda xatolik yuz berdi.', adminMainKeyboard());
          return;
        }

        if (!rows || !rows.length) {
          await ctx.reply('Hozircha ro‘yxatdan o‘tgan foydalanuvchilar yo‘q.', adminMainKeyboard());
          return;
        }

        let msg = '🧹 Foydalanuvchilar ro‘yxati (oxirgi 30 ta):\n\n';
        const buttons = [];

        rows.forEach((u) => {
          const name = u.name || '-';
          const username = u.username ? '@' + u.username : '-';
          msg += `ID: ${u.telegram_id}\nIsm: ${name}\nUsername: ${username}\n\n`;
          buttons.push([Markup.button.callback(`❌ O‘chirish (${u.telegram_id})`, `deluser_${u.telegram_id}`)]);
        });

        await ctx.reply(msg, {
          ...adminMainKeyboard(),
          ...Markup.inlineKeyboard(buttons)
        });
      });

      return;
    }

    // 🚫 Bloklanganlar ro‘yxati
    if (text === '🚫 Bloklanganlar ro‘yxati') {
      const now = Date.now();
      db.all(
        `SELECT telegram_id, name, username, block_until, permanent_block
         FROM users
         WHERE permanent_block = 1 OR (block_until IS NOT NULL AND block_until > 0)`,
        async (err, rows) => {
          if (err) {
            console.error('Bloklanganlar ro‘yxati xatosi:', err);
            await ctx.reply('Bloklanganlar ro‘yxatini olishda xatolik yuz berdi.', adminMainKeyboard());
            return;
          }

          if (!rows || !rows.length) {
            await ctx.reply('Hozircha bloklangan foydalanuvchilar yo‘q.', adminMainKeyboard());
            return;
          }

          let msg = '🚫 Bloklangan foydalanuvchilar:\n\n';
          const buttons = [];

          rows.forEach((u) => {
            const name = u.name || '-';
            const username = u.username ? '@' + u.username : '-';
            let type = 'Vaqtinchalik';

            if (u.permanent_block) {
              type = 'Cheksiz (permanent)';
            } else if (u.block_until) {
              const remainingMs = u.block_until - now;
              if (remainingMs <= 0) {
                type = 'Blok muddati tugagan (lekin flag saqlangan)';
              } else {
                const hours = Math.round(remainingMs / (60 * 60 * 1000));
                type = `Taxminan ${hours} soatgacha`;
              }
            }

            msg += `ID: ${u.telegram_id}\nIsm: ${name}\nUsername: ${username}\nBlok turi: ${type}\n\n`;
            buttons.push([Markup.button.callback(`♻️ Blokni bekor qilish (${u.telegram_id})`, `unblock_${u.telegram_id}`)]);
          });

          await ctx.reply(msg, {
            ...adminMainKeyboard(),
            ...Markup.inlineKeyboard(buttons)
          });
        }
      );

      return;
    }

    // Nomaʼlum matnlar uchun
    await ctx.reply('Admin menyudan birini tanlang.', adminMainKeyboard());
    return;
  }

  // Admin bo'lmagan foydalanuvchilardan kelgan xabarlarni admin'ga forward qilish
  const name = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim() || '-';
  const username = ctx.from.username ? `@${ctx.from.username}` : '-';

  const msg =
    `📩 Yangi xabar:\n\n` +
    `ID: ${fromId}\n` +
    `Ism: ${name}\n` +
    `Username: ${username}\n\n` +
    `Matn:\n${text}`;

  try {
    await adminBot.telegram.sendMessage(ADMIN_ID, msg);
    await ctx.reply('Xabaringiz admin ga yuborildi.');
  } catch (e) {
    console.error('Admin xabariga yuborishda xato:', e);
    await ctx.reply('Xatolik yuz berdi, keyinroq urinib ko‘ring.');
  }
  });

  // Blokni bekor qilish uchun inline handler
  adminBot.action(/unblock_(\d+)/, async (ctx) => {
  const telegramId = parseInt(ctx.match[1], 10);

  db.run(
    'UPDATE users SET block_until = NULL, permanent_block = 0 WHERE telegram_id = ?',
    [telegramId],
    async (err) => {
      if (err) {
        console.error('Blokni bekor qilishda xato:', err);
        await ctx.answerCbQuery('Xatolik yuz berdi.');
        return;
      }

      await ctx.answerCbQuery('Blok olib tashlandi.');
      await ctx.editMessageReplyMarkup();
    }
  );
  });

  // Kanallar ro'yxatidan bitta kanalni o'chirish
  adminBot.action(/delchan_(\d+)/, async (ctx) => {
  const channelId = parseInt(ctx.match[1], 10);

  db.serialize(() => {
    db.run('DELETE FROM channel_joins WHERE channel_id = ?', [channelId]);
    db.run('DELETE FROM channels WHERE id = ?', [channelId]);
  });

  await ctx.answerCbQuery('Kanal o‘chirildi.');

  try {
    await ctx.editMessageReplyMarkup();
  } catch (e) {
    // ignore
  }
  });

  // Bitta foydalanuvchini va unga tegishli barcha ma'lumotlarni o'chirish
  adminBot.action(/deluser_(\d+)/, async (ctx) => {
  const telegramId = parseInt(ctx.match[1], 10);

  db.serialize(() => {
    // Avval ushbu foydalanuvchiga tegishli almashishlarni topamiz
    db.all(
      'SELECT id FROM exchanges WHERE user1_id = ? OR user2_id = ?',
      [telegramId, telegramId],
      (err, rows) => {
        if (err) {
          console.error('Almashishlarni olishda xato:', err);
          ctx.answerCbQuery('Xatolik yuz berdi.');
          return;
        }

        const exIds = rows.map((r) => r.id);
        const placeholders = exIds.length ? exIds.map(() => '?').join(',') : null;

        if (placeholders) {
          db.run(
            `DELETE FROM exchange_screenshots WHERE exchange_id IN (${placeholders})`,
            exIds
          );
          db.run(`DELETE FROM exchanges WHERE id IN (${placeholders})`, exIds);
        }

        db.run('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?', [telegramId, telegramId]);
        db.run('DELETE FROM referrals WHERE referrer_id = ? OR new_user_id = ?', [telegramId, telegramId]);
        db.run('DELETE FROM users WHERE telegram_id = ?', [telegramId]);
      }
    );
  });

  await ctx.answerCbQuery('Foydalanuvchi va uning tarixlari o‘chirildi.');
  try {
    await ctx.editMessageReplyMarkup();
  } catch (e) {
    // ignore
  }
  });

  adminBot.launch()
    .then(() => {
      console.log('Admin bot ishga tushdi');
    })
    .catch((err) => {
      console.error('Admin botni ishga tushirishda xato (getMe yoki tarmoq):', err);
    });

  process.once('SIGINT', () => adminBot.stop('SIGINT'));
  process.once('SIGTERM', () => adminBot.stop('SIGTERM'));

  // Global Telegraf xatolarini ushlash
  adminBot.catch((err, ctx) => {
    console.error('Admin botda xatolik yuz berdi:', err);
    try {
      ctx
        .reply('Admin botda kutilmagan xatolik yuz berdi. Iltimos, birozdan so‘ng qayta urinib ko‘ring.')
        .catch(() => {});
    } catch (e) {
      // ignore
    }
  });

  // Node jarayonidagi global xatolarni ushlash
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection (admin):', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception (admin):', err);
  });
}
