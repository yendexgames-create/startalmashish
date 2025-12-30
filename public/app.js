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

  let currentTelegramId = null;

  // --- Navigatsiya (pastki navbar) ---
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

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

      if (!meRes.ok) throw new Error('me failed');
      const meData = await meRes.json();
      renderProfile(meData.user, u);

      let slotsData = null;
      if (slotsRes.ok) {
        slotsData = await slotsRes.json();
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

      // --- Boshlang'ich qaysi view ochilishi ---
      const hasSlot1Link =
        slotsData &&
        Array.isArray(slotsData.links) &&
        slotsData.links.some((l) => l.slot_index === 1 && l.link);

      if (!hasSlot1Link) {
        // 1-slot uchun link yo'q – foydalanuvchini slotlar bo'limiga olib boramiz
        switchView('view-slots');
        if (navbar) {
          navbar.style.display = 'none';
        }
        if (tg) {
          tg.showPopup({
            title: '1-slot uchun link kerak',
            message:
              'Avval 1-slot uchun bot/link manzilini kiriting. Bu link almashish jarayonlarida ishlatiladi.',
            buttons: [{ id: 'ok', type: 'close', text: 'Tushunarli' }]
          });
        }
      } else {
        // Asosiy maʼlumotlar tayyor – profil bo'limini ochamiz
        if (navbar) {
          navbar.style.display = 'flex';
        }
        switchView('view-profile');
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
      switchView('view-profile');
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
    const totalSlots = slotsData?.slots || 1;
    const links = slotsData?.links || [];

    const slot1 = links.find((l) => l.slot_index === 1);
    const currentLink = slot1?.link || '';
    const currentDesc = slot1?.description || '';

    const lockedText2 = totalSlots >= 2 ? '' : ' (qulf – 5 ta do‘stdan keyin ochiladi)';
    const lockedText3 = totalSlots >= 3 ? '' : ' (qulf – qo‘shimcha takliflardan keyin ochiladi)';

    slotsDiv.innerHTML = `
      <div class="slot-view">
        <p><strong>1-slot (asosiy):</strong> ${currentLink || 'Hali link kiritilmagan'}</p>
        <p><strong>Tavsif:</strong> ${currentDesc || '-'}</p>
      </div>
      <div class="slot-edit">
        <label class="slot-label">1-slot uchun yangi link:</label>
        <input id="slot1-link-input" class="slot-input" type="text" placeholder="https://t.me/yourbot?start=..." value="${currentLink || ''}" />
        <label class="slot-label">Qisqacha tavsif:</label>
        <textarea id="slot1-desc-input" class="slot-textarea" rows="2" placeholder="Bu bot nima qiladi?"></textarea>
        <button id="slot1-save-btn" class="primary-btn slot-save-btn">Saqlash</button>
        <p class="hint-text">Linkingiz va tavsif Web ilova va botdagi almashishlarda ishlatiladi.</p>
      </div>
      <div class="slot-other-info">
        <p><strong>2-slot:</strong> ${totalSlots >= 2 ? 'Mavjud, keyinroq Web ilovada tahrir qilinadi.' : 'Hozircha qulfda' + lockedText2}</p>
        <p><strong>3-slot:</strong> ${totalSlots >= 3 ? 'Mavjud, keyinroq Web ilovada tahrir qilinadi.' : 'Hozircha qulfda' + lockedText3}</p>
      </div>
    `;

    const descEl = document.getElementById('slot1-desc-input');
    if (descEl && currentDesc) {
      descEl.value = currentDesc;
    }

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
  loadFromBackend();
})();
