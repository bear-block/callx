// The call console's single page. Served by tool/call-console.mjs; polls /api/state.
export const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Callx call console</title>
<script src="https://cdn.jsdelivr.net/npm/livekit-client@2.22.3/dist/livekit-client.umd.js"></script>
<style>
  :root { --bg:#f5f4ef; --panel:#fff; --ink:#172c2a; --muted:#5e6e6b; --line:#dfe3dc; --accent:#1f6f5c;
    --danger:#b3261e; --warn:#8a5a00; --mono:ui-monospace,SFMono-Regular,Menlo,monospace; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111615; --panel:#1a2120; --ink:#e4ece9; --muted:#9aaba7;
    --line:#2c3634; --accent:#6fd0b3; --danger:#f2b8b5; --warn:#f0c674; } }
  * { box-sizing:border-box } body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.45 system-ui,sans-serif }
  main { max-width:1200px; margin:0 auto; padding:24px 16px }
  h1 { font-size:20px; margin:0 } h2 { font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin:0 0 10px }
  .meta { color:var(--muted); font-size:12px; margin:4px 0 20px } .grid { display:grid; grid-template-columns:340px 1fr; gap:16px }
  @media (max-width:800px) { .grid { grid-template-columns:1fr } }
  section { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:16px }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px }
  input, select { width:100%; padding:7px 9px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--ink); font:inherit }
  button { padding:7px 12px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--ink); font:inherit; cursor:pointer }
  button.primary { background:var(--accent); border-color:var(--accent); color:var(--panel); margin-top:12px; width:100% }
  button.danger { color:var(--danger) } button:disabled { opacity:.4; cursor:default }
  .device { display:flex; gap:8px; align-items:flex-start; padding:8px; border-radius:6px; cursor:pointer } .device.selected { background:var(--bg) }
  .dot { width:8px; height:8px; border-radius:50%; margin-top:6px; flex:none; background:var(--muted) } .dot.on { background:var(--accent) }
  .token { font:11px var(--mono); color:var(--muted); word-break:break-all }
  .call { border-top:1px solid var(--line); padding:12px 0 } .call:first-of-type { border-top:0; padding-top:0 }
  .head { display:flex; gap:8px; align-items:center; flex-wrap:wrap } .name { font-weight:600 } .id { font:11px var(--mono); color:var(--muted) }
  .badge { font-size:11px; font-weight:600; padding:2px 8px; border-radius:99px; border:1px solid currentColor; color:var(--accent) }
  .badge.ended, .badge.notRung, .badge.failed, .badge.expired { color:var(--muted) } .badge.failed { color:var(--danger) }
  .badge.sent, .badge.delivered { color:var(--warn) }
  .actions { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0 } .actions select { width:auto }
  ol { list-style:none; padding:0; margin:0; font:12px var(--mono) } li { padding:1px 0 } .src { display:inline-block; width:56px; color:var(--muted) }
  .src.server { color:var(--accent) } .src.fcm { color:var(--warn) } .empty { color:var(--muted) }
  #error { color:var(--danger); margin-top:8px } .log { max-height:420px; overflow:auto }
  .check { display:flex; gap:6px; align-items:center; margin-top:10px; color:var(--muted); font-size:12px } .check input { width:auto }
  .audio { font-size:12px; color:var(--muted); margin:4px 0 } .audio b { color:var(--ink); font-weight:600 }
</style>
</head>
<body>
<main>
  <h1>Callx call console</h1>
  <div class="meta" id="meta">Connecting…</div>
  <div class="grid">
    <div>
      <section><h2>Devices</h2><div id="devices" class="empty">Waiting for an example app to report…</div></section>
      <section><h2>Invite</h2>
        <label for="name">Caller name</label><input id="name" value="hao.dev7">
        <label for="expires">Rings for (seconds)</label><input id="expires" type="number" min="5" value="30">
        <label class="check"><input type="checkbox" id="join" checked> Join the call's audio as the caller with this browser's microphone (needs <code>npm run media:server</code>)</label>
        <button class="primary" id="invite">Send invitation</button>
        <div id="error" role="alert"></div>
      </section>
    </div>
    <div>
      <section><h2>Calls</h2><div id="calls" class="empty">No calls yet.</div></section>
      <section><h2>Device log</h2><ol id="log" class="log"></ol></section>
    </div>
  </div>
</main>
<script>
const REASONS = ['remoteEnded','callerCancelled','answeredElsewhere','declinedElsewhere','busy','unanswered','failed'];
const LIVE = new Set(['sent','delivered','ringing','answered','active','held']);
let selected = null; let state = null;
const reasons = {}; // Picked end reasons survive re-rendering.
const callers = {}; // callId -> { room, status, error }: this browser as the caller in the call's LiveKit room.
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
const time = (ms) => new Date(ms).toLocaleTimeString();

async function post(path, payload) {
  $('error').textContent = '';
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) $('error').textContent = result.error;
  refresh();
  return response.ok ? result : null;
}

// The caller's side of the media path: a LiveKit room named after the call, as the app joins it.
async function joinAudio(callId) {
  if (!window.LivekitClient) { $('error').textContent = 'livekit-client did not load (offline?).'; return; }
  if (callers[callId]?.room) return;
  const entry = callers[callId] = { status: 'connecting' };
  try {
    const credentials = await (await fetch('/api/media-token', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callId, identity: 'caller', name: $('name').value }) })).json();
    const { Room, RoomEvent } = LivekitClient;
    const room = entry.room = new Room();
    room.on(RoomEvent.TrackSubscribed, (track) => { if (track.kind === 'audio') document.body.appendChild(track.attach()); });
    room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((element) => element.remove()));
    room.on(RoomEvent.Disconnected, () => { entry.status = 'left'; entry.room = null; });
    await room.connect(credentials.url, credentials.token);
    await room.localParticipant.setMicrophoneEnabled(true);
    entry.status = 'in room';
  } catch (error) { entry.status = 'failed'; entry.error = error.message; entry.room?.disconnect(); entry.room = null; }
}
function leaveAudio(callId) { callers[callId]?.room?.disconnect(); }

function audioLine(c) {
  const entry = callers[c.callId];
  if (!entry) return '';
  const device = entry.room ? [...entry.room.remoteParticipants.values()][0] : null;
  const track = device ? [...device.audioTrackPublications.values()].find((p) => p.isSubscribed) : null;
  const level = device ? Math.round(device.audioLevel * 100) : 0;
  return '<div class="audio">Caller audio: <b>' + esc(entry.status) + '</b>' + (entry.error ? ' — ' + esc(entry.error) : '') +
    (entry.room ? ' · device ' + (device ? 'in room' : 'not in room') + ' · hearing device: <b>' + (track ? 'yes' : 'no') + '</b>' +
      (track ? ' · level ' + level + '%' : '') + ' · mic ' + (entry.room.localParticipant.isMicrophoneEnabled ? 'on' : 'off') : '') + '</div>';
}

function render() {
  $('meta').textContent = (state.serviceAccount ? 'Service account: ' + state.serviceAccount : 'No service account — invites disabled') + ' · ' + state.adb;
  if (!state.devices.some((d) => d.key === selected)) selected = (state.devices.find((d) => d.online) ?? state.devices[0])?.key ?? null;
  $('devices').className = state.devices.length ? '' : 'empty';
  if (state.devices.length) $('devices').innerHTML = state.devices.map((d) =>
    '<div class="device' + (d.key === selected ? ' selected' : '') + '" data-key="' + esc(d.key) + '"><span class="dot' + (d.online ? ' on' : '') + '"></span><div>' +
    '<div>' + esc(d.key) + (d.online ? '' : ' · offline') + '</div><div class="token">' + esc(d.token ? d.token : 'no FCM token — is google-services.json in the build?') + '</div></div></div>').join('');
  const device = state.devices.find((d) => d.key === selected);
  $('invite').disabled = !device?.token || !state.serviceAccount;
  $('calls').className = state.calls.length ? '' : 'empty';
  // Re-rendering would close an open reason picker.
  if (state.calls.length && document.activeElement?.tagName !== 'SELECT') $('calls').innerHTML = state.calls.map((c) => {
    const live = LIVE.has(c.status);
    // The call is over for the device: the caller leaves the room too.
    if (!live && callers[c.callId]?.room) leaveAudio(c.callId);
    return '<div class="call"><div class="head"><span class="name">' + esc(c.name) + '</span><span class="badge ' + esc(c.status) + '">' + esc(c.status) + '</span>' +
      '<span class="id">' + esc(c.callId) + ' · ' + esc(c.device) + '</span></div>' +
      '<div class="actions"><button data-accept="' + esc(c.callId) + '"' + (live ? '' : ' disabled') + '>Remote answers</button>' +
      '<select data-reason="' + esc(c.callId) + '"' + (live ? '' : ' disabled') + '>' + REASONS.map((r) => '<option' + (r === (reasons[c.callId] ?? REASONS[0]) ? ' selected' : '') + '>' + r + '</option>').join('') + '</select>' +
      '<button class="danger" data-end="' + esc(c.callId) + '"' + (live ? '' : ' disabled') + '>Remote ends</button>' +
      (callers[c.callId]?.room ? '<button data-leave="' + esc(c.callId) + '">Leave audio</button>'
        : '<button data-join="' + esc(c.callId) + '"' + (live ? '' : ' disabled') + '>Join audio</button>') + '</div>' + audioLine(c) +
      '<ol>' + c.timeline.map((t) => '<li>' + time(t.at) + ' <span class="src ' + t.source + '">' + t.source + '</span>' + esc(t.text) + '</li>').join('') + '</ol></div>';
  }).join('');
  $('log').innerHTML = (device?.log ?? []).map((line) => '<li>' + esc(line) + '</li>').join('') || '<li class="empty">No log from this device.</li>';
}

async function refresh() {
  try { state = await (await fetch('/api/state')).json(); render(); }
  catch { $('meta').textContent = 'Console server is not running.'; }
}

document.addEventListener('change', (event) => { if (event.target.dataset.reason) reasons[event.target.dataset.reason] = event.target.value; });
document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-key],[data-accept],[data-end],[data-join],[data-leave],#invite');
  if (!target) return;
  if (target.dataset.key) { selected = target.dataset.key; render(); }
  else if (target.dataset.accept) post('/api/signal', { callId: target.dataset.accept, message: 'accept' });
  else if (target.dataset.join) joinAudio(target.dataset.join).then(render);
  else if (target.dataset.leave) leaveAudio(target.dataset.leave);
  else if (target.dataset.end) post('/api/signal', { callId: target.dataset.end, message: 'end', reason: reasons[target.dataset.end] ?? REASONS[0] });
  else post('/api/invite', { device: selected, name: $('name').value, expiresIn: Number($('expires').value) || 30 })
    .then((call) => { if (call && $('join').checked) joinAudio(call.callId); });
});
setInterval(refresh, 1000); refresh();
</script>
</body>
</html>
`;
