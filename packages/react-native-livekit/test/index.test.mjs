import assert from 'node:assert/strict';
import test from 'node:test';
import { CallxLiveKitError, validateConfig } from '../lib/index.js';

test('a configuration needs an http(s) token URL and string headers', () => {
  validateConfig({ tokenUrl: 'https://api.example.com/livekit-token', headers: { authorization: 'Bearer x' } });
  validateConfig({ tokenUrl: 'http://192.168.1.16:8787/api/media-token' });
  assert.throws(() => validateConfig({ tokenUrl: 'wss://media.example.com' }), CallxLiveKitError);
  assert.throws(() => validateConfig({ tokenUrl: 'https://x', headers: { authorization: 1 } }), /must be a string/);
});
