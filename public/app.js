// Start Almashish Telegram WebApp logikasi
(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  if (tg) {
    tg.expand();
    tg.ready();
  }

  async function startExchangePolling() {
    if (exchangePollInterval) return;
    if (!tg) return;

    exchangePollInterval = setInterval(async () => {
      if (!currentTelegramId) return;
      try {
        await Promise.all([
          loadExchangeOffers(currentTelegramId),
          loadSentExchanges(currentTelegramId)
        ]);
      } catch (e) {
        console.error('exchange polling xato:', e);
      }
    }, 10000); // har 10 soniyada yangilaymiz
  }

  async function startActiveChatPolling() {
    if (!tg || !currentTelegramId) return;
    if (activeChatPollInterval) return;

    activeChatPollInterval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/exchange/active_chat?telegram_id=${currentTelegramId}`);
        if (!resp.ok) return;
        const data = await resp.json().catch(() => null);
        if (!data || !data.active || !data.active.partner || !data.active.exchange_id) return;

        const active = data.active;

        if (active && active.partner && active.exchange_id) {
          // Topildi, pollingni to'xtatamiz va chatni ochamiz
          clearInterval(activeChatPollInterval);
          activeChatPollInterval = null;
          showExchangeChat(active.partner, active.exchange_id);
        }
      } catch (e) {
        console.error('active_chat polling xato:', e);
      }
    }, 4000); // har 4 soniyada tekshiramiz
  }

  // Yuborilgan takliflar (Men tayyorman va link) va chat linki uchun listenerlar

  function formatExchangeTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}.${mm} ${hh}:${min}`;
  }

  async function loadSentExchanges(telegramId) {
    if (!exchangeSentCard || !exchangeSentList || !exchangeSentEmpty) return;

    exchangeSentCard.style.display = 'none';
    exchangeSentList.innerHTML = '';
    exchangeSentEmpty.style.display = 'block';

    try {
      const resp = await fetch(`/api/exchange/sent?telegram_id=${telegramId}`);
      if (!resp.ok) {
        console.error('/api/exchange/sent fetch xato:', resp.status);
        return;
      }

      const data = await resp.json();
      const sent = Array.isArray(data.sent) ? data.sent : [];

      if (!sent.length) {
        exchangeSentCard.style.display = 'none';
        return;
      }

      exchangeSentCard.style.display = 'block';
      exchangeSentEmpty.style.display = 'none';

      sent.forEach((item) => {
        const u = item.to_user || {};
        const wrapper = document.createElement('div');
        wrapper.className = 'sent-offer-item';

        const name = u.name || 'Foydalanuvchi';
        const username = u.username ? `@${u.username}` : '';
        const link = u.main_link || '-';
        const timeText = formatExchangeTime(item.created_at);

        let statusText = 'Kutilmoqda';
        if (item.status === 'accepted_partner') statusText = 'Qabul qilindi';
        else if (item.status === 'rejected_partner') statusText = 'Rad etildi';

        let html = '<div class="sent-offer-header">';
        html += `<div class="sent-offer-name">${name}</div>`;
        if (username) {
          html += `<div class="sent-offer-username">${username}</div>`;
        }
        html += '</div>';

        html += '<div class="sent-offer-body">';
        html += '<div class="sent-offer-link-label">Bu foydalanuvchining linki:</div>';
        html += `<button type="button" class="sent-offer-link-btn" data-url="${link}">${link}</button>`;
        html += '</div>';

        if (timeText) {
          html += `<div class="sent-offer-meta">Vaqti: ${timeText}</div>`;
        }

        html += '<div class="sent-offer-footer">';
        html += `<div class="sent-offer-status">Holat: ${statusText}</div>`;
        if (item.status === 'accepted_partner') {
          html +=
            '<button class="primary-btn sent-ready-btn" data-exchange-id="' +
            item.exchange_id +
            '">Men tayyorman</button>';
        }
        html += '</div>';

        wrapper.innerHTML = html;
        exchangeSentList.appendChild(wrapper);
      });
    } catch (e) {
      console.error('/api/exchange/sent yuklash xato:', e);
    }
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
        const initial = name && name.trim() ? name.trim().charAt(0).toUpperCase() : 'U';

        let html = '<div class="offer-header">';
        html += '<div class="friend-avatar">' + initial + '</div>';
        html += '<div class="offer-main">';
        html += `<div class="offer-name">${name}</div>`;
        if (username) {
          html += `<div class="offer-username">${username}</div>`;
        }
        html += '</div>';
        html += '</div>';

        // Faqat bitta tanlangan slot/link ko'rsatamiz
        const selectedSlot = slots.find((s) => s && s.link);

        if (selectedSlot && selectedSlot.link) {
          html += '<ul class="offer-slots">';
          html += `
            <li>
              <div class="offer-slot-line">
                <button class="offer-slot-link-btn" type="button" data-url="${selectedSlot.link}">
                  ${selectedSlot.link}
                </button>
              </div>
              <div class="offer-slot-question">Shu link uchun sizda start bormi?</div>
              <div class="offer-slot-actions">
                <button
                  class="primary-btn offer-accept-btn"
                  data-exchange-id="${offer.exchange_id}"
                  data-slot-index="${selectedSlot.slot_index}"
                >Bor</button>
              </div>
            </li>`;
          html += '</ul>';

          html += `
            <div class="offer-global-actions">
              <button
                class="secondary-btn offer-reject-btn"
                data-exchange-id="${offer.exchange_id}"
              >Hech qaysi biriga yoq</button>
            </div>`;
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
  const exchangeSlotCard = document.getElementById('exchange-slot-card');
  const exchangeSlotList = document.getElementById('exchange-slot-list');
  const exchangeSlotCancel = document.getElementById('exchange-slot-cancel');
  const exchangeNoCandidateCard = document.getElementById('exchange-no-candidate-card');
  const exchangeNoCandidateBack = document.getElementById('exchange-no-candidate-back');
  const exchangeSentCard = document.getElementById('exchange-sent-card');
  const exchangeSentEmpty = document.getElementById('exchange-sent-empty');
  const exchangeSentList = document.getElementById('exchange-sent-list');
  const exchangeChatCard = document.getElementById('exchange-chat-card');
  const exchangeChatAvatar = document.getElementById('exchange-chat-avatar');
  const exchangeChatName = document.getElementById('exchange-chat-name');
  const exchangeChatUsername = document.getElementById('exchange-chat-username');
  const exchangeChatLink = document.getElementById('exchange-chat-link');
  const exchangeChatTimer = document.getElementById('exchange-chat-timer');
  const exchangeChatClose = document.getElementById('exchange-chat-close');
  const exchangeChatMessages = document.getElementById('exchange-chat-messages');
  const chatAccountsArea = document.getElementById('exchange-chat-accounts-area');
  const chatAccountsSelect = document.getElementById('chat-accounts-select');
  const chatAccountsSubmit = document.getElementById('chat-accounts-submit');
  const chatMessageInput = document.getElementById('chat-message-input');
  const chatMessageSend = document.getElementById('chat-message-send');
  const chatScreenshotInput = document.getElementById('chat-screenshot-input');
  const chatScreenshotButton = document.getElementById('chat-screenshot-button');
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
  let currentChatExchangeId = null;
  let chatLastMessageId = 0;
  let chatPollInterval = null;
  let chatTimerInterval = null;
  let activeChatPollInterval = null;
  let exchangePollInterval = null;
  let currentSlotsData = null;
  let currentSelectedSlotIndex = 1;
  // Hozir qaysi akkaunt uchun screenshot yuborilayotgani (1..min_accounts)
  let currentScreenshotAccountIndex = 1;

  function hideExchangeCards() {
    if (exchangeHeroCard) exchangeHeroCard.style.display = 'none';
    if (exchangeCard) exchangeCard.style.display = 'none';
    if (exchangeSlotCard) exchangeSlotCard.style.display = 'none';
    if (exchangeNoCandidateCard) exchangeNoCandidateCard.style.display = 'none';
    if (exchangeOffersCard) exchangeOffersCard.style.display = 'none';
    if (exchangeSentCard) exchangeSentCard.style.display = 'none';
  }

  function showHeroCard() {
    if (exchangeHeroCard) exchangeHeroCard.style.display = 'block';
    if (exchangeCard) exchangeCard.style.display = 'none';
    if (exchangeSlotCard) exchangeSlotCard.style.display = 'none';
    if (exchangeNoCandidateCard) exchangeNoCandidateCard.style.display = 'none';
  }

  function showExchangeChat(partner, exchangeId) {
    // Agar aktiv chatni polling qilayotgan bo'lsak, endi to'xtatamiz
    if (activeChatPollInterval) {
      clearInterval(activeChatPollInterval);
      activeChatPollInterval = null;
    }

    currentChatExchangeId = exchangeId;
    hideExchangeCards();

    const name = partner && partner.name ? partner.name : 'Sherik';

    if (exchangeChatAvatar) {
      const initial = name.trim() ? name.trim().charAt(0).toUpperCase() : 'S';
      exchangeChatAvatar.textContent = initial;
    }
    if (exchangeChatName) {
      exchangeChatName.textContent = name;
    }
    if (exchangeChatUsername) {
      exchangeChatUsername.textContent = partner && partner.username ? `@${partner.username}` : '';
    }
    if (exchangeChatLink) {
      const link = (partner && partner.main_link) || '';
      exchangeChatLink.textContent = link || 'https://t.me/yourbot';
      exchangeChatLink.dataset.url = link || '';
    }

    if (exchangeChatMessages) {
      exchangeChatMessages.innerHTML = '';

      const firstMsg = document.createElement('div');
      firstMsg.className = 'chat-message chat-message-system';
      const linkText = (partner && partner.main_link) || 'https://t.me/yourbot';
      firstMsg.innerHTML =
        `<div>Bu chat faqat kelishib olish uchun. Startlarni bot ichida olasiz.</div>
         <div style="margin-top:4px;">Sherigingizning linki: <span style="word-break:break-all;">${linkText}</span></div>
         <div style="margin-top:6px;">Quyida bu bot uchun nechta akkauntingiz borligini tanlang.</div>`;
      exchangeChatMessages.appendChild(firstMsg);
    }

    // Timer matnini tozalab qo'yamiz
    if (exchangeChatTimer) {
      exchangeChatTimer.textContent = '';
    }

    if (exchangeChatCard) {
      exchangeChatCard.style.display = 'block';
    }

    // Eski chat xabarlarini yuklaymiz
    if (currentTelegramId && currentChatExchangeId) {
      loadChatMessages(false);

      if (chatPollInterval) {
        clearInterval(chatPollInterval);
      }
      chatPollInterval = setInterval(() => {
        loadChatMessages(true);
      }, 2500);
    }
  }

  function appendSelfChatMessage(text) {
    if (!exchangeChatMessages) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const isScreenshot = trimmed.startsWith('[SCREENSHOT]');

    const msg = document.createElement('div');
    msg.className = 'chat-message chat-message-self';

    if (isScreenshot) {
      const url = trimmed.replace('[SCREENSHOT]', '').trim();
      msg.innerHTML =
        `<div>Siz screenshot yubordingiz.</div>
         <div style="margin-top:4px; word-break:break-all;"><a href="${url}" target="_blank" rel="noopener noreferrer">Rasmni ko'rish</a></div>`;
    } else {
      msg.textContent = trimmed;
    }

    exchangeChatMessages.appendChild(msg);

    if (exchangeChatMessages.scrollHeight) {
      exchangeChatMessages.scrollTop = exchangeChatMessages.scrollHeight;
    }
  }

  function appendPartnerChatMessage(baseText) {
    if (!exchangeChatMessages) return;
    const msg = document.createElement('div');
    msg.className = 'chat-message chat-message-partner';

    const text = baseText && baseText.trim() ? baseText.trim() : 'OK, kelishdik.';
    const isScreenshot = text.startsWith('[SCREENSHOT]');

    if (isScreenshot) {
      const url = text.replace('[SCREENSHOT]', '').trim();
      msg.innerHTML =
        `<div>Sherigingiz screenshot yubordi.</div>
         <div style="margin-top:4px; word-break:break-all;"><a href="${url}" target="_blank" rel="noopener noreferrer">Rasmni ko'rish</a></div>`;
      exchangeChatMessages.appendChild(msg);

      // Pinned-like savol: keldi / kelmadi
      const qa = document.createElement('div');
      qa.className = 'chat-message chat-message-system';
      qa.innerHTML =
        `<div>Bu screenshot bo'yicha start keldimi?</div>
         <div style="margin-top:6px; display:flex; gap:8px;">
           <button type="button" class="primary-btn" style="flex:1;">Keldi</button>
           <button type="button" class="secondary-btn" style="flex:1;">Kelmadi</button>
         </div>`;
      exchangeChatMessages.appendChild(qa);

      const buttons = qa.querySelectorAll('button');
      if (buttons && buttons.length === 2) {
        const yesBtn = buttons[0];
        const noBtn = buttons[1];
        yesBtn.addEventListener('click', () => {
          if (tg) tg.showAlert('"Keldi" tugmasi bosildi. (Keyin backendga bog\'laymiz)');
        });
        noBtn.addEventListener('click', () => {
          if (tg) tg.showAlert('"Kelmadi" tugmasi bosildi. (Keyin backendga bog\'laymiz)');
        });
      }
    } else {
      msg.textContent = text;
      exchangeChatMessages.appendChild(msg);
    }

    if (exchangeChatMessages.scrollHeight) {
      exchangeChatMessages.scrollTop = exchangeChatMessages.scrollHeight;
    }
  }

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

  // Pastki navbar tugmalari bo'limlarga o'tkazadi
  if (navItems && navItems.length) {
    navItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        if (target) {
          switchView(target);
        }
      });
    });
  }

  async function loadChatMessages(onlyNew) {
    if (!currentTelegramId || !currentChatExchangeId || !exchangeChatMessages) return;

    const params = new URLSearchParams();
    params.set('telegram_id', currentTelegramId);
    params.set('exchange_id', currentChatExchangeId);
    if (onlyNew && chatLastMessageId > 0) {
      params.set('after_id', chatLastMessageId);
    }

    try {
      const resp = await fetch(`/api/exchange/messages?${params.toString()}`);
      if (!resp.ok) return;
      const data = await resp.json().catch(() => null);
      if (!data || !Array.isArray(data.messages) || !data.messages.length) return;

      data.messages.forEach((m) => {
        const fromId = m.from_telegram_id;
        const text = m.text || '';
        if (!text) return;
        if (fromId === currentTelegramId) {
          appendSelfChatMessage(text);
        } else {
          appendPartnerChatMessage(text);
        }
        if (typeof m.id === 'number' && m.id > chatLastMessageId) {
          chatLastMessageId = m.id;
        }
      });
    } catch (e) {
      console.error('Chat xabarlarini yuklashda xato:', e);
    }
  }

  // Akkaunt soni bo'yicha kelishish – backend bilan
  if (chatAccountsSubmit && chatAccountsSelect && exchangeChatMessages) {
    chatAccountsSubmit.addEventListener('click', async () => {
      if (!currentTelegramId || !currentChatExchangeId) return;

      const myVal = parseInt(chatAccountsSelect.value, 10) || 1;

      try {
        const resp = await fetch('/api/exchange/accounts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            telegram_id: currentTelegramId,
            exchange_id: currentChatExchangeId,
            count: myVal
          })
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok || !data || !data.ok) {
          const msgText = (data && data.error) || 'Akkaunt sonini saqlashda xatolik yuz berdi.';
          if (tg) tg.showAlert(msgText);
          return;
        }

        const state = data.state;
        const myCount = data.my_count;
        const otherCount = data.other_count;
        const minAccounts = data.min_accounts;
        const deadlineTs = data.deadline_ts;

        const msg = document.createElement('div');
        msg.className = 'chat-message chat-message-system';

        if (state === 'waiting_other') {
          msg.innerHTML =
            `<div>Siz <b>${myCount}</b> ta akkaunt deb tanladingiz.</div>
             <div>Sherigingiz hali javob bermadi. Uning ham nechta akkaunti borligini kutyapmiz.</div>`;
        } else if (state === 'both_set') {
          msg.innerHTML =
            `<div>Siz: <b>${myCount}</b> ta akkaunt deb tanladingiz.</div>
             <div>Sherigingiz: <b>${otherCount}</b> ta akkaunt deb tanladi.</div>
             <div style="margin-top:6px;">Adolatli bo'lishi uchun eng kichik son olinadi: <b>${minAccounts}</b> tadan start qilinadi.</div>`;

          if (chatAccountsArea) {
            chatAccountsArea.style.display = 'none';
          }

          // Timer
          if (deadlineTs && exchangeChatTimer) {
            const deadline = new Date(deadlineTs);

            function updateTimer() {
              const now = new Date();
              const diffMs = deadline.getTime() - now.getTime();
              if (diffMs <= 0) {
                exchangeChatTimer.textContent =
                  'Tayyorlash uchun ajratilgan 24 soat tugadi. Barcha startlar yakunlangan bo‘lishi kerak.';
                if (chatTimerInterval) {
                  clearInterval(chatTimerInterval);
                  chatTimerInterval = null;
                }
                return;
              }

              const diffMinTotal = Math.floor(diffMs / 60000);
              const hours = Math.floor(diffMinTotal / 60);
              const mins = diffMinTotal % 60;
              exchangeChatTimer.textContent = `Qolgan vaqt: ${hours} soat ${mins} daqiqa. Ikkala tomon ham startlarni shu vaqt ichida bosishi kerak.`;
            }

            if (chatTimerInterval) {
              clearInterval(chatTimerInterval);
              chatTimerInterval = null;
            }

            updateTimer();
            chatTimerInterval = setInterval(updateTimer, 30000); // har 30 soniyada yangilaymiz
          }

          // Akkaunt soni kelishilgandan keyin har bir akkaunt uchun alohida screenshot so'rovi xabarlari
          if (exchangeChatMessages && chatScreenshotInput && typeof minAccounts === 'number' && minAccounts > 0) {
            for (let i = 1; i <= minAccounts; i += 1) {
              const prompt = document.createElement('div');
              prompt.className = 'chat-message chat-message-system';
              prompt.innerHTML =
                `<div>${i}-akkaunt uchun shu linkdan bosgan startingizni rasmga olib yuboring.</div>
                 <button type="button" class="primary-btn" style="margin-top:6px; width:100%;">${i}-akkauntdan screenshot yuklash</button>`;
              exchangeChatMessages.appendChild(prompt);

              const btn = prompt.querySelector('button');
              if (btn) {
                btn.addEventListener('click', () => {
                  currentScreenshotAccountIndex = i;
                  chatScreenshotInput.click();
                });
              }
            }

            if (exchangeChatMessages.scrollHeight) {
              exchangeChatMessages.scrollTop = exchangeChatMessages.scrollHeight;
            }
          }
        } else {
          msg.textContent = 'Akkaunt soni yangilandi.';
        }

        exchangeChatMessages.appendChild(msg);

        if (exchangeChatMessages.scrollHeight) {
          exchangeChatMessages.scrollTop = exchangeChatMessages.scrollHeight;
        }
      } catch (e) {
        console.error('/api/exchange/accounts POST xato:', e);
        if (tg) tg.showAlert('Akkaunt sonini saqlashda xatolik yuz berdi.');
      }
    });
  }

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
      const [meRes, slotsRes, friendsRes, activeChatRes] = await Promise.all([
        fetch(`/api/me?telegram_id=${telegramId}`),
        fetch(`/api/slots?telegram_id=${telegramId}`),
        fetch(`/api/friends?telegram_id=${telegramId}`),
        fetch(`/api/exchange/active_chat?telegram_id=${telegramId}`)
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
      currentSlotsData = slotsData || null;
      const friendsData = friendsRes.ok ? await friendsRes.json() : { friends: [] };
      const activeChatData = activeChatRes.ok ? await activeChatRes.json() : { active: null };

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

      // Agar oldindan chat holatidagi almashish bo'lsa, shu holatni ko'rsatamiz
      const activeChat = activeChatData && activeChatData.active ? activeChatData.active : null;
      if (activeChat && activeChat.partner) {
        // Har doim aktiv chatni avtomatik ochamiz
        showExchangeChat(activeChat.partner, activeChat.exchange_id);
      } else {
        // Sizga kelgan va yuborgan takliflarni yuklaymiz (faqat chat yo'q bo'lsa)
        await loadExchangeOffers(telegramId);
        await loadSentExchanges(telegramId);

        // Hozircha chat yo'q – keyinchalik paydo bo'lsa, avtomatik ochish uchun polling boshlaymiz
        await startActiveChatPolling();
      }

      // Takliflar ro'yxatini ham fonda yangilab turamiz
      await startExchangePolling();

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
        tileRefInfo.textContent = `${invited} ta do‘st`; 
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
    const slot2 = links.find((l) => l.slot_index === 2);
    const slot3 = links.find((l) => l.slot_index === 3);
    const currentLink = slot1?.link || '';
    const currentDesc = slot1?.description || '';

    const slot2Link = slot2?.link || '';
    const slot2Desc = slot2?.description || '';
    const slot3Link = slot3?.link || '';
    const slot3Desc = slot3?.description || '';

    const lockedText2 = totalSlots >= 2 ? '' : ' (1 ta do‘st taklif qilgandan keyin ochiladi)';
    const lockedText3 = totalSlots >= 3 ? '' : ' (2 ta do‘st taklif qilgandan keyin ochiladi)';

    let slot2Html = '';
    if (totalSlots >= 2) {
      slot2Html = `
      <div class="slot-card">
        <div class="slot-card-header">
          <div class="slot-card-title">2-slot</div>
          <div class="slot-card-status">${slot2Link ? '🟢 Faol' : '⚪ Kutilmoqda'}</div>
        </div>
        <div class="slot-card-link">${slot2Link || 'Hali link kiritilmagan'}</div>
        <div class="slot-card-desc">${slot2Desc || 'Ikkinchi slot uchun boshqa bot/linkni saqlashingiz mumkin.'}</div>
        <div class="slot-edit">
          <label class="slot-label">2-slot uchun link:</label>
          <input id="slot2-link-input" class="slot-input" type="text" placeholder="https://t.me/yourbot?start=..." value="${slot2Link || ''}" />
          <label class="slot-label">Qisqacha tavsif:</label>
          <textarea id="slot2-desc-input" class="slot-textarea" rows="2" placeholder="Bu slot nima uchun?">${slot2Desc || ''}</textarea>
          <button id="slot2-save-btn" class="primary-btn slot-save-btn">✏️ Saqlash</button>
        </div>
      </div>`;
    } else {
      slot2Html = `
      <div class="slot-card slot-card--locked">
        <div class="slot-card-header">
          <div class="slot-card-title">2-slot</div>
          <div class="slot-card-status">🔒 Qulfda</div>
        </div>
        <div class="slot-card-desc">
          Yana do‘stlar taklif qiling, keyingi slotlar ochiladi.
          ${lockedText2}
        </div>
      </div>`;
    }

    let slot3Html = '';
    if (totalSlots >= 3) {
      slot3Html = `
      <div class="slot-card">
        <div class="slot-card-header">
          <div class="slot-card-title">3-slot</div>
          <div class="slot-card-status">${slot3Link ? '🟢 Faol' : '⚪ Kutilmoqda'}</div>
        </div>
        <div class="slot-card-link">${slot3Link || 'Hali link kiritilmagan'}</div>
        <div class="slot-card-desc">${slot3Desc || 'Uchinchi slot uchun yana bir bot/link saqlashingiz mumkin.'}</div>
        <div class="slot-edit">
          <label class="slot-label">3-slot uchun link:</label>
          <input id="slot3-link-input" class="slot-input" type="text" placeholder="https://t.me/yourbot?start=..." value="${slot3Link || ''}" />
          <label class="slot-label">Qisqacha tavsif:</label>
          <textarea id="slot3-desc-input" class="slot-textarea" rows="2" placeholder="Bu slot nima uchun?">${slot3Desc || ''}</textarea>
          <button id="slot3-save-btn" class="primary-btn slot-save-btn">✏️ Saqlash</button>
        </div>
      </div>`;
    } else {
      slot3Html = `
      <div class="slot-card slot-card--locked">
        <div class="slot-card-header">
          <div class="slot-card-title">3-slot</div>
          <div class="slot-card-status">🔒 Qulfda</div>
        </div>
        <div class="slot-card-desc">
          Ko‘proq referal taklif qilganingizda ochiladi.
          ${lockedText3}
        </div>
      </div>`;
    }

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
      ${slot2Html}
      ${slot3Html}
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

    const saveBtn2 = document.getElementById('slot2-save-btn');
    if (saveBtn2) {
      saveBtn2.addEventListener('click', async () => {
        if (!currentTelegramId) {
          if (tg) {
            tg.showAlert('Telegram foydalanuvchi ID topilmadi. Web ilovani qayta ochib ko‘ring.');
          }
          return;
        }

        const linkInput = document.getElementById('slot2-link-input');
        const descInput = document.getElementById('slot2-desc-input');
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
              slot_index: 2,
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
              message: '2-slot uchun linkingiz va tavsif saqlandi.',
              buttons: [{ id: 'ok', type: 'close', text: 'OK' }]
            });
          }

          await loadFromBackend();
        } catch (e) {
          console.error('2-slot saqlashda xato:', e);
          if (tg) tg.showAlert('Server bilan aloqa o‘rnatib bo‘lmadi. Keyinroq urinib ko‘ring.');
        }
      });
    }

    const saveBtn3 = document.getElementById('slot3-save-btn');
    if (saveBtn3) {
      saveBtn3.addEventListener('click', async () => {
        if (!currentTelegramId) {
          if (tg) {
            tg.showAlert('Telegram foydalanuvchi ID topilmadi. Web ilovani qayta ochib ko‘ring.');
          }
          return;
        }

        const linkInput = document.getElementById('slot3-link-input');
        const descInput = document.getElementById('slot3-desc-input');
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
              slot_index: 3,
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
              message: '3-slot uchun linkingiz va tavsif saqlandi.',
              buttons: [{ id: 'ok', type: 'close', text: 'OK' }]
            });
          }

          await loadFromBackend();
        } catch (e) {
          console.error('3-slot saqlashda xato:', e);
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
      const username = f.username ? '@' + f.username : '';
      const initial =
        (name && name.charAt(0).toUpperCase()) || (username && username.charAt(1).toUpperCase()) || '?';

      // Hozircha onlayn/offlayn holatini backenddan olmaymiz, statik ko'rinishda ko'rsatamiz
      const statusText = 'offline';

      return `
        <li class="friend-item">
          <div class="friend-main">
            <div class="friend-avatar">${initial}</div>
            <div class="friend-info">
              <div class="friend-name">${name}</div>
              <div class="friend-status">${statusText}</div>
            </div>
          </div>
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

  function showNoCandidateCard() {
    hideExchangeCards();
    if (exchangeNoCandidateCard) {
      exchangeNoCandidateCard.style.display = 'block';
      exchangeNoCandidateCard.classList.remove('exchange-slide-out-left', 'exchange-slide-in-right');
      exchangeNoCandidateCard.classList.add('exchange-slide-in-right');
      setTimeout(() => {
        exchangeNoCandidateCard.classList.remove('exchange-slide-in-right');
      }, 230);
    }
  }

  async function startExchangeFlow() {
    if (!currentTelegramId) {
      if (tg) tg.showAlert('Telegram foydalanuvchi ID topilmadi. Web ilovani qayta ochib ko‘ring.');
      return;
    }

    try {
      const resp = await fetch(`/api/exchange/match?telegram_id=${currentTelegramId}`);
      if (!resp.ok) {
        if (tg) tg.showAlert('Kandidatni yuklashda xatolik yuz berdi. Keyinroq urinib ko‘ring.');
        return;
      }

      const data = await resp.json();
      const c = data && data.candidate ? data.candidate : null;

      if (!c) {
        showNoCandidateCard();
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

      if (exchangeHeroCard) {
        exchangeHeroCard.style.display = 'none';
      }

      if (exchangeCard) {
        exchangeCard.style.display = 'block';
        exchangeCard.classList.remove('exchange-slide-out-left', 'exchange-slide-in-right');
        exchangeCard.classList.add('exchange-slide-in-right');
        setTimeout(() => {
          exchangeCard.classList.remove('exchange-slide-in-right');
        }, 230);
      }

      fillExchangeCardFromCandidate();
    } catch (e) {
      console.error('exchange/match fetch xato:', e);
      if (tg) tg.showAlert('Server bilan aloqa o‘rnatib bo‘lmadi. Keyinroq urinib ko‘ring.');
    }
  }

  function renderExchangeSlotSelection() {
    if (!exchangeSlotCard || !exchangeSlotList) {
      startExchangeFlow();
      return;
    }

    const links = currentSlotsData && Array.isArray(currentSlotsData.links) ? currentSlotsData.links : [];
    const openSlots = links.filter((l) => l.link);

    if (!openSlots.length || openSlots.length === 1) {
      currentSelectedSlotIndex = openSlots[0]?.slot_index || 1;
      startExchangeFlow();
      return;
    }

    exchangeSlotList.innerHTML = '';

    openSlots.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'primary-btn exchange-slot-btn';
      btn.textContent = `${s.slot_index}-slot: ${s.link}`;
      btn.addEventListener('click', () => {
        currentSelectedSlotIndex = s.slot_index;
        if (exchangeSlotCard) exchangeSlotCard.style.display = 'none';
        startExchangeFlow();
      });
      exchangeSlotList.appendChild(btn);
    });

    // Agar boshqa slotlar bo'sh bo'lsa, foydalanuvchiga ularni to'ldirish haqida eslatma beramiz
    const filledIndexes = openSlots.map((s) => s.slot_index);
    const emptyIndexes = [1, 2, 3].filter((idx) => !filledIndexes.includes(idx));
    if (emptyIndexes.length) {
      const hint = document.createElement('div');
      hint.className = 'hint-text';
      hint.textContent = 'Bo‘sh slotlar uchun profil bo‘limidan link qo‘shing (slotni to‘ldiring).';
      exchangeSlotList.appendChild(hint);
    }

    if (exchangeHeroCard) exchangeHeroCard.style.display = 'none';
    if (exchangeCard) exchangeCard.style.display = 'none';
    if (exchangeNoCandidateCard) exchangeNoCandidateCard.style.display = 'none';
    exchangeSlotCard.style.display = 'block';
  }

  // --- Tugmalar uchun handlerlar ---
  if (btnStartExchange) {
    btnStartExchange.addEventListener('click', async () => {
      // Boshlashdan oldin takliflar va yuborilgan almashishlarni yangilab olamiz
      if (currentTelegramId) {
        try {
          await Promise.all([
            loadExchangeOffers(currentTelegramId),
            loadSentExchanges(currentTelegramId)
          ]);
        } catch (e) {
          console.error('Takliflarni yangilashda xato (btnStartExchange):', e);
        }
      }

      renderExchangeSlotSelection();
    });
  }

  if (exchangeSlotCancel) {
    exchangeSlotCancel.addEventListener('click', () => {
      showHeroCard();
    });
  }

  if (exchangeNoCandidateBack) {
    exchangeNoCandidateBack.addEventListener('click', () => {
      showHeroCard();
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
        if (tg) tg.showAlert('Hozircha tanlangan foydalanuvchi topilmadi, qaytadan urinib ko‘ring.');
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
            candidate_telegram_id: candidateId,
            slot_index: currentSelectedSlotIndex || 1
          })
        });

        const data = await resp.json().catch(() => null);

        if (!resp.ok || !data || !data.ok) {
          const msg = (data && data.error) || 'Almashish so‘rovini yuborishda xatolik yuz berdi.';
          if (tg) tg.showAlert(msg);
          return;
        }

        if (tg) {
          tg.showAlert('Almashish so‘rovi yuborildi. Javobni bot chatidan kuting.');
        }
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

          if (exchangeCard) {
            exchangeCard.classList.remove('exchange-slide-out-left', 'exchange-slide-in-right');
            exchangeCard.classList.add('exchange-slide-out-left');
            setTimeout(() => {
              exchangeCard.classList.remove('exchange-slide-out-left');
              fillExchangeCardFromCandidate();
              exchangeCard.classList.add('exchange-slide-in-right');
              setTimeout(() => {
                exchangeCard.classList.remove('exchange-slide-in-right');
              }, 230);
            }, 180);
          } else {
            fillExchangeCardFromCandidate();
          }
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

  // Chatni yopish – vaqtinchalik tugma
  if (exchangeChatClose) {
    exchangeChatClose.addEventListener('click', async () => {
      if (chatPollInterval) {
        clearInterval(chatPollInterval);
        chatPollInterval = null;
      }

      if (chatTimerInterval) {
        clearInterval(chatTimerInterval);
        chatTimerInterval = null;
      }

      if (activeChatPollInterval) {
        clearInterval(activeChatPollInterval);
        activeChatPollInterval = null;
      }

      // Avval backendga chat yopilgani haqida xabar beramiz
      if (currentTelegramId && currentChatExchangeId) {
        try {
          const resp = await fetch('/api/exchange/close_chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              telegram_id: currentTelegramId,
              exchange_id: currentChatExchangeId
            })
          });

          const data = await resp.json().catch(() => null);
          if (!resp.ok || !data || !data.ok) {
            const msg = (data && data.error) || 'Chatni yopishda xatolik yuz berdi.';
            if (tg) tg.showAlert(msg);
          }
        } catch (e) {
          console.error('/api/exchange/close_chat xato:', e);
        }

      }

      if (exchangeChatCard) {
        exchangeChatCard.style.display = 'none';
      }

      // Asosiy almashish kartalarini qayta ko'rsatamiz
      if (exchangeHeroCard) exchangeHeroCard.style.display = 'block';
      if (exchangeCard) exchangeCard.style.display = 'none';

      if (currentTelegramId) {
        // Takliflar va yuborilgan takliflarni yangilab olamiz
        await loadExchangeOffers(currentTelegramId);
        await loadSentExchanges(currentTelegramId);
      }
    });
  }

  // Yuborilgan takliflar: Men tayyorman va link bosish
  if (exchangeSentList) {
    exchangeSentList.addEventListener('click', (e) => {
      const target = e.target;
      if (!tg) return;

      const linkEl = target.closest('.sent-offer-link-btn');
      if (linkEl) {
        const url = linkEl.getAttribute('data-url');
        if (url) {
          if (tg && typeof tg.openTelegramLink === 'function') {
            tg.openTelegramLink(url);
          } else {
            window.open(url, '_blank');
          }
        }
        return;
      }

      const readyBtn = target.closest('.sent-ready-btn');
      if (readyBtn) {
        const exchangeId = readyBtn.getAttribute('data-exchange-id');
        if (!exchangeId || !currentTelegramId) return;

        fetch('/api/exchange/ready', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            telegram_id: currentTelegramId,
            exchange_id: exchangeId
          })
        })
          .then((resp) => resp.json().catch(() => null))
          .then((data) => {
            if (!data || !data.ok || !data.partner) {
              const msg = (data && data.error) || 'Holatni yangilashda xatolik yuz berdi.';
              tg.showAlert(msg);
              return;
            }

            tg.showAlert('Siz tayyorligingizni bildirdingiz. Chat Telegram ichida davom etadi.');

            const item = readyBtn.closest('.sent-offer-item');
            if (item && item.parentElement) {
              item.parentElement.removeChild(item);
            }

            showExchangeChat(data.partner, data.exchange_id);
          })
          .catch((err) => {
            console.error('/api/exchange/ready xato:', err);
            tg.showAlert('Server bilan aloqa o‘rnatib bo‘lmadi. Keyinroq urinib ko‘ring.');
          });
      }
    });
  }

  // Chat kartasidagi link tugmasi
  if (exchangeChatLink) {
    exchangeChatLink.addEventListener('click', () => {
      const url = exchangeChatLink.dataset.url || exchangeChatLink.textContent;
      if (!url) return;
      if (tg && typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(url);
      } else {
        window.open(url, '_blank');
      }
    });
  }

  // Takliflar kartasidagi Bor/Yo'q tugmalari
  if (exchangeOffersList) {
    exchangeOffersList.addEventListener('click', (e) => {
      const target = e.target;
      if (!tg) return;

      const acceptBtn = target.closest('.offer-accept-btn');
      const rejectBtn = target.closest('.offer-reject-btn');
      const linkBtn = target.closest('.offer-slot-link-btn');

      if (linkBtn) {
        const url = linkBtn.getAttribute('data-url');
        if (url) {
          if (tg && typeof tg.openTelegramLink === 'function') {
            tg.openTelegramLink(url);
          } else {
            window.open(url, '_blank');
          }
        }
        return;
      }

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
            if (!data || !data.ok) {
              const msg = (data && data.error) ||
                'Taklifni qabul qilishda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.';
              tg.showAlert(msg);
              return;
            }

            // Muvaffaqiyatli bo'lsa, shu taklif itemini olib tashlaymiz
            const offerItem = acceptBtn.closest('.offer-item');
            if (offerItem && offerItem.parentElement) {
              offerItem.parentElement.removeChild(offerItem);
            }

            // Agar boshqa offer qolmagan bo'lsa, kartani yashiramiz
            if (exchangeOffersList && !exchangeOffersList.querySelector('.offer-item')) {
              if (exchangeOffersCard) exchangeOffersCard.style.display = 'none';
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
            if (!data || !data.ok) {
              const msg = (data && data.error) ||
                'Taklifni rad etishda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.';
              tg.showAlert(msg);
              return;
            }

            const offerItem = rejectBtn.closest('.offer-item');
            if (offerItem && offerItem.parentElement) {
              offerItem.parentElement.removeChild(offerItem);
            }

            if (exchangeOffersList && !exchangeOffersList.querySelector('.offer-item')) {
              if (exchangeOffersCard) exchangeOffersCard.style.display = 'none';
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
      if (!tg) {
        alert('Do\'st taklif qilish uchun ilovani Telegram ichidagi "🧩 Web ilova" tugmasi orqali oching.');
        return;
      }

      if (!currentTelegramId && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
        currentTelegramId = tg.initDataUnsafe.user.id;
      }

      if (!currentTelegramId) {
        if (tg.showAlert) {
          tg.showAlert(
            'Foydalanuvchi ID topilmadi. Iltimos, Web ilovani bot ichidagi "🧩 Web ilova" tugmasi orqali qayta oching.'
          );
        }
        return;
      }

      fetch(`/api/referral_link?telegram_id=${currentTelegramId}`)
        .then((resp) => resp.json().catch(() => null).then((data) => ({ resp, data })))
        .then(({ resp, data }) => {
          if (!resp.ok || !data || !data.referral_link) {
            const msg = (data && data.error) || 'Referal linkni olishda xatolik yuz berdi.';
            if (tg && tg.showAlert) tg.showAlert(msg);
            return;
          }

          const refUrl = data.referral_link;
          const text =
            '👥 Do‘stlarni taklif qilish\n\n' +
            'Men shu botdan start almashish uchun foydalanayapman. Agar sen ham sinab ko‘rmoqchi bo‘lsang, pastdagi referal link orqali kir:\n';
          const shareUrl =
            'https://t.me/share/url?url=' +
            encodeURIComponent(refUrl) +
            '&text=' +
            encodeURIComponent(text + '\n' + refUrl);

          if (tg && typeof tg.openTelegramLink === 'function') {
            tg.openTelegramLink(shareUrl);
          } else {
            window.open(shareUrl, '_blank');
          }
        })
        .catch((e) => {
          console.error('/api/referral_link xato:', e);
          if (tg && tg.showAlert) tg.showAlert('Referal linkni olishda xatolik yuz berdi.');
        });
    });
  }

  // Boshlang'ich render
  initSnowIfSeason();
  loadFromBackend();
})();
