const express = require('express');
const session = require('express-session');
const path = require('path');
const webpush = require('web-push');
const { Redis } = require('@upstash/redis');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_BASE_PATH = '/peyzaj';

// Initialize Redis
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const USERS = {
  ercan: '123456',
  ismail: '123456',
  omer: '123456',
};

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

// Initialize VAPID keys from Redis
let vapidKeys = null;

async function initializeVapidKeys() {
  try {
    const stored = await redis.get('vapid_keys');
    if (stored) {
      vapidKeys = stored;
    } else {
      vapidKeys = webpush.generateVAPIDKeys();
      await redis.set('vapid_keys', vapidKeys);
    }
    webpush.setVapidDetails(
      'mailto:ercan@example.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } catch (error) {
    console.error('Error initializing VAPID keys:', error);
    // Fallback for local testing
    vapidKeys = webpush.generateVAPIDKeys();
    webpush.setVapidDetails(
      'mailto:ercan@example.com',
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  }
}

// Initialize on startup
initializeVapidKeys();

async function loadJSON(key, fallback) {
  try {
    const data = await redis.get(key);
    return data || fallback;
  } catch (error) {
    console.error(`Error loading ${key}:`, error);
    return fallback;
  }
}

async function saveJSON(key, data) {
  try {
    await redis.set(key, data);
  } catch (error) {
    console.error(`Error saving ${key}:`, error);
  }
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
  try {
    const subscriptions = await loadJSON('subscriptions', []);
    if (!Array.isArray(subscriptions)) return;
    
    const tasks = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (error) {
        console.error('Push error', error.message);
      }
    });
    await Promise.all(tasks);
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
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

app.post(`${APP_BASE_PATH}/api/subscribe`, async (req, res) => {
  try {
    const subscriptions = await loadJSON('subscriptions', []);
    const exists = subscriptions.some((item) => JSON.stringify(item) === JSON.stringify(req.body));
    if (!exists) {
      subscriptions.push(req.body);
      await saveJSON('subscriptions', subscriptions);
    }
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

app.get(`${APP_BASE_PATH}/api/reminders`, isAuthenticated, async (_req, res) => {
  try {
    const reminders = await loadJSON('reminders', []);
    res.json(reminders);
  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(500).json({ error: 'Failed to get reminders' });
  }
});

app.delete(`${APP_BASE_PATH}/api/reminders/:id`, isAuthenticated, async (req, res) => {
  try {
    const reminders = await loadJSON('reminders', []);
    const filtered = reminders.filter((reminder) => reminder.id !== req.params.id);
    await saveJSON('reminders', filtered);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

app.post(`${APP_BASE_PATH}/api/reminders`, isAuthenticated, async (req, res) => {
  try {
    const reminders = await loadJSON('reminders', []);
    const reminder = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      ...req.body,
    };
    reminders.unshift(reminder);
    await saveJSON('reminders', reminders);

    await sendPushNotification({
      title: `${reminder.personName} için hatırlatma`,
      body: buildReminderText(reminder),
      url: '/',
    });

    res.status(201).json(reminder);
  } catch (error) {
    console.error('Create reminder error:', error);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
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
