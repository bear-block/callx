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
let activeCalls = new Map(); // callId -> call data
let deviceCalls = new Map(); // token -> Set of callIds for that device
let serviceAccount = null;

// Configuration
const CALL_TIMEOUT_SECONDS = 60; // Auto-miss calls after 60 seconds
const MAX_CALLS_PER_DEVICE = 5; // Maximum simultaneous calls per device

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

// Helper function to clean up call from device tracking
function removeCallFromDevice(callId, token) {
  const deviceCallSet = deviceCalls.get(token);
  if (deviceCallSet) {
    deviceCallSet.delete(callId);
    if (deviceCallSet.size === 0) {
      deviceCalls.delete(token);
    } else {
      deviceCalls.set(token, deviceCallSet);
    }
  }
}

// Helper function to update queue positions after call removal
async function updateQueuePositions(token) {
  const deviceCallSet = deviceCalls.get(token);
  if (!deviceCallSet || deviceCallSet.size === 0) return;

  const deviceCallsArray = Array.from(deviceCallSet)
    .map((callId) => activeCalls.get(callId))
    .filter(Boolean);

  // Sort by start time to maintain FIFO order
  deviceCallsArray.sort((a, b) => a.startTime - b.startTime);

  // Update queue positions and send notifications if needed
  for (let i = 0; i < deviceCallsArray.length; i++) {
    const call = deviceCallsArray[i];
    const newPosition = i + 1;

    if (call.queuePosition !== newPosition) {
      call.queuePosition = newPosition;
      activeCalls.set(call.callId, call);

      // Send queue update to device (optional)
      if (serviceAccount && newPosition === 1) {
        try {
          await sendFCM(token, {
            type: 'call.queue_updated',
            callId: call.callId,
            newPosition: newPosition.toString(),
            totalCalls: deviceCallsArray.length.toString(),
            message: 'You are now first in queue',
          });
        } catch (error) {
          console.error(
            `Failed to send queue update for ${call.callId}:`,
            error.message
          );
        }
      }
    }
  }
}

app.post('/api/call/start', async (req, res) => {
  try {
    const {
      token,
      callId = `call-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      callerName = 'Test Call',
      callerPhone = '+84123456789',
      callerAvatar = 'https://picsum.photos/200/200',
      withNotification = false,
      priority = 'normal', // normal, high, urgent
    } = req.body;

    if (!token) return res.status(400).json({ error: 'Token required' });
    if (!serviceAccount)
      return res.status(500).json({ error: 'Not configured' });

    // Check if device has too many active calls
    const deviceCallSet = deviceCalls.get(token) || new Set();
    if (deviceCallSet.size >= MAX_CALLS_PER_DEVICE) {
      return res.status(429).json({
        error: `Device has maximum calls (${MAX_CALLS_PER_DEVICE})`,
        activeCallsCount: deviceCallSet.size,
      });
    }

    // Calculate call position in queue for this device
    const queuePosition = deviceCallSet.size + 1;

    const data = {
      type: 'call.started',
      callId,
      callerName,
      callerPhone,
      callerAvatar,
      priority,
      queuePosition: queuePosition.toString(),
      totalCalls: queuePosition.toString(),
    };

    const notification = withNotification
      ? {
          title:
            queuePosition === 1
              ? 'Incoming Call'
              : `Incoming Call (${queuePosition})`,
          body:
            queuePosition === 1
              ? `${callerName} is calling...`
              : `${callerName} is calling... (${queuePosition} of ${queuePosition})`,
        }
      : null;

    const result = await sendFCM(token, data, notification);

    // Store call data
    const callData = {
      callId,
      callerName,
      callerPhone,
      callerAvatar,
      priority,
      queuePosition,
      startTime: new Date(),
      token,
    };

    activeCalls.set(callId, callData);

    // Update device call tracking
    deviceCallSet.add(callId);
    deviceCalls.set(token, deviceCallSet);

    console.log(
      `📞 Call started: ${callId} -> ${callerName} (${priority}) [Queue: ${queuePosition}/${queuePosition}]`
    );
    res.json({
      success: true,
      callId,
      queuePosition,
      deviceActiveCallsCount: deviceCallSet.size,
      result,
    });
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

    const duration = Math.floor((new Date() - call.startTime) / 1000);

    if (serviceAccount) {
      // Send end call FCM with complete call data (matching start call structure)
      await sendFCM(call.token, {
        type: 'call.ended',
        callId: call.callId,
        callerName: call.callerName,
        callerPhone: call.callerPhone,
        callerAvatar: call.callerAvatar,
        duration: duration.toString(),
        endTime: new Date().toISOString(),
      });
    }

    // Clean up call tracking
    activeCalls.delete(callId);
    removeCallFromDevice(callId, call.token);

    // Update remaining calls queue positions
    await updateQueuePositions(call.token);

    console.log(
      `📵 Call ended: ${callId} (${call.callerName}) - Duration: ${duration}s [Queue cleanup complete]`
    );

    const remainingCalls = deviceCalls.get(call.token)?.size || 0;
    res.json({
      success: true,
      callId,
      callerName: call.callerName,
      duration,
      remainingCallsOnDevice: remainingCalls,
    });
  } catch (error) {
    console.error('❌ End call error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/call/missed', async (req, res) => {
  try {
    const { callId } = req.body;
    const call = activeCalls.get(callId);

    if (!call) return res.status(404).json({ error: 'Call not found' });

    const duration = Math.floor((new Date() - call.startTime) / 1000);

    if (serviceAccount) {
      // Send missed call FCM with complete call data
      await sendFCM(call.token, {
        type: 'call.missed',
        callId: call.callId,
        callerName: call.callerName,
        callerPhone: call.callerPhone,
        callerAvatar: call.callerAvatar,
        missedTime: new Date().toISOString(),
        duration: duration.toString(),
      });
    }

    // Clean up call tracking
    activeCalls.delete(callId);
    removeCallFromDevice(callId, call.token);

    // Update remaining calls queue positions
    await updateQueuePositions(call.token);

    console.log(
      `📵 Call missed: ${callId} (${call.callerName}) - Duration: ${duration}s [Queue cleanup complete]`
    );

    const remainingCalls = deviceCalls.get(call.token)?.size || 0;
    res.json({
      success: true,
      callId,
      callerName: call.callerName,
      duration,
      remainingCallsOnDevice: remainingCalls,
    });
  } catch (error) {
    console.error('❌ Missed call error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/calls/end-all', async (req, res) => {
  try {
    if (!serviceAccount)
      return res.status(500).json({ error: 'Not configured' });

    const results = [];
    for (const [callId, call] of activeCalls) {
      try {
        const duration = Math.floor((new Date() - call.startTime) / 1000);

        await sendFCM(call.token, {
          type: 'call.ended',
          callId: call.callId,
          callerName: call.callerName,
          callerPhone: call.callerPhone,
          callerAvatar: call.callerAvatar,
          duration: duration.toString(),
          endTime: new Date().toISOString(),
          reason: 'mass_end',
        });

        results.push({
          callId,
          callerName: call.callerName,
          duration,
          success: true,
        });
      } catch (error) {
        results.push({
          callId,
          success: false,
          error: error.message,
        });
      }
    }

    activeCalls.clear();
    deviceCalls.clear(); // Clear all device call tracking
    console.log(
      `📵 Mass end: ${results.filter((r) => r.success).length} calls ended [All queues cleared]`
    );
    res.json({ success: true, results });
  } catch (error) {
    console.error('❌ Mass end error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Auto-expire calls (mark as missed after timeout)
async function checkExpiredCalls() {
  const now = new Date();
  const expiredCalls = [];

  for (const [callId, call] of activeCalls) {
    const duration = Math.floor((now - call.startTime) / 1000);
    if (duration >= CALL_TIMEOUT_SECONDS) {
      expiredCalls.push({ callId, call, duration });
    }
  }

  for (const { callId, call, duration } of expiredCalls) {
    try {
      if (serviceAccount) {
        await sendFCM(call.token, {
          type: 'call.missed',
          callId: call.callId,
          callerName: call.callerName,
          callerPhone: call.callerPhone,
          callerAvatar: call.callerAvatar,
          missedTime: new Date().toISOString(),
          duration: duration.toString(),
          reason: 'timeout',
        });
      }

      // Clean up call tracking
      activeCalls.delete(callId);
      removeCallFromDevice(callId, call.token);

      // Update remaining calls queue positions
      await updateQueuePositions(call.token);

      console.log(
        `⏰ Call auto-expired: ${callId} (${call.callerName}) - ${duration}s [Queue cleanup complete]`
      );
    } catch (error) {
      console.error(`❌ Auto-expire error for ${callId}:`, error.message);
    }
  }
}

// Run auto-expire check every 10 seconds
setInterval(checkExpiredCalls, 10000);

app.get('/api/calls', (req, res) => {
  const calls = Array.from(activeCalls.values()).map((call) => ({
    ...call,
    duration: Math.floor((new Date() - call.startTime) / 1000),
    remainingTime: Math.max(
      0,
      CALL_TIMEOUT_SECONDS - Math.floor((new Date() - call.startTime) / 1000)
    ),
  }));

  // Group calls by device for better organization
  const deviceGroups = {};
  calls.forEach((call) => {
    const deviceKey = call.token.substring(0, 20) + '...';
    if (!deviceGroups[deviceKey]) {
      deviceGroups[deviceKey] = {
        token: call.token,
        calls: [],
        totalCalls: 0,
      };
    }
    deviceGroups[deviceKey].calls.push(call);
    deviceGroups[deviceKey].totalCalls++;
  });

  // Sort calls within each device by queue position
  Object.values(deviceGroups).forEach((group) => {
    group.calls.sort((a, b) => a.queuePosition - b.queuePosition);
  });

  res.json({
    calls,
    deviceGroups,
    timeout: CALL_TIMEOUT_SECONDS,
    maxCallsPerDevice: MAX_CALLS_PER_DEVICE,
    totalActiveDevices: Object.keys(deviceGroups).length,
  });
});

// New endpoint: Get calls for specific device
app.get('/api/calls/device/:token', (req, res) => {
  const { token } = req.params;
  const deviceCallSet = deviceCalls.get(token) || new Set();

  const deviceCallsArray = Array.from(deviceCallSet)
    .map((callId) => activeCalls.get(callId))
    .filter(Boolean)
    .map((call) => ({
      ...call,
      duration: Math.floor((new Date() - call.startTime) / 1000),
      remainingTime: Math.max(
        0,
        CALL_TIMEOUT_SECONDS - Math.floor((new Date() - call.startTime) / 1000)
      ),
    }))
    .sort((a, b) => a.queuePosition - b.queuePosition);

  res.json({
    token,
    calls: deviceCallsArray,
    totalCalls: deviceCallsArray.length,
    maxCalls: MAX_CALLS_PER_DEVICE,
    canAcceptMore: deviceCallsArray.length < MAX_CALLS_PER_DEVICE,
  });
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
      priority = 'normal',
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

        // Check device call limit
        const deviceCallSet = deviceCalls.get(token) || new Set();
        if (deviceCallSet.size >= MAX_CALLS_PER_DEVICE) {
          results.push({
            token: token.substring(0, 20) + '...',
            success: false,
            error: `Max calls reached (${MAX_CALLS_PER_DEVICE})`,
          });
          continue;
        }

        const queuePosition = deviceCallSet.size + 1;

        const data = {
          type: 'call.started',
          callId,
          callerName,
          callerPhone,
          callerAvatar: 'https://picsum.photos/250/250',
          priority,
          queuePosition: queuePosition.toString(),
          totalCalls: queuePosition.toString(),
        };

        const notification = withNotification
          ? {
              title:
                queuePosition === 1
                  ? 'Incoming Call'
                  : `Incoming Call (${queuePosition})`,
              body:
                queuePosition === 1
                  ? `${callerName} is calling...`
                  : `${callerName} is calling... (${queuePosition} of ${queuePosition})`,
            }
          : null;

        await sendFCM(token, data, notification);

        const callData = {
          callId,
          callerName,
          callerPhone,
          callerAvatar: 'https://picsum.photos/250/250',
          priority,
          queuePosition,
          startTime: new Date(),
          token,
        };

        activeCalls.set(callId, callData);

        // Update device call tracking
        deviceCallSet.add(callId);
        deviceCalls.set(token, deviceCallSet);

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
