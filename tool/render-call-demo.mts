#!/usr/bin/env node
// Compose verified screen recordings without replacing, speeding up or reordering actions.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
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
const filter = `[0:v]setpts=PTS-STARTPTS,scale=540:1200,fps=20,tpad=stop_mode=clone:stop_duration=10,trim=duration=${duration},pad=556:1200:0:0:color=0x10251e[l];` +
  `[1:v]setpts=PTS-STARTPTS,scale=540:1200,fps=20,tpad=stop_mode=clone:stop_duration=10,trim=duration=${duration}[r];` +
  `[l][r]hstack=inputs=2,pad=1144:1340:24:100:color=0x10251e,` +
  `drawtext=fontfile='${font}':text='Steven':fontsize=32:fontcolor=white:x=24:y=18,` +
  `drawtext=fontfile='${font}':text='React Native · Android 16':fontsize=20:fontcolor=0xa7dbc8:x=24:y=60,` +
  `drawtext=fontfile='${font}':text='hao.dev7':fontsize=32:fontcolor=white:x=580:y=18,` +
  `drawtext=fontfile='${font}':text='Flutter · Android 13':fontsize=20:fontcolor=0xa7dbc8:x=580:y=60,` +
  `drawtext=fontfile='${font}':text='Android emulators · real FCM + native LiveKit · silent recording':fontsize=20:fontcolor=white:x=24:y=1310[out]`;
const movie = join(output, 'steven-hao.mp4');
function source(name: string): string[] {
  const manifest = join(input, name + '.frames.json');
  if (!existsSync(manifest)) return ['-i', join(input, name + '.mp4')];
  const frames: {file: string; seconds: number}[] = JSON.parse(readFileSync(manifest, 'utf8'));
  if (frames.length < 10 || frames.some((f, i) => !new RegExp(`^${name}/\\d{6}\\.png$`).test(f.file) || !Number.isFinite(f.seconds) || f.seconds < 0 || (i > 0 && f.seconds <= frames[i - 1]!.seconds)))
    throw Error('Invalid frame capture timeline');
  const list = join(input, name + '.concat.txt');
  writeFileSync(list, frames.map((f, i) => `file '${f.file}'\nduration ${Math.max(.04, (frames[i + 1]?.seconds ?? duration) - (i ? f.seconds : 0))}\n`).join('') + `file '${frames.at(-1)!.file}'\n`);
  return ['-f', 'concat', '-safe', '1', '-i', list];
}
await encode([...source('steven-rn'), ...source('hao-flutter'),
  '-filter_complex', filter, '-map', '[out]', '-an', '-c:v', 'libx264', '-crf', '24', '-preset', 'medium',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', movie]);
const videoPhase = marks.find(m => m.name === 'Enable video on both devices')!;
const mutePhase = marks.find(m => m.name === 'Mute and unmute')!;
const previewStart = mutePhase.seconds + 2;
await encode(['-ss', String(previewStart), '-i', movie, '-frames:v', '1', '-q:v', '3', join(output, 'steven-hao.jpg')]);
await encode(['-ss', String(previewStart), '-t', '12', '-i', movie, '-filter_complex',
  'fps=8,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
  '-loop', '0', join(output, 'steven-hao.gif')]);
const time = (seconds: number) => new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
writeFileSync(join(output, 'steven-hao.chapters.json'), JSON.stringify(marks.filter(m => m.name !== 'Complete'), null, 2) + '\n');
writeFileSync(join(output, 'steven-hao.vtt'), 'WEBVTT\n\n' + marks.map((m, i) =>
  `${time(m.seconds)} --> ${time((marks[i + 1]?.seconds ?? duration) - .001)}\n${m.name}\n`).join('\n'));
console.log(JSON.stringify({duration, videoEnabledAt: videoPhase.seconds, previewStart, output}));
