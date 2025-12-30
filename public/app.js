// Start Almashish Telegram WebApp logikasi
(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  if (tg) {
    tg.expand();
    tg.ready();
  }

  const profileDiv = document.getElementById('profile-content');
  const slotsDiv = document.getElementById('slots-content');
  const friendsDiv = document.getElementById('friends-content');
  const quickStatsDiv = document.getElementById('quick-stats-content');

  const navbar = document.querySelector('.bottom-nav');

  // Bosh sahifadagi tugmalar va nav elementlari
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');
  const btnStartExchange = document.getElementById('btn-start-exchange');
  const btnShareRef = document.getElementById('btn-share-ref');
  const homeTiles = document.querySelectorAll('.home-tile');
  const homeUsername = document.getElementById('home-username');
  const homeSlotsShort = document.getElementById('home-slots-short');
  const tileSlotsInfo = document.getElementById('tile-slots-info');
  const tileFriendsInfo = document.getElementById('tile-friends-info');
  const tileRefInfo = document.getElementById('tile-ref-info');
  const tileStatsInfo = document.getElementById('tile-stats-info');

  // Splash va tutorial elementlari
  const tutorialOverlay = document.getElementById('tutorial-overlay');
  const tutorialHighlight = document.getElementById('tutorial-highlight');
  const tutorialTooltip = document.getElementById('tutorial-tooltip');
  const tutorialText = document.getElementById('tutorial-text');
  const tutorialNext = document.getElementById('tutorial-next');
  const tutorialSkip = document.getElementById('tutorial-skip');

  let currentTelegramId = null;
  let tutorialStep = 0;

  // --- Qor yog'ishi animatsiyasi (faqat qish oylarida) ---
  function initSnowIfSeason() {
    const month = new Date().getMonth(); // 0 = yanvar, 11 = dekabr
    if (!(month === 11 || month === 0)) return;

    const canvas = document.getElementById('snow');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    let w;
    let h;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    resize();
    window.addEventListener('resize', resize);

    const snowflakes = [];
    const COUNT = 80;

    for (let i = 0; i < COUNT; i++) {
      snowflakes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2 + 1,
        d: Math.random() * 1 + 0.5
      });
    }

    function drawSnow() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      for (const f of snowflakes) {
        ctx.moveTo(f.x, f.y);
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx.fill();
      moveSnow();
    }

    function moveSnow() {
      for (const f of snowflakes) {
        f.y += f.d;
        f.x += Math.sin(f.y * 0.01) * 0.5;

        if (f.y > h) {
          f.y = -5;
          f.x = Math.random() * w;
        }
      }
    }

    function animateSnow() {
      drawSnow();
      window.requestAnimationFrame(animateSnow);
    }

    animateSnow();
  }

  function switchView(targetId) {
    views.forEach((v) => {
      v.classList.toggle('view-active', v.id === targetId);
    });

    navItems.forEach((b) => {
      const t = b.getAttribute('data-target');
      if (t === targetId) {
        b.classList.add('nav-item-active');
      } else {
        b.classList.remove('nav-item-active');
      }
    });
  }
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      switchView(target);
    });
  });

  // Bosh sahifadagi mozayka tile'lari bo'limlarga o'tkazadi
  if (homeTiles && homeTiles.length) {
    homeTiles.forEach((tile) => {
      tile.addEventListener('click', () => {
        const target = tile.getAttribute('data-target');
        if (target) {
          switchView(target);
        }
      });
    });
  }

  // --- Profil va statistikani backend + Telegram WebApp dan olish ---
  async function loadFromBackend() {
    if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
      profileDiv.textContent =
        'Profilni to‘liq ko‘rish uchun ilovani Telegram ichidagi "🧩 Web ilova" tugmasi orqali oching.';
      return;
    }

    const u = tg.initDataUnsafe.user;
    const telegramId = u.id;
    currentTelegramId = telegramId;

    try {
      const [meRes, slotsRes, friendsRes] = await Promise.all([
        fetch(`/api/me?telegram_id=${telegramId}`),
        fetch(`/api/slots?telegram_id=${telegramId}`),
        fetch(`/api/friends?telegram_id=${telegramId}`)
      ]);

      // Ro'yxatdan o'tmagan foydalanuvchi
      if (meRes.status === 404) {
        profileDiv.textContent =
          "Avval botda ro'yxatdan o'ting. Telegram bot chatida /start buyrug'ini bosing, so'ng 1-slot uchun asosiy bot/link va tavsifni kiriting.";
        quickStatsDiv.innerHTML = '';
        friendsDiv.innerHTML =
          "Ro'yxatdan o'tganingizdan so'ng bu yerda do'stlaringiz va referallar statistikasi ko'rinadi.";
        if (navbar) {
          navbar.style.display = 'none';
        }
        if (tg && tg.showPopup) {
          tg.showPopup({
            title: "Ro'yxatdan o'tish kerak",
            message:
              "Web ilovadan foydalanishdan oldin botda /start buyrug'ini bering va 1-slot uchun asosiy linkni kiriting. Shundan keyin bu yerda slotlar, almashish va statistika ochiladi.",
            buttons: [{ id: 'ok', type: 'close', text: 'Tushunarli' }]
          });
        }
        return;
      }

      if (!meRes.ok) {
        throw new Error('me failed');
      }

      const meData = await meRes.json();

      const slotsData = slotsRes.ok ? await slotsRes.json() : null;
      const friendsData = friendsRes.ok ? await friendsRes.json() : { friends: [] };

      const links = slotsData && Array.isArray(slotsData.links) ? slotsData.links : [];
      const activeSlots = links.filter((l) => l.link).length;
      const totalSlots = (slotsData && slotsData.slots) || meData.user.slots || 1;

      // Asosiy bo'limlarni chizish
      renderProfile(meData.user, u, { activeSlots, totalSlots });
      renderSlots(slotsData || null);
      renderFriends(friendsData.friends || []);

      // Bosh sahifadagi mini profil va tile matnlarini to'ldirish
      if (homeUsername) {
        homeUsername.textContent = meData.user.username
          ? '@' + meData.user.username
          : u.username
          ? '@' + u.username
          : 'Foydalanuvchi';
      }
      if (homeSlotsShort) {
        homeSlotsShort.textContent = `Slotlar: ${activeSlots}/${totalSlots}`;
      }
      if (tileSlotsInfo) {
        tileSlotsInfo.textContent = `${activeSlots} / ${totalSlots} ochiq`;
      }
      if (tileFriendsInfo) {
        const friendsCount = (friendsData.friends && friendsData.friends.length) || 0;
        tileFriendsInfo.textContent = `${friendsCount} ta`;
      }
      if (tileRefInfo) {
        const invited = meData.user.invited_friends_count || 0;
        tileRefInfo.textContent = `${invited} / 5`;
      }
      if (tileStatsInfo) {
        const totalEx = meData.user.total_exchanges || 0;
        tileStatsInfo.textContent = `${totalEx} almashish`;
      }

      // --- Boshlang'ich qaysi view ochilishi ---
      const hasSlot1Link =
        slotsData &&
        Array.isArray(slotsData.links) &&
        slotsData.links.some((l) => l.slot_index === 1 && l.link);

      if (!hasSlot1Link) {
        // 1-slot uchun link yo'q – navbarni yopib, foydalanuvchidan link kiritishni so'raymiz
        if (navbar) {
          navbar.style.display = 'none';
        }
        if (tg) {
          tg.showPopup({
            title: '1-slot uchun link kerak',
            message:
              'Avval 1-slot uchun asosiy bot/link manzilini va qisqacha tavsifni kiriting. Bu link almashish paytida boshqa foydalanuvchilarga sizning asosiy botingiz sifatida ko‘rsatiladi.',
            buttons: [{ id: 'ok', type: 'close', text: 'Tushunarli' }]
          });
        }
        switchView('view-profile');
      } else {
        // 1-slot allaqachon bor – navbar ochiq bo'ladi va asosiy bosh sahifa ko'rsatiladi
        if (navbar) {
          navbar.style.display = 'flex';
        }
        switchView('view-home');

        // Tutorial faqat birinchi marta va 1-slot tayyor bo'lganda ko'rsatiladi
        const tutorialDone = window.localStorage.getItem('tutorial_done');
        if (tutorialDone !== '1') {
          setTimeout(() => {
            startTutorial();
          }, 400);
        }
      }
    } catch (e) {
      console.error('Backend yuklashda xato:', e);
      // Foydalanuvchiga eng kamida Telegram profili ko‘rinib tursin
      renderProfile(null, tg.initDataUnsafe.user);
      renderSlots();
      renderFriends([]);
      if (navbar) {
        navbar.style.display = 'flex';
      }
      switchView('view-home');
    }
  }

  function renderProfile(userFromDb, tgUser, slotStats) {
    profileDiv.textContent = '';

    const fullNameFromTg = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim();
    const name = (userFromDb && userFromDb.name) || fullNameFromTg || '-';
    const username = tgUser.username ? '@' + tgUser.username : userFromDb?.username || '-';

    const phone = userFromDb?.phone || '-';
    const mainLink = userFromDb?.main_link || '-';
    const invited = userFromDb?.invited_friends_count || 0;
    const totalEx = userFromDb?.total_exchanges || 0;

    const active = slotStats && typeof slotStats.activeSlots === 'number'
      ? slotStats.activeSlots
      : userFromDb?.used_slots || 0;
    const total = slotStats && typeof slotStats.totalSlots === 'number'
      ? slotStats.totalSlots
      : userFromDb?.slots || 1;

    profileDiv.innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar">
          ${tgUser.photo_url ? `<img src="${tgUser.photo_url}" alt="avatar" />` : (name.charAt(0).toUpperCase() || '?')}
        </div>
        <div class="profile-main">
          <div class="name">${name}</div>
          <div class="username">${username}</div>
          <div class="profile-contact">📞 ${phone}</div>
          <div class="profile-contact">🔗 ${mainLink}</div>
        </div>
      </div>
      <div class="profile-stats-row">
        <div><span class="label">Almashishlar:</span> <span class="value">${totalEx}</span></div>
        <div><span class="label">Do‘stlar:</span> <span class="value">${invited}</span></div>
        <div><span class="label">Slotlar:</span> <span class="value">${active}/${total}</span></div>
      </div>
      <div class="profile-actions">
        <button id="btn-home" class="secondary-btn profile-btn">Bosh sahifa</button>
        <button id="btn-help" class="primary-btn profile-btn">Savol va tavsiyalar</button>
      </div>
    `;

    // Qisqa statistika (mini dashboard)
    quickStatsDiv.innerHTML = `
      <div class="stats-grid">
        <div class="stats-item">
          <div class="stats-label">Bugungi almashishlar</div>
          <div class="stats-value">0</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">Umumiy almashishlar</div>
          <div class="stats-value">${totalEx}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">Referallar</div>
          <div class="stats-value">${invited}</div>
        </div>
        <div class="stats-item">
          <div class="stats-label">Faol slotlar</div>
          <div class="stats-value">${active}/${total}</div>
        </div>
      </div>
    `;

    const btnHome = document.getElementById('btn-home');
    if (btnHome) {
      btnHome.addEventListener('click', () => {
        switchView('view-exchange');
      });
    }

    const btnHelp = document.getElementById('btn-help');
    if (btnHelp) {
      btnHelp.addEventListener('click', () => {
        if (tg && tg.showPopup) {
          tg.showPopup({
            title: 'Savol va tavsiyalar',
            message:
              'Savol va tavsiyalar uchun alohida bo‘lim tez orada qo‘shiladi. Hozircha savollaringizni shu bot chatida yozib qoldiring.',
            buttons: [{ id: 'ok', type: 'close', text: 'Yopish' }]
          });
        }
      });
    }
  }

  function renderSlots(slotsData) {
    const totalSlots = slotsData?.slots || 1;
    const links = slotsData?.links || [];

    const slot1 = links.find((l) => l.slot_index === 1);
    const currentLink = slot1?.link || '';
    const currentDesc = slot1?.description || '';

    const lockedText2 = totalSlots >= 2 ? '' : ' (5 ta do‘stdan keyin ochiladi)';
    const lockedText3 = totalSlots >= 3 ? '' : ' (qo‘shimcha takliflardan keyin ochiladi)';

    slotsDiv.innerHTML = `
      <div class="slot-card slot-card--active">
        <div class="slot-card-header">
          <div class="slot-card-title">1-slot (asosiy)</div>
          <div class="slot-card-status">${currentLink ? '🟢 Faol' : '⚪ Kutilmoqda'}</div>
        </div>
        <div class="slot-card-link">${currentLink || 'Hali link kiritilmagan'}</div>
        <div class="slot-card-desc">${currentDesc || 'Bu bot nima qiladi? Qisqacha yozib qo‘ying.'}</div>
        <div class="slot-edit">
          <label class="slot-label">1-slot uchun yangi link:</label>
          <input id="slot1-link-input" class="slot-input" type="text" placeholder="https://t.me/yourbot?start=..." value="${currentLink || ''}" />
          <label class="slot-label">Qisqacha tavsif:</label>
          <textarea id="slot1-desc-input" class="slot-textarea" rows="2" placeholder="Bu bot nima qiladi?">${currentDesc || ''}</textarea>
          <button id="slot1-save-btn" class="primary-btn slot-save-btn">✏️ Saqlash</button>
          <p class="hint-text">Linkingiz va tavsif Web ilova va botdagi almashishlarda ishlatiladi.</p>
        </div>
      </div>
      <div class="slot-card ${totalSlots >= 2 ? '' : 'slot-card--locked'}">
        <div class="slot-card-header">
          <div class="slot-card-title">2-slot</div>
          <div class="slot-card-status">${totalSlots >= 2 ? '🟢 Ochiq' : '🔒 Qulfda'}</div>
        </div>
        <div class="slot-card-desc">
          ${totalSlots >= 2 ? 'Bu slot keyinroq Web ilovada tahrir qilinadi.' : 'Yana do‘stlar taklif qiling, 5 ta do‘stdan keyin ochiladi.'}
          ${lockedText2}
        </div>
      </div>
      <div class="slot-card ${totalSlots >= 3 ? '' : 'slot-card--locked'}">
        <div class="slot-card-header">
          <div class="slot-card-title">3-slot</div>
          <div class="slot-card-status">${totalSlots >= 3 ? '🟢 Ochiq' : '🔒 Qulfda'}</div>
        </div>
        <div class="slot-card-desc">
          ${totalSlots >= 3 ? 'Bu slot keyinroq Web ilovada tahrir qilinadi.' : 'Ko‘proq referal taklif qilganingizda ochiladi.'}
          ${lockedText3}
        </div>
      </div>
    `;

    const saveBtn = document.getElementById('slot1-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (!currentTelegramId) {
          if (tg) {
            tg.showAlert('Telegram foydalanuvchi ID topilmadi. Web ilovani qayta ochib ko‘ring.');
          }
          return;
        }

        const linkInput = document.getElementById('slot1-link-input');
        const descInput = document.getElementById('slot1-desc-input');
        const newLink = linkInput.value.trim();
        const newDesc = descInput.value.trim();

        if (!newLink || !newLink.startsWith('http')) {
          if (tg) tg.showAlert('Iltimos, to‘g‘ri link kiriting (https:// bilan).');
          return;
        }

        try {
          const resp = await fetch('/api/slots', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              telegram_id: currentTelegramId,
              slot_index: 1,
              link: newLink,
              description: newDesc
            })
          });

          if (!resp.ok) {
            const data = await resp.json().catch(() => null);
            const msg = data && data.error ? data.error : 'Saqlashda xatolik yuz berdi.';
            if (tg) tg.showAlert(msg);
            return;
          }

          if (tg) {
            tg.showPopup({
              title: 'Saqlangan',
              message:
                '1-slot linkingiz va tavsifingiz saqlandi. Endi asosiy menyudan almashish va boshqa bo‘limlardan foydalanishingiz mumkin.',
              buttons: [{ id: 'ok', type: 'close', text: 'OK' }]
            });
          }

          // Qayta yuklab, yangilangan maʼlumotni ko'rsatamiz va navbarni yoqamiz
          await loadFromBackend();
          if (navbar) {
            navbar.style.display = 'flex';
          }
          switchView('view-exchange');
        } catch (e) {
          console.error('Slot saqlashda xato:', e);
          if (tg) tg.showAlert('Server bilan aloqa o‘rnatib bo‘lmadi. Keyinroq urinib ko‘ring.');
        }
      });
    }
  }

  function renderFriends(friends) {
    if (!friends || !friends.length) {
      friendsDiv.innerHTML =
        'Hozircha do‘stlar ro‘yxati bo‘sh. Almashishlarni yakunlaganingizdan so‘ng va referallar orqali bu yer to‘lib boradi.';
      return;
    }

    const items = friends.map((f) => {
      const name = f.name || '-';
      const username = f.username ? '@' + f.username : '-';
      const profile = f.profile_link || '#';
      const initial = (name && name.charAt(0).toUpperCase()) || (username && username.charAt(1).toUpperCase()) || '?';
      return `
        <li class="friend-item">
          <div class="friend-main">
            <div class="friend-avatar">${initial}</div>
            <div>
              <div class="friend-name">${name}</div>
              <div class="friend-username">${username}</div>
            </div>
          </div>
          <div class="friend-link"><a href="${profile}" target="_blank">🔗 Profil</a></div>
        </li>
      `;
    });

    friendsDiv.innerHTML = `<ul class="friends-list">${items.join('')}</ul>`;
  }

  // --- Tugmalar uchun oddiy handlerlar ---
  if (btnStartExchange) {
    btnStartExchange.addEventListener('click', () => {
      if (tg) {
        try {
          tg.sendData(
            JSON.stringify({
              type: 'start_exchange'
            })
          );
          tg.close();
        } catch (e) {
          console.error('sendData xato:', e);
          tg.showAlert('Almashishni boshlashda xatolik. Iltimos, botdagi "🔁 Almashishni topish" tugmasidan foydalaning.');
        }
      }
    });
  }

  if (btnShareRef) {
    btnShareRef.addEventListener('click', () => {
      if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
        // Hozircha faqat tushuntirish popup, keyin backend orqali haqiqiy referal linkni olamiz
        tg.showPopup({
          title: "Do'st taklif qilish",
          message:
            "Referal linkingizni bot ichidagi '👥 Doʼst taklif qilish' menyusidan olishingiz mumkin. Bu yerda keyinchalik uni koʼrib va ulashishingiz ham mumkin boʼladi.",
          buttons: [{ id: 'ok', type: 'close', text: 'Yopish' }]
        });
      }
    });
  }

  // Boshlang'ich render
  initSnowIfSeason();
  loadFromBackend();
})();
