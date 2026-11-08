export const stations = {
  burrow: {
    name: 'Burrow FM', description: 'Swung lo-fi beats, mellow keys and a warm bass groove.',
    base: 62, ceiling: 104, swing: .26,
    roots: [45,41,48,43,45,38,41,40],
    chords: [[55,59,60,64],[57,60,64,67],[55,59,62,64],[57,59,62,65],
      [55,59,60,64],[57,60,64,65],[57,60,64,67],[56,59,62,65]],
    melody: [[76,79,74],[72,76,79],[74,76,71],[69,71,74],
      [72,76,79],[77,76,72],[69,72,76],[74,71,68]]
  },
  night: {
    name: 'Night Run', description: 'Wide synth pads, gated drums and a driving analog bassline.',
    base: 84, ceiling: 138, swing: .02,
    roots: [42,38,45,40,42,45,38,37],
    chords: [[54,57,61,64],[54,57,61,64],[57,61,64,68],[56,59,64,66],
      [54,57,61,64],[57,61,64,68],[54,57,62,64],[53,56,59,61]],
    melody: [[73,76,81],[78,76,73],[76,81,80],[76,71,68],
      [73,76,78],[81,80,76],[78,74,73],[71,68,73]]
  }
};

export function intensity(rpm) {
  return Math.min(1, Math.max(0, (rpm ?? 0) / 70));
}

export function tempo(station, rpm) {
  return Math.round(station.base + (station.ceiling - station.base) * intensity(rpm));
}

export function readWheel(payload, now = Date.now()) {
  const data = payload?.measurement;
  if (payload?.status === 'unavailable' || !data || data.provenance !== 'hardware'
      || !['IDLE','ACTIVE'].includes(data.coreStatus)
      || !Number.isSafeInteger(data.rpmMilli) || data.rpmMilli < 0) return {state:'unavailable', rpm:null};
  const observedAt = Date.parse(data.observedAt);
  const receivedAt = Date.parse(data.receivedAt);
  const age = data.staleAfterSeconds;
  const validFor = Number.isFinite(age) && age > 0 ? age * 1000 : 120000;
  if (data.freshness !== 'online' || !Number.isFinite(observedAt) || !Number.isFinite(receivedAt)
      || now - Math.min(observedAt, receivedAt) > validFor || Math.max(observedAt, receivedAt) > now + 10000) {
    return {state:'stale', rpm:null};
  }
  return {state:'live', rpm:data.rpmMilli / 1000};
}

const arrangements = {
  burrow: [
    {kick:[0,7,10], bass:[0,6,10], keys:[0,6,11], lead:[3,9,14]},
    {kick:[0,6,10,15], bass:[0,5,9,13], keys:[0,5,10], lead:[2,6,11]},
    {kick:[0,10], bass:[0,10], keys:[0,10], lead:[6,13]},
    {kick:[0,7,10,14], bass:[0,5,9,13], keys:[0,6,11], lead:[2,7,12]}
  ],
  night: [
    {kick:[0,4,8,12], bass:[0,3,6,8,11,14], keys:[0], lead:[2,6,10]},
    {kick:[0,4,8,12], bass:[0,2,4,6,8,10,12,14], keys:[0], lead:[1,5,9]},
    {kick:[0,8], bass:[0,6,8,14], keys:[0], lead:[4,10]},
    {kick:[0,4,8,12], bass:[0,2,4,6,8,10,12,14], keys:[0], lead:[2,6,11]}
  ]
};

const frequency = (note) => 440 * 2 ** ((note - 69) / 12);

export class RadioEngine {
  constructor(context, destination = context.destination) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    compressor.attack.value = .006;
    this.master.connect(compressor).connect(destination);
    this.bus = null;
    this.timer = null;
    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * .36), context.sampleRate);
    const buffer = this.noise.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) buffer[i] = Math.random() * 2 - 1;
  }

  volume(value) {
    this.master.gain.setTargetAtTime(value * .58, this.context.currentTime, .025);
  }

  start(getMix, onError) {
    if (this.bus) return;
    this.bus = this.context.createGain();
    this.bus.connect(this.master);
    this.space = this.context.createGain();
    const delay = this.context.createDelay(.6);
    delay.delayTime.value = .245;
    const echo = this.context.createGain();
    echo.gain.value = .24;
    this.space.connect(delay).connect(echo).connect(this.bus);
    this.step = 0;
    this.station = null;
    this.next = this.context.currentTime + .035;
    const schedule = () => {
      if (this.context.state !== 'running') return;
      const now = this.context.currentTime;
      if (this.next < now) this.next = now + .035;
      while (this.next < now + .12) {
        const {station, rpm} = getMix();
        const beat = 60 / tempo(station, rpm);
        if (station !== this.station) {
          this.step = 0;
          this.station = station;
        }
        const swing = this.step % 2 === 1 ? beat * .25 * station.swing : 0;
        this.playStep(station, intensity(rpm), this.next + swing, beat);
        this.step = (this.step + 1) % 256;
        this.next += beat / 4;
      }
    };
    schedule();
    this.timer = setInterval(() => {
      try { schedule(); }
      catch (error) {
        this.stop();
        onError?.(error);
      }
    }, 25);
  }

  stop() {
    clearInterval(this.timer);
    const bus = this.bus;
    if (!bus) return;
    this.bus = null;
    const space = this.space;
    bus.gain.setTargetAtTime(0, this.context.currentTime, .012);
    setTimeout(() => {
      space.disconnect();
      bus.disconnect();
    }, 90);
  }

  tone(time, duration, note, voice) {
    const {context, bus} = this;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner?.() ?? context.createGain();
    const hz = voice.hz ?? frequency(note);
    oscillator.type = voice.type;
    oscillator.detune.value = voice.detune ?? 0;
    oscillator.frequency.setValueAtTime(hz, time);
    if (voice.sweep) oscillator.frequency.exponentialRampToValueAtTime(voice.sweep, time + duration * .7);
    filter.frequency.value = voice.cutoff ?? 19000;
    if (panner.pan) panner.pan.value = voice.pan ?? 0;
    const attack = Math.min(voice.attack ?? .009, duration * .4);
    gain.gain.setValueAtTime(.0001, time);
    gain.gain.exponentialRampToValueAtTime(voice.level, time + attack);
    if (voice.hold) gain.gain.exponentialRampToValueAtTime(voice.level * .65, time + duration * .76);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    oscillator.connect(filter).connect(gain).connect(panner).connect(bus);
    if (voice.echo) panner.connect(this.space);
    oscillator.start(time);
    oscillator.stop(time + duration + .02);
  }

  percussion(time, duration, cutoff, level, pan = 0) {
    const {context, bus} = this;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const panner = context.createStereoPanner?.() ?? context.createGain();
    source.buffer = this.noise;
    filter.type = 'highpass';
    filter.frequency.value = cutoff;
    if (panner.pan) panner.pan.value = pan;
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(filter).connect(gain).connect(panner).connect(bus);
    source.start(time);
    source.stop(time + duration);
  }

  playStep(station, motion, time, beat) {
    const step = this.step % 16;
    const bar = Math.floor(this.step / 16);
    const chord = station.chords[bar % 8];
    const root = station.roots[bar % 8];
    const night = station === stations.night;
    const section = Math.floor(bar / 4);
    const pattern = arrangements[night ? 'night' : 'burrow'][section];

    if (pattern.keys.includes(step)) {
      chord.forEach((note, index) => {
        const pan = (index - 1.5) * .27;
        const at = time + (night ? 0 : index * .009);
        this.tone(at, beat * (night ? 3.85 : 1.65), note, {
          type:night ? 'sawtooth' : 'triangle', level:night ? .027 : .064,
          cutoff:night ? 840 + motion * 1100 : 2200, attack:night ? .21 : .012,
          hold:night, pan, echo:true
        });
        this.tone(at, beat * (night ? 3.2 : .47), note + (night ? 0 : 12), {
          type:'sine', level:night ? .018 : .022, detune:night ? (index % 2 ? 7 : -7) : 0,
          attack:night ? .24 : .004, pan:-pan
        });
      });
    }

    if (pattern.bass.includes(step)) {
      const note = root - 12 + (step >= 12 && bar % 2 === 1 ? 7 : 0);
      this.tone(time, beat * (night ? .46 : .78), note, {
        type:night ? 'sawtooth' : 'triangle', level:night ? .15 : .18, cutoff:night ? 360 + motion * 390 : 420,
        attack:.014, hold:true
      });
    }
    if (pattern.kick.includes(step)) {
      this.tone(time, .19, 0, {type:'sine', hz:night ? 154 : 114, sweep:night ? 47 : 42, level:.32, attack:.005});
    }
    if (step === 4 || step === 12) {
      this.percussion(time, night ? .23 : .135, night ? 1330 : 760, night ? .16 : .12);
      this.tone(time,.095,0,{type:'triangle',hz:night ? 210 : 155,sweep:115,level:.038});
      if (night && section === 3) this.percussion(time + .013,.18,1750,.075,.36);
    }
    if (step % 4 === 2 || (motion > .4 && step % 2 === 1)) {
      const open = night && step % 8 === 6;
      this.percussion(time,open ? .12 : .047,6600,step % 4 === 2 ? .05 : .027,step % 4 === 2 ? .27 : -.27);
    }
    if (bar % 4 === 3 && step >= 13 && motion > .45) {
      this.percussion(time,.065,1120,.065,(step-14) * .28);
    }

    const lead = pattern.lead.indexOf(step);
    if (lead >= 0) {
      const note = station.melody[bar % 8][lead];
      this.tone(time, beat * (night ? .85 : .63), note, {
        type:night ? 'triangle' : 'sine', level:night ? .085 : .095, cutoff:2700,
        attack:.022, pan:-.18, echo:true
      });
    }
    if (motion > .58 && section !== 2 && step % 2 === 1) {
      const note = chord[(Math.floor(step/2) + bar) % chord.length] + 12;
      this.tone(time,beat*.33,note,{type:night ? 'triangle' : 'sine',level:.043,cutoff:3900,pan:.25,echo:true});
    }
  }
}
