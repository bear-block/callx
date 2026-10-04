import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateCode} from '../.vitepress/theme/setup/code.ts';
import {buildPlan, choices, defaults, type Selection} from '../.vitepress/theme/setup/plan.ts';

test('all setup combinations generate supported starter files or no code for unavailable products', () => {
  let count = 0;
  function visit(keys: (keyof Selection)[], selection: Selection) {
    const key = keys[0];
    if (key) { for (const [value] of choices[key]) visit(keys.slice(1), {...selection, [key]: value}); return; }
    for (const video of [false, true]) {
      count++;
      const result = generateCode(selection, video);
      if (buildPlan(selection).blockers.length) { assert.deepEqual(result.files, []); continue; }
      assert(result.files.length >= 3);
      assert.equal(new Set(result.files.map(f => f.name)).size, result.files.length);
      const calling = result.files.find(f => /^calling\./.test(f.name))!;
      assert(calling.code.includes('registerPushToken'));
      assert.equal(calling.code.includes('setCamera('), video);
      assert.equal(calling.code.includes('LiveKit'), selection.media === 'livekit');
      assert(result.files.every(f => f.purpose && f.code.endsWith('\n')));
      assert(result.files.every(f => !/\.jsx?$/.test(f.name)), 'TS/TSX only for framework code');
      const presentation = result.files.find(f => /presentation\./i.test(f.name))!;
      assert(presentation.code.includes('incoming') && presentation.code.includes('ended'));
      assert.equal(presentation.code.includes('CallxCallOverlay'), selection.ui === 'supplied');
      if (selection.framework !== 'expo') {
        assert.equal(result.files.some(f => f.name.startsWith('AndroidManifest')), selection.platform !== 'ios');
        assert.equal(result.files.some(f => f.name.startsWith('Info.plist')), selection.platform !== 'android');
      }
    }
  }
  visit(Object.keys(choices) as (keyof Selection)[], defaults);
  assert.equal(count, 3240);
});

test('Expo output uses supported plugins and respects audio-only/platform choices', () => {
  const ios = generateCode({...defaults, framework:'expo', platform:'ios'}, false).files.find(f => f.name === 'app.config.ts')!.code;
  assert(ios.includes('"iosVoip":true') && ios.includes('"androidPush":"none"') && ios.includes('"video":false'));
  assert(!ios.includes('googleServicesFile'));
  const android = generateCode({...defaults, framework:'expo', platform:'android', media:'own'}, true);
  const config = android.files.find(f => f.name === 'app.config.ts')!.code;
  assert(config.includes('"androidPush":"fcm"') && config.includes('"video":true'));
  assert(!config.includes('callx-livekit'));
  assert(android.notes.some(n => n.includes('native adapter')));
});
