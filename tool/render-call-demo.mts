#!/usr/bin/env node
// Compose verified screen recordings without replacing, speeding up or reordering actions.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--input', '--output', '--ffmpeg', '--font'].includes(process.argv[i]!) || !process.argv[i + 1])
    throw Error('Use --input <take> --output <assets> [--ffmpeg <binary>] [--font <ttf>]');
  args.set(process.argv[i]!, process.argv[i + 1]!);
}
if (!args.has('--input') || !args.has('--output')) throw Error('--input and --output are required');
const input = resolve(args.get('--input')!);
const output = resolve(args.get('--output')!);
const proof = JSON.parse(readFileSync(join(input, 'result.json'), 'utf8'));
if (proof.status !== 'passed' || !proof.checks.length || proof.checks.some((c: {passed: boolean}) => !c.passed))
  throw Error('Only a passing take may be rendered.');
if (proof.caller.name !== 'Steven' || proof.callee.name !== 'hao.dev7') throw Error('Unexpected demo participants');
const marks: {name: string; seconds: number}[] = proof.marks;
if (!marks.length || marks.at(-1)?.name !== 'Complete' || marks.some((m, i) => !Number.isFinite(m.seconds) || m.seconds < 0 || (i > 0 && m.seconds < marks[i - 1]!.seconds)))
  throw Error('Invalid recording timeline');
const duration = marks.at(-1)!.seconds + 1;
const ffmpeg = args.get('--ffmpeg') ?? 'ffmpeg';
const font = args.get('--font') ?? '/System/Library/Fonts/Supplemental/Arial.ttf';
if (/[\[\]':;\\]/.test(font)) throw Error('Font path contains filter syntax');
mkdirSync(output, {recursive: true});
const run = promisify(execFile);
async function encode(parameters: string[]) {
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...parameters], {maxBuffer: 1 << 22});
}
const work = mkdtempSync(join(tmpdir(), 'callx-demo-render-'));
// Original, neutral device frame. Do not redistribute an SDK vendor's skin artwork.
const inside = (radius: number, inset = 0) => `lte(pow(max(abs(X-W/2)-(W/2-${inset + radius}),0),2)+pow(max(abs(Y-H/2)-(H/2-${inset + radius}),0),2),${radius * radius})`;
const frame = join(work, 'frame.png');
const mask = join(work, 'screen-mask.png');
await encode(['-f', 'lavfi', '-i', 'color=black:s=576x1236', '-vf',
  `format=rgba,geq=r='if(${inside(47, 3)},12,92)':g='if(${inside(47, 3)},20,111)':b='if(${inside(47, 3)},17,103)':a='255*${inside(50)}'`,
  '-frames:v', '1', frame]);
await encode(['-f', 'lavfi', '-i', 'color=white:s=540x1200', '-vf',
  `format=gray,geq=lum='255*${inside(32)}*gt(pow(X-270,2)+pow(Y-32,2),289)'`,
  '-frames:v', '1', mask]);
const normalize = (index: number, name: string, label: string) => {
  const offset = proof.recordingOffsets?.[name] ?? 0;
  if (!Number.isFinite(offset) || offset < 0 || offset > 5) throw Error('Invalid recording offset');
  return `[${index}:v]setpts=PTS-STARTPTS,scale=540:1200:force_original_aspect_ratio=decrease,pad=540:1200:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=start_mode=clone:start_duration=${offset}:stop_mode=clone:stop_duration=10,trim=duration=${duration}[${label}];`;
};
let filter = normalize(0, 'steven-rn', 'left') + normalize(1, 'hao-flutter', 'right');
const movie = join(output, 'steven-hao.mp4');
function source(name: string): string[] {
  const manifest = join(input, name + '.frames.json');
  if (!existsSync(manifest)) return ['-i', join(input, name + (existsSync(join(input, name + '.webm')) ? '.webm' : '.mp4'))];
  const frames: {file: string; seconds: number}[] = JSON.parse(readFileSync(manifest, 'utf8'));
  if (frames.length < 10 || frames.some((f, i) => !new RegExp(`^${name}/\\d{6}\\.png$`).test(f.file) || !Number.isFinite(f.seconds) || f.seconds < 0 || (i > 0 && f.seconds <= frames[i - 1]!.seconds)))
    throw Error('Invalid frame capture timeline');
  const list = join(input, name + '.concat.txt');
  writeFileSync(list, frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(.04, (frames[i + 1]?.seconds ?? duration) - (i ? f.seconds : 0))}\n`).join('') + `file '${frames.at(-1)!.file}'\n`);
  return ['-f', 'concat', '-safe', '1', '-i', list];
}
const inputs = [...source('steven-rn'), ...source('hao-flutter'), '-loop', '1', '-i', frame];
const fallbackManifest = join(input, 'steven-fallback.frames.json');
if (existsSync(fallbackManifest)) {
  const frames: {file: string; seconds: number}[] = JSON.parse(readFileSync(fallbackManifest, 'utf8'));
  if (frames.length < 2 || frames.some((f, i) => !/^steven-fallback\/\d{6}\.png$/.test(f.file) || !Number.isFinite(f.seconds) || f.seconds < 0 || f.seconds > duration || (i > 0 && f.seconds <= frames[i - 1]!.seconds))) throw Error('Invalid fallback capture');
  const list = join(input, 'steven-fallback.concat.txt');
  writeFileSync(list, frames.map((f, i) => `file '${f.file}'\nduration ${(frames[i + 1]?.seconds ?? duration) - f.seconds}\n`).join('') + `file '${frames.at(-1)!.file}'\n`);
  inputs.push('-f', 'concat', '-safe', '1', '-i', list);
  filter += `[3:v]setpts=PTS-STARTPTS+${frames[0]!.seconds}/TB,scale=540:1200,setsar=1[actual];[left][actual]overlay=enable='gte(t,${frames[0]!.seconds})':eof_action=pass[leftVerified];`;
} else filter += '[left]null[leftVerified];';
const maskIndex = existsSync(fallbackManifest) ? 4 : 3;
inputs.push('-loop', '1', '-i', mask);
filter += `[${maskIndex}:v]split[maskL][maskR];[leftVerified][maskL]alphamerge[screenL];[right][maskR]alphamerge[screenR];`;
filter += `color=c=0xedf3ef:s=1856x1460:r=30:d=${duration}[stage];[2:v]split[frameL][frameR];` +
  `[stage][frameL]overlay=40:150[stageL];[stageL][frameR]overlay=1240:150[phones];` +
  `[phones][screenL]overlay=58:168[p1];[p1][screenR]overlay=1258:168,` +
  `drawtext=fontfile='${font}':text='Steven':fontsize=38:fontcolor=0x12382b:x=58:y=43,` +
  `drawtext=fontfile='${font}':text='React Native / Android 16':fontsize=22:fontcolor=0x587567:x=58:y=99,` +
  `drawtext=fontfile='${font}':text='hao.dev7':fontsize=38:fontcolor=0x12382b:x=1258:y=43,` +
  `drawtext=fontfile='${font}':text='Flutter / Android 13':fontsize=22:fontcolor=0x587567:x=1258:y=99,` +
  `drawtext=fontfile='${font}':text='CALLX  /  Real FCM + native LiveKit':fontsize=22:fontcolor=0x12382b:x=58:y=1413,` +
  `drawtext=fontfile='${font}':text='Emulators / demo camera clips / silent':fontsize=20:fontcolor=0x587567:x=1258:y=1415,`;
const descriptions: Record<string, string> = {
  'Steven calls hao.dev7': 'Steven sends an invitation. hao.dev7 stays on Home until acceptance.',
  'Accept from native incoming screen': 'Native Answer starts media. The app opens the accepted call.',
  'Switch local camera': 'Switch front and back cameras with cover framing.',
  'Minimize inside app': 'Back shows a mini-call. Expand returns to the same call.',
  'Camera off and branded fallback': 'Both cameras off. App colors and logo fill the PiP.',
  'hao.dev7 ends the call': 'Remote end closes both call presentations.',
  'Home before incoming': 'Home stays visible until native acceptance.',
  'Incoming call on hao.dev7': 'FCM reaches the native incoming presenter.',
  'Answer on hao.dev7': 'One native acceptance starts LiveKit media.',
  'Enable video on both devices': 'Explicit camera actions. Video uses cover.',
  'Mute and unmute': 'Microphone controls follow native call state.',
  'Hold and resume': 'Telecom hold and resume keep the same call.',
  'In-app minimize and expand': 'Return to Home with a live mini-call.',
  'Turn cameras off': 'App branding appears when both cameras are off.',
  'Android system PiP': 'The system keeps the active call visible.',
  'Remote end cleans up both devices': 'Remote end closes both call presentations.',
};
function wrap(text: string, limit = 24) {
  const lines: string[] = []; let line = '';
  for (const word of text.split(' ')) {
    if ((line + ' ' + word).trim().length > limit) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  lines.push(line); return lines.join('\n');
}
filter += `drawtext=fontfile='${font}':text='CALLX / CALL FLOW':fontsize=20:fontcolor=0x587567:x=680:y=240,`;
for (const [i, mark] of marks.entries()) {
  const label = join(work, `action-${i}.txt`), detail = join(work, `detail-${i}.txt`);
  writeFileSync(label, `${String(i + 1).padStart(2, '0')}\n\n${wrap(mark.name)}`);
  writeFileSync(detail, wrap(descriptions[mark.name] ?? (mark.name === 'Complete' ? 'Call ended. Both apps return to Home.' : 'A real action on the same native call.'), 30));
  const enabled = `between(t,${mark.seconds},${(marks[i + 1]?.seconds ?? duration) - .001})`;
  filter += `drawtext=fontfile='${font}':textfile='${label}':fontsize=30:line_spacing=12:fontcolor=0x12382b:x=680:y=440:enable='${enabled}',` +
    `drawtext=fontfile='${font}':textfile='${detail}':fontsize=23:line_spacing=10:fontcolor=0x587567:x=680:y=850:enable='${enabled}',`;
}
filter = filter.slice(0, -1) + '[out]';
try { await encode([...inputs,
  '-filter_complex', filter, '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '24', '-preset', 'medium',
  '-t', String(duration), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', movie]);
} finally { rmSync(work, {recursive: true, force: true}); }
const videoPhase = marks.find(m => m.name === 'Enable video on both devices')!;
const mutePhase = marks.find(m => m.name === 'Mute and unmute')!;
const previewStart = mutePhase.seconds + 2;
await encode(['-ss', String(previewStart), '-i', movie, '-frames:v', '1', '-q:v', '3', join(output, 'steven-hao.jpg')]);
await encode(['-ss', String(previewStart), '-t', '6', '-i', movie, '-filter_complex',
  'fps=10,scale=400:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
  '-loop', '0', join(output, 'steven-hao.gif')]);
const time = (seconds: number) => new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
writeFileSync(join(output, 'steven-hao.chapters.json'), JSON.stringify(marks.filter(m => m.name !== 'Complete'), null, 2) + '\n');
writeFileSync(join(output, 'steven-hao.vtt'), 'WEBVTT\n\n' + marks.map((m, i) =>
  `${time(m.seconds)} --> ${time((marks[i + 1]?.seconds ?? duration) - .001)}\n${m.name}\n`).join('\n'));
console.log(JSON.stringify({duration, videoEnabledAt: videoPhase.seconds, previewStart, output}));
