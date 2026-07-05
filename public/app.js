const state = {
  publicKey: '',
};

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

function renderStatusResult(result) {
  const container = document.querySelector('#status-result');
  container.innerHTML = `
    <div><strong>${result.jobCount} iş yapıldı</strong></div>
    <div>Toplam gelir: <strong>${formatCurrency(result.totalIncome)}</strong></div>
    <div>Giderler: <strong>${formatCurrency(result.expenses)}</strong></div>
    <div>Net kâr: <strong>${formatCurrency(result.netProfit)}</strong></div>
    <div>Ercan: <strong>${formatCurrency(result.shares.ercan)}</strong></div>
    <div>İsmail: <strong>${formatCurrency(result.shares.ismail)}</strong></div>
    <div>Ömer: <strong>${formatCurrency(result.shares.omer)}</strong></div>
  `;
}

function renderBalanceResult() {
  const container = document.querySelector('#balance-result');
  const balances = {
    ercan: Number(document.querySelector('#ercanDeposit').value || 0),
    ismail: Number(document.querySelector('#ismailDeposit').value || 0),
    omer: Number(document.querySelector('#omerDeposit').value || 0),
  };
  const expenses = {
    ercan: Number(document.querySelector('#ercanExpense').value || 0),
    ismail: Number(document.querySelector('#ismailExpense').value || 0),
    omer: Number(document.querySelector('#omerExpense').value || 0),
  };

  container.innerHTML = `
    <div>Ercan: <strong>${formatCurrency(balances.ercan)}</strong> bakiye | <strong>${formatCurrency(expenses.ercan)}</strong> harcama | net: <strong>${formatCurrency(balances.ercan - expenses.ercan)}</strong></div>
    <div>İsmail: <strong>${formatCurrency(balances.ismail)}</strong> bakiye | <strong>${formatCurrency(expenses.ismail)}</strong> harcama | net: <strong>${formatCurrency(balances.ismail - expenses.ismail)}</strong></div>
    <div>Ömer: <strong>${formatCurrency(balances.omer)}</strong> bakiye | <strong>${formatCurrency(expenses.omer)}</strong> harcama | net: <strong>${formatCurrency(balances.omer - expenses.omer)}</strong></div>
  `;
}

function setPreset(values) {
  document.querySelector('#ercan').value = values[0];
  document.querySelector('#ismail').value = values[1];
  document.querySelector('#omer').value = values[2];
}

async function loadVapidKey() {
  const response = await fetch('./api/vapid-public-key');
  const data = await response.json();
  state.publicKey = data.publicKey;
}

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

  const registration = await navigator.serviceWorker.register('./sw.js');
  await registration.update();
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(state.publicKey),
  });

  await fetch('./api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription),
  });

  alert('Bildirimler etkinleştirildi.');
}

async function loadReminders() {
  const response = await fetch('./api/reminders');
  const reminders = await response.json();
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
      await fetch(`./api/reminders/${id}`, { method: 'DELETE' });
      await loadReminders();
    });
  });
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
  await loadVapidKey();
  await loadReminders();

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

  document.querySelector('#reminder-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      personName: document.querySelector('#personName').value,
      jobTitle: document.querySelector('#jobTitle').value,
      lastCutDate: document.querySelector('#lastCutDate').value,
      nextVisitDate: document.querySelector('#nextVisitDate').value,
      paymentStatus: document.querySelector('#paymentStatus').value,
      notes: document.querySelector('#notes').value,
    };

    const response = await fetch('./api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      event.target.reset();
      await loadReminders();
      alert('Hatırlatma kaydedildi.');
    }
  });

  document.querySelector('#enable-notifications').addEventListener('click', subscribeToPush);
});
