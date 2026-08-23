"use strict";
/* ============================ 4. STATE ============================ */
const S = {
  sa:440, raga:'desh', range:'mandra', len:4, bpm:90, mode:'fixed',
  autoNext:true, blind:false, strict:false, ladder:false, rmsGate:.012,
  droneReg:-1, dronePartner:7, taal:'none',
  view:'riyaz',
  kind:'riyaz',            /* riyaz | comp | orn */
  phase:'idle', running:false,
  phrase:[], durs:[], glides:[], playDur:0, hits:[], cursor:0, revealed:true,
  alap:{stage:0, cleared:0, auto:true, nyasStart:0, nyasNeed:1000, holding:false},
  paste:{text:'', matras:6, parsed:[]},
  retSthayi:false, playAlong:false, stableNeed:3, leftHold:false, curSemi:0,
  grammar:'rules', match:'forgiving', vol:1.0, thekaVol:.85, pluckGap:1.15,
  tabla:null, droneGain:null, droneTimer:null, droneSrcs:[], droneIdx:0, droneNext:0,
  micInterval:null, comp2:null, articulated:true, lastHitSemi:null, awayFrames:0,
  comp:{kind:'core', pick:0, lines:[], idx:0, done:[]},
  orn:{sel:'meend', spec:null, samples:[], t0:0, lastSound:0, capturing:false},
  stats:{phrases:0, cleared:0, streak:0, best:0, sinceBump:0},
  ctx:null, master:null, drone:null, droneOn:false,
  stream:null, analyser:null, buf:null, micOn:false,
  stableNote:null, stableCount:0, lastMissFlash:0, lastHz:0,
  scan:{}, timeouts:[], raf:null, windowStart:0, windowEnd:0,
  taalTimer:null, taalNext:0, taalIdx:0
};
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const freqOf = semi => S.sa * Math.pow(2, semi/12);
const centsFreq = c => S.sa * Math.pow(2, c/1200);
const range = () => RANGES[S.range];

function poolSemis(){
  const {lo,hi} = range(), pcs = new Set(RAGAS[S.raga].pc), out = [];
  for (let s=lo; s<=hi; s++) if (pcs.has(mod12(s))) out.push(s);
  return out;
}
/* madhya-octave scale used for paltas */
function scaleSemis(){
  const pcs = RAGAS[S.raga].pc.slice().sort((a,b)=>a-b);
  return pcs.concat([12]);
}

/* ============================ 5. AUDIO ============================ */
/* iOS drops Web Audio to a quiet, earpiece-routed session unless we claim one.
   A looping silent element plus an explicit audioSession type keeps the flute
   on the media channel at full speaker volume. */
const SILENT_WAV = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACA' + 'gICA'.repeat(100);
let silentEl = null;
function audioSessionType(t){
  try{ if (navigator.audioSession) navigator.audioSession.type = t; }catch(e){}
}
function primeAudio(){
  const ctx = audio();
  if (!silentEl){
    silentEl = new Audio(SILENT_WAV);
    silentEl.loop = true; silentEl.volume = 0.001;
    silentEl.setAttribute('playsinline','');
    silentEl.play().catch(()=>{});
  }
  if (ctx.state === 'suspended') ctx.resume();
}
function audio(){
  if (!S.ctx){
    const AC = window.AudioContext || window.webkitAudioContext;
    S.ctx = new AC();
    audioSessionType('playback');
    S.master = S.ctx.createGain(); S.master.gain.value = 1.0;
    /* gentle glue so the drone, metronome and flute can all be loud without clipping */
    S.comp2 = S.ctx.createDynamicsCompressor();
    S.comp2.threshold.value = -16; S.comp2.knee.value = 14;
    S.comp2.ratio.value = 3; S.comp2.attack.value = .005; S.comp2.release.value = .18;
    S.out = S.ctx.createGain(); S.out.gain.value = S.vol;
    S.master.connect(S.comp2); S.comp2.connect(S.out); S.out.connect(S.ctx.destination);
  }
  if (S.ctx.state === 'suspended') S.ctx.resume();
  return S.ctx;
}
function setVolume(v){
  S.vol = v;
  if (S.out) S.out.gain.setTargetAtTime(v, S.ctx.currentTime, .02);
  $('volVal').textContent = Math.round(v*100) + '%';
  saveSettings();
}
function voice(t, dur, freqAt, prevFreq, glide){
  /* freqAt: either a number, or {curve:Float32Array} */
  const ctx = audio(), end = t + dur;
  const nominal = typeof freqAt === 'number' ? freqAt : freqAt.nominal;
  const lp = ctx.createBiquadFilter();
  lp.type='lowpass'; lp.frequency.value = clamp(nominal*3.5, 800, 6000); lp.Q.value = .7;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(.0001, t);
  amp.gain.exponentialRampToValueAtTime(.55, t + .045);
  amp.gain.setValueAtTime(.55, Math.max(t + .046, end - .09));
  amp.gain.exponentialRampToValueAtTime(.0001, end);
  lp.connect(amp); amp.connect(S.master);

  const o1 = ctx.createOscillator(); o1.type='sine';
  const o2 = ctx.createOscillator(); o2.type='sine';
  const g2 = ctx.createGain(); g2.gain.value = .14;
  if (typeof freqAt === 'number'){
    if (prevFreq > 0){
      const gl = glide || .04;
      o1.frequency.setValueAtTime(prevFreq, t);
      o1.frequency.exponentialRampToValueAtTime(freqAt, t + gl);
      o2.frequency.setValueAtTime(prevFreq*3, t);
      o2.frequency.exponentialRampToValueAtTime(freqAt*3, t + gl);
    } else { o1.frequency.setValueAtTime(freqAt, t); o2.frequency.setValueAtTime(freqAt*3, t); }
  } else {
    o1.frequency.setValueCurveAtTime(freqAt.curve, t, dur);
    o2.frequency.setValueCurveAtTime(freqAt.curve3, t, dur);
  }
  o1.connect(lp); o2.connect(g2); g2.connect(lp);
  o1.start(t); o2.start(t); o1.stop(end + .05); o2.stop(end + .05);

  const n = ctx.createBufferSource();
  const len = Math.floor(ctx.sampleRate * .09);
  const b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  for (let i=0;i<len;i++) d[i] = (Math.random()*2-1)*(1 - i/len);
  n.buffer = b;
  const bp = ctx.createBiquadFilter();
  bp.type='bandpass'; bp.frequency.value = clamp(nominal*2, 400, 4000); bp.Q.value=.9;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(.16, t); ng.gain.exponentialRampToValueAtTime(.0001, t + .09);
  n.connect(bp); bp.connect(ng); ng.connect(S.master);
  n.start(t); n.stop(t + .1);
}
const playNote = (f,t,d,prev,gl) => voice(t, d, f, prev, gl);

function playContour(points, t, dur){
  /* points: [{t:0..1, cents}] -> frequency curve */
  const N = clamp(Math.round(dur*250), 32, 3000);
  const c1 = new Float32Array(N), c3 = new Float32Array(N);
  for (let i=0;i<N;i++){
    const x = i/(N-1);
    const f = centsFreq(interpCents(points, x));
    c1[i] = f; c3[i] = f*3;
  }
  voice(t, dur, {curve:c1, curve3:c3, nominal:c1[Math.floor(N/2)]}, 0);
}
function interpCents(points, x){
  if (x <= points[0].t) return points[0].cents;
  for (let i=1;i<points.length;i++){
    if (x <= points[i].t){
      const a = points[i-1], b = points[i];
      const k = b.t === a.t ? 0 : (x - a.t)/(b.t - a.t);
      return a.cents + (b.cents - a.cents)*k;
    }
  }
  return points[points.length-1].cents;
}
function click(at, kind){
  const ctx = audio();
  const spec = {sam:[1650,.15], div:[1250,.10], soft:[1000,.055], khali:[760,.042]}[kind];
  const o = ctx.createOscillator(); o.type='triangle'; o.frequency.value = spec[0];
  const g = ctx.createGain();
  g.gain.setValueAtTime(spec[1], at); g.gain.exponentialRampToValueAtTime(.0001, at + .06);
  o.connect(g); g.connect(S.master); o.start(at); o.stop(at + .07);
}
function chime(ok){
  const t = audio().currentTime;
  (ok ? [0,7,12] : [-5]).forEach((s,i) => playNote(freqOf(s), t + i*.09, .34, 0));
}
/* ---- tanpura -------------------------------------------------------------
   Sine drones do not sound like a tanpura. What makes one is the jawari: a
   thread under each string at the bridge makes the string graze the curved
   bone as it decays, throwing off a shifting cascade of upper partials. So
   each string is a real plucked string — Karplus–Strong, a noise burst
   circulating through a delay line the length of one period — with a soft
   nonlinearity standing in for the grazing bridge, and the four strings are
   plucked in turn so the overlap becomes the drone.                        */
const ksCache = new Map();
function ksBuffer(freq, dur, damp){
  const key = freq.toFixed(2) + ':' + dur;
  if (ksCache.has(key)) return ksCache.get(key);
  const ctx = audio(), sr = ctx.sampleRate;
  const N = Math.max(2, Math.round(sr/freq));
  const len = Math.floor(sr*dur);
  const buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
  const line = new Float32Array(N);
  let p = 0;
  for (let i=0;i<N;i++){ p = p*.32 + (Math.random()*2-1)*.68; line[i] = p; }
  const decay = Math.exp(-Math.log(1200)/(sr*dur));
  let idx = 0;
  for (let i=0;i<len;i++){
    const cur = line[idx], nxt = line[(idx+1)%N];
    let v = (cur*(1-damp) + nxt*damp) * decay;
    v = v - .22*v*v*v;                 /* jawari: keeps the upper partials alive */
    line[idx] = v;
    out[i] = cur;
    idx = (idx+1) % N;
  }
  const fi = Math.floor(sr*.003);
  for (let i=0;i<fi;i++) out[i] *= i/fi;
  const fo = Math.floor(sr*.25);
  for (let i=0;i<fo;i++) out[len-1-i] *= i/fo;
  if (ksCache.size > 24) ksCache.clear();
  ksCache.set(key, buf);
  return buf;
}
function droneStrings(){
  const sa = freqOf(S.droneReg*12);
  const first = S.dronePartner === 'none' ? sa : sa*Math.pow(2, S.dronePartner/12);
  /* the classic four: companion string, two Sa, then the kharaj an octave down */
  return [first, sa, sa, sa/2];
}
function pluck(freq, at, gain){
  const ctx = audio();
  const src = ctx.createBufferSource();
  src.buffer = ksBuffer(freq, 4.2, freq < 150 ? .42 : .34);
  const g = ctx.createGain(); g.gain.value = gain;
  const shimmer = ctx.createBiquadFilter();
  shimmer.type = 'peaking'; shimmer.frequency.value = 2400; shimmer.Q.value = .9; shimmer.gain.value = 5;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 6500;
  src.connect(shimmer); shimmer.connect(lp); lp.connect(g); g.connect(S.droneGain);
  src.start(at);
  S.droneSrcs.push(src);
  if (S.droneSrcs.length > 12) S.droneSrcs.splice(0, S.droneSrcs.length-12);
}
function stopDrone(){
  if (S.droneTimer){ clearInterval(S.droneTimer); S.droneTimer = null; }
  if (S.droneGain){
    const ctx = audio();
    S.droneGain.gain.cancelScheduledValues(ctx.currentTime);
    S.droneGain.gain.setValueAtTime(S.droneGain.gain.value, ctx.currentTime);
    S.droneGain.gain.linearRampToValueAtTime(.0001, ctx.currentTime + .6);
    const dead = S.droneSrcs.slice();
    setTimeout(() => dead.forEach(x => { try{ x.stop(); }catch(e){} }), 800);
  }
  S.droneSrcs = []; S.droneOn = false;
  $('dronePill').classList.remove('on');
}
function startDrone(){
  primeAudio();
  const ctx = audio();
  if (!S.droneGain){
    S.droneGain = ctx.createGain();
    S.droneGain.connect(S.master);
  }
  S.droneGain.gain.cancelScheduledValues(ctx.currentTime);
  S.droneGain.gain.setValueAtTime(.0001, ctx.currentTime);
  S.droneGain.gain.linearRampToValueAtTime(.55, ctx.currentTime + 1.2);
  S.droneSrcs = [];
  const strings = droneStrings();
  S.droneIdx = 0; S.droneNext = ctx.currentTime + .2;
  S.droneOn = true;
  $('dronePill').classList.add('on');
  S.droneTimer = setInterval(() => {
    const ctx = S.ctx;
    if (ctx.state !== 'running'){ ctx.resume(); S.droneNext = ctx.currentTime + .2; return; }
    const now = ctx.currentTime;
    if (S.droneNext < now - .5) S.droneNext = now + .1;
    let guard = 0;
    while (S.droneNext < now + .4 && guard++ < 8){
      const i = S.droneIdx % strings.length;
      /* the kharaj string is plucked a little softer, the companion a little louder */
      const g = i === 3 ? .34 : i === 0 ? .46 : .40;
      pluck(strings[i], S.droneNext, g);
      S.droneNext += S.pluckGap;
      S.droneIdx++;
    }
  }, 60);
}
const toggleDrone = () => S.droneOn ? stopDrone() : startDrone();
function restartDrone(){ if (S.droneOn){ ksCache.clear(); stopDrone(); setTimeout(startDrone, 120); } }

/* ---- tabla ----------------------------------------------------------------
   The dayan is tuned to the drone Sa. A tabla's treble head is unusual in that
   its overtones are close to harmonic, which is why it sounds pitched rather
   than like a tom, so it is built from near-harmonic partials over a short
   noise transient. The bayan gets a low body with a downward bend for open
   strokes (the heel easing off) and a dead thud for closed ones.            */
function tablaBus(){
  if (!S.tabla){
    const ctx = audio();
    S.tabla = ctx.createGain();
    S.tabla.gain.value = S.thekaVol;
    S.tabla.connect(S.master);
  }
  return S.tabla;
}
function dayan(at, o){
  const ctx = audio(), out = tablaBus();
  const f = freqOf(S.droneReg*12) * 2;            /* dayan sits on Sa */
  const parts = [1, 2, 3.0, 4.0, 5.4], amps = [1, .5, .3, .16, .08];
  const dec = o.decay;
  parts.forEach((mult, i) => {
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(f*mult*(o.bright||1), at);
    /* the head tightens for a moment on the strike */
    osc.frequency.exponentialRampToValueAtTime(f*mult*(o.bright||1)*0.995, at + .05);
    const g = ctx.createGain();
    const peak = o.amp*amps[i]*0.42;
    const d = dec * (i ? 1/(1 + i*0.55) : 1);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + .002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(.03, d));
    osc.connect(g); g.connect(out);
    osc.start(at); osc.stop(at + Math.max(.05, d) + .02);
  });
  /* strike transient */
  const n = ctx.createBufferSource();
  const L = Math.floor(ctx.sampleRate*.03), bf = ctx.createBuffer(1,L,ctx.sampleRate), dd = bf.getChannelData(0);
  for (let i=0;i<L;i++) dd[i] = (Math.random()*2-1)*(1-i/L);
  n.buffer = bf;
  const bp = ctx.createBiquadFilter();
  bp.type='bandpass'; bp.frequency.value = o.closed ? 2600 : 1700; bp.Q.value = .8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(o.amp*(o.closed ? .5 : .3), at);
  ng.gain.exponentialRampToValueAtTime(.0001, at + .03);
  n.connect(bp); bp.connect(ng); ng.connect(out);
  n.start(at); n.stop(at + .04);
}
function bayan(at, o){
  const ctx = audio(), out = tablaBus();
  const f = freqOf(S.droneReg*12) * 0.72;
  const osc = ctx.createOscillator(); osc.type = 'sine';
  const f0 = f*(o.bend ? Math.pow(2, o.bend/12) : 1);
  osc.frequency.setValueAtTime(f0, at);
  if (o.bend) osc.frequency.exponentialRampToValueAtTime(f, at + o.decay*0.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(.0001, at);
  g.gain.exponentialRampToValueAtTime(o.amp*.65, at + .006);
  g.gain.exponentialRampToValueAtTime(.0001, at + Math.max(.05, o.decay));
  const lp = ctx.createBiquadFilter(); lp.type='lowpass';
  lp.frequency.value = o.closed ? 240 : 620; lp.Q.value = .6;
  osc.connect(lp); lp.connect(g); g.connect(out);
  osc.start(at); osc.stop(at + Math.max(.08, o.decay) + .03);

  const n = ctx.createBufferSource();
  const L = Math.floor(ctx.sampleRate*.05), bf = ctx.createBuffer(1,L,ctx.sampleRate), dd = bf.getChannelData(0);
  for (let i=0;i<L;i++) dd[i] = (Math.random()*2-1)*(1-i/L);
  n.buffer = bf;
  const nl = ctx.createBiquadFilter(); nl.type='lowpass'; nl.frequency.value = 400;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(o.amp*.5, at);
  ng.gain.exponentialRampToValueAtTime(.0001, at + .05);
  n.connect(nl); nl.connect(ng); ng.connect(out);
  n.start(at); n.stop(at + .06);
}
/* one syllable = a bayan part, a dayan part, or both (that is what "dha" is) */
const BOL = {
  na:  {d:{amp:.85, decay:.75}},
  ta:  {d:{amp:.8,  decay:.45, bright:1.0}},
  tin: {d:{amp:.8,  decay:1.05, bright:1.0}},
  ti:  {d:{amp:.5,  decay:.06, bright:1.6, closed:true}},
  te:  {d:{amp:.5,  decay:.06, bright:1.5, closed:true}},
  ra:  {d:{amp:.42, decay:.05, bright:1.45, closed:true}},
  ki:  {d:{amp:.45, decay:.05, bright:1.75, closed:true}},
  ke:  {b:{amp:.5,  decay:.09, closed:true}},
  ka:  {b:{amp:.72, decay:.10, closed:true}},
  kat: {b:{amp:.72, decay:.10, closed:true}},
  ge:  {b:{amp:.9,  decay:.5,  bend:2}},
  ghe: {b:{amp:.9,  decay:.5,  bend:2}},
  tu:  {b:{amp:.85, decay:.7,  bend:3}},
  dha: {b:{amp:.9,  decay:.5,  bend:2}, d:{amp:.85, decay:.75}},
  dhin:{b:{amp:.9,  decay:.5,  bend:2}, d:{amp:.8,  decay:1.05}},
  dhi: {b:{amp:.85, decay:.45, bend:2}, d:{amp:.75, decay:.55}}
};
function playBol(name, at){
  const o = BOL[String(name).toLowerCase()];
  if (!o) return;
  if (o.b) bayan(at, o.b);
  if (o.d) dayan(at, o.d);
}

/* ---- taal ---- */
const TAALS = {
  teentaal:{m:16, div:[0,4,8,12], khali:[8],
    theka:['Dha','Dhin','Dhin','Dha','Dha','Dhin','Dhin','Dha',
           'Dha','Tin','Tin','Ta','Ta','Dhin','Dhin','Dha']},
  ektaal:  {m:12, div:[0,2,4,6,8,10], khali:[2,6,10],
    theka:['Dhin','Dhin','Dha.Ge','Ti.Ra.Ki.Ta','Tu','Na',
           'Kat','Ta','Dha.Ge','Ti.Ra.Ki.Ta','Dhin','Na']},
  jhaptaal:{m:10, div:[0,2,5,7], khali:[5],
    theka:['Dhi','Na','Dhi','Dhi','Na','Ti','Na','Dhi','Dhi','Na']},
  keharwa: {m:8,  div:[0,4], khali:[4],
    theka:['Dha','Ge','Na','Ti','Na','Ka','Dhi','Na']},
  rupak:   {m:7,  div:[0,3,5], khali:[0],
    theka:['Tin','Tin','Na','Dhin','Na','Dhin','Na']},
  dadra:   {m:6,  div:[0,3], khali:[3],
    theka:['Dha','Dhin','Na','Dha','Tin','Na']}
};
function stopTaal(){
  if (S.taalTimer){ clearInterval(S.taalTimer); S.taalTimer = null; }
  $('matraChip').textContent = 'laya off';
  $('matraChip').className = 'matra';
  renderTheka(-1);
}
function startTaal(){
  stopTaal();
  const t = TAALS[S.taal]; if (!t) return;
  primeAudio();
  const ctx = audio();
  S.taalIdx = 0; S.taalNext = ctx.currentTime + .15;
  S.taalTimer = setInterval(() => {
    const ctx = S.ctx;
    /* a suspended context has a frozen clock — reset the cursor and wait for
       the unlock instead of scheduling everything into the past */
    if (ctx.state !== 'running'){
      ctx.resume();
      S.taalNext = ctx.currentTime + .15;
      return;
    }
    const now = ctx.currentTime, beat = 60/S.bpm;
    if (S.taalNext < now - .25) S.taalNext = now + .05;   /* resync after a stall */
    let guard = 0;
    while (S.taalNext < now + .2 && guard++ < 16){
      const i = S.taalIdx % t.m;
      const bols = String(t.theka[i]).split('.');
      bols.forEach((b, k) => playBol(b, S.taalNext + (k*beat)/bols.length));
      const delay = (S.taalNext - now)*1000, shown = i;
      setTimeout(() => {
        $('matraChip').textContent = t.theka[shown].replace(/\./g,'') + '  ' + (shown+1) + '/' + t.m;
        $('matraChip').className = 'matra' + (shown===0 ? ' sam' : t.khali.includes(shown) ? ' khali' : '');
        renderTheka(shown);
      }, Math.max(0, delay));
      S.taalNext += beat; S.taalIdx++;
    }
  }, 25);
}
const refreshTaal = () => S.taal === 'none' ? stopTaal() : startTaal();
function renderTheka(cur){
  const el = $('thekaStrip'); if (!el) return;
  const t = TAALS[S.taal];
  if (!t){ el.innerHTML = ''; return; }
  el.innerHTML = t.theka.map((b,i) =>
    '<span class="bol'+(i===cur?' on':'')+(i===0?' sam':'')+(t.khali.includes(i)?' khali':'')+
    '">'+b.replace(/\./g,'')+'</span>').join('');
}

/* ============================ 6. GENERATION ============================ */
function phraseLen(){ return S.len === 'rand' ? 2 + Math.floor(Math.random()*4) : S.len; }

/* ---- free walk: any note of the raga, no grammar (interval drilling) ---- */
function walkPhrase(n, validate){
  const p = poolSemis();
  if (p.length < 2) return [0];
  const steps = [-3,-2,-2,-1,-1,1,1,2,2,3];
  for (let a=0; a<120; a++){
    const idx = [Math.floor(Math.random()*p.length)], deltas = [];
    for (let i=1;i<n;i++){
      let d, next, tries = 0, good = false;
      do{
        d = steps[Math.floor(Math.random()*steps.length)];
        next = idx[i-1] + d; tries++;
        good = next >= 0 && next < p.length && next !== idx[i-1] &&
               !(deltas.length >= 2 && deltas[i-2] === d && deltas[i-3] === d);
      } while (tries < 30 && !good);
      if (!good) break;
      deltas.push(next - idx[i-1]); idx.push(next);
    }
    if (idx.length !== n) continue;
    const jump = deltas.some(d => Math.abs(d) >= 2);
    const turn = deltas.some((d,i) => i>0 && Math.sign(d) !== Math.sign(deltas[i-1]));
    if (n >= 3 && !jump && !turn) continue;
    const phrase = idx.map(i => p[i]);
    if (validate && grammarFault(phrase, S.raga)) continue;
    return phrase;
  }
  return null;
}

/* ---- chalan: chain authentic fragments so phrases move like the raga ---- */
function chalanPhrase(n){
  const g = GRAMMAR[S.raga];
  if (!g || !g.motifs.length) return null;
  const {lo,hi} = range();
  const pc = x => ((x % 12) + 12) % 12;
  const fits = ph => ph.every(x => x >= lo && x <= hi);
  const shifts = [0,12,-12,24,-24];
  const placed = mot => {
    const out = [];
    for (const sh of shifts){ const t = mot.map(x => x + sh); if (fits(t)) out.push(t); }
    return out;
  };

  for (let a=0; a<60; a++){
    /* start on any placement of any motif */
    const starts = [];
    for (const mot of g.motifs) starts.push(...placed(mot));
    if (!starts.length) return null;
    let ph = starts[Math.floor(Math.random()*starts.length)].slice();

    /* grow well past the length we need, so there are several windows to choose from */
    const want = n + 4;
    let guard = 0;
    while (ph.length < want && guard++ < 30){
      const tail = ph[ph.length-1], joins = [];
      for (const mot of g.motifs)
        for (const t of placed(mot)) if (t[0] === tail) joins.push(t);
      if (!joins.length) break;
      ph = ph.concat(joins[Math.floor(Math.random()*joins.length)].slice(1));
    }
    for (let i=ph.length-1; i>0; i--) if (ph[i] === ph[i-1]) ph.splice(i,1);
    if (ph.length < n) continue;

    /* every window of the right length that is still legal and lands well */
    const wins = [];
    for (let i=0; i + n <= ph.length; i++){
      const w = ph.slice(i, i+n);
      if (grammarFault(w, S.raga)) continue;
      if (n >= 3 && g.end.length && !g.end.includes(pc(w[n-1]))) continue;
      if (n >= 3 && new Set(w).size < 3) continue;
      wins.push(w);
    }
    if (wins.length) return wins[Math.floor(Math.random()*wins.length)];
  }
  return null;
}

function generatePhrase(){
  const n = phraseLen();
  let out = null;
  if (S.grammar === 'chalan') out = chalanPhrase(n) || walkPhrase(n, true);
  else if (S.grammar === 'rules') out = walkPhrase(n, true) || chalanPhrase(n);
  else out = walkPhrase(n, false);
  if (out) return out;
  /* last resort: never leave the student with nothing */
  const p = poolSemis(), res = [p[Math.floor(Math.random()*p.length)]];
  while (res.length < n){
    const c = p[Math.floor(Math.random()*p.length)];
    if (c !== res[res.length-1]) res.push(c);
  }
  return res;
}

function buildComposition(){
  const raga = S.raga, k = S.comp.kind, pick = S.comp.pick;
  if (k === 'core'){
    const c = CORE[raga];
    const sets = [
      {n:'Aroh — the ascent', lines:[c.aroh], d:c.note},
      {n:'Avroh — the descent', lines:[c.avroh], d:c.note},
      {n:'Aroh & Avroh', lines:[c.aroh, c.avroh], d:c.note},
      {n:'Pakad — the catch-phrase', lines:c.pakad, d:'The phrase that identifies the raga. ' + c.note}
    ];
    return sets[clamp(pick,0,sets.length-1)];
  }
  if (k === 'pack'){
    if (raga !== 'yaman') return {n:'Yaman pack', lines:[], d:'This pack is Yaman material — switch the raga to Yaman to use it.'};
    const sec = PACK_SECTIONS[clamp(pick,0,PACK_SECTIONS.length-1)];
    let raw;
    if (sec.k === 'full'){
      raw = [].concat(YAMAN_PACK.sthayiA, YAMAN_PACK.sthayiA, YAMAN_PACK.sthayiB, YAMAN_PACK.sthayiA,
                      YAMAN_PACK.antaraA, YAMAN_PACK.antaraA, YAMAN_PACK.antaraB, YAMAN_PACK.sthayiA);
    } else raw = YAMAN_PACK[sec.k];
    let parsed = parseNotation(raw);
    if (sec.ret && S.retSthayi){
      const mukhda = parseNotation(YAMAN_PACK.sthayiA);
      const out = [];
      parsed.forEach(l => { out.push(l); mukhda.forEach(mk => out.push(mk)); });
      parsed = out;
    }
    return {n:sec.n, lines:parsed.map(x => x.ev.map(e => ({s:e.s, d:e.d}))),
      grid:{matras:YAMAN_PACK.matras, rows:parsed.map(x => x.grid), free:!!sec.free},
      free:!!sec.free, ret:!!sec.ret, d:sec.d};
  }
  if (k === 'paste'){
    const parsed = S.paste.parsed || [];
    return {n:'Your notation', lines:parsed.map(x => x.ev.map(e => ({s:e.s, d:e.d}))),
      grid:{matras:S.paste.matras, rows:parsed.map(x => x.grid), free:!S.paste.matras},
      free:!S.paste.matras,
      d: parsed.length ? parsed.length + ' lines loaded.' : 'Paste sargam above and press Load notation.'};
  }
  if (k === 'gat'){
    const g = GATS[raga], t = TAALS.teentaal;
    const which = pick === 0 ? ['sthayi'] : pick === 1 ? ['antara'] : ['sthayi','antara'];
    const lines = [];
    which.forEach(part => {
      const row = g[part];
      for (let v=0; v<row.length; v+=4){
        const cells = row.slice(v, v+4);
        const line = [];
        cells.forEach(c => {
          if (c === null){ if (line.length) line[line.length-1].d += 1; }
          else line.push({s:c, d:1});
        });
        if (line.length) lines.push(line);
      }
    });
    const rows = [];
    which.forEach(part => {
      const row = g[part];
      for (let v=0; v<row.length; v+=4)
        rows.push(row.slice(v, v+4).map(c => c === null ? {hold:true} : {notes:[c]}));
    });
    return {n:'Gat — ' + which.join(' & '), lines, grid:{matras:16, rows, cols:4, labels:which},
      d:'Teentaal, 16 matras. Each row is one vibhag of four. Sthayi sits low; antara climbs past taar Sa. ' +
        'Written for practice rather than transcribed from a gharana.'};
  }
  if (k === 'palta'){
    const sc = scaleSemis(), pt = PALTAS[clamp(pick,0,PALTAS.length-1)];
    const span = Math.max(...pt.p);
    const up = [], down = [];
    for (let r=0; r + span < sc.length; r++) up.push(pt.p.map(o => sc[r+o]));
    for (let r=sc.length-1; r - span >= 0; r--) down.push(pt.p.map(o => sc[r-o]));
    return {n:pt.n + ' — aroh then avroh', lines:up.concat(down), d:pt.d + ' · ' + up.length + ' up, ' + down.length + ' down'};
  }
  const set = LINES[raga][clamp(pick,0,LINES[raga].length-1)];
  return {n:set.n, lines:set.l, d:'Short characteristic movement — repeat each line after the guru.'};
}

/* ---- ornament specs ---- */
function pickTwo(p, minGap, maxGap){
  for (let i=0;i<80;i++){
    const a = p[Math.floor(Math.random()*p.length)];
    const b = p[Math.floor(Math.random()*p.length)];
    const g = Math.abs(b-a);
    if (g >= minGap && g <= maxGap) return [a,b];
  }
  return [p[0], p[Math.min(1,p.length-1)]];
}
function neighbour(p, n, dir){
  const i = p.indexOf(n);
  const j = clamp(i + dir, 0, p.length-1);
  return p[j === i ? clamp(i - dir, 0, p.length-1) : j];
}
function buildGesture(id){
  const p = poolSemis().filter(s => s >= -3 && s <= 14);
  const pool = p.length > 2 ? p : poolSemis();
  const beat = 60/S.bpm;
  if (id === 'mix') id = GESTURES[Math.floor(Math.random()*(GESTURES.length-1))].id;

  if (id === 'meend'){
    const [a,b] = pickTwo(pool, 2, 7);
    return {id, label:'Meend · ' + swaraText(a) + ' → ' + swaraText(b), notes:[a,b], dur:beat*2.6,
      points:[{t:0,cents:a*100},{t:.14,cents:a*100},{t:.74,cents:b*100},{t:1,cents:b*100}],
      tip:'One breath, fingers rolling — no tongue between the notes.'};
  }
  if (id === 'kan'){
    const n = pool[Math.floor(Math.random()*pool.length)];
    const g = neighbour(pool, n, Math.random() < .5 ? 1 : -1);
    return {id, label:'Kan · ' + swaraText(g) + ' into ' + swaraText(n), notes:[g,n], dur:beat*2.2,
      points:[{t:0,cents:g*100},{t:.07,cents:g*100},{t:.14,cents:n*100},{t:1,cents:n*100}],
      tip:'The grace note is a brush, not a beat — barely there, then settle.'};
  }
  if (id === 'andolan'){
    const n = pool[Math.floor(Math.random()*pool.length)];
    const amp = 45, cyc = 3.5, pts = [];
    for (let i=0;i<=48;i++) pts.push({t:i/48, cents:n*100 + amp*Math.sin(2*Math.PI*cyc*(i/48))});
    return {id, label:'Andolan on ' + swaraText(n), notes:[n], dur:beat*3.2, points:pts, centre:n, amp,
      tip:'A slow sway of about a quarter-tone. Move the breath, not the fingers.'};
  }
  if (id === 'gamak'){
    const n = pool[Math.floor(Math.random()*pool.length)];
    const lo = neighbour(pool, n, -1);
    const half = Math.abs(n - lo)*50, mid = n*100 - half, cyc = 5;
    const pts = [];
    for (let i=0;i<=64;i++) pts.push({t:i/64, cents:mid + half*Math.cos(2*Math.PI*cyc*(i/64))});
    return {id, label:'Gamak · ' + swaraText(n) + ' against ' + swaraText(lo), notes:[n,lo],
      dur:beat*2.6, points:pts, centre:n, amp:half,
      tip:'Full-swara swing, driven from the diaphragm. Heavier and faster than andolan.'};
  }
  if (id === 'murki'){
    const i = clamp(pool.indexOf(pool[Math.floor(Math.random()*pool.length)]), 1, pool.length-2);
    const n = pool[i], up = pool[i+1], dn = pool[i-1];
    const seq = [n, up, n, dn, n], pts = [];
    seq.forEach((s,k) => {
      const t0 = k/seq.length, t1 = (k+1)/seq.length;
      pts.push({t:t0, cents:s*100}, {t:t1-.005, cents:s*100});
    });
    return {id, label:'Murki around ' + swaraText(n), notes:seq, dur:beat*1.6, points:pts, seq,
      tip:'Five notes inside one beat — light fingers, one continuous breath.'};
  }
  const n = pool[Math.floor(Math.random()*pool.length)];
  return {id:'sustain', label:'Sustain ' + swaraText(n), notes:[n], dur:beat*6,
    points:[{t:0,cents:n*100},{t:1,cents:n*100}], centre:n,
    tip:'Steady as a tanpura string. Watch the trace stay flat.'};
}

/* ============================ 7. RENDER ============================ */
function renderCards(){
  const el = $('cards'); el.innerHTML = '';
  S.phrase.forEach((semi,i) => {
    const c = document.createElement('div'); c.className = 'card';
    const hidden = !S.revealed, s = swara(semi);
    c.innerHTML =
      '<div class="nm">' + (hidden ? (S.hits[i] ? '✓' : '?') : swaraHTML(semi)) + '</div>' +
      '<div class="dv">' + (hidden ? '·' : s.dev) + '</div>' +
      '<div class="hz">' + (hidden ? '— Hz' : freqOf(semi).toFixed(1)) + '</div>';
    if (S.hits[i]) c.classList.add('hit');
    el.appendChild(c);
  });
}
const markCard = (i,c) => { const e = $('cards').children[i]; if (e) e.classList.add(c); };
const clearCardClass = c => [...$('cards').children].forEach(e => e.classList.remove(c));

function renderRibbon(){
  const r = $('ribbon');
  [...r.querySelectorAll('.tick,.saptak-bg')].forEach(t => t.remove());
  const {lo,hi} = range(), span = hi - lo, pos = s => ((s-lo)/span)*100;
  for (let k=Math.floor(lo/12); k<=Math.floor(hi/12); k++){
    const a = Math.max(lo, k*12), b = Math.min(hi, k*12 + 11.999);
    if (b <= a) continue;
    const d = document.createElement('div'); d.className = 'saptak-bg';
    d.style.left = pos(a)+'%'; d.style.width = (pos(b)-pos(a))+'%';
    if (k % 2) d.style.background = 'transparent';
    d.innerHTML = '<span>' + (SAPTAK[String(k)]||'') + '</span>';
    r.appendChild(d);
  }
  /* label only what fits: Sa always, then fill outward while there is room */
  const semis = poolSemis();
  const W = r.clientWidth || 700;
  const need = W < 520 ? 34 : 30;
  const px = s => pos(s)/100*W;
  const label = new Set();
  semis.forEach(s => { if (mod12(s) === 0) label.add(s); });
  semis.forEach(s => {
    if (label.has(s)) return;
    let ok = true;
    label.forEach(l => { if (Math.abs(px(l) - px(s)) < need) ok = false; });
    if (ok) label.add(s);
  });
  semis.forEach(s => {
    const t = document.createElement('div');
    t.className = 'tick'; t.dataset.semi = s; t.style.left = pos(s)+'%';
    if (label.has(s)) t.innerHTML = '<span>' + swaraText(s) + '</span>';
    r.appendChild(t);
  });
}
const highlightTargetTick = semi => [...$('ribbon').querySelectorAll('.tick')]
  .forEach(t => t.classList.toggle('tgt', semi !== null && +t.dataset.semi === semi));

const FL = {
  W:800, bodyX:24, bodyW:752, bodyY:28, bodyH:56,
  emb:118, holes:[300,368,436,522,590,658],
  nodes:[232,478,712], threads:[[240,9],[252,4],[486,9]],
  handA:'#7FA8C9', handB:'#B79BD4'
};
const FINGERS = ['index','middle','ring'];
/* logical coordinates assume the blow hole at the left; mirror for a left-side hold */
const fx  = x => S.leftHold ? FL.W - x : x;
const frx = (x,w) => S.leftHold ? FL.W - x - w : x;

function handNames(){
  /* the hand nearest the mouth covers holes 1–3 */
  return S.leftHold ? {upper:'Right', lower:'Left'} : {upper:'Left', lower:'Right'};
}
function renderFlute(){
  const h = handNames(), H = FL.holes;
  const mob = (window.innerWidth || 1000) < 760;
  const fsHand = mob ? 14 : 10, fsNum = mob ? 15 : 10.5, fsFin = mob ? 12 : 9, fsBlow = mob ? 13 : 10;
  let d = '<defs><linearGradient id="bamboo" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="#6B5A45"/><stop offset="38%" stop-color="#9C8563"/>' +
    '<stop offset="72%" stop-color="#5E4E3B"/><stop offset="100%" stop-color="#3B3028"/></linearGradient>';
  H.forEach((x,i) => { d += '<clipPath id="clip'+i+'"><circle cx="'+fx(x)+'" cy="56" r="14"/></clipPath>'; });
  d += '</defs>';

  /* hand brackets above the tube */
  let g = '';
  [[0,2,h.upper,FL.handA],[3,5,h.lower,FL.handB]].forEach(([i0,i1,name,col]) => {
    const xs = [fx(H[i0]), fx(H[i1])];
    const L = Math.min(...xs) - 26, R = Math.max(...xs) + 26;
    g += '<path d="M'+L+' 24 V14 H'+R+' V24" fill="none" stroke="'+col+'" stroke-width="1.5" opacity=".75"/>' +
      '<text x="'+((L+R)/2)+'" y="10" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" ' +
      'font-size="'+fsHand+'" letter-spacing="1.6" fill="'+col+'">'+name.toUpperCase()+' HAND</text>';
  });

  /* body, nodes, thread bindings, cork, embouchure */
  g += '<rect x="'+FL.bodyX+'" y="'+FL.bodyY+'" width="'+FL.bodyW+'" height="'+FL.bodyH+'" rx="28" fill="url(#bamboo)"/>' +
       '<rect x="'+FL.bodyX+'" y="'+FL.bodyY+'" width="'+FL.bodyW+'" height="'+FL.bodyH+'" rx="28" fill="none" stroke="rgba(232,217,188,.16)"/>';
  FL.nodes.forEach(x => { g += '<path d="M'+fx(x)+' 28 v56" stroke="rgba(23,17,31,.4)" stroke-width="3"/>'; });
  FL.threads.forEach(([x,w],i) => {
    g += '<rect x="'+frx(x,w)+'" y="28" width="'+w+'" height="56" fill="#8E2B34" opacity="'+(i===1?'.6':'.85')+'"/>';
  });
  g += '<rect x="'+frx(FL.bodyX,18)+'" y="28" width="18" height="56" rx="9" fill="#2A2029"/>' +
       '<ellipse cx="'+fx(FL.emb)+'" cy="56" rx="17" ry="14" fill="#17111F" stroke="rgba(232,217,188,.28)"/>' +
       '<text x="'+fx(FL.emb)+'" y="106" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" ' +
       'font-size="'+fsBlow+'" letter-spacing="1.4" fill="#A99BBC">BLOW</text>';

  /* holes, ringed in the colour of the hand that covers them */
  H.forEach((x,i) => {
    const col = i < 3 ? FL.handA : FL.handB;
    const cx = fx(x);
    g += '<circle cx="'+cx+'" cy="56" r="14" fill="#F0A830" stroke="rgba(23,17,31,.55)" stroke-width="1.5"/>' +
      '<rect id="hf'+i+'" x="'+(cx-14)+'" y="42" width="0" height="28" fill="#221A2B" clip-path="url(#clip'+i+')"/>' +
      '<circle cx="'+cx+'" cy="56" r="17" fill="none" stroke="'+col+'" stroke-width="2" opacity=".55"/>' +
      '<text x="'+cx+'" y="106" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" ' +
      'font-size="'+fsNum+'" fill="#A99BBC">'+(i+1)+'</text>' +
      '<text x="'+cx+'" y="122" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" ' +
      'font-size="'+fsFin+'" letter-spacing=".5" fill="'+col+'" opacity=".9">'+FINGERS[i%3]+'</text>';
  });
  $('fluteSvg').innerHTML = d + g;

  $('fluteNote').innerHTML =
    '<b>' + (S.leftHold ? 'Left-handed' : 'Right-handed') + '</b> — blow hole on the ' +
    (S.leftHold ? 'right' : 'left') + ', flute out to your ' + (S.leftHold ? 'left' : 'right') + '. ' +
    'Dark = closed · Amber = open · Half-filled = half-hole. ' +
    '<b style="color:'+FL.handA+'">' + h.upper + ' hand</b> takes holes 1–3 nearest the mouth, ' +
    '<b style="color:'+FL.handB+'">' + h.lower + ' hand</b> takes 4–6, index–middle–ring on each. ' +
    'Thumbs and little fingers only balance the flute — they cover nothing. ' +
    'All six closed is <b>mandra Pa</b>; the same grips overblown give madhya Pa upward.';
  setFingering(S.curSemi || 0);
}
function setFingering(semi){
  S.curSemi = semi;
  GRIP[mod12(semi)].forEach((v,i) => { const r = $('hf'+i); if (r) r.setAttribute('width', String(28*v)); });
  $('regChip').textContent = REG_LABEL[registerOf(semi)];
}
function setPhase(t,sub,cls){
  $('phaseText').textContent = t; $('phaseSub').textContent = sub;
  $('breath').className = 'breath' + (cls ? ' '+cls : '');
}
function updateStats(){
  $('stPhrases').textContent = S.stats.phrases; $('stCleared').textContent = S.stats.cleared;
  $('stStreak').textContent = S.stats.streak;  $('stBest').textContent = S.stats.best;
}
const showHint = h => { $('hint').innerHTML = h; $('hint').classList.remove('hidden'); };
const hideHint = () => $('hint').classList.add('hidden');

function westernOf(hz){
  const midi = 69 + 12*Math.log2(hz/440), r = Math.round(midi);
  return {label: WEST[mod12(r)] + (Math.floor(r/12)-1), cents:(midi-r)*100};
}
function refreshSaInfo(){
  const w = westernOf(S.sa), dr = freqOf(S.droneReg*12);
  $('saInfo').innerHTML = 'Madhya Sa <b>'+S.sa.toFixed(1)+' Hz</b> ≈ '+w.label+
    (Math.abs(w.cents)>4 ? ' '+(w.cents>0?'+':'')+w.cents.toFixed(0)+'¢' : '')+
    ' · mandra Pa <b>'+freqOf(-5).toFixed(1)+'</b> · taar Sa <b>'+freqOf(12).toFixed(1)+' Hz</b>';
  $('droneInfo').innerHTML = 'Drone Sa sounds at <b>'+dr.toFixed(1)+' Hz</b> ('+westernOf(dr).label+
    '). A tanpura sits a saptak below the flute — this is the number to match in iTablaPro.';
  $('droneLabel').textContent = 'Tanpura ' + dr.toFixed(0);
}
function refreshRagaNotes(){
  const r = RAGAS[S.raga];
  const txt = r.pc.map(p => PC[p].name + PC[p].mark + (r.descOnly.includes(p) ? '↓' : '')).join(' · ');
  $('ragaNotes').textContent = txt + '   ·   ' + range().label +
    (r.descOnly.length ? '   ·   ↓ = avroh only' : '');
}
function syncButtons(){
  const busy = S.phase === 'guru';
  $('startBtn').textContent = (S.running && S.kind==='riyaz') ? 'Riyaz running' : 'Start riyaz';
  $('startBtn').disabled = S.running && S.kind==='riyaz';
  $('stopBtn').disabled = !(S.running && S.kind==='riyaz');
  $('repeatBtn').disabled = !(S.running && S.kind==='riyaz') || !S.phrase.length || busy;
  $('nextBtn').disabled = !(S.running && S.kind==='riyaz') || busy;
  $('revealBtn').disabled = !(S.running && S.kind==='riyaz') || S.revealed || !S.phrase.length;
  $('compStart').disabled = S.running && S.kind==='comp';
  $('compStop').disabled = !(S.running && S.kind==='comp');
  $('compRepeat').disabled = !(S.running && S.kind==='comp') || busy;
  $('compSkip').disabled = !(S.running && S.kind==='comp') || busy;
  $('ornStart').disabled = S.running && S.kind==='orn';
  $('ornStop').disabled = !(S.running && S.kind==='orn');
  $('ornRepeat').disabled = !(S.running && S.kind==='orn') || busy;
  $('ornNext').disabled = !(S.running && S.kind==='orn') || busy;
  $('alapStart').disabled = S.running && S.kind==='alap';
  $('alapStop').disabled = !(S.running && S.kind==='alap');
  $('alapRepeat').disabled = !(S.running && S.kind==='alap') || busy;
  $('alapNext').disabled = !(S.running && S.kind==='alap') || busy;
  $('capExact').disabled = !(S.lastHz > 0);
  $('capNear').disabled = !(S.lastHz > 0);
}

/* ============================ 8. SESSION FLOW ============================ */
function clearTimers(){
  S.timeouts.forEach(clearTimeout); S.timeouts = [];
  if (S.raf){ cancelAnimationFrame(S.raf); S.raf = null; }
  $('window').classList.add('hidden'); $('windowBar').style.width = '0%';
}
const later = (fn,ms) => S.timeouts.push(setTimeout(fn, ms));
const noteDur = () => 60/S.bpm;

function stopAll(){
  clearTimers(); S.running = false; S.phase = 'idle';
  S.phrase = []; S.durs = []; S.glides = []; S.hits = []; S.cursor = 0; S.revealed = true;
  $('nyasBar').classList.add('hidden'); S.alap.holding = false;
  $('cards').innerHTML = ''; highlightTargetTick(null);
  setPhase('Stopped','Press Start when you want to go again','');
  syncButtons();
}

/* ---- riyaz ---- */
function startRiyaz(){
  audio(); stopAll(); S.kind = 'riyaz'; S.running = true; hideHint();
  if (S.mode === 'listen' && !S.micOn)
    showHint('<b>Listen back needs the mic.</b> Turn it on above, or switch to Fixed time.');
  nextRiyaz();
}
function nextRiyaz(){
  clearTimers();
  S.phrase = generatePhrase(); S.durs = S.phrase.map(()=>1); S.glides = S.phrase.map(()=>0);
  S.hits = S.phrase.map(()=>false);
  S.cursor = 0; S.revealed = !S.blind;
  S.stableNote = null; S.stableCount = 0;
  S.lastHitSemi = null; S.articulated = true; S.awayFrames = 0;
  renderCards(); syncButtons(); playPhrase();
}

/* ---- compositions ---- */
function startComp(){
  audio(); stopAll(); S.kind = 'comp'; S.running = true; hideHint();
  const c = buildComposition();
  S.comp.lines = c.lines; S.comp.idx = 0; S.comp.done = c.lines.map(()=>false);
  renderLineList();
  if (S.mode === 'listen' && !S.micOn)
    showHint('<b>Listen back needs the mic.</b> Turn it on above, or switch to Fixed time.');
  loadCompLine();
}
function loadCompLine(){
  clearTimers();
  if (S.comp.idx >= S.comp.lines.length){
    setPhase('Composition complete', S.comp.done.filter(Boolean).length + ' of ' +
      S.comp.lines.length + ' lines cleared','');
    S.running = false; renderLineList(); syncButtons(); chime(true); return;
  }
  S.compFree = !!buildComposition().free;
  const ln = S.comp.lines[S.comp.idx];
  S.phrase = ln.map(x => typeof x === 'object' ? x.s : x);
  S.durs = ln.map(x => typeof x === 'object' ? x.d : 1);
  S.glides = S.phrase.map(()=>0);
  S.hits = S.phrase.map(()=>false); S.cursor = 0; S.revealed = !S.blind;
  S.stableNote = null; S.stableCount = 0;
  renderCards(); renderLineList(); syncButtons(); playPhrase();
}
function renderLineList(){
  const el = $('lineList'); if (!el) return;
  renderGatGrid();
  el.innerHTML = (S.comp.lines.length ? S.comp.lines : []).map((ln,i) =>
    '<div class="lineRow'+(i===S.comp.idx && S.running ? ' cur':'')+(S.comp.done[i]?' done':'')+'" data-i="'+i+'">' +
    '<span class="idx">'+(i+1)+'</span>' +
    '<span class="sw-line">'+ln.map(x => swaraHTML(typeof x === 'object' ? x.s : x)).join(' ')+'</span>' +
    '<span class="tickmark">'+(S.comp.done[i]?'✓':'')+'</span></div>').join('');
}

/* ---- shared call/response ---- */
function playPhrase(){
  clearTimers(); S.phase = 'guru';
  clearCardClass('target'); highlightTargetTick(null);
  setPhase('Listen', 'The guru is playing ' + S.phrase.length + ' swaras', 'listen');
  syncButtons();
  const ctx = audio(), d = noteDur(), t0 = ctx.currentTime + .12;
  let prev = 0, off = 0;
  S.phrase.forEach((semi,i) => {
    const len = d * (S.durs[i] || 1);
    const f = freqOf(semi);
    const gl = S.glides[i] ? Math.min(len*.45, .5) : 0;
    playNote(f, t0 + off, len*.94, prev, gl); prev = f;
    const at = (.12 + off)*1000;
    later(() => { clearCardClass('playing'); markCard(i,'playing'); setFingering(semi); highlightTargetTick(semi); }, at);
    off += len;
  });
  S.playDur = off;
  const avgMs = (off/Math.max(1,S.phrase.length))*1000;
  S.stableNeed = avgMs < 420 ? 2 : 3;
  later(() => { clearCardClass('playing'); beginResponse(); }, (.12 + off)*1000 + 120);
}
function beginResponse(){
  S.phase = 'response'; S.cursor = 0; S.stableNote = null; S.stableCount = 0;
  S.lastHitSemi = null; S.articulated = true; S.awayFrames = 0;
  clearCardClass('playing'); focusTarget(); syncButtons();
  if (S.kind === 'comp' && S.playAlong){
    const wait = (S.playDur || 1)*1000 + 700;
    setPhase('Play along', 'Following the line — no checking', 'turn');
    $('window').classList.remove('hidden');
    S.windowStart = performance.now(); S.windowEnd = S.windowStart + wait;
    const st = () => {
      const pr = clamp((performance.now()-S.windowStart)/(S.windowEnd-S.windowStart),0,1);
      $('windowBar').style.width = (pr*100)+'%';
      if (pr >= 1){ S.raf = null; S.comp.done[S.comp.idx] = true; S.comp.idx++; loadCompLine(); return; }
      S.raf = requestAnimationFrame(st);
    };
    S.raf = requestAnimationFrame(st);
    return;
  }
  if (S.mode === 'listen' || S.kind === 'alap' || (S.kind === 'comp' && S.compFree)){
    setPhase('Your turn', S.micOn ? (S.kind === 'alap'
        ? 'No clock — play the phrase and rest on the last swara'
        : 'Play it back — it advances when you finish')
      : 'Turn the mic on so the guru can hear you','turn');
    return;
  }
  const total = (S.playDur || S.phrase.length*noteDur())*2;
  setPhase('Play it back','You have ' + total.toFixed(1) + 's — twice the guru\'s length','turn');
  const ctx = audio();
  if (S.taal === 'none') for (let i=0;i<S.phrase.length*2;i++) click(ctx.currentTime + .05 + i*noteDur(), 'soft');
  $('window').classList.remove('hidden');
  S.windowStart = performance.now(); S.windowEnd = S.windowStart + total*1000;
  const step = () => {
    const p = clamp((performance.now()-S.windowStart)/(S.windowEnd-S.windowStart), 0, 1);
    $('windowBar').style.width = (p*100)+'%';
    if (p >= 1){ S.raf = null; finishPhrase(S.hits.every(Boolean)); return; }
    S.raf = requestAnimationFrame(step);
  };
  S.raf = requestAnimationFrame(step);
}
function focusTarget(){
  clearCardClass('target');
  if (S.cursor < S.phrase.length){
    markCard(S.cursor,'target'); setFingering(S.phrase[S.cursor]);
    highlightTargetTick(S.phrase[S.cursor]);
  } else highlightTargetTick(null);
}
function registerHit(slot){
  const i = (slot === undefined || slot < 0) ? S.cursor : slot;
  /* anything jumped over counts as missed rather than blocking the run */
  if (S.match !== 'any') for (let k=S.cursor; k<i; k++){
    const sk = $('cards').children[k];
    if (sk){ sk.classList.remove('target'); sk.classList.add('miss'); }
  }
  S.hits[i] = true;
  const c = $('cards').children[i];
  if (c){ c.classList.remove('target','miss'); c.classList.add('hit');
    if (!S.revealed) c.querySelector('.nm').textContent = '✓'; }
  S.lastHitSemi = S.phrase[i]; S.articulated = false; S.awayFrames = 0;
  if (S.match === 'any'){
    const nx = S.hits.findIndex(h => !h);
    S.cursor = nx < 0 ? S.phrase.length : nx;
  } else S.cursor = i + 1;
  S.stableNote = null; S.stableCount = 0;
  if (S.hits.every(Boolean) || S.cursor >= S.phrase.length){
    if (S.kind === 'alap'){
      S.alap.holding = true; S.alap.nyasStart = 0;
      $('nyasFill').style.maxWidth = '0%';
      $('nyasBar').classList.remove('hidden');
      setPhase('Hold it', 'Sustain ' + swaraText(S.phrase[S.phrase.length-1]) + ' to close the phrase', 'turn');
      return;
    }
    finishPhrase(true);
  } else focusTarget();
}
function registerMiss(){
  const now = performance.now();
  if (now - S.lastMissFlash < 420) return;
  S.lastMissFlash = now;
  const c = $('cards').children[S.cursor];
  if (c){ c.classList.remove('miss'); void c.offsetWidth; c.classList.add('miss'); }
}
function finishPhrase(cleared){
  clearTimers(); S.phase = 'cleared';
  clearCardClass('target'); clearCardClass('playing'); highlightTargetTick(null);
  S.revealed = true;
  const hits = S.hits.slice();
  renderCards(); hits.forEach((h,i)=>{ if(h) markCard(i,'hit'); });
  S.stats.phrases++;
  if (cleared){
    S.stats.cleared++; S.stats.streak++; S.stats.sinceBump++;
    S.stats.best = Math.max(S.stats.best, S.stats.streak);
    setPhase('Cleared','All ' + S.phrase.length + ' swaras matched','');
    if (S.ladder && S.stats.sinceBump >= 3 && S.bpm < 140){
      S.stats.sinceBump = 0;
      S.bpm = Math.min(140, S.bpm + 4);
      $('bpm').value = S.bpm; $('bpmVal').textContent = S.bpm + ' BPM';
      setPhase('Cleared','Laya up to ' + S.bpm + ' BPM','');
      refreshTaal();
    }
  } else {
    S.stats.streak = 0; S.stats.sinceBump = 0;
    setPhase('Time', hits.filter(Boolean).length + ' of ' + S.phrase.length + ' matched','');
  }
  updateStats(); chime(cleared); saveSettings();
  if (S.kind === 'comp'){
    S.comp.done[S.comp.idx] = cleared;
    renderLineList();
    if (cleared) S.comp.idx++;
    syncButtons();
    if (S.running) later(loadCompLine, 1100);
    return;
  }
  syncButtons();
  if (S.autoNext && S.running) later(nextRiyaz, 1100);
  else if (S.running) later(() => setPhase('Ready','Press New phrase for the next one',''), 1100);
}

/* ============================ 9. ORNAMENTS ============================ */
function startOrn(){
  audio(); stopAll(); S.kind = 'orn'; S.running = true; hideHint();
  if (!S.micOn) showHint('<b>Ornament practice needs the mic</b> — the trace is drawn from what you play.');
  nextOrn();
}
function nextOrn(){
  clearTimers();
  S.orn.spec = buildGesture(S.orn.sel);
  S.phrase = []; $('cards').innerHTML = '';
  $('ornScore').textContent = '—'; $('ornScore').className = 'scorebig';
  $('ornText').textContent = S.orn.spec.tip;
  S.orn.samples = [];
  drawTrace();
  playOrn();
}
function playOrn(){
  clearTimers(); S.phase = 'guru';
  const g = S.orn.spec;
  setPhase('Listen', g.label, 'listen');
  setFingering(g.notes[0]); highlightTargetTick(g.notes[0]);
  syncButtons();
  playContour(g.points, audio().currentTime + .12, g.dur);
  later(beginOrnResponse, (g.dur + .3)*1000);
}
function beginOrnResponse(){
  S.phase = 'response';
  S.orn.samples = []; S.orn.capturing = false; S.orn.t0 = 0; S.orn.lastSound = 0;
  setPhase('Your turn', S.micOn ? 'Play it back — the trace draws as you go'
                                : 'Turn the mic on to record the trace','turn');
  syncButtons();
  const limit = (S.orn.spec.dur*3 + 4)*1000;
  later(() => { if (S.phase === 'response') evaluateOrn(); }, limit);
}
function evaluateOrn(){
  clearTimers(); S.phase = 'cleared';
  const g = S.orn.spec, s = S.orn.samples;
  const res = scoreGesture(g, s);
  $('ornScore').textContent = res.score;
  $('ornScore').className = 'scorebig ' + (res.score >= 75 ? 'good' : res.score >= 45 ? 'mid' : 'bad');
  $('ornText').textContent = res.text;
  S.stats.phrases++;
  if (res.score >= 70){ S.stats.cleared++; S.stats.streak++; S.stats.best = Math.max(S.stats.best, S.stats.streak); }
  else S.stats.streak = 0;
  updateStats(); drawTrace(); syncButtons(); saveSettings();
  if (S.autoNext && S.running) later(nextOrn, 1800);
}
function scoreGesture(g, s){
  if (s.length < 6) return {score:0, text:'Nothing came through the mic. Check the level meter at the top and play a little louder.'};
  const dur = s[s.length-1].t - s[0].t;
  const cs = s.map(x => x.cents);
  const smooth = cs.map((v,i,a) => (a[Math.max(0,i-1)] + v + a[Math.min(a.length-1,i+1)])/3);

  if (g.id === 'meend'){
    const a = g.notes[0]*100, b = g.notes[1]*100, dir = Math.sign(b-a);
    const head = smooth.slice(0, Math.ceil(smooth.length*.35));
    const tail = smooth.slice(Math.floor(smooth.length*.6));
    const startOK = head.some(c => Math.abs(c-a) < 75);
    const endOK   = tail.some(c => Math.abs(c-b) < 75);
    let right = 0, moves = 0, maxJump = 0;
    for (let i=1;i<smooth.length;i++){
      const d = smooth[i]-smooth[i-1];
      maxJump = Math.max(maxJump, Math.abs(d));
      if (Math.abs(d) > 4){ moves++; if (Math.sign(d) === dir) right++; }
    }
    const monot = moves ? right/moves : 0;
    const smoothOK = maxJump < 260;
    let sc = (startOK?28:0) + (endOK?28:0) + Math.round(monot*28) + (smoothOK?16:0);
    const t = !startOK ? 'Start the glide from ' + swaraText(g.notes[0]) + ' itself — the trace begins somewhere else.'
      : !endOK ? 'The glide never settles on ' + swaraText(g.notes[1]) + '. Carry it all the way and hold.'
      : !smoothOK ? 'That reads as a jump, not a meend. Roll the fingers off gradually so the pitch bends.'
      : monot < .7 ? 'The line wanders both ways. A meend travels in one direction only.'
      : 'Clean meend — one direction, both ends held.';
    return {score:clamp(sc,0,100), text:t};
  }
  if (g.id === 'kan'){
    const gr = g.notes[0]*100, mn = g.notes[1]*100;
    let firstMain = -1;
    for (let i=0;i<smooth.length;i++) if (Math.abs(smooth[i]-mn) < 60){ firstMain = i; break; }
    const touched = smooth.slice(0, firstMain < 0 ? smooth.length : firstMain).some(c => Math.abs(c-gr) < 90);
    const graceLen = firstMain < 0 ? 999 : (s[firstMain].t - s[0].t);
    let hold = 0;
    if (firstMain >= 0) for (let i=firstMain;i<smooth.length;i++){
      if (Math.abs(smooth[i]-mn) < 55) hold = s[i].t - s[firstMain].t; else break;
    }
    let sc = (touched?35:0) + (firstMain>=0?25:0) + (graceLen < 320 ? 20 : 0) + (hold > 320 ? 20 : Math.round(hold/16));
    const t = !touched ? 'The grace note ' + swaraText(g.notes[0]) + ' never sounded — brush it on the way in.'
      : graceLen >= 320 ? 'You held the grace note too long; it became a note of its own. Make it a flick.'
      : hold <= 320 ? 'Land on ' + swaraText(g.notes[1]) + ' and hold it — the kan leans into a sustained swara.'
      : 'Well shaped — a brush, then a steady landing.';
    return {score:clamp(sc,0,100), text:t};
  }
  if (g.id === 'andolan' || g.id === 'gamak'){
    let rev = 0, up = null;
    for (let i=1;i<smooth.length;i++){
      const d = smooth[i]-smooth[i-1];
      if (Math.abs(d) < 6) continue;
      const nowUp = d > 0;
      if (up !== null && nowUp !== up) rev++;
      up = nowUp;
    }
    const pp = Math.max(...smooth) - Math.min(...smooth);
    const want = g.id === 'andolan' ? [25,110] : [130,330];
    const wide = pp >= want[0] && pp <= want[1];
    const enough = rev >= (g.id === 'andolan' ? 4 : 6);
    const centred = Math.abs((Math.max(...smooth)+Math.min(...smooth))/2 - (g.centre*100 - (g.id==='gamak'?g.amp:0))) < 120;
    let sc = (wide?40:Math.max(0, 40 - Math.abs(pp - (want[0]+want[1])/2)/6)) +
             (enough?35:rev*6) + (centred?25:0);
    const t = !enough ? 'Not enough swing — ' + (g.id==='andolan'
        ? 'let the breath rock the pitch gently, four or five times.'
        : 'drive it from the diaphragm, six or more swings.')
      : pp < want[0] ? 'Too shallow. Widen the oscillation.'
      : pp > want[1] ? 'Too wide — that has become a different note.'
      : !centred ? 'The swing is centred on the wrong pitch. Anchor it on ' + swaraText(g.centre) + '.'
      : 'Good shape and width.';
    return {score:clamp(Math.round(sc),0,100), text:t};
  }
  if (g.id === 'murki'){
    let idx = 0, last = null;
    for (const c of smooth){
      const target = g.seq[idx]*100;
      if (Math.abs(c - target) < 70 && last !== idx){ idx++; last = idx-1; if (idx >= g.seq.length) break; }
    }
    const fast = dur < 2200;
    let sc = Math.round(idx/g.seq.length*70) + (fast?30:10);
    const t = idx < g.seq.length ? 'Got ' + idx + ' of ' + g.seq.length + ' notes. Keep the fingers light and let it spill out.'
      : !fast ? 'All the notes are there, but a murki has to be quick — compress it into a single beat.'
      : 'Crisp murki.';
    return {score:clamp(sc,0,100), text:t};
  }
  /* sustain */
  const target = g.centre*100;
  let best = 0, runStart = null;
  for (let i=0;i<smooth.length;i++){
    if (Math.abs(smooth[i]-target) < 25){
      if (runStart === null) runStart = s[i].t;
      best = Math.max(best, s[i].t - runStart);
    } else runStart = null;
  }
  const inband = smooth.filter(c => Math.abs(c-target) < 25).length / smooth.length;
  const mean = smooth.reduce((a,b)=>a+b,0)/smooth.length;
  const sd = Math.sqrt(smooth.reduce((a,b)=>a+(b-mean)*(b-mean),0)/smooth.length);
  const sc = clamp(Math.round(Math.min(best/4000,1)*50 + inband*30 + Math.max(0, 20 - sd/2)), 0, 100);
  const t = best < 1200 ? 'Held steady for only ' + (best/1000).toFixed(1) + 's. Aim for four seconds inside ±25¢.'
    : Math.abs(mean-target) > 30 ? 'Steady, but sitting ' + (mean>target?'sharp':'flat') + ' by ' +
        Math.abs(mean-target).toFixed(0) + '¢ — adjust the blowing angle, not the fingers.'
    : 'Excellent — ' + (best/1000).toFixed(1) + 's rock steady.';
  return {score:sc, text:t};
}

const tcv = () => $('trace');
function sizeTrace(){
  const c = tcv(); if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  c.width = Math.floor(c.clientWidth*dpr); c.height = Math.floor(190*dpr);
  const x = c.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0);
}
function drawTrace(){
  const c = tcv(); if (!c) return;
  const x = c.getContext('2d'), W = c.clientWidth, H = 190;
  x.clearRect(0,0,W,H);
  const g = S.orn.spec;
  if (!g){ return; }
  const tc = g.points.map(p => p.cents);
  const uc = S.orn.samples.map(p => p.cents);
  const all = tc.concat(uc.length ? uc : []);
  let lo = Math.min(...all) - 120, hi = Math.max(...all) + 120;
  if (hi - lo < 400){ const m = (hi+lo)/2; lo = m-200; hi = m+200; }
  const Y = c2 => H - ((c2-lo)/(hi-lo))*H;

  x.strokeStyle = 'rgba(232,217,188,.13)'; x.lineWidth = 1;
  x.fillStyle = 'rgba(232,217,188,.45)'; x.font = '10px ui-monospace,Menlo,monospace';
  poolSemis().forEach(s => {
    const y = Y(s*100);
    if (y < 8 || y > H-4) return;
    x.beginPath(); x.moveTo(34,y); x.lineTo(W,y); x.stroke();
    x.fillText(swaraText(s), 4, y+3);
  });

  const userDur = S.orn.samples.length ? S.orn.samples[S.orn.samples.length-1].t : 0;
  const span = Math.max(g.dur*1000, userDur, 1);

  x.strokeStyle = '#F0A830'; x.lineWidth = 2; x.setLineDash([5,4]); x.beginPath();
  g.points.forEach((p,i) => {
    const px = 34 + (p.t*g.dur*1000/span)*(W-38), py = Y(p.cents);
    i ? x.lineTo(px,py) : x.moveTo(px,py);
  });
  x.stroke(); x.setLineDash([]);

  if (S.orn.samples.length > 1){
    x.strokeStyle = '#4FBF9B'; x.lineWidth = 2; x.beginPath();
    S.orn.samples.forEach((p,i) => {
      const px = 34 + (p.t/span)*(W-38), py = Y(p.cents);
      i ? x.lineTo(px,py) : x.moveTo(px,py);
    });
    x.stroke();
  }
}

/* ======================= 9b. ALAP ======================= */
function stageRange(){
  const st = STAGES[S.alap.stage];
  const pcs = new Set(RAGAS[S.raga].pc), out = [];
  for (let s=st.lo; s<=st.hi; s++) if (pcs.has(mod12(s))) out.push(s);
  return out;
}
function nyasSemis(pool){
  const nz = new Set(PROFILE[S.raga].nyas.map(mod12));
  const hits = pool.filter(s => nz.has(mod12(s)));
  return hits.length ? hits : pool;
}
/* A free-rhythm phrase: mostly stepwise, one or two leaps, resting on a nyas swar */
function buildAlapPhrase(){
  const pool = stageRange();
  if (pool.length < 3) return {notes:[0], durs:[3], glides:[0]};
  const nyas = nyasSemis(pool);
  const desc = new Set(RAGAS[S.raga].descOnly);
  const n = 3 + Math.floor(Math.random()*4);        /* 3–6 swaras */
  const end = nyas[Math.floor(Math.random()*nyas.length)];
  const endI = pool.indexOf(end);
  let i = clamp(endI + (Math.random()<.5 ? 1 : -1)*(1 + Math.floor(Math.random()*3)), 0, pool.length-1);
  const idx = [i];
  for (let k=1;k<n-1;k++){
    const steps = [-2,-1,-1,-1,1,1,1,2];
    let tries = 0, next;
    do{
      next = i + steps[Math.floor(Math.random()*steps.length)];
      tries++;
    } while (tries < 20 && (next < 0 || next >= pool.length || next === i ||
             (desc.has(mod12(pool[next])) && pool[next] >= pool[i])));
    if (next < 0 || next >= pool.length || next === i ||
        (desc.has(mod12(pool[next])) && pool[next] >= pool[i])){
      const down = clamp(i - 1, 0, pool.length-1), up = clamp(i + 1, 0, pool.length-1);
      next = (down !== i && !(desc.has(mod12(pool[down])) && pool[down] >= pool[i])) ? down
           : (up !== i && !(desc.has(mod12(pool[up])) && pool[up] >= pool[i])) ? up : i;
    }
    if (next === i) continue;
    i = next; idx.push(i);
  }
  if (idx[idx.length-1] !== endI) idx.push(endI);
  /* never let it collapse below three swaras */
  while (idx.length < 3){
    const j = clamp(endI + (endI > 0 ? -1 : 1), 0, pool.length-1);
    if (j === endI || j === idx[idx.length-2]) break;
    idx.splice(idx.length-1, 0, j);
  }
  /* the matcher needs a re-articulation between identical swaras — drop any doubles */
  for (let k=idx.length-1; k>0; k--) if (idx[k] === idx[k-1]) idx.splice(k, 1);
  const notes = idx.map(k => pool[k]);
  /* free rhythm: long opening, mixed middle, long nyas */
  const durs = notes.map((_,k) =>
    k === notes.length-1 ? 3.5 : k === 0 ? 1.6 : [.7,1,1,1.4][Math.floor(Math.random()*4)]);
  const glides = notes.map((s,k) =>
    k > 0 && Math.abs(s - notes[k-1]) >= 2 && Math.random() < .45 ? 1 : 0);
  return {notes, durs, glides};
}
function renderProfile(){
  const p = PROFILE[S.raga];
  $('ragaProfile').innerHTML =
    '<div><b>' + RAGAS[S.raga].label + '</b><span>Raga</span></div>' +
    '<div><b>' + p.thaat + '</b><span>Thaat</span></div>' +
    '<div><b>' + swaraHTML(p.vadi) + '</b><span>Vadi</span></div>' +
    '<div><b>' + swaraHTML(p.samvadi) + '</b><span>Samvadi</span></div>' +
    '<div><b>' + p.jati + '</b><span>Jati</span></div>' +
    '<div><b style="font-size:13px;line-height:1.4">' + p.time + '</b><span>Samay</span></div>' +
    '<div><b>' + PROFILE[S.raga].nyas.map(swaraHTML).join(' ') + '</b><span>Nyas swars</span></div>';
}
function renderStages(){
  $('stageBar').innerHTML = STAGES.map((st,i) =>
    '<button type="button" data-st="'+i+'" class="'+(i===S.alap.stage?'sel':i<S.alap.stage?'done':'')+'">' +
    st.n + '</button>').join('');
  $('stageDesc').textContent = STAGES[S.alap.stage].d + ' · ' + PROFILE[S.raga].note;
  $('stageRead').innerHTML = 'stage ' + (S.alap.stage+1) + ' of ' + STAGES.length +
    ' · <b>' + S.alap.cleared + '/3</b> cleared here';
}
function startAlap(){
  audio(); stopAll(); S.kind = 'alap'; S.running = true; hideHint();
  if (!S.micOn) showHint('<b>Alap is hands-free — it needs the mic.</b> Tap the mic pill at the top right.');
  if (!S.droneOn) startDrone();
  S.alap.cleared = 0;
  renderStages(); nextAlap();
}
function nextAlap(){
  clearTimers();
  const a = buildAlapPhrase();
  S.phrase = a.notes; S.durs = a.durs; S.glides = a.glides;
  S.hits = S.phrase.map(()=>false); S.cursor = 0; S.revealed = !S.blind;
  S.stableNote = null; S.stableCount = 0; S.alap.holding = false;
  $('nyasBar').classList.add('hidden');
  renderCards(); renderStages(); syncButtons(); playPhrase();
}
/* the last swara must be held before the phrase counts */
function nyasProgress(hz){
  const last = S.phrase[S.phrase.length-1];
  const inTune = Math.abs(centsTo(hz, last, !S.strict)) <= CENT_TOL;
  const now = performance.now();
  if (!inTune){ S.alap.nyasStart = 0; $('nyasFill').style.maxWidth = '0%'; return; }
  if (!S.alap.nyasStart) S.alap.nyasStart = now;
  const p = clamp((now - S.alap.nyasStart)/S.alap.nyasNeed, 0, 1);
  $('nyasFill').style.maxWidth = (p*100) + '%';
  if (p >= 1){ S.alap.holding = false; finishAlap(); }
}
function finishAlap(){
  clearTimers(); S.phase = 'cleared';
  $('nyasBar').classList.add('hidden');
  clearCardClass('target'); highlightTargetTick(null);
  S.revealed = true; renderCards();
  S.hits.forEach((h,i)=>{ if(h) markCard(i,'hit'); });
  S.stats.phrases++; S.stats.cleared++; S.stats.streak++;
  S.stats.best = Math.max(S.stats.best, S.stats.streak);
  S.alap.cleared++;
  let msg = 'Nyas held on ' + swaraText(S.phrase[S.phrase.length-1]);
  if (S.alap.auto && S.alap.cleared >= 3 && S.alap.stage < STAGES.length-1){
    S.alap.stage++; S.alap.cleared = 0;
    msg = 'Badhat — the raga opens to ' + STAGES[S.alap.stage].n;
  }
  setPhase('Cleared', msg, '');
  updateStats(); renderStages(); chime(true); syncButtons(); saveSettings();
  if (S.running) later(nextAlap, 1400);
}

/* ======================= 9c. TAAL GRID ======================= */
function renderGatGrid(){
  const c = buildComposition();
  const box = $('gatGrid'), list = $('lineList');
  if (!c.grid || !c.grid.rows.length){ box.innerHTML=''; box.style.display='none'; list.style.display=''; return; }
  box.style.display = ''; list.style.display = 'none';
  const g = c.grid, cols = g.cols || g.matras;
  const khali = {6:[3], 8:[4], 10:[5], 12:[2,6,10], 16:[8]}[g.matras] || [];
  let html = '';
  c.lines.forEach((ln, li) => {
    const cells = g.rows[li] || [];
    const cur = li === S.comp.idx && S.running && S.kind === 'comp';
    html += '<div class="linegroup'+(cur?' cur':'')+(S.comp.done[li]?' done':'')+'" data-i="'+li+'">';
    html += '<div class="lg-i">'+(li+1)+(S.comp.done[li]?'  \u2713':'')+'</div>';
    for (let v=0; v<cells.length; v+=cols){
      html += '<div class="avartan" style="grid-template-columns:repeat('+cols+',1fr)">';
      for (let k=0;k<cols;k++){
        const cell = cells[v+k];
        if (!cell){ html += '<div class="matracell"><div class="mn"></div><div class="mi"></div></div>'; continue; }
        const m = g.free ? -1 : (v+k) % g.matras;
        const cls = g.free ? '' : m===0 ? ' sam' : khali.includes(m) ? ' khali' : '';
        const inner = cell.hold ? '\u2013'
          : cell.notes.map(n => '<span'+(cell.notes.length>1?' class="subcell"':'')+'>'+swaraHTML(n)+'</span>').join('');
        html += '<div class="matracell'+cls+(cell.hold?' hold':'')+'">' +
          '<div class="mn">'+inner+'</div>' +
          '<div class="mi">'+(g.free ? '' : (m+1)+(m===0?' sam':khali.includes(m)?' khali':''))+'</div></div>';
      }
      html += '</div>';
    }
    html += '</div>';
  });
  box.innerHTML = html;
}

let wakeLock = null;
async function requestWakeLock(){
  try{
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  }catch(err){ /* unsupported (older iOS) or denied — practice still works, screen just may sleep */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.micOn) requestWakeLock();
});

async function enableMic(){
  if (S.micOn) return;
  try{
    const ctx = audio();
    const stream = await navigator.mediaDevices.getUserMedia({audio:{
      echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
    S.stream = stream;
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 2048;
    src.connect(an);
    S.analyser = an; S.buf = new Float32Array(an.fftSize); S.micOn = true;
    $('micPill').classList.add('on'); $('micPill').classList.remove('warn');
    $('micLabel').textContent = 'Listening'; hideHint();
    S.micInterval = setInterval(detectLoop, 55);
    audioSessionType('play-and-record');
    requestWakeLock();
  }catch(err){
    $('micPill').classList.add('warn'); $('micLabel').textContent = 'Mic blocked';
    showHint('<b>The browser would not hand over the mic.</b> Chrome blocks microphone access on ' +
      '<code>file:///</code> pages — open this file in Firefox, or serve the folder with ' +
      '<code>python3 -m http.server</code> and load <code>http://localhost:8000</code>.');
  }
}
function autoCorrelate(buf, sr, gate){
  const N = buf.length;
  let rms = 0;
  for (let i=0;i<N;i++) rms += buf[i]*buf[i];
  rms = Math.sqrt(rms/N);
  if (rms < gate) return {hz:-1, rms};
  let r1 = 0, r2 = N-1;
  for (let i=0;i<N/2;i++) if (Math.abs(buf[i]) < .2){ r1 = i; break; }
  for (let i=1;i<N/2;i++) if (Math.abs(buf[N-i]) < .2){ r2 = N-i; break; }
  const b = buf.slice(r1,r2), n = b.length;
  if (n < 128) return {hz:-1, rms};
  const c = new Float32Array(n);
  for (let lag=0; lag<n; lag++){
    let sum = 0;
    for (let i=0;i<n-lag;i++) sum += b[i]*b[i+lag];
    c[lag] = sum;
  }
  let d = 0; while (d < n-1 && c[d] > c[d+1]) d++;
  let mv = -1, mp = -1;
  for (let i=d;i<n;i++) if (c[i] > mv){ mv = c[i]; mp = i; }
  let T = mp;
  if (T <= 0) return {hz:-1, rms};
  const x1 = c[T-1]||0, x2 = c[T], x3 = c[T+1]||0;
  const a = (x1+x3-2*x2)/2, bb = (x3-x1)/2;
  if (a) T = T - bb/(2*a);
  const hz = sr/T;
  return (hz < 60 || hz > 3000) ? {hz:-1, rms} : {hz, rms};
}
function centsTo(hz, semi, folded){
  let d = 12*Math.log2(hz/S.sa) - semi;
  if (folded){ while (d > 6) d -= 12; while (d < -6) d += 12; }
  return d*100;
}
const nearestSemi = hz => Math.round(12*Math.log2(hz/S.sa));

function detectLoop(){
  if (!S.micOn || !S.analyser) return;
  S.analyser.getFloatTimeDomainData(S.buf);
  const {hz, rms} = autoCorrelate(S.buf, S.ctx.sampleRate, S.rmsGate);
  $('levelBar').style.width = clamp(rms*900,0,100) + '%';

  /* ornament capture */
  if (S.kind === 'orn' && S.phase === 'response'){
    const now = performance.now();
    if (hz > 0){
      if (!S.orn.capturing){ S.orn.capturing = true; S.orn.t0 = now; }
      S.orn.lastSound = now;
      S.orn.samples.push({t: now - S.orn.t0, cents: 1200*Math.log2(hz/S.sa)});
      if (S.orn.samples.length % 3 === 0) drawTrace();
      $('ornRead').innerHTML = hz.toFixed(1) + ' Hz · <b>' + swaraText(nearestSemi(hz)) + '</b>';
    } else if (S.orn.capturing && now - S.orn.lastSound > 850){
      evaluateOrn(); return;
    }
  }

  if (hz < 0){
    S.lastHz = 0; S.stableNote = null; S.stableCount = 0;
    $('needle').classList.remove('on');
    $('readout').classList.remove('in'); $('readout').innerHTML = '— <b>silent</b>';
    if (S.view === 'tuner') tunerSilent();
    syncButtons(); return;
  }
  S.lastHz = hz;
  const raw = 12*Math.log2(hz/S.sa), near = nearestSemi(hz), {lo,hi} = range();
  const nd = $('needle');
  nd.style.left = clamp((raw-lo)/(hi-lo),0,1)*100 + '%';
  nd.classList.add('on');
  nd.classList.toggle('out', raw < lo-.5 || raw > hi+.5);

  if (S.kind === 'alap' && S.alap.holding && S.phase === 'response'){ nyasProgress(hz); }
  const listening = S.phase === 'response' && S.kind !== 'orn' && S.cursor < S.phrase.length;
  const target = listening ? S.phrase[S.cursor] : null;
  const folded = !S.strict;
  const dev = target !== null ? centsTo(hz, target, folded) : centsTo(hz, near, false);
  const inTune = Math.abs(dev) <= CENT_TOL;
  const shown = target !== null ? target : near;
  nd.classList.toggle('in', inTune && target !== null);
  $('readout').classList.toggle('in', inTune);
  $('readout').innerHTML = hz.toFixed(1) + ' Hz · <b>' + swaraText(shown) + '</b> ' +
    (dev>=0?'+':'') + dev.toFixed(0) + '¢' +
    (target !== null && inTune && folded && Math.round(raw) !== target ? ' · other saptak' : '');

  if (S.view === 'alap') $('alapRead').innerHTML = $('readout').innerHTML;
  if (S.view === 'tuner') tunerUpdate(hz, near);
  if (S.view === 'tuner' || S.phase === 'idle' || S.phase === 'cleared') setFingering(near);

  /* has the player left the last note yet? two identical swaras in a row need
     a fresh breath, not one long tone drifting through both slots */
  if (S.lastHitSemi !== null){
    const away = Math.abs(centsTo(hz, S.lastHitSemi, folded)) > 90;
    S.awayFrames = away ? S.awayFrames + 1 : 0;
    if (S.awayFrames >= 2) S.articulated = true;
  }

  if (!listening) return;

  const slot = matchSlot(hz);
  const heard = slot >= 0 ? 'slot' + slot : near;
  if (S.stableNote === heard) S.stableCount++; else { S.stableNote = heard; S.stableCount = 1; }
  if (S.stableCount === S.stableNeed){
    if (slot >= 0) registerHit(slot); else registerMiss();
  }
}

/* Which phrase slot does this pitch answer, or -1.
   strict     only the next unplayed swara counts
   forgiving  you may run ahead by up to two; the skipped ones are marked missed
   any        any swara still outstanding counts, in whatever order it arrives  */
function matchSlot(hz){
  const folded = !S.strict;
  const fits = i => i >= 0 && i < S.phrase.length && !S.hits[i] &&
                    Math.abs(centsTo(hz, S.phrase[i], folded)) <= CENT_TOL;
  const needsBreath = i => S.lastHitSemi !== null && !S.articulated &&
        mod12(S.phrase[i]) === mod12(S.lastHitSemi);
  if (S.match === 'any'){
    for (let i=0;i<S.phrase.length;i++) if (fits(i) && !needsBreath(i)) return i;
    return -1;
  }
  const look = S.match === 'forgiving' ? 2 : 0;
  for (let d=0; d<=look; d++){
    const i = S.cursor + d;
    if (fits(i) && !needsBreath(i)) return i;
  }
  return -1;
}

/* ============================ 11. TUNER ============================ */
function tunerSilent(){
  $('tSw').textContent = '—'; $('tSw').classList.remove('in');
  $('tSap').textContent = 'blow a steady note';
  $('tHz').innerHTML = '— Hz <span>· western —</span>';
  $('tCents').textContent = '—'; $('tCents').classList.remove('in');
  $('tDir').textContent = ''; $('mNeedle').classList.remove('on');
  [...$('scanBody').children].forEach(r => r.classList.remove('live'));
}
function tunerUpdate(hz, near){
  const dev = centsTo(hz, near, false), inTune = Math.abs(dev) <= 10;
  const s = swara(near), w = westernOf(hz);
  $('tSw').innerHTML = swaraHTML(near); $('tSw').classList.toggle('in', inTune);
  $('tSap').textContent = s.saptakName + ' saptak · ' + s.dev;
  $('tHz').innerHTML = hz.toFixed(1) + ' Hz <span>· western ' + w.label + '</span>';
  $('tCents').textContent = (dev>=0?'+':'') + dev.toFixed(0) + '¢';
  $('tCents').classList.toggle('in', inTune);
  $('tDir').textContent = inTune ? 'in tune' : dev < 0 ? 'flat — blow a touch harder / roll out'
                                                       : 'sharp — ease off / roll in';
  const n = $('mNeedle');
  n.style.left = clamp(50+dev, 2, 98) + '%';
  n.classList.add('on'); n.classList.toggle('in', inTune);
  if (Math.abs(dev) < 60){
    const key = mod12(near), e = S.scan[key] || (S.scan[key] = {sum:0,n:0});
    e.sum += dev; e.n++;
    if (e.n % 3 === 0) renderScan(key);
  }
}
function renderScan(live){
  $('scanBody').innerHTML = RAGAS[S.raga].pc.map(pc => {
    const e = S.scan[pc], avg = e && e.n ? e.sum/e.n : null;
    const cls = avg === null ? '' : Math.abs(avg) <= 12 ? 'good' : Math.abs(avg) <= 30 ? 'warn' : 'bad';
    return '<tr'+(pc===live?' class="live"':'')+'><td class="n">'+swaraHTML(pc)+'</td>' +
      '<td class="f">'+freqOf(pc).toFixed(1)+' Hz</td>' +
      '<td class="c '+cls+'">'+(avg===null?'—':(avg>=0?'+':'')+avg.toFixed(0)+'¢')+'</td>' +
      '<td class="s">'+(e?e.n:0)+'</td></tr>';
  }).join('');
}
function buildMeterTicks(){
  const m = $('meter');
  [-50,-25,0,25,50].forEach(c => {
    const t = document.createElement('div');
    t.className = 'mtick'; t.style.left = (50+c)+'%'; m.appendChild(t);
    const l = document.createElement('div');
    l.className = 'mlab'; l.style.left = (50+c)+'%';
    l.textContent = c === 0 ? 'sur' : (c>0?'+':'')+c;
    m.appendChild(l);
  });
}

/* ============================ 12. Sa SETUP ============================ */
function buildSaSelects(){
  $('saNote').innerHTML = WEST.map((w,i)=>'<option value="'+i+'">'+w+'</option>').join('');
  $('saOct').innerHTML = [2,3,4,5,6].map(o=>'<option value="'+o+'">octave '+o+'</option>').join('');
}
function saFromNote(){
  const midi = 12*(+$('saOct').value + 1) + (+$('saNote').value);
  return 440*Math.pow(2,(midi-69)/12);
}
function setSa(hz, fromHz){
  S.sa = clamp(hz, 60, 2000);
  const midi = Math.round(69 + 12*Math.log2(S.sa/440));
  $('saNote').value = String(mod12(midi));
  $('saOct').value = String(clamp(Math.floor(midi/12)-1, 2, 6));
  if (!fromHz) $('saHz').value = S.sa.toFixed(1);
  const m = [...$('presetSel').options].find(o => Math.abs(parseFloat(o.value)-S.sa) < .6);
  $('presetSel').value = m ? m.value : 'custom';
  refreshSaInfo(); renderRibbon(); renderScan(null); restartDrone();
  if (S.phrase.length) renderCards();
  saveSettings();
}

/* ============================ 13. PERSISTENCE ============================ */
const KEYS = ['sa','raga','range','len','bpm','mode','autoNext','blind','strict','ladder',
              'rmsGate','droneReg','dronePartner','taal','leftHold','grammar','match','vol','thekaVol','pluckGap'];
function saveSettings(){
  try{
    const o = {}; KEYS.forEach(k => o[k] = S[k]);
    o.ornSel = S.orn.sel; o.compKind = S.comp.kind; o.compPick = S.comp.pick; o.stage = S.alap.stage;
    o.retSthayi = S.retSthayi; o.playAlong = S.playAlong; o.paste = S.paste.text; o.pasteM = S.paste.matras;
    localStorage.setItem('bansuri-riyaz', JSON.stringify(o));
  }catch(e){}
}
function loadSettings(){
  try{
    const o = JSON.parse(localStorage.getItem('bansuri-riyaz') || '{}');
    KEYS.forEach(k => { if (o[k] !== undefined) S[k] = o[k]; });
    if (o.ornSel) S.orn.sel = o.ornSel;
    if (o.compKind) S.comp.kind = o.compKind;
    if (o.compPick !== undefined) S.comp.pick = o.compPick;
    if (o.stage !== undefined) S.alap.stage = clamp(o.stage, 0, 4);
    if (o.retSthayi !== undefined) S.retSthayi = o.retSthayi;
    if (o.playAlong !== undefined) S.playAlong = o.playAlong;
    if (o.paste) S.paste.text = o.paste;
    if (o.pasteM !== undefined) S.paste.matras = o.pasteM;
  }catch(e){}
}

/* ============================ 14. WIRING ============================ */
function showView(v){
  S.view = v;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('sel', b.dataset.view === v));
  ['riyaz','alap','comp','orn','tuner'].forEach(k => $('view-'+k).classList.toggle('on', k === v));
  $('playArea').style.display = (v === 'tuner') ? 'none' : '';
  document.querySelectorAll('.ctrl-group[data-tab]').forEach(g => {
    const tabs = g.dataset.tab;
    g.classList.toggle('hidden', tabs !== 'all' && !tabs.split(' ').includes(v));
  });
  if (v === 'tuner'){
    renderScan(null);
    if (!S.micOn) showHint('<b>The tuner needs the mic.</b> Tap the mic pill at the top right.');
    else hideHint();
  }
  if (v === 'orn'){ sizeTrace(); drawTrace(); }
  if (v === 'comp') refreshCompPick();
  if (v === 'alap'){ renderProfile(); renderStages(); }
}
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-view]'); if (b) showView(b.dataset.view);
});

function refreshCompPick(){
  const k = S.comp.kind;
  const opts = k === 'core'
    ? ['Aroh — the ascent','Avroh — the descent','Aroh & Avroh','Pakad — the catch-phrase']
    : k === 'pack' ? PACK_SECTIONS.map(x => x.n)
    : k === 'paste' ? ['Your notation']
    : k === 'gat' ? ['Sthayi only','Antara only','Sthayi & antara']
    : k === 'palta' ? PALTAS.map(p => p.n + ' — ' + p.d.split('—')[0].trim())
    : LINES[S.raga].map(l => l.n);
  S.comp.pick = clamp(S.comp.pick, 0, opts.length-1);
  $('compPick').innerHTML = opts.map((o,i)=>'<option value="'+i+'">'+o+'</option>').join('');
  $('compPick').value = String(S.comp.pick);
  $('compKind').value = k;
  $('pasteBox').style.display = k === 'paste' ? '' : 'none';
  $('retSthayiWrap').style.display = k === 'pack' ? '' : 'none';
  const c = buildComposition();
  $('compDesc').textContent = c.d;
  $('packMeta').innerHTML = k === 'pack'
    ? 'Source: <b>' + YAMAN_PACK.source + '</b><br>' + YAMAN_PACK.taal + ' taal, ' +
      YAMAN_PACK.matras + ' matras — each written line is two cycles. ' +
      'Two cells in the source read as typos and are corrected here: ' +
      '<b>D.N \u2192 .D.N</b> (taan sthayi II, line 1). <b>RN</b> in taan sthayi II line 3 is left as written — ' +
      'if it should be R.N, tell me.'
    : '';
  if (!S.running || S.kind !== 'comp'){
    S.comp.lines = c.lines; S.comp.done = c.lines.map(()=>false); S.comp.idx = 0;
    renderLineList();
  }
  renderGatGrid();
}
$('compKind').addEventListener('change', e => { S.comp.kind = e.target.value; S.comp.pick = 0; refreshCompPick(); saveSettings(); });
$('compPick').addEventListener('change', e => { S.comp.pick = +e.target.value; refreshCompPick(); saveSettings(); });
$('lineList').addEventListener('click', e => {
  const r = e.target.closest('.lineRow');
  if (r && S.running && S.kind === 'comp'){ S.comp.idx = +r.dataset.i; loadCompLine(); }
});
$('retSthayi').addEventListener('change', e => { S.retSthayi = e.target.checked; refreshCompPick(); saveSettings(); });
$('playAlong').addEventListener('change', e => { S.playAlong = e.target.checked; saveSettings(); });
$('pasteParse').addEventListener('click', () => {
  const txt = $('pasteText').value;
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = parseNotation(lines);
  S.paste.text = txt; S.paste.matras = +$('pasteMatra').value; S.paste.parsed = parsed;
  const msg = $('pasteMsg');
  if (!parsed.length){
    msg.className = 'parsemsg err';
    msg.textContent = 'Nothing recognised. Use S R G M P D N, a dot before a swara for mandra, an apostrophe after for taar.';
  } else {
    const m = S.paste.matras;
    const off = m ? parsed.filter(x => Math.abs(x.ev.reduce((a,b)=>a+b.d,0) % m) > .001).length : 0;
    msg.className = 'parsemsg ' + (off ? 'err' : 'ok');
    msg.textContent = parsed.length + ' lines loaded, ' +
      parsed.reduce((a,x)=>a+x.ev.length,0) + ' swaras' +
      (off ? ' — ' + off + ' line(s) do not fill whole cycles of ' + m + ' matras.' : '.');
  }
  S.comp.pick = 0; refreshCompPick(); saveSettings();
});
$('compStart').addEventListener('click', startComp);
$('compStop').addEventListener('click', stopAll);
$('compRepeat').addEventListener('click', () => { if (S.phrase.length) playPhrase(); });
$('compSkip').addEventListener('click', () => { S.comp.idx++; loadCompLine(); });

function buildGestureGrid(){
  $('gestureGrid').innerHTML = GESTURES.map(g =>
    '<button type="button" class="gcard'+(g.id===S.orn.sel?' sel':'')+'" data-g="'+g.id+'">' +
    '<div class="gn">'+g.n+'</div><div class="gd">'+g.d+'</div></button>').join('');
}
$('gestureGrid').addEventListener('click', e => {
  const b = e.target.closest('button[data-g]'); if (!b) return;
  S.orn.sel = b.dataset.g; buildGestureGrid(); saveSettings();
  if (S.running && S.kind === 'orn') nextOrn();
});
$('alapStart').addEventListener('click', startAlap);
$('alapStop').addEventListener('click', stopAll);
$('alapRepeat').addEventListener('click', () => { if (S.phrase.length) playPhrase(); });
$('alapNext').addEventListener('click', nextAlap);
$('stageBar').addEventListener('click', e => {
  const b = e.target.closest('button[data-st]'); if (!b) return;
  S.alap.stage = +b.dataset.st; S.alap.cleared = 0; renderStages(); saveSettings();
  if (S.running && S.kind === 'alap') nextAlap();
});
$('gatGrid').addEventListener('click', e => {
  const r = e.target.closest('.linegroup,.vibhag');
  if (r && S.running && S.kind === 'comp'){ S.comp.idx = +r.dataset.i; loadCompLine(); }
});
$('ornStart').addEventListener('click', startOrn);
$('ornStop').addEventListener('click', stopAll);
$('ornRepeat').addEventListener('click', () => { if (S.orn.spec) playOrn(); });
$('ornNext').addEventListener('click', nextOrn);

$('presetSel').addEventListener('change', e => { if (e.target.value !== 'custom') setSa(parseFloat(e.target.value)); });
$('saNote').addEventListener('change', () => setSa(saFromNote()));
$('saOct').addEventListener('change', () => setSa(saFromNote()));
$('saHz').addEventListener('change', e => {
  const v = parseFloat(e.target.value);
  isFinite(v) ? setSa(v, true) : ($('saHz').value = S.sa.toFixed(1));
});
$('octUp').addEventListener('click', () => setSa(S.sa*2));
$('octDown').addEventListener('click', () => setSa(S.sa/2));
$('capExact').addEventListener('click', () => { if (S.lastHz > 0) setSa(S.lastHz); });
$('capNear').addEventListener('click', () => {
  if (!(S.lastHz > 0)) return;
  const midi = Math.round(69 + 12*Math.log2(S.lastHz/440));
  setSa(440*Math.pow(2,(midi-69)/12));
});
$('droneReg').addEventListener('change', e => { S.droneReg = +e.target.value; refreshSaInfo(); restartDrone(); saveSettings(); });
$('dronePartner').addEventListener('change', e => {
  S.dronePartner = e.target.value === 'none' ? 'none' : +e.target.value;
  restartDrone(); saveSettings();
});
$('dronePill').addEventListener('click', () => { primeAudio(); toggleDrone(); });
$('taalSel').addEventListener('change', e => {
  S.taal = e.target.value; primeAudio(); renderTheka(-1); refreshTaal(); saveSettings();
});
$('thekaVol').addEventListener('input', e => {
  S.thekaVol = +e.target.value/100;
  if (S.tabla) S.tabla.gain.setTargetAtTime(S.thekaVol, S.ctx.currentTime, .02);
  $('thekaVolVal').textContent = e.target.value + '%';
  saveSettings();
});
$('pluck').addEventListener('input', e => {
  S.pluckGap = +e.target.value/100;
  $('pluckVal').textContent = S.pluckGap.toFixed(2) + ' s';
  saveSettings();
});

$('ragaSel').addEventListener('change', e => {
  S.raga = e.target.value; S.comp.pick = 0;
  refreshRagaNotes(); renderRibbon(); renderScan(null); refreshCompPick();
  renderProfile(); renderStages(); saveSettings();
  if (S.running && S.kind === 'riyaz') nextRiyaz();
  if (S.running && S.kind === 'comp') startComp();
});
$('rangeSel').addEventListener('change', e => {
  S.range = e.target.value; refreshRagaNotes(); renderRibbon(); saveSettings();
  if (S.running && S.kind === 'riyaz') nextRiyaz();
});
$('lenSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-len]'); if (!b) return;
  S.len = b.dataset.len === 'rand' ? 'rand' : +b.dataset.len;
  [...$('lenSeg').children].forEach(x => x.classList.toggle('sel', x === b));
  saveSettings();
});
$('bpm').addEventListener('input', e => {
  S.bpm = +e.target.value; $('bpmVal').textContent = S.bpm + ' BPM';
  if (S.taal !== 'none') refreshTaal();
  saveSettings();
});
$('modes').addEventListener('change', e => {
  S.mode = e.target.value;
  [...$('modes').children].forEach(m => m.classList.toggle('sel', m.dataset.mode === S.mode));
  saveSettings();
});
$('autoNext').addEventListener('change', e => { S.autoNext = e.target.checked; saveSettings(); });
$('strictSaptak').addEventListener('change', e => { S.strict = e.target.checked; saveSettings(); });
$('ladder').addEventListener('change', e => { S.ladder = e.target.checked; saveSettings(); });
$('blind').addEventListener('change', e => {
  S.blind = e.target.checked; saveSettings();
  if (S.phase === 'guru' || S.phase === 'response'){
    S.revealed = !S.blind; renderCards();
    S.hits.forEach((h,i)=>{ if(h) markCard(i,'hit'); });
    focusTarget(); syncButtons();
  }
});
$('sens').addEventListener('input', e => {
  const v = +e.target.value;
  S.rmsGate = .030 - (v/100)*.027;
  $('sensVal').textContent = v < 33 ? 'Quiet room' : v < 70 ? 'Normal' : 'Sensitive';
  saveSettings();
});
$('resetScan').addEventListener('click', () => { S.scan = {}; renderScan(null); });
function setHand(left){
  S.leftHold = left;
  $('holdSel').value = left ? 'left' : 'right';
  [...$('handSeg').children].forEach(b => b.classList.toggle('sel', (b.dataset.hand === 'left') === left));
  renderFlute(); saveSettings();
}
$('holdSel').addEventListener('change', e => setHand(e.target.value === 'left'));
$('handSeg').addEventListener('click', e => {
  const b = e.target.closest('button[data-hand]'); if (b) setHand(b.dataset.hand === 'left');
});
function disableMic(){
  if (S.micInterval){ clearInterval(S.micInterval); S.micInterval = null; }
  if (S.stream){ S.stream.getTracks().forEach(t => { try{ t.stop(); }catch(e){} }); S.stream = null; }
  if (S.analyser){ try{ S.analyser.disconnect(); }catch(e){} S.analyser = null; }
  S.micOn = false; S.lastHz = 0; S.buf = null;
  S.stableNote = null; S.stableCount = 0;
  $('micPill').classList.remove('on','warn');
  $('micLabel').textContent = 'Mic off';
  $('levelBar').style.width = '0%';
  $('needle').classList.remove('on');
  $('readout').classList.remove('in'); $('readout').innerHTML = '\u2014 <b>mic off</b>';
  if (S.view === 'tuner') tunerSilent();
  /* back to a pure playback session — this is what makes the flute loud again on iPhone */
  audioSessionType('playback');
  if (wakeLock){ try{ wakeLock.release(); }catch(e){} wakeLock = null; }
  hideHint(); syncButtons();
}
const GRAMMAR_NOTE = {
  chalan:'Phrases are assembled from authentic fragments of the raga\u2019s chalan, so every one sounds like the raga. Fewer distinct phrases, all idiomatic.',
  rules:'Free movement over the raga\u2019s swaras, but every phrase is checked against aroh/avroh, resolutions and vakra rules before you hear it. Wide variety, still legal.',
  free:'Any allowed swara in any order \u2014 interval and finger drilling rather than raga work.'
};
const MATCH_NOTE = {
  forgiving:'If you fumble one swara, playing the next still moves you on \u2014 the skipped one is marked missed instead of stalling the phrase.',
  strict:'Only the next swara counts. Nothing advances until you get it.',
  any:'Order is ignored. Useful for hearing the notes, but a raga phrase is a sequence, so keep this for drilling.'
};
$('grammarSel').addEventListener('change', e => {
  S.grammar = e.target.value;
  $('grammarNote').textContent = GRAMMAR_NOTE[S.grammar];
  saveSettings();
  if (S.running && S.kind === 'riyaz') nextRiyaz();
});
$('matchSel').addEventListener('change', e => {
  S.match = e.target.value;
  $('matchNote').textContent = MATCH_NOTE[S.match];
  saveSettings();
});
$('vol').addEventListener('input', e => { audio(); setVolume(+e.target.value/100); });
$('micPill').addEventListener('click', () => { primeAudio(); S.micOn ? disableMic() : enableMic(); });
$('startBtn').addEventListener('click', startRiyaz);
$('stopBtn').addEventListener('click', stopAll);
$('repeatBtn').addEventListener('click', () => { if (S.phrase.length) playPhrase(); });
$('nextBtn').addEventListener('click', () => S.running ? nextRiyaz() : startRiyaz());
$('revealBtn').addEventListener('click', () => {
  S.revealed = true; renderCards();
  S.hits.forEach((h,i)=>{ if(h) markCard(i,'hit'); });
  focusTarget(); syncButtons();
});
let _rz;
function onResize(){
  clearTimeout(_rz);
  _rz = setTimeout(() => {
    renderRibbon(); renderFlute();
    if (S.view === 'orn'){ sizeTrace(); drawTrace(); }
  }, 140);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);
document.addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea')) return;
  const tabs = ['riyaz','alap','comp','orn','tuner'];
  if (['1','2','3','4','5'].includes(e.key)){ showView(tabs[+e.key-1]); return; }
  if (e.code === 'Space'){
    e.preventDefault();
    if (S.kind === 'orn' && S.orn.spec && S.phase !== 'guru') playOrn();
    else if (S.phrase.length && S.phase !== 'guru') playPhrase();
  }
  if (e.key === 'n' || e.key === 'N'){
    if (!S.running) return;
    S.kind === 'orn' ? nextOrn() : S.kind === 'alap' ? nextAlap()
      : S.kind === 'comp' ? (S.comp.idx++, loadCompLine()) : nextRiyaz();
  }
  if ((e.key === 'r' || e.key === 'R') && !S.revealed) $('revealBtn').click();
});

/* ---- boot ---- */
loadSettings();
renderFlute(); buildSaSelects(); buildMeterTicks(); buildGestureGrid();
$('ragaSel').value = S.raga; $('rangeSel').value = S.range; $('taalSel').value = S.taal;
$('holdSel').value = S.leftHold ? 'left' : 'right';
$('grammarSel').value = S.grammar; $('grammarNote').textContent = GRAMMAR_NOTE[S.grammar];
$('matchSel').value = S.match;     $('matchNote').textContent = MATCH_NOTE[S.match];
$('vol').value = String(Math.round(S.vol*100)); $('volVal').textContent = Math.round(S.vol*100) + '%';
$('thekaVol').value = String(Math.round(S.thekaVol*100));
$('thekaVolVal').textContent = Math.round(S.thekaVol*100) + '%';
$('pluck').value = String(Math.round(S.pluckGap*100));
$('pluckVal').textContent = S.pluckGap.toFixed(2) + ' s';
renderTheka(-1);
document.addEventListener('pointerdown', primeAudio, {passive:true});
document.addEventListener('touchstart', primeAudio, {passive:true});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.ctx && S.ctx.state === 'suspended') S.ctx.resume();
});
[...$('handSeg').children].forEach(b => b.classList.toggle('sel', (b.dataset.hand === 'left') === S.leftHold));
$('bpm').value = S.bpm; $('bpmVal').textContent = S.bpm + ' BPM';
$('autoNext').checked = S.autoNext; $('blind').checked = S.blind;
$('strictSaptak').checked = S.strict; $('ladder').checked = S.ladder;
$('retSthayi').checked = S.retSthayi; $('playAlong').checked = S.playAlong;
$('pasteText').value = S.paste.text || ''; $('pasteMatra').value = String(S.paste.matras);
if (S.paste.text) S.paste.parsed = parseNotation(S.paste.text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean));
$('droneReg').value = String(S.droneReg); $('dronePartner').value = String(S.dronePartner);
document.querySelector('input[name=mode][value='+S.mode+']').checked = true;
[...$('modes').children].forEach(m => m.classList.toggle('sel', m.dataset.mode === S.mode));
[...$('lenSeg').children].forEach(x => x.classList.toggle('sel',
  x.dataset.len === String(S.len)));
setSa(S.sa); renderRibbon(); refreshRagaNotes(); renderScan(null);
refreshCompPick(); renderProfile(); renderStages();
setFingering(0); updateStats(); syncButtons(); refreshTaal();
showView('riyaz'); sizeTrace();
requestAnimationFrame(() => { renderRibbon(); renderFlute(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
