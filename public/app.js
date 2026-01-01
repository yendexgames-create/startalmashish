// Start Almashish Telegram WebApp logikasi
(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  if (tg) {
    tg.expand();
    tg.ready();
  }

  async function loadExchangeOffers(telegramId) {
    if (!exchangeOffersCard || !exchangeOffersList || !exchangeOffersEmpty) return;

    exchangeOffersCard.style.display = 'none';
    exchangeOffersList.innerHTML = '';
    exchangeOffersEmpty.style.display = 'block';

    try {
      const resp = await fetch(`/api/exchange/offers?telegram_id=${telegramId}`);
      if (!resp.ok) {
        console.error('exchange offers fetch xato:', resp.status);
        return;
      }

      const data = await resp.json();
      const offers = Array.isArray(data.offers) ? data.offers : [];

      if (!offers.length) {
        // Hech qanday taklif yo'q
        exchangeOffersCard.style.display = 'none';
        return;
      }

      exchangeOffersCard.style.display = 'block';
      exchangeOffersEmpty.style.display = 'none';

      offers.forEach((offer) => {
        const u = offer.from_user || {};
        const slots = Array.isArray(offer.slots) ? offer.slots : [];

        const wrapper = document.createElement('div');
        wrapper.className = 'offer-item';

        const name = u.name || 'Foydalanuvchi';
        const username = u.username ? `@${u.username}` : '';

        let html = `<div class="offer-header"><div class="offer-name">${name}</div>`;
        if (username) {
          html += `<div class="offer-username">${username}</div>`;
        }
        html += '</div>';

        if (slots.length) {
          html += '<ul class="offer-slots">';
          slots.forEach((s) => {
            if (!s.link) return;
            html += `
              <li>
                <div class="offer-slot-line">
                  <span class="offer-slot-index">${s.slot_index}-slot:</span>
                  <span class="offer-slot-link">${s.link}</span>
                </div>
                <div class="offer-slot-actions">
                  <button
                    class="primary-btn offer-accept-btn"
                    data-exchange-id="${offer.exchange_id}"
                    data-slot-index="${s.slot_index}"
                  >Bor</button>
                </div>
              </li>`;
          });
          html += '</ul>';

          if (slots.length > 1) {
            html += `
              <div class="offer-global-actions">
                <button
                  class="secondary-btn offer-reject-btn"
                  data-exchange-id="${offer.exchange_id}"
                >Hech qaysi biriga yoq</button>
              </div>`;
          } else {
            html += `
              <div class="offer-global-actions">
                <button
                  class="secondary-btn offer-reject-btn"
                  data-exchange-id="${offer.exchange_id}"
                >Yo'q</button>
              </div>`;
          }
        } else {
          html += '<p class="hint-text">Bu foydalanuvchi uchun slot linklari topilmadi.</p>';
        }

        html += '<div class="offer-status"></div>';

        wrapper.innerHTML = html;
        exchangeOffersList.appendChild(wrapper);
      });
    } catch (e) {
      console.error('exchange offers yuklash xato:', e);
    }
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

  const exchangeHeroCard = document.querySelector('#view-exchange .hero-card');

  // Almashish kartasi elementlari
  const exchangeCard = document.getElementById('exchange-card');
  const exchangeUserAvatar = document.getElementById('exchange-user-avatar');
  const exchangeUserName = document.getElementById('exchange-user-name');
  const exchangeUserUsername = document.getElementById('exchange-user-username');
  const exchangeLinkIcon = document.getElementById('exchange-link-icon');
  const exchangeLinkTitle = document.getElementById('exchange-link-title');
  const exchangeLinkUrl = document.getElementById('exchange-link-url');
  const exchangeOpenBotBtn = document.getElementById('exchange-open-bot');
  const exchangeYesBtn = document.getElementById('exchange-yes');
  const exchangeNoBtn = document.getElementById('exchange-no');
  const exchangeNextBtn = document.getElementById('exchange-next');
  const exchangeOffersCard = document.getElementById('exchange-offers-card');
  const exchangeOffersEmpty = document.getElementById('exchange-offers-empty');
  const exchangeOffersList = document.getElementById('exchange-offers-list');
  const exchangeStatus = document.getElementById('exchange-status');

  // Tutorial elementlari
  const tutorialOverlay = document.getElementById('tutorial-overlay');
  const tutorialHighlight = document.getElementById('tutorial-highlight');
  const tutorialTooltip = document.getElementById('tutorial-tooltip');
  const tutorialText = document.getElementById('tutorial-text');
  const tutorialNext = document.getElementById('tutorial-next');
  const tutorialSkip = document.getElementById('tutorial-skip');

  let currentTelegramId = null;
  let tutorialStep = 0;
  let currentExchangeCandidate = null;
  let hasExchangeCandidates = false;

  function getTutorialStorageKey() {
    const base = 'tutorial_done';
    if (currentTelegramId) {
      return `${base}_${currentTelegramId}`;
    }
    return base;
  }

  // Tutorial qadamlar ro'yxati (maksimum 6 ta)
  const tutorialSteps = [
    {
      // 1-qadam: Bosh sahifadagi "Almashish" tile
      view: 'view-home',
      selector: '.tile-exchange',
      text: 'Bu kafel orqali almashish bo\'limiga o\'tasiz va almashishni WebApp ichida boshlasiz.'
    },
    {
      // 2-qadam: Almashish bo\'limidagi asosiy tugma
      view: 'view-exchange',
      selector: '#btn-start-exchange',
      text: 'Shu tugmani bossangiz, almashish jarayoni shu Web ilova orqali ishga tushadi va bot sizga sherik beradI.'
    },
    {
      // 3-qadam: Bosh sahifadagi "Slotlar" tile
      view: 'view-home',
      selector: '.tile-slots',
      text: 'Slotlar kafeli sizni profil/slotlar bo\'limiga olib o\'tadi va qaysi bot bilan almashayotganingizni ko\'rasiz.'
    },
    {
      // 4-qadam: Profildagi slotlar kartasi
      view: 'view-profile',
      selector: '#slots-card',
      text: 'Profil bo\'limida 1-slot linkingiz va tavsifini tahrir qilasiz. Almashish aynan shu link orqali bajariladi.'
    },
    {
      // 5-qadam: Referal / Do\'st taklif qilish
      view: 'view-friends',
      selector: '#btn-share-ref',
      text: 'Do\'stlaringizni referal orqali taklif qiling, shunda qo\'shimcha slotlar ochiladi.'
    },
    {
      // 6-qadam: Bosh sahifadagi "Do\'stlar" tile
      view: 'view-home',
      selector: '.tile-friends',
      text: 'Bu kafel orqali almashgan do\'stlaringiz ro\'yxatini ko\'rasiz.'
    }
  ];

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

  function endTutorial() {
    if (tutorialOverlay) {
      tutorialOverlay.classList.add('hidden');
      tutorialOverlay.style.display = 'none';
    }
    const key = getTutorialStorageKey();
    window.localStorage.setItem(key, '1');
  }

  function showTutorialStep() {
    if (!tutorialOverlay || !tutorialHighlight || !tutorialText) return;

    if (tutorialStep >= tutorialSteps.length) {
      endTutorial();
      return;
    }

    const step = tutorialSteps[tutorialStep];

    // Kerakli viewga o'tamiz
    if (step.view) {
      switchView(step.view);
    }

    // View almashganidan keyin elementni topish uchun biroz kutamiz
    setTimeout(() => {
      const el = document.querySelector(step.selector);
      if (!el) {
        // Element topilmasa, keyingi qadamlarga o'tamiz
        tutorialStep += 1;
        showTutorialStep();
        return;
      }

      const rect = el.getBoundingClientRect();

      tutorialOverlay.style.display = 'block';
      tutorialOverlay.classList.remove('hidden');

      const padding = 8;
      tutorialHighlight.style.top = `${rect.top + window.scrollY - padding}px`;
      tutorialHighlight.style.left = `${rect.left + window.scrollX - padding}px`;
      tutorialHighlight.style.width = `${rect.width + padding * 2}px`;
      tutorialHighlight.style.height = `${rect.height + padding * 2}px`;

      tutorialText.textContent = step.text;
    }, 250);
  }

  function startTutorial() {
    if (!tutorialOverlay) return;
    const key = getTutorialStorageKey();
    const done = window.localStorage.getItem(key);
    if (done === '1') return;
    tutorialStep = 0;
    showTutorialStep();
  }

  if (tutorialNext) {
    tutorialNext.addEventListener('click', () => {
      tutorialStep += 1;
      showTutorialStep();
    });
  }

  if (tutorialSkip) {
    tutorialSkip.addEventListener('click', () => {
      endTutorial();
    });
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

      // Almashish uchun hozircha mos sherik bormi-yo'qligini backenddan so'rab olamiz
      try {
        const hasRes = await fetch(`/api/exchange/has_candidates?telegram_id=${telegramId}`);
        if (hasRes.ok) {
          const hasData = await hasRes.json();
          hasExchangeCandidates = !!hasData.has_candidates;
        } else {
          hasExchangeCandidates = false;
        }
      } catch (e) {
        console.error('has_candidates fetch xato:', e);
        hasExchangeCandidates = false;
      }

      // WebApp dagi almashish kartasi hozircha real sherikni emas, faqat umumiy interfeysni ko'rsatadi.
      currentExchangeCandidate = null;

      // Asosiy bo'limlarni chizish
      renderProfile(meData.user, u, { activeSlots, totalSlots });
      renderSlots(slotsData || null);
      renderFriends(friendsData.friends || []);

      // Sizga kelgan takliflarni yuklaymiz
      await loadExchangeOffers(telegramId);

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
        const tutorialKey = getTutorialStorageKey();
        const tutorialDone = window.localStorage.getItem(tutorialKey);
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

  // --- Almashish kartasi logikasi ---
  function sendStartExchange() {
    if (!tg || !tg.sendData) return;
    try {
      tg.sendData(
        JSON.stringify({
          type: 'start_exchange'
        })
      );
    } catch (e) {
      console.error('start_exchange sendData xato:', e);
    }
  }
  function fillExchangeCardFromCandidate() {
    if (!exchangeCard) return;

    // Agar real kandidat ma'lumoti bo'lsa, kartani shu ma'lumotlar bilan to'ldiramiz
    if (currentExchangeCandidate) {
      if (exchangeUserAvatar) {
        const name = currentExchangeCandidate.name || '';
        const initial = name.trim() ? name.trim().charAt(0).toUpperCase() : 'U';
        exchangeUserAvatar.textContent = initial;
      }
      if (exchangeUserName) {
        exchangeUserName.textContent = currentExchangeCandidate.name || 'Foydalanuvchi';
      }
      if (exchangeUserUsername) {
        exchangeUserUsername.textContent = currentExchangeCandidate.username
          ? `@${currentExchangeCandidate.username}`
          : '@username';
      }
      if (exchangeLinkUrl) {
        exchangeLinkUrl.textContent = currentExchangeCandidate.botUrl || 'https://t.me/yourbot';
      }
    }

    exchangeCard.classList.add('exchange-card--visible');
  }

  // --- Tugmalar uchun handlerlar ---
  if (btnStartExchange) {
    btnStartExchange.addEventListener('click', async () => {
      // Agar hozircha mos sherik bo'lmasa, foydalanuvchiga xabar chiqamiz
      if (!hasExchangeCandidates) {
        if (tg) {
          tg.showAlert(
            'Hozircha siz uchun mos almashish topilmadi. Iltimos, birozdan keyin qayta kirib ko‘ring.'
          );
        } else {
          alert('Hozircha siz uchun mos almashish topilmadi. Iltimos, birozdan keyin qayta kirib ko‘ring.');
        }
        return;
      }

      // Avval backenddan real kandidatni so'rab olamiz
      if (!currentTelegramId) {
        if (tg) tg.showAlert('Telegram foydalanuvchi ID topilmadi. Web ilovani qayta ochib ko‘ring.');
        return;
      }

      try {
        const resp = await fetch(`/api/exchange/match?telegram_id=${currentTelegramId}`);
        if (resp.ok) {
          const data = await resp.json();
          const c = data && data.candidate ? data.candidate : null;

          if (!c) {
            if (tg) {
              tg.showAlert(
                'Hozircha siz uchun mos almashish topilmadi. Iltimos, birozdan keyin qayta kirib ko‘ring.'
              );
            }
            return;
          }

          currentExchangeCandidate = {
            telegramId: c.telegram_id,
            name: c.name || 'Foydalanuvchi',
            username: c.username || '',
            profileLink: c.profile_link || '',
            botUrl: c.main_link || '',
            description: c.description || ''
          };
        } else {
          if (tg) tg.showAlert('Kandidatni yuklashda xatolik yuz berdi. Keyinroq urinib ko‘ring.');
          return;
        }
      } catch (e) {
        console.error('exchange/match fetch xato:', e);
        if (tg) tg.showAlert('Server bilan aloqa o‘rnatib bo‘lmadi. Keyinroq urinib ko‘ring.');
        return;
      }

      // Hero cardni yashiramiz, almashish kartasini esa real kandidat bilan ko'rsatamiz
      if (exchangeHeroCard) {
        exchangeHeroCard.style.display = 'none';
      }

      fillExchangeCardFromCandidate();
    });
  }

  async function sendExchangeAction(action) {
    const candidateId = currentExchangeCandidate && currentExchangeCandidate.telegramId
      ? currentExchangeCandidate.telegramId
      : null;

    if (action === 'yes') {
      if (!tg || !currentTelegramId) {
        if (tg) tg.showAlert('Telegram foydalanuvchi ID topilmadi. Web ilovani qayta ochib ko‘ring.');
        return;
      }

      if (!candidateId) {
        tg.showAlert('Hozircha tanlangan foydalanuvchi topilmadi, qaytadan urinib ko‘ring.');
        return;
      }

      try {
        const resp = await fetch('/api/exchange/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from_telegram_id: currentTelegramId,
            candidate_telegram_id: candidateId
          })
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok || !data || !data.ok) {
          const msg = (data && data.error) || 'Almashish so‘rovini yuborishda xatolik yuz berdi.';
          tg.showAlert(msg);
          return;
        }

        tg.showAlert('Almashish so‘rovi yuborildi. Javobni bot chatidan kuting.');
      } catch (e) {
        console.error('/api/exchange/create fetch xato:', e);
        if (tg) tg.showAlert('Server bilan aloqa o‘rnatib bo‘lmadi. Keyinroq urinib ko‘ring.');
      }

      return;
    }

    if (action === 'next') {
      if (!currentTelegramId) {
        if (tg) tg.showAlert('Telegram foydalanuvchi ID topilmadi. Web ilovani qayta ochib ko‘ring.');
        return;
      }

      try {
        const resp = await fetch(`/api/exchange/match?telegram_id=${currentTelegramId}`);
        if (resp.ok) {
          const data = await resp.json();
          const c = data && data.candidate ? data.candidate : null;

          if (!c) {
            if (tg) {
              tg.showAlert(
                'Hozircha siz uchun mos almashish topilmadi. Iltimos, birozdan keyin qayta kirib ko‘ring.'
              );
            }
            return;
          }

          currentExchangeCandidate = {
            telegramId: c.telegram_id,
            name: c.name || 'Foydalanuvchi',
            username: c.username || '',
            profileLink: c.profile_link || '',
            botUrl: c.main_link || '',
            description: c.description || ''
          };

          fillExchangeCardFromCandidate();
        } else {
          if (tg) tg.showAlert('Kandidatni yuklashda xatolik yuz berdi. Keyinroq urinib ko‘ring.');
        }
      } catch (e) {
        console.error('exchange/match fetch xato (next):', e);
        if (tg) tg.showAlert('Server bilan aloqa o‘rnatib bo‘lmadi. Keyinroq urinib ko‘ring.');
      }
    }
  }

  function openCurrentBotLink() {
    if (!currentExchangeCandidate || !currentExchangeCandidate.botUrl) {
      if (tg) tg.showAlert('Bot linki topilmadi. Avval 1-slot uchun link kiriting.');
      return;
    }

    const url = currentExchangeCandidate.botUrl;
    if (tg && typeof tg.openTelegramLink === 'function') {
      tg.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  }

  // "Bor" tugmasi – almashishga rozilik
  if (exchangeYesBtn) {
    exchangeYesBtn.addEventListener('click', () => {
      sendExchangeAction('yes');

      if (exchangeStatus) {
        exchangeStatus.textContent =
          'Taklif yuborildi. Ikkinchi foydalanuvchi rozilik yoki rad javobini berganda botda va bu yerda yangilanadi.';
        exchangeStatus.style.display = 'block';
      }
    });
  }

  // "Keyingisi" tugmasi – keyingi sherikni so'rash
  if (exchangeNextBtn) {
    exchangeNextBtn.addEventListener('click', () => {
      sendExchangeAction('next');

      if (exchangeStatus) {
        exchangeStatus.textContent = '';
        exchangeStatus.style.display = 'none';
      }
    });
  }

  // Linkning o'zi yoki "Botni ko‘rish" bosilganda – bot linkini ochish
  if (exchangeLinkUrl) {
    exchangeLinkUrl.addEventListener('click', () => {
      openCurrentBotLink();
    });
  }

  if (exchangeOpenBotBtn) {
    exchangeOpenBotBtn.addEventListener('click', () => {
      openCurrentBotLink();
    });
  }

  // Takliflar kartasidagi Bor/Yo'q tugmalari
  if (exchangeOffersList) {
    exchangeOffersList.addEventListener('click', (e) => {
      const target = e.target;
      if (!tg) return;

      const acceptBtn = target.closest('.offer-accept-btn');
      const rejectBtn = target.closest('.offer-reject-btn');

      if (acceptBtn) {
        const exchangeId = acceptBtn.getAttribute('data-exchange-id');
        const slotIndex = acceptBtn.getAttribute('data-slot-index');
        if (!exchangeId || !slotIndex || !currentTelegramId) return;

        fetch('/api/exchange/offer_action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            telegram_id: currentTelegramId,
            exchange_id: Number(exchangeId),
            action: 'accept',
            slot_index: Number(slotIndex)
          })
        })
          .then((r) => r.json().catch(() => null))
          .then((data) => {
            const offerItem = acceptBtn.closest('.offer-item');
            if (offerItem) {
              const statusEl = offerItem.querySelector('.offer-status');
              if (statusEl) {
                if (data && data.ok) {
                  statusEl.textContent =
                    'Siz bu taklifga rozilik bildirdingiz. Almashish bo‘yicha keyingi qadamlarni botdan kuzating.';
                } else {
                  statusEl.textContent =
                    (data && data.error) ||
                    'Taklifni qabul qilishda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.';
                }
              }
            }
          })
          .catch((err) => {
            console.error('offer_action accept xato:', err);
            if (tg) tg.showAlert('Taklifni qabul qilishda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.');
          });

        return;
      }

      if (rejectBtn) {
        const exchangeId = rejectBtn.getAttribute('data-exchange-id');
        if (!exchangeId || !currentTelegramId) return;

        fetch('/api/exchange/offer_action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            telegram_id: currentTelegramId,
            exchange_id: Number(exchangeId),
            action: 'reject'
          })
        })
          .then((r) => r.json().catch(() => null))
          .then((data) => {
            const offerItem = rejectBtn.closest('.offer-item');
            if (offerItem) {
              const statusEl = offerItem.querySelector('.offer-status');
              if (statusEl) {
                if (data && data.ok) {
                  statusEl.textContent = 'Siz bu almashish taklifini rad etdingiz.';
                } else {
                  statusEl.textContent =
                    (data && data.error) ||
                    'Taklifni rad etishda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.';
                }
              }
            }
          })
          .catch((err) => {
            console.error('offer_action reject xato:', err);
            if (tg) tg.showAlert('Taklifni rad etishda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.');
          });
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
