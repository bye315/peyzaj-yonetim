const admin = require('firebase-admin');

// Service Account JSON'ını çevre değişkeninden okuyoruz
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
  : null;

if (serviceAccount && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

module.exports = async (req, res) => {
  // CORS ayarları (farklı domainlerden/APK'dan gelen istekler için)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!serviceAccount) {
    return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT environment variable is not set.' });
  }

  const { title, body } = req.body;

  try {
    const db = admin.firestore();
    
    // fcm_tokens koleksiyonundaki tüm aktif cihaz tokenlarını çek
    const tokensSnapshot = await db.collection('fcm_tokens').get();
    const registrationTokens = [];
    tokensSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.token) {
        registrationTokens.push(data.token);
      }
    });

    if (registrationTokens.length === 0) {
      return res.status(200).json({ status: 'No registered tokens found' });
    }

    // FCM Multicast mesajı oluştur
    const message = {
      notification: {
        title: title || 'Peyzaj Takip',
        body: body || 'Yeni bir hatırlatma eklendi.'
      },
      tokens: registrationTokens
    };

    // Firebase Cloud Messaging üzerinden tüm tokenlara gönder
    const response = await admin.messaging().sendEachForMulticast(message);
    
    // Geçersiz/eski tokenları temizle
    const tokensToRemove = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errCode = resp.error?.code;
        if (errCode === 'messaging/invalid-registration-token' || errCode === 'messaging/registration-token-not-registered') {
          // Bu token artık aktif değil, Firestore'dan sil
          tokensToRemove.push(tokensSnapshot.docs[idx].id);
        }
      }
    });

    if (tokensToRemove.length > 0) {
      const batch = db.batch();
      tokensToRemove.forEach((uid) => {
        batch.delete(db.collection('fcm_tokens').doc(uid));
      });
      await batch.commit();
      console.log(`Cleaned up ${tokensToRemove.length} inactive FCM tokens.`);
    }

    return res.status(200).json({ 
      status: 'ok', 
      successCount: response.successCount, 
      failureCount: response.failureCount 
    });
  } catch (error) {
    console.error('Error sending multicast message:', error);
    return res.status(500).json({ error: error.message });
  }
};
