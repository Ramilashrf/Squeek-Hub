import {downloadRecap} from './run-media.mjs';
import {RadioEngine, readWheel, stations, tempo} from './music.mjs';

import {readArchive, runDuration, runRpm, runPeak, runTrace} from './archive.mjs';

const get = (id) => document.getElementById(id);
const play = get('play');
const volume = get('volume');
const demo = get('demo');
const signal = get('signal');
const media = get('compatible-player');
const audioMode = get('audio-mode');
let compatible = false;
let mediaStation;
const stationButtons = Array.from(document.querySelectorAll('[data-station]'));
const labels = {pending:'Connecting', live:'Live wheel', stale:'Signal stale', unavailable:'Signal unavailable', sample:'Sample signal', replay:'Recorded run', missing:'Replay unavailable'};
const number = new Intl.NumberFormat('en-US', {maximumFractionDigits:1});
let live = {state:'pending', rpm:null};
let sample = false;
let station = stations.burrow;
let playing = false;
let engine;
let selectedRun;
let archive;
let started = false;
let samples = [];
let lastLiveUpdate;
let recording;
let replayMissing = false;
let elapsed = 0;
let startedAt = 0;
let frame;
const elapsedMs = () => elapsed + (playing ? performance.now() - startedAt : 0);

function paintReplay() {
  const current = Math.min(elapsedMs(),runDuration(recording));
  if (current >= runDuration(recording)) {
    pause();
    get('radio-recap').hidden = false;
  }
  paintPlayhead(current);
  showMix();
  if (playing) frame = requestAnimationFrame(paintReplay);
}

function pause() {
  if (!playing) return;
  elapsed = elapsedMs();
  playing = false;
  cancelAnimationFrame(frame);
  if (compatible) media.pause();
  else engine?.stop();
  showPlayback();
}

function wheel() {
  if (recording) return {state:'replay',rpm:runRpm(recording,elapsedMs())};
  if (replayMissing) return {state:'missing',rpm:null};
  return sample ? {state:'sample',rpm:53} : live;
}

function showMix() {
  const {state, rpm} = wheel();
  if (signal.dataset.state !== state || signal.textContent !== labels[state]) {
    signal.dataset.state = state;
    signal.textContent = labels[state];
  }
  get('rpm').textContent = rpm == null ? '—' : number.format(rpm);
  const bpm = tempo(station, rpm);
  get('tempo').textContent = bpm;
  if (compatible) media.playbackRate = bpm / station.base;
  get('station-name').textContent = station.name;
  get('station-description').textContent = station.description;
  get('mini-station').textContent = station.name;
  get('mini-signal').textContent = labels[state] + ' · ' + bpm + ' BPM';
}

function showPlayback() {
  document.body.dataset.playing = playing;
  get('play-icon').textContent = playing ? 'Ⅱ' : '▶';
  const playbackLabel = playing ? 'Pause radio' : 'Play radio';
  play.setAttribute('aria-label', playbackLabel);
  get('mini-play').textContent = get('play-icon').textContent;
  get('mini-play').setAttribute('aria-label', playbackLabel);
  get('mini-player').hidden = !started;
}

function updateVolume() {
  const value = Number(volume.value);
  get('mini-volume').value = volume.value;
  get('level').textContent = value + '%';
  engine?.volume(value / 100);
  media.volume = value / 100;
  media.muted = value === 0;
}

function prepareMedia() {
  if (mediaStation === station) return;
  const file = station === stations.burrow ? 'burrow' : 'night';
  media.src = './assets/audio/' + file + '.mp3';
  mediaStation = station;
}

function setAudioMode(value) {
  compatible = value;
  audioMode.textContent = value ? 'Use live synth' : 'Use compatible audio';
  get('audio-mode-note').hidden = !value;
}

function showAudioError(message) {
  const error = get('audio-error');
  error.textContent = message;
  error.hidden = false;
}

async function resumeAudio(context) {
  let timer;
  try {
    await Promise.race([
      context.resume(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Audio startup timed out')), 1800);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function startPlayback() {
  if (play.disabled) return;
  play.disabled = true;
  audioMode.disabled = true;
  get('audio-error').hidden = true;
  try {
    if (navigator.audioSession) {
      try { navigator.audioSession.type = 'playback'; } catch {}
    }
    if (compatible) {
      prepareMedia();
      showMix();
      updateVolume();
      await media.play();
    } else {
      if (!engine || engine.context.state === 'closed') {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw new Error('AudioContext unavailable');
        engine = new RadioEngine(new Audio());
        engine.context.addEventListener('statechange', () => {
          if (playing && !compatible && engine.context.state !== 'running') {
            pause();
            showAudioError('Audio was interrupted. Press Play radio to resume.');
          }
        });
      }
      await resumeAudio(engine.context);
      if (engine.context.state !== 'running') throw new Error('Playback did not start');
      updateVolume();
    }
    if (recording && elapsed >= runDuration(recording)) elapsed = 0;
    startedAt = performance.now();
    playing = true;
    started = true;
    if (!compatible) engine.start(() => ({station, rpm:wheel().rpm}), error => {
      console.warn('Radio scheduling stopped',error);
      pause();
      showAudioError('Live synth stopped. Try compatible audio.');
    });
    showPlayback();
    if (recording) paintReplay();
  } catch (error) {
    pause();
    console.warn('Radio playback did not start',error);
    showAudioError(compatible ? 'Audio could not start. Try Play radio again.' :
      'Live synth could not start. Try compatible audio.');
  } finally {
    play.disabled = false;
    audioMode.disabled = false;
  }
}

play.addEventListener('click', () => {
  if (playing) pause();
  else startPlayback();
});
audioMode.addEventListener('click', () => {
  if (play.disabled) return;
  pause();
  setAudioMode(!compatible);
  startPlayback();
});

get('mini-play').addEventListener('click', () => play.click());
get('mini-volume').addEventListener('input', event => {
  volume.value = event.target.value;
  updateVolume();
});
volume.addEventListener('input', updateVolume);
for (const button of stationButtons) {
  button.addEventListener('click', () => {
    station = stations[button.dataset.station];
    for (const item of stationButtons) item.setAttribute('aria-pressed', String(item === button));
    if (compatible && playing && mediaStation !== station) {
      prepareMedia();
      const requested = station;
      media.play().catch(() => {
        if (station !== requested || !playing) return;
        pause();
        showAudioError('The channel could not start. Press Play radio to retry.');
      });
    }
    showMix();
  });
}

demo.addEventListener('click', () => {
  sample = !sample;
  demo.setAttribute('aria-pressed', String(sample));
  demo.textContent = sample ? 'Back to live signal' : 'Try sample signal';
  showMix();
  syncStudioAnimation();
});

async function poll() {
  let delay = 10000;
  try {
    const response = await fetch('https://api.squeekchain.com/v1/status', {
      credentials:'omit', signal:AbortSignal.timeout(6500)
    });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      if (Number.isFinite(retryAfter) && retryAfter > 0) delay = Math.max(delay, Math.min(retryAfter * 1000, 300000));
      throw new Error('Telemetry unavailable');
    }
    live = readWheel(await response.json());
  } catch {
    live = {state:'unavailable',rpm:null};
  }
  showMix();
  const now = Date.now();
  paintWheelCam(now);
  syncStudioAnimation();
  samples = samples.filter(point => point.time >= now - 300000);
  samples.push({time:now, rpm:live.state === 'live' ? live.rpm : null});
  paintChart(now);
  setTimeout(poll, delay);
}

function paintChart(now) {
  const values = samples.filter(point => Number.isFinite(point.rpm));
  const max = Math.max(20, Math.ceil(Math.max(0,...values.map(point => point.rpm))/20)*20);
  let last;
  let position;
  const path = samples.map(point => {
    if (!Number.isFinite(point.rpm)) {
      last = undefined;
      return '';
    }
    position = [596 - (now - point.time)/300000*592, 116 - point.rpm/max*110];
    const instruction = last && point.time - last.time < 25000 ? 'L' : 'M';
    last = point;
    return instruction + position.join(' ');
  }).join(' ');
  get('chart-line').setAttribute('d',path);
  const dot = get('chart-point');
  dot.toggleAttribute('hidden', !last);
  if (last) {
    dot.setAttribute('cx',position[0]);
    dot.setAttribute('cy',position[1]);
  }
  get('chart-latest').textContent = (last ? number.format(last.rpm) : '—') + ' RPM';
  get('chart-scale').textContent = '0–' + max + ' RPM';
  get('chart-note').textContent = values.length
    ? values.length + ' live readings collected on this page. Gaps indicate missing readings.'
    : 'Waiting for live readings. Sample and replay signals are excluded.';
}

export async function selectRun(id) {
  if (selectedRun === id) return;
  const request = {};
  selectRun.request = request;
  selectedRun = id;
  pause();
  recording = undefined;
  replayMissing = false;
  elapsed = 0;
  sample = false;
  demo.setAttribute('aria-pressed','false');
  demo.textContent = 'Try sample signal';
  demo.hidden = Boolean(id);
  get('replay-strip').hidden = !id;
  get('restart').hidden = true;
  get('radio-recap').hidden = true;
  get('replay-chart').hidden = true;
  get('replay-progress').value = 0;
  play.disabled = Boolean(id);
  showMix();
  syncStudioAnimation();
  if (!id) return;
  get('replay-info').textContent = 'Loading recorded run…';
  try {
    const runs = await loadRuns();
    if (selectRun.request !== request) return;
    recording = runs.find(run => run.id === id);
    if (!recording) throw new Error('Run not found');
    get('replay-info').textContent = 'Recorded ' + new Date(recording.start).toLocaleString();
    get('restart').hidden = false;
    get('replay-progress').max = runDuration(recording)/1000;
    get('replay-line').setAttribute('d',runTrace(recording,runDuration(recording),Math.max(1,runPeak(recording))));
    get('replay-chart').hidden = false;
    paintPlayhead(0);
    play.disabled = false;
  } catch {
    if (selectRun.request !== request) return;
    replayMissing = true;
    get('replay-info').textContent = 'Recorded run unavailable';
  }
  showMix();
}

function loadRuns() {
  archive ??= readArchive('./runs.json').catch(error => { archive = undefined; throw error; });
  return archive;
}

const replayGraph = get('replay-chart').querySelector('svg');
function formatTime(ms) {
  const seconds = Math.floor(ms/1000);
  return Math.floor(seconds/60) + ':' + String(seconds%60).padStart(2,'0');
}
function paintPlayhead(ms) {
  const duration = runDuration(recording);
  get('replay-progress').value = ms/1000;
  get('replay-time').textContent = formatTime(ms) + ' / ' + formatTime(duration);
  get('replay-cursor').setAttribute('transform','translate(' + (600*ms/duration) + ' 0)');
}
function seek(ms) {
  if (!recording) return;
  elapsed = ms;
  startedAt = performance.now();
  paintPlayhead(ms);
  showMix();
}
get('replay-progress').addEventListener('input',event => seek(Number(event.target.value)*1000));
replayGraph.addEventListener('click',event => {
  if (!recording) return;
  const bounds = replayGraph.getBoundingClientRect();
  seek(Math.min(1,Math.max(0,(event.clientX-bounds.left)/bounds.width))*runDuration(recording));
});
get('radio-recap').addEventListener('click',() => { if (recording) downloadRecap(recording); });
get('restart').addEventListener('click',() => seek(0));

function paintWheelCam(now) {
  const cam = document.querySelector('.wheel-cam');
  const rpm = live.state === 'live' ? live.rpm : null;
  if (rpm !== null) lastLiveUpdate = now;
  cam.dataset.moving = String(rpm > 0);
  if (rpm > 0) cam.style.setProperty('--cam-spin',Math.max(.12,60/rpm) + 's');
  get('cam-needle').setAttribute('transform','rotate(' + (Math.min(100,rpm ?? 0)*1.3-65) + ' 60 60)');
  get('cam-rpm').textContent = (rpm === null ? '—' : number.format(rpm)) + ' RPM';
  get('cam-status').textContent = rpm === null
    ? lastLiveUpdate ? labels[live.state] + ' · last reading ' + new Date(lastLiveUpdate).toLocaleTimeString() : labels[live.state]
    : rpm > 0 ? 'Live · Wheel turning' : 'Live · Wheel resting';
}

const studioArt = document.querySelector('.radio-art');
const studioPose = studioArt.querySelector('.studio-pose');
const studioAnimation = studioArt.querySelector('.studio-animation');
const animationButton = studioArt.querySelector('.studio-motion');
const stillCredit = studioArt.querySelector('.still-credit');
const motionCredit = studioArt.querySelector('.motion-credit');
const desktop = matchMedia('(min-width: 1024px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let animationEnabled = true;

function studioCanRun() {
  return desktop.matches && (sample || (live.state === 'live' && live.rpm > 0)) &&
    animationEnabled && !reducedMotion.matches;
}

function syncStudioAnimation() {
  const hasReading = desktop.matches && (sample || live.state === 'live');
  const moving = hasReading && (sample || live.rpm > 0);
  studioArt.toggleAttribute('data-studio-scene',hasReading);
  studioPose.hidden = !hasReading;
  stillCredit.hidden = hasReading;
  motionCredit.hidden = !hasReading;
  animationButton.hidden = !moving || reducedMotion.matches;
  if (hasReading) {
    const pose = moving ? studioPose.dataset.run : studioPose.dataset.rest;
    if (studioPose.getAttribute('src') !== pose) studioPose.src = pose;
    const sceneLabel = sample ? 'SAMPLE SIGNAL' : moving ? 'WHEEL TURNING' : 'WHEEL IDLE';
    motionCredit.textContent = 'STUDIO ANIMATION · ' + sceneLabel;
  }
  if (!studioCanRun()) {
    studioAnimation.pause();
    studioAnimation.hidden = true;
    return;
  }
  if (!studioAnimation.getAttribute('src')) studioAnimation.src = studioAnimation.dataset.src;
  if (studioAnimation.paused) studioAnimation.play().catch(() => {});
}

studioAnimation.addEventListener('playing',() => {
  if (studioCanRun()) studioAnimation.hidden = false;
  else studioAnimation.pause();
});
animationButton.addEventListener('click',() => {
  animationEnabled = !animationEnabled;
  animationButton.textContent = animationEnabled ? 'Pause animation' : 'Play animation';
  syncStudioAnimation();
});
desktop.addEventListener('change',syncStudioAnimation);
reducedMotion.addEventListener('change',syncStudioAnimation);
showMix();
syncStudioAnimation();
poll();
