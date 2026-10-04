#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
const args = new Map<string,string>();
for (let i=2;i<process.argv.length;i+=2) {
  if (!['--input','--output','--ffmpeg','--font'].includes(process.argv[i]!) || !process.argv[i+1]) throw Error('Use --input <take> --output <assets> [--ffmpeg <binary>] [--font <ttf>]');
  args.set(process.argv[i]!,process.argv[i+1]!);
}
if (!args.has('--input') || !args.has('--output')) throw Error('Input and output required');
const input=resolve(args.get('--input')!), output=resolve(args.get('--output')!);
const proof=JSON.parse(readFileSync(join(input,'result.json'),'utf8'));
const marks: {name:string;seconds:number}[]=proof.marks;
if(proof.status!=='passed' || !proof.checks.length || proof.checks.some((c:{passed:boolean})=>!c.passed) || marks.at(-1)?.name!=='Complete') throw Error('A passing complete take is required');
if(marks.some((m,i)=>!Number.isFinite(m.seconds)||m.seconds<0||(i>0&&m.seconds<marks[i-1]!.seconds)))throw Error('Invalid timeline');
const duration=marks.at(-1)!.seconds+1, ffmpeg=args.get('--ffmpeg')??'ffmpeg', font=args.get('--font')??'/System/Library/Fonts/Supplemental/Arial.ttf';
if(/[\[\]':;\\]/.test(font))throw Error('Unsupported font path');
const work=mkdtempSync(join(tmpdir(),'callx-lockscreen-render-'));
mkdirSync(output,{recursive:true});
const run=promisify(execFile);
const encode=(a:string[])=>run(ffmpeg,['-hide_banner','-loglevel','error','-y',...a],{maxBuffer:1<<22});
const inside=(r:number,inset=0)=>`lte(pow(max(abs(X-W/2)-(W/2-${inset+r}),0),2)+pow(max(abs(Y-H/2)-(H/2-${inset+r}),0),2),${r*r})`;
try {
  const frame=join(work,'frame.png'),mask=join(work,'mask.png');
  await encode(['-f','lavfi','-i','color=black:s=576x1236','-vf',`format=rgba,geq=r='if(${inside(47,3)},12,92)':g='if(${inside(47,3)},20,111)':b='if(${inside(47,3)},17,103)':a='255*${inside(50)}'`,'-frames:v','1',frame]);
  await encode(['-f','lavfi','-i','color=white:s=540x1200','-vf',`format=gray,geq=lum='255*${inside(32)}*gt(pow(X-270,2)+pow(Y-32,2),289)'`,'-frames:v','1',mask]);
  const inputs=['-i',join(input,'lockscreen.webm'),'-loop','1','-i',frame,'-loop','1','-i',mask];
  let filter=`[0:v]setpts=PTS-STARTPTS,scale=540:1200,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=5,trim=duration=${duration}[recorded];`;
  let previous='recorded';
  for(const [i,segment] of proof.captureSegments.entries()) {
    if(!['incoming','camera-pause'].includes(segment.name)||!Number.isFinite(segment.end)||segment.end>duration)throw Error('Invalid capture segment');
    const frames:{file:string;seconds:number}[]=JSON.parse(readFileSync(join(input,segment.name+'.frames.json'),'utf8'));
    if(frames.length<2||frames.some((f,j)=>!new RegExp(`^${segment.name}/\\d{6}\\.png$`).test(f.file)||!Number.isFinite(f.seconds)||f.seconds<0||f.seconds>segment.end||(j>0&&f.seconds<=frames[j-1]!.seconds)))throw Error('Invalid capture frames');
    const list=join(input,segment.name+'.concat.txt');
    writeFileSync(list,frames.map((f,j)=>`file '${f.file}'\nduration ${(frames[j+1]?.seconds??segment.end)-f.seconds}\n`).join('')+`file '${frames.at(-1)!.file}'\n`);
    inputs.push('-f','concat','-safe','1','-i',list);
    filter+=`[${i+3}:v]setpts=PTS-STARTPTS+${frames[0]!.seconds}/TB,scale=540:1200,setsar=1[frames${i}];[${previous}][frames${i}]overlay=enable='between(t,${frames[0]!.seconds},${segment.end})':eof_action=pass[actual${i}];`;
    previous=`actual${i}`;
  }
  filter+=`[${previous}][2:v]alphamerge[screen];color=c=0xedf3ef:s=1416x1460:r=30:d=${duration}[bg];[bg][1:v]overlay=40:150[phone];[phone][screen]overlay=58:168,`+
    `drawtext=fontfile='${font}':text='hao.dev7 receives a call':fontsize=34:fontcolor=0x12382b:x=58:y=46,`+
    `drawtext=fontfile='${font}':text='React Native / Android 16 / dev':fontsize=22:fontcolor=0x587567:x=58:y=100,`+
    `drawtext=fontfile='${font}':text='VOICE + VIDEO':fontsize=20:fontcolor=0x587567:x=732:y=190,`+
    `drawtext=fontfile='${font}':text='Calls do not wait':fontsize=46:fontcolor=0x12382b:x=728:y=246,`+
    `drawtext=fontfile='${font}':text='for the app UI.':fontsize=46:fontcolor=0x12382b:x=728:y=305,`+
    `drawtext=fontfile='${font}':text='Secure PIN / RequireUnlock':fontsize=24:fontcolor=0x587567:x=732:y=1040,`+
    `drawtext=fontfile='${font}':text='Real FCM + native LiveKit':fontsize=24:fontcolor=0x587567:x=732:y=1090,`+
    `drawtext=fontfile='${font}':text='Camera starts after explicit action':fontsize=24:fontcolor=0x587567:x=732:y=1140,`+
    `drawtext=fontfile='${font}':text='Native controls / unreleased':fontsize=24:fontcolor=0x587567:x=732:y=1190,`+
    `drawtext=fontfile='${font}':text='CALLX / Android emulator / stock camera clips / silent':fontsize=22:fontcolor=0x12382b:x=58:y=1413,`;
  for(const [i,m] of marks.entries()) {
    const text=join(work,`chapter-${i}.txt`);
    const lines:string[]=[];let line='';for(const word of m.name.split(' ')){if((line+' '+word).trim().length>30){lines.push(line);line=word;}else line=(line+' '+word).trim();}lines.push(line);
    writeFileSync(text,`${String(i+1).padStart(2,'0')}\n\n${lines.join('\n')}`);
    filter+=`drawtext=fontfile='${font}':textfile='${text}':fontsize=32:line_spacing=12:fontcolor=0x12382b:x=732:y=530:enable='between(t,${m.seconds},${(marks[i+1]?.seconds??duration)-.001})',`;
  }
  const movie=join(output,'lockscreen.mp4');
  await encode([...inputs,'-filter_complex',filter.slice(0,-1)+'[out]','-map','[out]','-t',String(duration),'-an','-c:v','libx264','-crf','24','-preset','medium','-pix_fmt','yuv420p','-movflags','+faststart','-map_metadata','-1',movie]);
  const poster=Math.max(0,(marks.find(m=>m.name==='Mute and unmute without unlocking')?.seconds??4)-0.5);
  await encode(['-ss',String(poster),'-i',movie,'-frames:v','1','-q:v','3',join(output,'lockscreen.jpg')]);
  const time=(s:number)=>new Date(Math.round(s*1000)).toISOString().slice(11,23);
  writeFileSync(join(output,'lockscreen.vtt'),'WEBVTT\n\n'+marks.map((m,i)=>`${time(m.seconds)} --> ${time((marks[i+1]?.seconds??duration)-.001)}\n${m.name}\n`).join('\n'));
  writeFileSync(join(output,'lockscreen.chapters.json'),JSON.stringify(marks.filter(m=>m.name!=='Complete'),null,2)+'\n');
  console.log(JSON.stringify({duration,output}));
} finally {rmSync(work,{recursive:true,force:true});}
