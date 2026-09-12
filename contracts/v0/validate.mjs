import {readFileSync} from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const safeMax = Number.MAX_SAFE_INTEGER;
const decimal = /^(0|[1-9][0-9]*)$/;

function object(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value;
}

function member(value, values, path) {
  if (!values.includes(value)) throw new Error(`${path} is not supported`);
}

function id(value, path) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} is required`);
}

function timestamp(value, path) {
  if (!Number.isSafeInteger(value) || value < 0 || value > safeMax) {
    throw new Error(`${path} must be a safe non-negative integer`);
  }
}

function counter(value, path) {
  if (typeof value !== 'string' || !decimal.test(value)) {
    throw new Error(`${path} must be a canonical unsigned decimal string`);
  }
}

function version(value, path) {
  if (value !== manifest.contractVersion) throw new Error(`${path} is incompatible`);
}

function validateError(value, path = 'error') {
  const error = object(value, path);
  member(error.code, manifest.errorCodes, `${path}.code`);
  if (typeof error.message !== 'string' || error.message.length === 0) {
    throw new Error(`${path}.message is required`);
  }
  if (typeof error.retryable !== 'boolean') throw new Error(`${path}.retryable must be boolean`);
  if (error.platform !== undefined) {
    const platform = object(error.platform, `${path}.platform`);
    id(platform.domain, `${path}.platform.domain`);
    id(platform.code, `${path}.platform.code`);
  }
}

export function validateCommand(value) {
  const command = object(value, 'command');
  version(command.contractVersion, 'command.contractVersion');
  id(command.operationId, 'command.operationId');
  member(command.type, manifest.commandTypes, 'command.type');
  if (command.deadlineAtMs !== undefined) timestamp(command.deadlineAtMs, 'command.deadlineAtMs');
  if (command.type === 'startCall') {
    const input = object(command.input, 'command.input');
    id(input.callId, 'command.input.callId');
    id(input.displayName, 'command.input.displayName');
    if (command.callId !== undefined || command.value !== undefined) throw new Error('startCall has forbidden fields');
  } else {
    id(command.callId, 'command.callId');
    const hasValue = command.type === 'setMuted' || command.type === 'setHeld';
    if (hasValue !== (typeof command.value === 'boolean')) throw new Error('command.value shape is invalid');
    if (command.input !== undefined) throw new Error('non-start command cannot contain input');
  }
  return true;
}

export function validateResult(value) {
  const result = object(value, 'result');
  version(result.contractVersion, 'result.contractVersion');
  id(result.operationId, 'result.operationId');
  member(result.status, manifest.commandStatuses, 'result.status');
  timestamp(result.completedAtMs, 'result.completedAtMs');
  if (result.status === 'applied') {
    if (result.error !== undefined) throw new Error('applied result cannot contain error');
  } else {
    validateError(result.error, 'result.error');
    if (result.status === 'timedOut' && result.error.code !== 'deadlineExceeded') {
      throw new Error('timedOut requires deadlineExceeded');
    }
  }
  return true;
}

export function validateCall(value, path = 'call') {
  const call = object(value, path);
  id(call.callId, `${path}.callId`);
  member(call.direction, manifest.callDirections, `${path}.direction`);
  member(call.state, manifest.callStates, `${path}.state`);
  if (typeof call.muted !== 'boolean' || typeof call.mediaReady !== 'boolean') {
    throw new Error(`${path} flags must be boolean`);
  }
  if (call.state === 'active' && call.mediaReady !== true) throw new Error('active requires mediaReady');
  if (call.state === 'active' && call.mediaConnectedAtMs === undefined) throw new Error('active requires mediaConnectedAtMs');
  if (call.state === 'ended' && call.mediaReady !== false) throw new Error('ended cannot be mediaReady');
  if (call.state === 'ended') member(call.endReason, manifest.endReasons, `${path}.endReason`);
  if (call.state !== 'ended' && call.endReason !== undefined) throw new Error('live call cannot have endReason');
  for (const field of ['createdAtMs', 'acceptedAtMs', 'mediaConnectedAtMs', 'endedAtMs']) {
    if (call[field] !== undefined) timestamp(call[field], `${path}.${field}`);
  }
  return true;
}

export function validateSnapshot(value) {
  const snapshot = object(value, 'snapshot');
  version(snapshot.contractVersion, 'snapshot.contractVersion');
  counter(snapshot.watermark, 'snapshot.watermark');
  if (!Array.isArray(snapshot.calls) || snapshot.calls.length > 1) throw new Error('v0 snapshot allows at most one call');
  snapshot.calls.forEach((call, index) => validateCall(call, `snapshot.calls[${index}]`));
  return true;
}

export function validateEvent(value) {
  const event = object(value, 'event');
  version(event.contractVersion, 'event.contractVersion');
  id(event.eventId, 'event.eventId');
  counter(event.sequence, 'event.sequence');
  member(event.kind, manifest.eventKinds, 'event.kind');
  member(event.source, manifest.eventSources, 'event.source');
  timestamp(event.observedAtMs, 'event.observedAtMs');
  if (event.callId !== undefined) id(event.callId, 'event.callId');
  if (event.operationId !== undefined) id(event.operationId, 'event.operationId');
  return true;
}

export function validateFixture(value) {
  if (value.command !== undefined) validateCommand(value.command);
  if (value.result !== undefined) validateResult(value.result);
  if (value.snapshot !== undefined) validateSnapshot(value.snapshot);
  if (value.event !== undefined) validateEvent(value.event);
  if (value.call !== undefined) validateCall(value.call);
  return true;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const fixture of fixtures.valid) validateFixture(fixture);
  for (const fixture of fixtures.invalid) {
    let rejected = false;
    try {
      if (fixture.path === 'event.sequence') validateEvent({
        contractVersion: manifest.contractVersion,
        eventId: 'invalid-event', sequence: fixture.value, kind: 'callChanged',
        source: 'local', observedAtMs: 0,
      });
      else if (fixture.path === 'command.operationId') validateCommand({
        contractVersion: manifest.contractVersion,
        operationId: fixture.value,
        type: 'answer', callId: 'call-1',
      });
      else validateFixture({[fixture.path]: fixture.value});
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`invalid fixture accepted: ${fixture.name}`);
  }
  console.log(`${fixtures.valid.length} valid and ${fixtures.invalid.length} invalid fixtures passed`);
}
