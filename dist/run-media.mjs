import {runDuration, runPeak, runRpm, runTrace} from './archive.mjs';
import {RadioEngine, stations, tempo} from './music.mjs';

const clipLength = 15000;
const format = new Intl.NumberFormat('en',{maximumFractionDigits:1});

function save(blob,name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),30000);
}

function caption(ctx,text,x,y,font,color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text,x,y);
}

function ticket(canvas,run,clip) {
  const ctx = canvas.getContext('2d');
  const {width,height} = canvas;
  const duration = runDuration(run);
  const peak = runPeak(run);
  ctx.fillStyle = '#101710';
  ctx.fillRect(0,0,width,height);
  ctx.fillStyle = '#20291b';
  ctx.fillRect(22,22,width-44,height-44);
  ctx.strokeStyle = '#aaa270';
  ctx.strokeRect(33.5,33.5,width-67,height-67);
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([3,7]);
  ctx.moveTo(45,height-78);
  ctx.lineTo(width-45,height-78);
  ctx.stroke();
  ctx.restore();
  caption(ctx,'SQUEEK HUB   /   WHEEL ARCHIVE',54,65,'15px monospace','#c7ef87');
  caption(ctx,clip ? 'Radio Postcard' : 'Run Recap',51,123,'bold 48px Georgia','#f5edda');
  const recorded = new Date(run.start).toISOString().slice(0,16).replace('T',' ') + ' UTC';
  caption(ctx,recorded + '  ·  RECORDED SENSOR PASSAGES',54,151,'13px monospace','#c9bc99');
  caption(ctx,format.format(duration/1000) + ' s   /   ' + format.format(peak) + ' PEAK RPM',54,188,'bold 20px monospace','#f6d29a');

  const graphWidth = clip ? width-285 : width-112;
  const graphHeight = height-294;
  ctx.save();
  ctx.translate(55,200);
  ctx.scale(graphWidth/600,graphHeight/96);
  ctx.strokeStyle = '#6b7558';
  ctx.lineWidth = 1;
  ctx.stroke(new Path2D('M0 6H600 M0 50H600 M0 94H600'));
  ctx.strokeStyle = '#d0f991';
  ctx.lineWidth = 1.8;
  ctx.stroke(new Path2D(runTrace(run,duration,Math.max(1,peak))));
  if (clip) {
    const x = 600*Math.min(clip.time/duration,1);
    ctx.strokeStyle = '#f3bb73';
    ctx.stroke(new Path2D('M'+x+' 0V96'));
  }
  ctx.restore();
  if (clip) {
    const rpm = runRpm(run,clip.time);
    ctx.save();
    ctx.translate(width-127,245);
    ctx.rotate(clip.rotation);
    ctx.strokeStyle = '#e4ad72';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0,0,46,0,Math.PI*2);
    for (let i=0;i<8;i++) {
      const angle = i*Math.PI/4;
      ctx.moveTo(8*Math.cos(angle),8*Math.sin(angle));
      ctx.lineTo(43*Math.cos(angle),43*Math.sin(angle));
    }
    ctx.stroke();
    ctx.restore();
    caption(ctx,tempo(clip.station,rpm) + ' BPM',width-174,height-51,'bold 17px monospace','#c7ef87');
  }
  caption(ctx,clip ? clip.station.name.toUpperCase() + '   /   ARCHIVE REPLAY' : 'SQUEEKTOSHI   /   ONE RUN, RECORDED',54,height-51,'bold 14px monospace','#f5edda');
}

export function downloadRecap(run) {
  const canvas = Object.assign(document.createElement('canvas'),{width:960,height:510});
  ticket(canvas,run);
  canvas.toBlob(blob => {
    if (blob) save(blob,'squeek-run-' + run.id + '.png');
  },'image/png');
}

export function setupPostcard() {
  const dialog = document.getElementById('postcard');
  const canvas = document.getElementById('postcard-canvas');
  const start = document.getElementById('postcard-start');
  const stationInput = document.getElementById('postcard-station');
  const render = document.getElementById('postcard-export');
  const status = document.getElementById('postcard-status');
  const close = document.getElementById('postcard-close');
  let run;
  let busy = false;

  const selectedStation = () => stations[stationInput.value];
  const renderPreview = () => {
    const time = Number(start.value);
    const duration = Math.min(clipLength,runDuration(run));
    document.getElementById('postcard-window').textContent =
      (time/1000).toFixed(1) + '–' + ((time+duration)/1000).toFixed(1) + ' s';
    ticket(canvas,run,{time,rotation:0,station:selectedStation()});
  };
  start.addEventListener('input',renderPreview);
  stationInput.addEventListener('change',renderPreview);
  close.addEventListener('click',() => dialog.close());
  dialog.addEventListener('cancel',event => { if (busy) event.preventDefault(); });

  render.addEventListener('click',async () => {
    if (busy) return;
    busy = true;
    for (const control of [render,close,start,stationInput]) control.disabled = true;
    let audio, stream, engine, recorder, frame, timer;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio || !window.MediaRecorder || !canvas.captureStream) throw new Error('Video export is unavailable in this browser.');
      const type = ['video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(value => MediaRecorder.isTypeSupported(value));
      if (!type) throw new Error('No supported video format found.');
      audio = new Audio();
      await audio.resume();
      if (audio.state !== 'running') throw new Error('Could not start the radio audio.');
      const destination = audio.createMediaStreamDestination();
      engine = new RadioEngine(audio,destination);
      engine.volume(.75);
      stream = canvas.captureStream(30);
      stream.addTrack(destination.stream.getAudioTracks()[0]);
      recorder = new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:2500000});
      const station = selectedStation();
      const first = Number(start.value);
      const length = Math.min(clipLength,runDuration(run));
      let rotation = 0;
      let previous = 0;
      const parts = [];
      const done = new Promise((resolve,reject) => {
        recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
        recorder.onstop = () => resolve(new Blob(parts,{type:recorder.mimeType}));
        recorder.onerror = () => reject(new Error('The browser could not record this clip.'));
      });
      const began = performance.now();
      const elapsed = () => Math.min(length,performance.now()-began);
      function draw() {
        const time = elapsed();
        rotation += (time-previous)*runRpm(run,first+time)*Math.PI/30000;
        previous = time;
        ticket(canvas,run,{time:first+time,rotation,station});
        status.textContent = 'Recording ' + Math.floor(time/1000) + ' / ' + Math.ceil(length/1000) + ' s… Keep this tab open.';
        if (time < length) frame = requestAnimationFrame(draw);
      }
      recorder.start();
      try {
        engine.start(() => ({station,rpm:runRpm(run,first+elapsed())}),() => {
          if (recorder.state === 'recording') recorder.stop();
        });
        draw();
        timer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); },length);
        const blob = await done;
        if (!blob.size || elapsed() < length-250) throw new Error('The clip ended early. Try recording it again.');
        const extension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
        save(blob,'squeek-postcard-' + run.id + '.' + extension);
        status.textContent = extension.toUpperCase() + ' postcard downloaded.';
      } finally {
        if (recorder.state === 'recording') recorder.stop();
      }
    } catch (error) {
      status.textContent = error.message || 'The clip could not be recorded.';
    } finally {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      engine?.stop();
      stream?.getTracks().forEach(track => track.stop());
      audio?.close().catch(() => {});
      busy = false;
      for (const control of [render,close,stationInput]) control.disabled = false;
      start.disabled = Number(start.max) === 0;
      renderPreview();
    }
  });

  return record => {
    run = record;
    const max = Math.max(0,runDuration(run)-clipLength);
    start.max = max;
    let best = 0;
    let strongest = -1;
    for (let time=0;time<=max;time+=250) {
      const score = Array.from({length:30},(_,index) => runRpm(run,time+index*500)).reduce((sum,rpm) => sum+rpm,0);
      if (score > strongest) { strongest = score; best = time; }
    }
    start.value = best;
    start.disabled = max === 0;
    status.textContent = 'The busiest window is selected. Adjust it before exporting.';
    renderPreview();
    dialog.showModal();
  };
}
