const express = require('express');
const cors = require('cors');
const { JWT } = require('google-auth-library');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage
let fcmTokens = new Set();
let activeCalls = new Map();
let serviceAccount = null;

// Load Firebase service account
function loadServiceAccount() {
  try {
    const configPath = path.join(__dirname, 'firebase-service-account.json');
    if (fs.existsSync(configPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('✅ Firebase service account loaded');
      console.log(`🔧 Project: ${serviceAccount.project_id}`);
      return true;
    } else {
      console.log('⚠️  Firebase service account not found');
      console.log('📁 Please add: firebase-service-account.json');
      return false;
    }
  } catch (error) {
    console.error('❌ Error loading service account:', error.message);
    return false;
  }
}

// Get OAuth2 access token
async function getAccessToken() {
  if (!serviceAccount) throw new Error('Service account not configured');

  const jwtClient = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

// Send FCM message
async function sendFCM(token, data, notification = null) {
  const accessToken = await getAccessToken();

  const message = {
    message: {
      token,
      data,
      android: { priority: 'high' },
    },
  };

  if (notification) {
    message.message.notification = notification;
  }

  const postData = JSON.stringify(message);
  const options = {
    hostname: 'fcm.googleapis.com',
    port: 443,
    path: `/v1/projects/${serviceAccount.project_id}/messages:send`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': postData.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(responseData));
        } else {
          reject(new Error(`FCM Error: ${res.statusCode} - ${responseData}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Routes
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    configured: !!serviceAccount,
    project: serviceAccount?.project_id || null,
    devices: fcmTokens.size,
    activeCalls: activeCalls.size,
  });
});

app.post('/api/register', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  fcmTokens.add(token);
  console.log(`📱 Device registered: ${token.substring(0, 20)}...`);
  res.json({ success: true, total: fcmTokens.size });
});

app.get('/api/devices', (req, res) => {
  res.json({ tokens: Array.from(fcmTokens) });
});

app.post('/api/call/start', async (req, res) => {
  try {
    const {
      token,
      callId = `call-${Date.now()}`,
      callerName = 'Test Call',
      callerPhone = '+84123456789',
      callerAvatar = 'https://picsum.photos/200/200',
      withNotification = false,
    } = req.body;

    if (!token) return res.status(400).json({ error: 'Token required' });
    if (!serviceAccount)
      return res.status(500).json({ error: 'Not configured' });

    const data = {
      type: 'call.started',
      callId,
      callerName,
      callerPhone,
      callerAvatar,
    };

    const notification = withNotification
      ? {
          title: 'Incoming Call',
          body: `${callerName} is calling...`,
        }
      : null;

    const result = await sendFCM(token, data, notification);

    activeCalls.set(callId, {
      callId,
      callerName,
      callerPhone,
      callerAvatar,
      startTime: new Date(),
      token,
    });

    console.log(`📞 Call started: ${callId} -> ${callerName}`);
    res.json({ success: true, callId, result });
  } catch (error) {
    console.error('❌ Start call error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/call/end', async (req, res) => {
  try {
    const { callId } = req.body;
    const call = activeCalls.get(callId);

    if (!call) return res.status(404).json({ error: 'Call not found' });

    if (serviceAccount) {
      await sendFCM(call.token, {
        type: 'call.ended',
        callId,
        duration: Math.floor((new Date() - call.startTime) / 1000),
      });
    }

    activeCalls.delete(callId);
    console.log(`📵 Call ended: ${callId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ End call error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/calls', (req, res) => {
  const calls = Array.from(activeCalls.values()).map((call) => ({
    ...call,
    duration: Math.floor((new Date() - call.startTime) / 1000),
  }));
  res.json({ calls });
});

app.post('/api/test-notification', async (req, res) => {
  try {
    const {
      token,
      title = 'Test Notification',
      body = 'This is a basic FCM test',
    } = req.body;

    if (!token) return res.status(400).json({ error: 'Token required' });
    if (!serviceAccount)
      return res.status(500).json({ error: 'Not configured' });

    // Send ONLY notification (no custom data)
    const result = await sendFCM(
      token,
      {},
      {
        title,
        body,
      }
    );

    console.log(`🔔 Test notification sent: ${title}`);
    res.json({ success: true, result });
  } catch (error) {
    console.error('❌ Test notification error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/test-data-only', async (req, res) => {
  try {
    const {
      token,
      testData = { type: 'test.message', content: 'Hello from server' },
    } = req.body;

    if (!token) return res.status(400).json({ error: 'Token required' });
    if (!serviceAccount)
      return res.status(500).json({ error: 'Not configured' });

    // Send ONLY data (no notification)
    const result = await sendFCM(token, testData, null);

    console.log(`📊 Test data-only message sent:`, testData);
    res.json({ success: true, result, dataSent: testData });
  } catch (error) {
    console.error('❌ Test data-only error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/broadcast', async (req, res) => {
  try {
    const {
      callerName = 'Broadcast',
      callerPhone = '+84999999999',
      withNotification = false,
    } = req.body;

    if (!serviceAccount)
      return res.status(500).json({ error: 'Not configured' });
    if (fcmTokens.size === 0)
      return res.status(400).json({ error: 'No devices' });

    const results = [];
    for (const token of fcmTokens) {
      try {
        const callId = `broadcast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

        const data = {
          type: 'call.started',
          callId,
          callerName,
          callerPhone,
          callerAvatar: 'https://picsum.photos/250/250',
        };

        const notification = withNotification
          ? {
              title: 'Incoming Call',
              body: `${callerName} is calling...`,
            }
          : null;

        await sendFCM(token, data, notification);

        activeCalls.set(callId, {
          callId,
          callerName,
          callerPhone,
          callerAvatar: 'https://picsum.photos/250/250',
          startTime: new Date(),
          token,
        });

        results.push({
          token: token.substring(0, 20) + '...',
          callId,
          success: true,
        });
      } catch (error) {
        results.push({
          token: token.substring(0, 20) + '...',
          success: false,
          error: error.message,
        });
      }
    }

    console.log(
      `📡 Broadcast: ${results.filter((r) => r.success).length}/${results.length} sent`
    );
    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Broadcast error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Serve web UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const configured = loadServiceAccount();
app.listen(PORT, () => {
  console.log('\n🚀 Callx Server Started!');
  console.log(`📱 Web UI: http://localhost:${PORT}`);
  console.log(`🔧 API: http://localhost:${PORT}/api/status`);

  if (!configured) {
    console.log('\n⚠️  Setup Required:');
    console.log('   1. Download Firebase service account JSON');
    console.log('   2. Save as: firebase-service-account.json');
    console.log('   3. Restart server');
  }

  console.log('\n🎯 Ready to control Callx FCM calls!\n');
});
