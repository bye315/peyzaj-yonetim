const state = {
  publicKey: '',
};

// Auth listener to protect pages and sync notifications
auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = './login.html';
  } else {
    const username = user.email.split('@')[0];
    document.querySelector('#user-welcome').textContent = `Hoş geldin, ${username.charAt(0).toUpperCase() + username.slice(1)}`;
    loadReminders();
    listenToNewReminders();
    syncLocalNotifications(); // Sync all future reminders locally on startup
    registerPushNotifications(); // Register device for FCM on login
  }
});

// Register device for FCM Push Notifications
async function registerPushNotifications() {
  if (typeof window.Capacitor === 'undefined' || !window.Capacitor.isPluginAvailable('PushNotifications')) {
    console.log('PushNotifications plugin is not available on this device');
    return;
  }
  
  const { PushNotifications } = window.Capacitor.Plugins;
  
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }
    
    if (perm.receive === 'granted') {
      await PushNotifications.register();
    }
    
    // Add registration success listener
    PushNotifications.addListener('registration', async (token) => {
      console.log('Push registration success, token: ' + token.value);
      const currentUser = auth.currentUser;
      if (currentUser) {
        // Store FCM Token securely in Firestore under current user's UID
        await db.collection('fcm_tokens').doc(currentUser.uid).set({
          token: token.value,
          email: currentUser.email,
          updatedAt: new Date().toISOString()
        });
      }
    });
    
    // Add listener for registration errors
    PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error: ', err);
    });
    
    // Add listener for incoming push notifications (foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received in foreground: ', notification);
    });
  } catch (err) {
    console.error('Error during push notification setup:', err);
  }
}

function calculateShares(ercan, ismail, omer) {
  const total = Number(ercan) + Number(ismail) + Number(omer);
  if (total === 0) {
    return { ercan: 0, ismail: 0, omer: 0 };
  }

  return {
    ercan: (Number(ercan) / total) * 100,
    ismail: (Number(ismail) / total) * 100,
    omer: (Number(omer) / total) * 100,
  };
}

function formatCurrency(value) {
  return `${Number(value || 0).toFixed(2)} ₺`;
}

function renderResult(shares) {
  const result = document.querySelector('#result');
  result.innerHTML = `
    <div>Ercan: <strong>${shares.ercan.toFixed(2)}%</strong></div>
    <div>İsmail: <strong>${shares.ismail.toFixed(2)}%</strong></div>
    <div>Ömer: <strong>${shares.omer.toFixed(2)}%</strong></div>
  `;
}

function calculateStatusResult(jobCount, totalIncome, expenses) {
  const netProfit = Math.max(0, Number(totalIncome) - Number(expenses));
  const shares = calculateShares(
    document.querySelector('#ercan').value,
    document.querySelector('#ismail').value,
    document.querySelector('#omer').value
  );

  return {
    jobCount: Number(jobCount || 0),
    totalIncome: Number(totalIncome || 0),
    expenses: Number(expenses || 0),
    netProfit,
    shares: {
      ercan: (netProfit * shares.ercan) / 100,
      ismail: (netProfit * shares.ismail) / 100,
      omer: (netProfit * shares.omer) / 100,
    },
  };
}

function renderStatusResult(statusResult) {
  const result = document.querySelector('#status-result');
  result.innerHTML = `
    <div class="result-item">Net Kâr: <strong>${formatCurrency(statusResult.netProfit)}</strong></div>
    <div class="shares-grid">
      <div class="share-box ercan">
        <span class="label">Ercan</span>
        <span class="amount">${formatCurrency(statusResult.shares.ercan)}</span>
      </div>
      <div class="share-box ismail">
        <span class="label">İsmail</span>
        <span class="amount">${formatCurrency(statusResult.shares.ismail)}</span>
      </div>
      <div class="share-box omer">
        <span class="label">Ömer</span>
        <span class="amount">${formatCurrency(statusResult.shares.omer)}</span>
      </div>
    </div>
  `;
}

function renderBalanceResult() {
  const shares = calculateShares(
    document.querySelector('#ercan').value,
    document.querySelector('#ismail').value,
    document.querySelector('#omer').value
  );
  
  const statusResult = calculateStatusResult(
    document.querySelector('#jobCount').value,
    document.querySelector('#totalIncome').value,
    document.querySelector('#expenses').value
  );

  const container = document.querySelector('#balance-result');
  
  const ercanExpected = statusResult.shares.ercan;
  const ismailExpected = statusResult.shares.ismail;
  const omerExpected = statusResult.shares.omer;

  const ercanExpense = Number(document.querySelector('#expense-ercan').value || 0);
  const ismailExpense = Number(document.querySelector('#expense-ismail').value || 0);
  const omerExpense = Number(document.querySelector('#expense-omer').value || 0);

  const ercanReceived = Number(document.querySelector('#income-ercan').value || 0);
  const ismailReceived = Number(document.querySelector('#income-ismail').value || 0);
  const omerReceived = Number(document.querySelector('#income-omer').value || 0);

  const ercanActual = ercanReceived - ercanExpense;
  const ismailActual = ismailReceived - ismailExpense;
  const omerActual = omerReceived - omerExpense;

  const ercanDiff = ercanActual - ercanExpected;
  const ismailDiff = ismailActual - ismailExpected;
  const omerDiff = omerActual - omerExpected;

  const diffs = [
    { name: 'Ercan', diff: ercanDiff },
    { name: 'İsmail', diff: ismailDiff },
    { name: 'Ömer', diff: omerDiff }
  ];

  let html = '<h3>Kasa Dengesi (Kim Kime Ne Verecek?)</h3>';
  
  const debtors = diffs.filter(d => d.diff > 0).sort((a,b) => b.diff - a.diff);
  const creditors = diffs.filter(d => d.diff < 0).map(d => ({ ...d, diff: Math.abs(d.diff) })).sort((a,b) => b.diff - a.diff);

  if (debtors.length === 0 && creditors.length === 0) {
    html += '<p>Herkesin hesabı dengede.</p>';
  } else {
    let dIdx = 0;
    let cIdx = 0;

    while(dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];
      const amount = Math.min(debtor.diff, creditor.diff);

      html += `<p><strong>${debtor.name}</strong>, <strong>${creditor.name}</strong> kişisine <strong>${formatCurrency(amount)}</strong> ödemeli.</p>`;

      debtor.diff -= amount;
      creditor.diff -= amount;

      if (debtor.diff < 0.01) dIdx++;
      if (creditor.diff < 0.01) cIdx++;
    }
  }

  container.innerHTML = html;
}

// Hashing function to map Firestore String ID to unique positive Integer
function getNotificationIdFromDocId(docId) {
  let hash = 0;
  for (let i = 0; i < docId.length; i++) {
    hash = docId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 1000000;
}

// Schedule future Local Notification on Phone
async function scheduleReminderNotification(reminder, docId) {
  if (typeof window.Capacitor === 'undefined' || !window.Capacitor.isPluginAvailable('LocalNotifications')) {
    console.log('LocalNotifications plugin is not available on this device');
    return;
  }

  const { LocalNotifications } = window.Capacitor.Plugins;

  try {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') {
      console.warn('LocalNotifications permission not granted');
      return;
    }

    const nextVisit = new Date(reminder.nextVisitDate + 'T00:00:00');
    const scheduleTime = new Date(nextVisit.getTime() - 24 * 60 * 60 * 1000); // 1 day before
    scheduleTime.setHours(9, 0, 0, 0); // 9:00 AM

    // If scheduled time is in the past, but next visit is in the future
    if (scheduleTime.getTime() <= Date.now()) {
      const visitTime = new Date(reminder.nextVisitDate + 'T09:00:00');
      if (visitTime.getTime() > Date.now()) {
        // Schedule for 5 seconds from now as a test/helper warning
        scheduleTime.setTime(Date.now() + 5000);
      } else {
        return; // Both in the past, skip
      }
    }

    const notificationId = getNotificationIdFromDocId(docId);

    // Cancel existing first to prevent duplicate accumulation
    try {
      await LocalNotifications.cancel({ notifications: [{ id: notificationId }] });
    } catch (e) {}

    await LocalNotifications.schedule({
      notifications: [
        {
          title: `${reminder.personName} Hatırlatması`,
          body: `${reminder.jobTitle} işi için son 1 gün! Yarın gidilecek.`,
          id: notificationId,
          schedule: { at: scheduleTime },
          sound: null,
          attachments: null,
          actionTypeId: "",
          extra: null
        }
      ]
    });

    console.log(`Scheduled local notification ID ${notificationId} for ${scheduleTime.toString()}`);
  } catch (err) {
    console.error('Error scheduling local notification:', err);
  }
}

// Cancel local notification
async function cancelReminderNotification(notificationId) {
  if (notificationId && typeof window.Capacitor !== 'undefined' && window.Capacitor.isPluginAvailable('LocalNotifications')) {
    const { LocalNotifications } = window.Capacitor.Plugins;
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: notificationId }]
      });
      console.log(`Cancelled scheduled notification ID ${notificationId}`);
    } catch (err) {
      console.error('Error cancelling notification:', err);
    }
  }
}

// Sync all future reminders locally from database
async function syncLocalNotifications() {
  if (typeof window.Capacitor === 'undefined' || !window.Capacitor.isPluginAvailable('LocalNotifications')) {
    return;
  }
  
  const { LocalNotifications } = window.Capacitor.Plugins;
  
  try {
    const permission = await LocalNotifications.requestPermissions();
    if (permission.display !== 'granted') return;

    const snapshot = await db.collection('reminders').get();
    const pendingNotifications = [];
    
    snapshot.forEach((doc) => {
      const reminder = doc.data();
      const docId = doc.id;
      
      const nextVisit = new Date(reminder.nextVisitDate + 'T00:00:00');
      const scheduleTime = new Date(nextVisit.getTime() - 24 * 60 * 60 * 1000); // 1 day before
      scheduleTime.setHours(9, 0, 0, 0); // 9:00 AM
      
      if (scheduleTime.getTime() > Date.now()) {
        const notificationId = getNotificationIdFromDocId(docId);
        pendingNotifications.push({
          title: `${reminder.personName} Hatırlatması`,
          body: `${reminder.jobTitle} işi için son 1 gün! Yarın gidilecek.`,
          id: notificationId,
          schedule: { at: scheduleTime },
          sound: null,
          attachments: null,
          actionTypeId: "",
          extra: null
        });
      }
    });
    
    if (pendingNotifications.length > 0) {
      await LocalNotifications.schedule({
        notifications: pendingNotifications
      });
      console.log(`Synced ${pendingNotifications.length} upcoming notifications.`);
    }
  } catch (err) {
    console.error('Error syncing notifications:', err);
  }
}

// Load VAPID Key from Firestore if available
async function loadVapidKey() {
  try {
    const doc = await db.collection('settings').doc('vapid_keys').get();
    if (doc.exists) {
      state.publicKey = doc.data().publicKey;
    }
  } catch (err) {
    console.error("Error loading VAPID key from Firestore:", err);
  }
}

// Push subscription (Legacy Web Push - kept for fallback)
async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Bu tarayıcı web push desteklemiyor.');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Bildirim izni verilmedi.');
    return;
  }

  await loadVapidKey();
  if (!state.publicKey) {
    alert('Push bildirimi için VAPID anahtarı sunucuda tanımlı değil.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(state.publicKey),
    });

    // Save subscription to Firestore
    await db.collection('subscriptions').add(JSON.parse(JSON.stringify(subscription)));
    alert('Bildirimler etkinleştirildi.');
  } catch (err) {
    console.error('Subscription error:', err);
    alert('Bildirimler etkinleştirilemedi.');
  }
}

// Load reminders from Firestore
async function loadReminders() {
  try {
    const snapshot = await db.collection('reminders').orderBy('createdAt', 'desc').get();
    const reminders = [];
    snapshot.forEach((doc) => {
      reminders.push({ id: doc.id, ...doc.data() });
    });

    const container = document.querySelector('#reminders');
    if (!reminders.length) {
      container.innerHTML = '<p>Henüz hatırlatma yok.</p>';
      return;
    }

    container.innerHTML = reminders
      .map((reminder) => {
        const paymentText = reminder.paymentStatus === 'paid' ? 'Ödeme alındı' : 'Ödeme alınmadı';
        const daysLeft = Math.max(0, Math.ceil((new Date(reminder.nextVisitDate).getTime() - Date.now()) / 86400000));
        return `
          <article class="reminder">
            <div class="reminder-header">
              <strong>${reminder.personName}</strong>
              <button class="danger" data-remove-id="${reminder.id}" type="button">Sil</button>
            </div>
            <div>${reminder.jobTitle}</div>
            <small>Son biçim: ${reminder.lastCutDate}</small><br />
            <small>Sonraki ziyaret: ${reminder.nextVisitDate}</small><br />
            <small>${daysLeft} gün kaldı</small><br />
            <small>${paymentText}</small>
            <div>${reminder.notes || 'Not yok'}</div>
          </article>
        `;
      })
      .join('');

    container.querySelectorAll('[data-remove-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.getAttribute('data-remove-id');
        if (confirm('Bu hatırlatmayı silmek istediğinize emin misiniz?')) {
          const notificationId = getNotificationIdFromDocId(id);
          await cancelReminderNotification(notificationId); // Cancel alarm on this phone
          await db.collection('reminders').doc(id).delete();
          await loadReminders();
        }
      });
    });
  } catch (err) {
    console.error('Error loading reminders:', err);
  }
}

// Listen to new reminders in real-time to show local notifications and manage alarms
let isFirstLoad = true;
const sessionStartTime = new Date().toISOString();

function listenToNewReminders() {
  db.collection('reminders')
    .onSnapshot((snapshot) => {
      if (isFirstLoad) {
        isFirstLoad = false;
        return;
      }
      snapshot.docChanges().forEach(async (change) => {
        const docId = change.doc.id;
        const reminder = change.doc.data();
        const notificationId = getNotificationIdFromDocId(docId);

        if (change.type === 'added') {
          if (reminder.createdAt > sessionStartTime) {
            showLocalNotification(reminder);
            await scheduleReminderNotification(reminder, docId); // Schedule on this phone
          }
          loadReminders();
        } else if (change.type === 'removed') {
          await cancelReminderNotification(notificationId); // Cancel on this phone
          loadReminders();
        }
      });
    });
}

function showLocalNotification(reminder) {
  if (Notification.permission === 'granted') {
    const daysAgo = Math.max(0, Math.round((Date.now() - new Date(reminder.lastCutDate).getTime()) / 86400000));
    const nextVisitDate = new Date(reminder.nextVisitDate).toLocaleDateString('tr-TR');
    const paymentStatus = reminder.paymentStatus === 'paid' ? 'ödeme alındı' : 'ödeme alınmadı';
    const daysLeft = Math.max(0, Math.ceil((new Date(reminder.nextVisitDate).getTime() - Date.now()) / 86400000));

    const bodyText = `${reminder.personName} kişinin ${reminder.jobTitle} işi ${daysAgo} gün önce biçildi. ${daysLeft} gün kaldı. ${paymentStatus}.`;
    
    const title = `${reminder.personName} için hatırlatma`;
    const options = {
      body: bodyText,
      icon: 'icon.jpg',
      badge: 'icon.jpg'
    };

    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, options);
    });
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

window.addEventListener('DOMContentLoaded', async () => {
  // Register service worker immediately for PWA/installability support
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      console.error('Service Worker registration failed:', err);
    }
  }

  document.querySelector('#calculate').addEventListener('click', () => {
    const shares = calculateShares(
      document.querySelector('#ercan').value,
      document.querySelector('#ismail').value,
      document.querySelector('#omer').value
    );
    renderResult(shares);
  });

  document.querySelector('#preset-one').addEventListener('click', () => setPreset(['70', '15', '15']));
  document.querySelector('#preset-two').addEventListener('click', () => setPreset(['15', '37.5', '37.5']));

  document.querySelector('#calculate-status').addEventListener('click', () => {
    const statusResult = calculateStatusResult(
      document.querySelector('#jobCount').value,
      document.querySelector('#totalIncome').value,
      document.querySelector('#expenses').value
    );
    renderStatusResult(statusResult);
  });

  document.querySelector('#apply-balances').addEventListener('click', () => {
    renderBalanceResult();
  });

  function setPreset(values) {
    document.querySelector('#ercan').value = values[0];
    document.querySelector('#ismail').value = values[1];
    document.querySelector('#omer').value = values[2];
  }

  document.querySelector('#reminder-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      personName: document.querySelector('#personName').value,
      jobTitle: document.querySelector('#jobTitle').value,
      lastCutDate: document.querySelector('#lastCutDate').value,
      nextVisitDate: document.querySelector('#nextVisitDate').value,
      paymentStatus: document.querySelector('#paymentStatus').value,
      notes: document.querySelector('#notes').value,
      createdAt: new Date().toISOString(),
    };

    try {
      const docRef = await db.collection('reminders').add(payload);
      await scheduleReminderNotification(payload, docRef.id); // Schedule notification immediately on this phone
      
      // Trigger network broadcast push notifications via Vercel Serverless Function
      if (typeof vercelUrl !== 'undefined') {
        const bodyText = `${payload.personName} kişinin ${payload.jobTitle} işi kaydedildi.`;
        fetch(`${vercelUrl}/api/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${payload.personName} için hatırlatma`,
            body: bodyText
          })
        }).catch(e => console.error('Error calling vercel notification api:', e));
      }

      event.target.reset();
      await loadReminders();
      alert('Hatırlatma kaydedildi.');
    } catch (err) {
      console.error('Error saving reminder:', err);
      alert('Hata oluştu: ' + err.message);
    }
  });

  document.querySelector('#enable-notifications').addEventListener('click', subscribeToPush);
});
