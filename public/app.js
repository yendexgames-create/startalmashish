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

  // --- Navigatsiya (pastki navbar) ---
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');

      // viewlarni almashtirish
      views.forEach((v) => {
        v.classList.toggle('view-active', v.id === target);
      });

      // aktiv nav itemni belgilash
      navItems.forEach((b) => b.classList.remove('nav-item-active'));
      btn.classList.add('nav-item-active');
    });
  });

  // --- Profil ma'lumotlarini Telegram WebApp dan olish ---
  function renderProfileFromTelegram() {
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
      const u = tg.initDataUnsafe.user;
      profileDiv.textContent = '';
      const list = document.createElement('ul');

      function addRow(label, value) {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${label}:</strong> ${value || '-'}`;
        list.appendChild(li);
      }

      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim();
      addRow('Ism', fullName || '-');
      addRow('Username', u.username ? '@' + u.username : '-');
      addRow('Telegram ID', u.id);

      profileDiv.appendChild(list);
    } else {
      profileDiv.textContent = 'Telegram WebApp maʼlumotlarini olishning iloji boʼlmadi.';
    }
  }

  // --- Hozircha mock maʼlumotlar (backend ulanguncha) ---
  function renderMockStats() {
    quickStatsDiv.innerHTML =
      '<p><strong>Umumiy almashishlar:</strong> 0</p>' +
      '<p><strong>Taklif qilingan doʼstlar:</strong> 0 / 5</p>' +
      '<p><strong>Faol slotlar:</strong> 1 / 3</p>';
  }

  function renderMockSlots() {
    const html = `
      <ul>
        <li><strong>1-slot:</strong> Hali link kiritilmagan</li>
        <li><strong>2-slot:</strong> Qulf (5 ta doʼstdan keyin ochiladi)</li>
        <li><strong>3-slot:</strong> Qulf (yana qoʼshimcha takliflar bilan ochiladi)</li>
      </ul>
    `;
    slotsDiv.innerHTML = html;
  }

  function renderMockFriends() {
    friendsDiv.innerHTML =
      "Hozircha doʼstlar roʼyxati boʼsh. Almashishlarni yakunlaganingizdan soʼng va referallar orqali bu yer toʼlib boradi.";
  }

  // --- Tugmalar uchun oddiy handlerlar ---
  const btnStartExchange = document.getElementById('btn-start-exchange');
  const btnShareRef = document.getElementById('btn-share-ref');

  if (btnStartExchange) {
    btnStartExchange.addEventListener('click', () => {
      if (tg) {
        tg.showPopup({
          title: 'Almashishni boshlash',
          message:
            'Almashishni bot ichida boshlaysiz. Bu WebApp faqat profil va slotlarni boshqarish uchun. Asosiy chatga qayting va "🔁 Almashishni topish" tugmasini bosing.',
          buttons: [{ id: 'ok', type: 'close', text: 'Tushunarli' }]
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
  renderProfileFromTelegram();
  renderMockStats();
  renderMockSlots();
  renderMockFriends();
})();
