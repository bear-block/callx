import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildPlan, choices, defaults, type Selection} from '../.vitepress/theme/setup/plan.ts';

test('every selection produces a supported path or an explicit blocker', () => {
  let tested = 0;
  function visit(keys: (keyof Selection)[], selection: Selection) {
    const key = keys[0];
    if (key) {
      for (const [value] of choices[key]) visit(keys.slice(1), {...selection, [key]: value});
      return;
    }
    const plan = buildPlan(selection); tested++;
    const unavailable = selection.framework === 'native' || selection.ui === 'native' || !['livekit','own'].includes(selection.media) || selection.backend === 'hosted' || (selection.migration === 'callkeep' && !['rn','expo'].includes(selection.framework)) || (selection.migration === 'flutter-callkit' && selection.framework !== 'flutter');
    assert.equal(plan.blockers.length > 0, unavailable, JSON.stringify(selection));
    if (unavailable) { assert.deepEqual(plan.commands, []); assert.deepEqual(plan.steps, []); }
    else {
      assert(plan.steps.length >= 6);
      for (const step of plan.steps) {
        assert(step.check.length > 0);
        assert(existsSync(fileURLToPath(new URL('..'+step.link+'.md', import.meta.url))), step.link);
      }
      const expected = selection.framework === 'flutter' ? 'flutter pub add callx' : selection.framework === 'expo' ? 'npx expo install @bear-block/callx' : 'npm install @bear-block/callx';
      assert.equal(plan.commands[0], expected);
      assert.equal(plan.commands.length, selection.media === 'livekit' ? 2 : 1);
    }
  }
  visit(Object.keys(choices) as (keyof Selection)[], defaults);
  assert.equal(tested, 1620);
});

test('own media and local signaling retain native ownership and credential checkpoints', () => {
  const plan = buildPlan({...defaults, media:'own', backend:'local', ui:'custom'});
  assert(plan.steps.some(s=>s.detail.includes('native media lifecycle')));
  assert(plan.steps.some(s=>s.detail.includes('credentials')));
  assert(plan.steps.some(s=>s.check.includes('Native system integration remains enabled')));
});
