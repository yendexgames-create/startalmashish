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

  // --- Profil va statistikani backend + Telegram WebApp dan olish ---
  async function loadFromBackend() {
    if (!tg || !tg.initDataUnsafe || !tg.initDataUnsafe.user) {
      profileDiv.textContent =
        'Profilni to‘liq ko‘rish uchun ilovani Telegram ichidagi "🧩 Web ilova" tugmasi orqali oching.';
      return;
    }

    const u = tg.initDataUnsafe.user;
    const telegramId = u.id;

    try {
      const [meRes, slotsRes, friendsRes] = await Promise.all([
        fetch(`/api/me?telegram_id=${telegramId}`),
        fetch(`/api/slots?telegram_id=${telegramId}`),
        fetch(`/api/friends?telegram_id=${telegramId}`)
      ]);

      if (!meRes.ok) throw new Error('me failed');
      const meData = await meRes.json();
      renderProfile(meData.user, u);

      if (slotsRes.ok) {
        const slotsData = await slotsRes.json();
        renderSlots(slotsData);
      } else {
        renderSlots();
      }

      if (friendsRes.ok) {
        const friendsData = await friendsRes.json();
        renderFriends(friendsData.friends || []);
      } else {
        renderFriends([]);
      }
    } catch (e) {
      console.error('Backend yuklashda xato:', e);
      // Foydalanuvchiga eng kamida Telegram profili ko‘rinib tursin
      renderProfile(null, tg.initDataUnsafe.user);
      renderSlots();
      renderFriends([]);
    }
  }

  function renderProfile(userFromDb, tgUser) {
    profileDiv.textContent = '';
    const list = document.createElement('ul');

    function addRow(label, value) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${label}:</strong> ${value || '-'}`;
      list.appendChild(li);
    }

    const fullNameFromTg = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim();
    addRow('Ism', (userFromDb && userFromDb.name) || fullNameFromTg || '-');
    addRow('Username', tgUser.username ? '@' + tgUser.username : userFromDb?.username || '-');
    addRow('Telegram ID', tgUser.id);

    if (userFromDb) {
      addRow('Telefon', userFromDb.phone || '-');
      addRow('Asosiy link', userFromDb.main_link || '-');
      addRow('Taklif qilingan do‘stlar', userFromDb.invited_friends_count || 0);
      addRow('Almashishlar soni', userFromDb.total_exchanges || 0);
      addRow('Slotlar', `${userFromDb.used_slots || 0}/${userFromDb.slots || 1}`);

      quickStatsDiv.innerHTML =
        `<p><strong>Umumiy almashishlar:</strong> ${userFromDb.total_exchanges || 0}</p>` +
        `<p><strong>Taklif qilingan do‘stlar:</strong> ${userFromDb.invited_friends_count || 0} / 5</p>` +
        `<p><strong>Faol slotlar:</strong> ${userFromDb.slots || 1} / 3</p>`;
    }

    profileDiv.appendChild(list);
  }

  function renderSlots(slotsData) {
    if (!slotsData) {
      slotsDiv.innerHTML =
        '<ul><li><strong>1-slot:</strong> Hali link kiritilmagan</li><li><strong>2-slot:</strong> Qulf (5 ta do‘stdan keyin ochiladi)</li><li><strong>3-slot:</strong> Qulf (yana qo‘shimcha takliflar bilan ochiladi)</li></ul>';
      return;
    }

    const totalSlots = slotsData.slots || 1;
    const links = slotsData.links || [];
    const items = [];

    for (let i = 1; i <= 3; i++) {
      const slot = links.find((l) => l.slot_index === i);
      let text = '';
      if (i <= totalSlots) {
        if (slot && slot.link) {
          text = `<strong>${i}-slot:</strong> ${slot.link}`;
        } else {
          text = `<strong>${i}-slot:</strong> Hali link kiritilmagan`;
        }
      } else {
        text = `<strong>${i}-slot:</strong> Qulf (takliflar orqali ochiladi)`;
      }
      items.push(`<li>${text}</li>`);
    }

    slotsDiv.innerHTML = `<ul>${items.join('')}</ul>`;
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
      const profile = f.profile_link || '-';
      return `<li><strong>${name}</strong> (${username}) – <a href="${profile}" target="_blank">Profil</a></li>`;
    });

    friendsDiv.innerHTML = `<ul>${items.join('')}</ul>`;
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
  loadFromBackend();
})();
