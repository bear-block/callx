// Call state for the example backend: who calls whom, who answered first, when a call is over,
// and which events each app installation must receive. In memory, for one process; a real
// backend keeps the same rules in its database, in one transaction per change.
import { randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const RETAINED_EVENTS = 100;
const LOCAL_REASONS = new Set(['localHangup', 'declined', 'unanswered', 'busy', 'failed']);

/**
 * @param push      sends a push: ({installation, payload, priority}) => void. Invitations go out
 *                  with high priority; Android stop signals with normal priority.
 * @param schedule  runs a function at a time: (atMs, fn) => void. Used for the ring expiry.
 */
export function createCalls({ push, schedule, now = Date.now, ringMs = 30_000, newId = randomUUID }) {
  const installations = new Map(); // installationId → {installationId, userId, type, token}
  const calls = new Map();         // callId → call
  const inboxes = new Map();       // installationId → {next, events: [{cursor, event}]}
  const listeners = new Map();     // installationId → Set of functions

  const devicesOf = (userId) => [...installations.values()].filter((device) => device.userId === userId);

  function registerPushToken(userId, installationId, type, token) {
    if (!['voip', 'fcm'].includes(type) || !token) throw new HttpError(400, 'type must be voip or fcm, with a token.');
    // An installation belongs to whoever signed in last: a token never rings the previous user.
    installations.set(installationId, { installationId, userId, type, token });
  }

  /** Forgets an installation's token: on sign-out (with the user), or when the push service rejects it. */
  function removeInstallation(installationId, userId) {
    if (userId === undefined || installations.get(installationId)?.userId === userId) installations.delete(installationId);
  }

  function snapshot(call) {
    const { callerInstallationId, ...visible } = call;
    return { schemaVersion: 1, ...visible, revision: String(call.revision) };
  }

  function emit(call, installationId, type, extra = {}) {
    const inbox = inboxes.get(installationId) ?? { next: 1, events: [] };
    inboxes.set(installationId, inbox);
    const event = { schemaVersion: 1, eventId: newId(), type, callId: call.callId,
      revision: String(call.revision), occurredAtMs: now(), ...extra };
    inbox.events.push({ cursor: inbox.next++, event });
    if (inbox.events.length > RETAINED_EVENTS) inbox.events.shift();
    for (const listener of listeners.get(installationId) ?? []) listener();
  }

  /** Events after `cursor` for one installation. `gap` means some were dropped: refetch the calls. */
  function eventsFor(installationId, cursor = 0) {
    const inbox = inboxes.get(installationId) ?? { next: 1, events: [] };
    const events = inbox.events.filter((entry) => entry.cursor > cursor);
    const oldest = inbox.events[0]?.cursor ?? inbox.next;
    return { events: events.map((entry) => entry.event), cursor: inbox.next - 1, gap: cursor > 0 && cursor < oldest - 1 };
  }

  function subscribe(installationId, listener) {
    const set = listeners.get(installationId) ?? new Set();
    listeners.set(installationId, set);
    set.add(listener);
    return () => set.delete(listener);
  }

  function find(userId, callId) {
    const call = calls.get(callId);
    if (!call || (call.callerUserId !== userId && call.calleeUserId !== userId)) {
      throw new HttpError(404, 'No such call.');
    }
    return call;
  }

  function createCall(userId, installationId, { callId, calleeUserId, video = false }) {
    if (!callId || !calleeUserId) throw new HttpError(400, 'callId and calleeUserId are required.');
    const existing = calls.get(callId);
    if (existing) {
      // A retry of the same request gets the same call; anything else reusing the ID is refused.
      if (existing.callerUserId === userId && existing.calleeUserId === calleeUserId) return snapshot(existing);
      throw new HttpError(409, 'callId was already used for another call. Use a fresh UUID.');
    }
    const callees = devicesOf(calleeUserId);
    if (callees.length === 0) throw new HttpError(404, 'The callee has no registered device.');

    const createdAtMs = now();
    const call = {
      callId, callerUserId: userId, callerInstallationId: installationId, calleeUserId,
      displayName: userId, handle: `callx:${userId}`, video: video === true,
      state: 'ringing', revision: 1, createdAtMs, expiresAtMs: createdAtMs + ringMs,
    };
    calls.set(callId, call);

    const invitation = {
      schemaVersion: 1, eventId: newId(), type: 'call.invited', callId,
      revision: '1', displayName: call.displayName, handle: call.handle,
      issuedAtMs: createdAtMs, expiresAtMs: call.expiresAtMs, ...(call.video ? { video: true } : {}),
    };
    for (const installation of callees) push({ installation, payload: invitation, priority: 'high' });
    schedule(call.expiresAtMs, () => expire(callId));
    return snapshot(call);
  }

  /**
   * The LiveKit adapter asks for a room token when a call is answered. For the callee, that
   * request is the answer: the first installation to ask wins, atomically.
   */
  function claimMedia(userId, installationId, callId) {
    const call = find(userId, callId);
    if (call.state === 'ringing' && now() >= call.expiresAtMs) expire(callId);
    if (call.state === 'ended') throw new HttpError(410, 'The call has ended.');

    if (userId === call.callerUserId) {
      if (call.state !== 'accepted') throw new HttpError(409, 'The call has not been accepted yet.');
      return { room: `call-${callId}`, identity: `${userId}:${installationId}` };
    }
    if (call.state === 'accepted') {
      if (call.answeredByInstallationId !== installationId) throw new HttpError(409, 'Answered on another device.');
      return { room: `call-${callId}`, identity: `${userId}:${installationId}` }; // a retry
    }

    call.state = 'accepted';
    call.answeredByInstallationId = installationId;
    call.acceptedAtMs = now();
    call.revision++;
    emit(call, call.callerInstallationId, 'call.accepted', { answeredByInstallationId: installationId });
    for (const device of devicesOf(call.calleeUserId)) {
      if (device.installationId !== installationId) stop(call, device, 'answeredElsewhere');
    }
    return { room: `call-${callId}`, identity: `${userId}:${installationId}` };
  }

  /** An installation ended the call: `reason` is from its own point of view. */
  function endCall(userId, installationId, callId, reason) {
    const call = find(userId, callId);
    if (!LOCAL_REASONS.has(reason)) throw new HttpError(400, `reason must be one of ${[...LOCAL_REASONS].join(', ')}.`);
    if (call.state === 'ended') return snapshot(call); // a retry, or both sides hung up at once
    const byCaller = userId === call.callerUserId;
    if (call.state === 'accepted' && !byCaller && installationId !== call.answeredByInstallationId) {
      return snapshot(call); // a device that lost the answer; the call goes on
    }

    const wasRinging = call.state === 'ringing';
    finish(call, reason);
    if (byCaller) {
      for (const device of devicesOf(call.calleeUserId)) {
        if (wasRinging) stop(call, device, 'callerCancelled');
        else if (device.installationId === call.answeredByInstallationId) emit(call, device.installationId, 'call.ended', { reason: 'remoteEnded' });
      }
    } else {
      emit(call, call.callerInstallationId, 'call.ended', { reason: wasRinging ? reason : 'remoteEnded' });
      if (wasRinging) {
        const elsewhere = reason === 'declined' ? 'declinedElsewhere' : reason;
        for (const device of devicesOf(call.calleeUserId)) {
          if (device.installationId !== installationId) stop(call, device, elsewhere);
        }
      }
    }
    return snapshot(call);
  }

  /** Nobody answered in time: only the backend can know that for every device. */
  function expire(callId) {
    const call = calls.get(callId);
    if (!call || call.state !== 'ringing') return;
    finish(call, 'unanswered');
    emit(call, call.callerInstallationId, 'call.ended', { reason: 'unanswered' });
    for (const device of devicesOf(call.calleeUserId)) stop(call, device, 'unanswered');
  }

  function finish(call, reason) {
    call.state = 'ended';
    call.endReason = reason;
    call.endedAtMs = now();
    call.revision++;
  }

  /**
   * Stops a callee device. The event reaches a running app; on Android a normal-priority push
   * also stops a phone whose app is not running (Callx 3.0.1 and later apply it natively).
   */
  function stop(call, device, reason) {
    emit(call, device.installationId, 'call.ended', { reason });
    if (device.type === 'fcm') {
      push({ installation: device, priority: 'normal',
        payload: { schemaVersion: 1, type: 'call.ended', callId: call.callId, reason } });
    }
  }

  function getCall(userId, callId) {
    return snapshot(find(userId, callId));
  }

  return { registerPushToken, removeInstallation, createCall, claimMedia, endCall, expire, getCall, eventsFor, subscribe };
}
