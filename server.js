const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_BASE_PATH = '/peyzaj';
const DATA_DIR = path.join(__dirname, 'data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const USERS = {
  ercan: '123456',
  ismail: '123456',
  omer: '123456',
};

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'peyzaj-2026-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));
app.use(APP_BASE_PATH, express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

let vapidKeys = null;
if (fs.existsSync(path.join(DATA_DIR, 'vapid.json'))) {
  vapidKeys = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'vapid.json'), 'utf8'));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(path.join(DATA_DIR, 'vapid.json'), JSON.stringify(vapidKeys, null, 2));
}

webpush.setVapidDetails(
  'mailto:ercan@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

function loadJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function formatTurkishDate(dateString) {
  const value = new Date(dateString);
  return value.toLocaleDateString('tr-TR');
}

function isAuthenticated(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.redirect(`${APP_BASE_PATH}/login`);
}

function buildReminderText(reminder) {
  const daysAgo = Math.max(0, Math.round((Date.now() - new Date(reminder.lastCutDate).getTime()) / 86400000));
  const nextVisitDate = formatTurkishDate(reminder.nextVisitDate);
  const paymentStatus = reminder.paymentStatus === 'paid' ? 'ödeme alındı' : 'ödeme alınmadı';
  const daysLeft = Math.max(0, Math.ceil((new Date(reminder.nextVisitDate).getTime() - Date.now()) / 86400000));
  return `${reminder.personName} kişinin ${reminder.jobTitle} işi ${daysAgo} gün önce biçildi. ${daysLeft} gün kaldı. ${reminder.notes || 'İş durumu takipte.'} ${paymentStatus}. ${nextVisitDate} tarihinde tekrar gidilecek.`;
}

async function sendPushNotification(payload) {
  const subscriptions = loadJSON(SUBSCRIPTIONS_FILE, []);
  const tasks = subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (error) {
      console.error('Push error', error.message);
    }
  });
  await Promise.all(tasks);
}

app.get(`${APP_BASE_PATH}/login`, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post(`${APP_BASE_PATH}/login`, (req, res) => {
  const { username, password } = req.body;
  const valid = USERS[username] && USERS[username] === password;
  if (!valid) {
    return res.status(401).send('Kullanıcı adı veya şifre yanlış');
  }

  req.session.authenticated = true;
  req.session.username = username;
  res.redirect(APP_BASE_PATH);
});

app.post(`${APP_BASE_PATH}/logout`, (req, res) => {
  req.session.destroy(() => {
    res.redirect(`${APP_BASE_PATH}/login`);
  });
});

app.get(`${APP_BASE_PATH}/api/health`, (_req, res) => {
  res.json({ status: 'ok' });
});

app.get(`${APP_BASE_PATH}/api/vapid-public-key`, (_req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post(`${APP_BASE_PATH}/api/subscribe`, (req, res) => {
  const subscriptions = loadJSON(SUBSCRIPTIONS_FILE, []);
  const exists = subscriptions.some((item) => JSON.stringify(item) === JSON.stringify(req.body));
  if (!exists) {
    subscriptions.push(req.body);
    saveJSON(SUBSCRIPTIONS_FILE, subscriptions);
  }
  res.status(201).json({ ok: true });
});

app.get(`${APP_BASE_PATH}/api/reminders`, isAuthenticated, (_req, res) => {
  const reminders = loadJSON(REMINDERS_FILE, []);
  res.json(reminders);
});

app.delete(`${APP_BASE_PATH}/api/reminders/:id`, isAuthenticated, (req, res) => {
  const reminders = loadJSON(REMINDERS_FILE, []);
  const filtered = reminders.filter((reminder) => reminder.id !== req.params.id);
  saveJSON(REMINDERS_FILE, filtered);
  res.json({ ok: true });
});

app.post(`${APP_BASE_PATH}/api/reminders`, isAuthenticated, async (req, res) => {
  const reminders = loadJSON(REMINDERS_FILE, []);
  const reminder = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    ...req.body,
  };
  reminders.unshift(reminder);
  saveJSON(REMINDERS_FILE, reminders);

  await sendPushNotification({
    title: `${reminder.personName} için hatırlatma`,
    body: buildReminderText(reminder),
    url: '/',
  });

  res.status(201).json(reminder);
});

app.get(APP_BASE_PATH, isAuthenticated, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (_req, res) => {
  res.redirect(APP_BASE_PATH);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Uygulama http://localhost:${PORT} üzerinde çalışıyor`);
  });
}

module.exports = app;
