"use strict";
/* ============================ 1. PITCH MODEL ============================ */
const PC = [
  {name:'Sa', dev:'सा', mark:''},  {name:'re', dev:'रे', mark:'♭'},
  {name:'Re', dev:'रे', mark:''},  {name:'ga', dev:'ग',  mark:'♭'},
  {name:'Ga', dev:'ग',  mark:''},  {name:'ma', dev:'म',  mark:''},
  {name:'Ma', dev:'म',  mark:'♯'}, {name:'Pa', dev:'प',  mark:''},
  {name:'dha',dev:'ध',  mark:'♭'}, {name:'Dha',dev:'ध',  mark:''},
  {name:'ni', dev:'नि', mark:'♭'}, {name:'Ni', dev:'नि', mark:''}
];
const WEST = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const SAPTAK = {'-2':'Ati-mandra','-1':'Mandra','0':'Madhya','1':'Taar','2':'Ati-taar'};
const mod12 = s => ((s % 12) + 12) % 12;
const saptakOf = s => Math.floor(s / 12);
function swara(semi){
  const p = PC[mod12(semi)], k = saptakOf(semi);
  return {name:p.name, dev:p.dev, mark:p.mark, saptak:k, saptakName:SAPTAK[String(k)] || (k>0?'Ati-taar':'Ati-mandra')};
}
function swaraHTML(semi){
  const s = swara(semi);
  const cls = s.saptak > 0 ? ' taar' : s.saptak < 0 ? ' mandra' : '';
  return '<span class="sw'+cls+'">'+s.name+(s.mark?'<span class="acc">'+s.mark+'</span>':'')+'</span>';
}
function swaraText(semi){
  const s = swara(semi);
  return s.name + s.mark + (s.saptak > 0 ? '\u0307'.repeat(s.saptak)
        : s.saptak < 0 ? '\u0323'.repeat(-s.saptak) : '');
}

/* descOnly: notes a raga uses only while descending */
const RAGAS = {
  desh:        {label:'Desh',        pc:[0,2,4,5,7,9,10,11], descOnly:[4,10]},
  yaman:       {label:'Yaman',       pc:[0,2,4,6,7,9,11],    descOnly:[]},
  hamsadhvani: {label:'Hamsadhvani', pc:[0,2,4,7,11],        descOnly:[]},
  durga:       {label:'Durga',       pc:[0,2,5,7,9],         descOnly:[]},
  all:         {label:'All notes',   pc:[0,1,2,3,4,5,6,7,8,9,10,11], descOnly:[]}
};
const RANGES = {
  madhya:{lo:0,  hi:12, label:'Madhya Sa – Sȧ'},
  mandra:{lo:-5, hi:12, label:'Mandra Pa – madhya Sȧ'},
  taar:  {lo:0,  hi:16, label:'Madhya Sa – taar Ga'},
  full:  {lo:-5, hi:16, label:'Mandra Pa – taar Ga'}
};
/* Raga profile: thaat, vadi/samvadi, resting notes, time of day */
const PROFILE = {
  yaman:{thaat:'Kalyan', vadi:4, samvadi:11, jati:'Sampurna', time:'First prahar of night',
    nyas:[0,2,4,11], note:'Teevra Ma throughout; aroh leans on mandra Ni into Re.'},
  desh:{thaat:'Khamaj', vadi:2, samvadi:7, jati:'Audav–Sampurna', time:'Second prahar of night',
    nyas:[0,2,7], note:'Shuddha Ni climbs, komal ni descends; Ga only as a touch in avroh.'},
  hamsadhvani:{thaat:'Bilawal', vadi:7, samvadi:0, jati:'Audav–Audav', time:'Night',
    nyas:[0,2,7], note:'Carnatic in origin. No ma, no Dha — wide clean leaps.'},
  durga:{thaat:'Bilawal', vadi:5, samvadi:0, jati:'Audav–Audav', time:'Second prahar of night',
    nyas:[0,5,7], note:'No Ga, no Ni. The ma–Pa–Dha cluster carries the raga.'},
  all:{thaat:'—', vadi:0, samvadi:7, jati:'Chromatic', time:'Any',
    nyas:[0,7], note:'Not a raga — a drilling scale.'}
};
/* Badhat: how far the alap has opened up */
const STAGES = [
  {n:'Sthayi', lo:-5, hi:4,  d:'Settle around Sa. Mandra Pa up to Ga, resting often.'},
  {n:'to Pa',  lo:-5, hi:7,  d:'Open the middle. Pa becomes the new resting point.'},
  {n:'to Ni',  lo:-5, hi:11, d:'Upper madhya. Longer arcs, still returning to nyas.'},
  {n:'Taar Sa',lo:-3, hi:12, d:'Reach taar Sa and hold it — the emotional peak.'},
  {n:'Full',   lo:-5, hi:16, d:'The whole flute. Free movement across three saptaks.'}
];
/* Practice gats in Teentaal — written for this app, idiomatic rather than traditional.
   null = hold the previous swara for another matra. */
const GATS = {
  yaman:{
    sthayi:[4,6,4,2, -1,2,0,null, -1,2,4,6, 7,6,4,2],
    antara:[7,9,11,12, null,11,9,null, 11,12,14,12, 11,9,7,6]},
  desh:{
    sthayi:[2,5,7,null, 5,7,11,12, 10,9,7,5, 4,2,4,0],
    antara:[7,11,12,null, 12,14,17,14, 12,10,9,7, 5,4,2,0]},
  hamsadhvani:{
    sthayi:[4,2,0,null, -1,0,2,4, 7,4,2,0, 2,4,7,11],
    antara:[7,11,12,null, 14,12,11,7, 11,12,16,14, 12,11,7,4]},
  durga:{
    sthayi:[5,7,9,null, 7,5,2,0, 2,5,7,9, 7,5,2,0],
    antara:[7,9,12,null, 12,14,12,9, 12,9,7,5, 7,5,2,0]},
  all:{
    sthayi:[0,2,4,null, 5,7,9,11, 12,11,9,7, 5,4,2,0],
    antara:[7,9,11,12, null,14,16,14, 12,11,9,7, 5,4,2,0]}
};
const GRIP = [
  [1,1,1,0,0,0],[1,1,.5,0,0,0],[1,1,0,0,0,0],[1,.5,0,0,0,0],
  [1,0,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,1],[1,1,1,1,1,1],
  [1,1,1,1,1,.5],[1,1,1,1,1,0],[1,1,1,1,.5,0],[1,1,1,1,0,0]
];
const registerOf = s => s < 7 ? 1 : s < 19 ? 2 : 3;
const REG_LABEL = {1:'First register', 2:'Overblow · second register', 3:'Taar · third register'};
const CENT_TOL = 1200 * Math.log2(1.03);

/* ============================ 2. COMPOSITIONS ============================ */
/* Aroh / avroh / pakad, as semitones from madhya Sa */
const CORE = {
  yaman: {
    aroh:  [-1,2,4,6,9,11,12],
    avroh: [12,11,9,7,6,4,2,0],
    pakad: [[-1,2,4],[2,4],[7,6,4,2,0]],
    note:'Aroh skips Pa; teevra Ma throughout. Mandra Ni is the usual approach to Sa.'
  },
  desh: {
    aroh:  [-1,0,2,5,7,11,12],
    avroh: [12,10,9,7,5,4,2,4,0],
    pakad: [[2,5,7,11,12],[10,9,7],[5,4,2]],
    note:'Shuddha Ni climbs, komal ni descends. Shuddha Ga appears only as a touch in avroh.'
  },
  hamsadhvani: {
    aroh:  [0,2,4,7,11,12],
    avroh: [12,11,7,4,2,0],
    pakad: [[0,2,4,7],[11,7,4,2,0]],
    note:'Pentatonic — no ma, no Dha. Clean leaps make it excellent for breath control.'
  },
  durga: {
    aroh:  [0,2,5,7,9,12],
    avroh: [12,9,7,5,2,0],
    pakad: [[5,7,9,5],[7,9,5,2],[0]],
    note:'Pentatonic — no Ga, no Ni. The ma–Pa–Dha cluster is its signature.'
  },
  all: {
    aroh:  [0,1,2,3,4,5,6,7,8,9,10,11,12],
    avroh: [12,11,10,9,8,7,6,5,4,3,2,1,0],
    pakad: [[0,4,7,12],[12,7,4,0]],
    note:'Full chromatic — for interval drilling rather than raga work.'
  }
};
/* Palta patterns: index offsets against the raga scale */
const PALTAS = [
  {n:'Palta 1',  p:[0,1,2,3], d:'Four in a row — the foundation'},
  {n:'Palta 2',  p:[0,1,0],   d:'Step up, step back'},
  {n:'Palta 3',  p:[0,1,2,1], d:'Up three, fall one'},
  {n:'Palta 4',  p:[0,2,1,3], d:'Interlocked — trains skips'},
  {n:'Palta 5',  p:[0,3,2,1], d:'Leap then walk down'},
  {n:'Palta 6',  p:[0,2,4],   d:'Thirds — wide and open'},
  {n:'Palta 7',  p:[0,1,2,3,2,1], d:'Six-note arch'},
  {n:'Palta 8',  p:[0,2,1,0], d:'Turn around the root'}
];
/* Short practice lines built from each raga's characteristic movement */
const LINES = {
  yaman: [
    {n:'Chalan 1', l:[[-1,2,4,2],[0,2,4,6],[7,6,4,2],[0]]},
    {n:'Chalan 2', l:[[4,6,7,9],[11,9,7,6],[7,6,4,2],[4,2,0]]},
    {n:'Taar approach', l:[[7,9,11,12],[12,11,9,7],[9,7,6,4],[2,0]]}
  ],
  desh: [
    {n:'Chalan 1', l:[[0,2,5,7],[11,12],[10,9,7],[5,4,2,0]]},
    {n:'Chalan 2', l:[[2,5,7,5],[7,11,12],[10,9,7,5],[4,2,0]]},
    {n:'Mandra turn', l:[[-1,0,2,0],[-3,-1,0],[2,5,7],[5,4,2,0]]}
  ],
  hamsadhvani: [
    {n:'Chalan 1', l:[[0,2,4,7],[11,12],[11,7,4],[2,0]]},
    {n:'Leap drill', l:[[0,4,7,11],[12,7,4,0],[0,7,4,11],[12,0]]},
    {n:'Taar climb', l:[[4,7,11,12],[14,12,11,7],[4,2,0]]}
  ],
  durga: [
    {n:'Chalan 1', l:[[0,2,5,7],[9,12],[9,7,5],[2,0]]},
    {n:'ma-Pa-Dha', l:[[5,7,9,5],[7,9,12],[9,7,5,2],[0]]},
    {n:'Mandra turn', l:[[-5,-3,0],[2,5,7],[5,2,0],[-3,-5]]}
  ],
  all: [
    {n:'Chromatic walk', l:[[0,1,2,3],[4,5,6,7],[8,9,10,11],[12]]},
    {n:'Interval drill', l:[[0,4,0,7],[0,5,0,9],[0,3,0,8],[0,12]]}
  ]
};

/* ==================== 2b. SARGAM NOTATION PARSER ====================
   Letters resolve against the selected raga's own pitch classes, so "M" is
   teevra in Yaman and shuddha ma in Desh without any extra markup.
   Prefix dots = mandra, suffix apostrophes = taar, ">" holds the previous
   swara for another matra, several letters in one cell split that matra. */
const CAND = {s:[0,0], r:[1,2], g:[3,4], m:[5,6], p:[7,7], d:[8,9], n:[10,11]};
function letterToSemi(letter, dots, quotes){
  const key = letter.toLowerCase(), isLow = letter === key;
  const [lo, hi] = CAND[key];
  let pc = isLow ? lo : hi;
  const pcs = new Set(RAGAS[S.raga].pc);
  if (!pcs.has(pc)){ const alt = isLow ? hi : lo; if (pcs.has(alt)) pc = alt; }
  return pc + 12*(quotes - dots);
}
function parseNotationLine(line){
  const cells = String(line).trim().split(/[\t ]+/).filter(Boolean);
  const ev = [], grid = [];
  for (const cell of cells){
    if (/^[>—–-]+$/.test(cell)){
      if (ev.length) ev[ev.length-1].d += 1;
      grid.push({hold:true});
      continue;
    }
    const toks = [...cell.replace(/[,|]/g,'').matchAll(/(\.*)([SRGMPDNsrgmpdn])('*)/g)];
    if (!toks.length) continue;
    const each = 1/toks.length, notes = [];
    for (const t of toks){
      const semi = letterToSemi(t[2], t[1].length, t[3].length);
      ev.push({s:semi, d:each}); notes.push(semi);
    }
    grid.push({notes});
  }
  return {ev, grid};
}
function parseNotation(lines){
  return lines.map(l => parseNotationLine(l)).filter(x => x.ev.length);
}

/* Yaman teaching material — Sangeetapriya Academy of Music (Venugopal Hegde),
   published on bansuri.com. Dadra taal, 6 matras; each written line is two cycles. */
const YAMAN_PACK = {
  taal:'Dadra', matras:6,
  source:'Sangeetapriya Academy of Music (Shri Venugopal Hegde) · bansuri.com',
  alaap:[
    "S > > > .N .D S > > > >",
    ".N .D S .N > > .N .D .P > >",
    ".D .N R > > .N .D S > > >",
    "S .N .D .N R > > > >",
    ".N .D .N G R > > >",
    "M G R > > .N .D .N S > >",
    "G R .N R G > > >",
    "M G R > > >",
    "N R G G M > > P M G >",
    "R GM P > M GR S > > >",
    ".N R G > R G M > G M P",
    "N > D P > M GR > > >",
    "G R .N .D S > > > > > >"],
  sthayiA:["S .N .D N R R G > > R .N R", "M > > G M D P MG R S > >"],
  sthayiB:["G G R G M D P > > D N S'", "N D P D P M P MG R S > >"],
  antaraA:["P P P G M P M D N S' > >"],
  antaraB:["G' > > R'S' ND P R' > > S'N DP M", "N D P D P M P MG R S > >"],
  alaapSthayi1:[
    "G R S R .N R G > > > > >",
    "M M M P > > R G M G > >",
    "R G M P > > M G R S > >",
    ".D .N R .N R G R G P M > >",
    "M M G R .N R G G R .N .D .N",
    ".D .N R P M G R > S > > >",
    ".N .D .N G R G R .N R M G M",
    ".N R G R G M P > > > > >",
    "G M D P > > R G P M > >",
    ".N R M G > > P MG R S > >",
    "M G R S .N .D .NR GM P > > >",
    "R G R S .N .D .NR GM P > > >",
    "S' N D ND PM GM N D P DP MG RG",
    "D P M PM GR SR P M G MG RS .NS"],
  alaapSthayi2:[
    ".N R G MG RS .N.D .N R GM P > >",
    "R G M PM GR SR R G MD P > >",
    "P P P M G M N D P MG RS .NS",
    "R G M P M P G M N D > >",
    "G M P M G M G M P D > >",
    "D P M GM GM P P M G RG RG M",
    "P > M G > R S > .N R > S",
    "P MG R G M P M D S' N > >",
    "ND PM GR G M P G M D N > >",
    "N G' R' S' N D S' N S' N DP M",
    "N D N D PM G P M P M GR S"],
  alaapAntara:[
    "S' N D ND PM GM R GM D N > >",
    "N S' N DP MG RS R GM D N > >",
    "N > S' N DP M GM D N S' > >",
    "G > M D > N S' > > > > >",
    "DP M G M D N DP M G M D N",
    "S' > > N D N R' > > > > >",
    "N S' D N M D R' > > > > >",
    "R' G' R' N D N D N R' S' > >",
    "D N R' S' N D N R' R' G' > >",
    "M' G' R' S' N D M D N R' > >",
    "N D P M G R GM DN S' > > >"],
  taanSthayi1:[
    "S.N RS .N.D .N R G .NG RS .N.D .N R G",
    "RM GR S.N .D .N R .NR S.N .D.P .D .N S",
    "S S S .N.D .NR GR S S S .NR GM GR",
    "G G G PM GR .NR G G G ND PM GR",
    "S .N.D .NR G RS .N.D N DP MG P MG RS",
    ".NR GM GR PM GR S.N .D.N R R G > >",
    "RG RG MP .NR .NR GM .D.N .D.N RG P M G",
    "P MG RG DP MG RS M GR .NR PM GR S.N",
    ".DN R R .NR G G RG MD PM GR S.N S",
    ".D.N .D.N RG .NR .NR GM PM GR .NR MG RS .NS",
    ".NR .NR GM RG RG MP DP MG RG PM GR SS",
    "S.N .D.N RG MG RS .N.D ND PM GR DP MG RS"],
  taanSthayi2:[
    "S .N.D .NR GR S.N .D.N R > > MG RS .NS",
    "S .N.D .NR GR S.N .D.N R > > PM GR S",
    "PM GR S .N.D .NG RG ND PM G RN RM GM",
    "S'N DP M GM GP MP DP MG R S.N RS .NS",
    "PM GR S.N R GM D P > > RG MG MP",
    "DP MG RS .N RG MD P > > .NR GM P",
    "S'N DP MG ND PM GR DP MG RS P MG RS",
    "SS .N.D .NR MG RS .NS PP MG RG DP MG RS",
    ".D.N RG MP NR GM DN RG MD NS' ND PM GR",
    "NN DP MG DD PM GR PP MG RG MM GR SS",
    ".NG RS .N.D .NR GM P RG MD NS' N > >",
    "RG P,M GR, GM D,P MG, MD N,D PM, RG MD NS'",
    "N > > RG M,G MD, MD N,G' R'S' N > >",
    "NS' N DP DN D PM RP M GR MG RS .NS"],
  taanAntara:[
    "PM GR MG MG RS .N.D RG MD N D > >",
    "GM DN S' N > > MD NR' G'R' S' > >",
    "NR GM D RG MD NR' S' > > > > >",
    "MD NR' G'R' S'N DN R' S' > > ND PM GR",
    ".NR GM DN R' > > S'N DN R'G' R' > >",
    "G'R' S'N DP MG RS .N.D .NR GM DN S' > >",
    "PM MG RS ND DP MG S'N ND PM RG MD NR'",
    "S' > > NG' G'R' S'N DN R'G' R' R'M' M'G' R'S'",
    "NR' G'M' G' NR' G'R' S'N DP MG RG MD NR' S'"]
};
/* section list: [label, key, free?, returnable?] */
const PACK_SECTIONS = [
  {n:'Alaap — before the taal', k:'alaap', free:true,
   d:'Unmetered. Open in the mandra saptak and let the swaras arrive one at a time.'},
  {n:'Bandish — sthayi, primary', k:'sthayiA',
   d:'The mukhda. Everything else returns here.'},
  {n:'Bandish — sthayi, secondary', k:'sthayiB', d:'The second half of the sthayi.'},
  {n:'Bandish — antara, primary', k:'antaraA', d:'Climbs to taar Sa.'},
  {n:'Bandish — antara, secondary', k:'antaraB', d:'Peaks on taar Ga and falls back to the sthayi.'},
  {n:'Bandish — full performance order', k:'full',
   d:'Sthayi primary ×2, secondary ×1, primary ×1 · antara primary ×2, secondary ×1, sthayi primary ×1.'},
  {n:'Alaap in sthayi I', k:'alaapSthayi1', ret:true, d:'Improvisation in the mandra and madhya saptaks.'},
  {n:'Alaap in sthayi II', k:'alaapSthayi2', ret:true, d:'Denser movement, more half-matra pairs.'},
  {n:'Alaap in antara', k:'alaapAntara', ret:true, d:'Madhya and taar saptaks. Follow with the antara.'},
  {n:'Taan in sthayi I', k:'taanSthayi1', ret:true, d:'Fast runs, mostly two swaras to the matra.'},
  {n:'Taan in sthayi II', k:'taanSthayi2', ret:true, d:'Continued — wider leaps and taar entries.'},
  {n:'Taan in antara', k:'taanAntara', ret:true, d:'Fast runs through the upper saptaks.'}
];

const GESTURES = [
  {id:'meend',   n:'Meend',   d:'A smooth glide from one swara to another — no re-articulation.'},
  {id:'kan',     n:'Kan swar',d:'A grace note brushed on the way into the main swara.'},
  {id:'andolan', n:'Andolan', d:'A slow, narrow sway around one swara.'},
  {id:'gamak',   n:'Gamak',   d:'A heavy oscillation swinging a full swara wide.'},
  {id:'murki',   n:'Murki',   d:'A quick cluster turning around the main note.'},
  {id:'sustain', n:'Sustain', d:'Hold one swara dead steady — breath and embouchure control.'},
  {id:'mix',     n:'Mixed',   d:'A random ornament each round.'}
];

/* ==================== 3b. RAGA GRAMMAR ====================
   A raga is not a scale you may wander over freely. Three things are encoded:

   asc / desc   which swaras are available climbing vs falling. Desh climbs
                S R m P N and falls S' n D P m G R S, so Ga, Dha and komal ni
                belong to the descent and shuddha Ni to the ascent.
   resolve      a swara that must go somewhere particular next. Desh's Ga has
                to fall to Re, which is why "R G m" is wrong but "R m G R" is right.
   vakra        crooked turns that are idiomatic even though they break the
                directional rule, e.g. Desh's "G R G S".
   motifs       authentic fragments of the raga's chalan. Chaining these
                overlapping fragments produces phrases that sound like the raga
                instead of like a random walk over its notes.                        */
const GRAMMAR = {
  desh:{
    asc:[0,2,5,7,11], desc:[0,2,4,5,7,9,10],
    resolve:{4:[2,0]},
    vakra:[[4,2,4,0],[5,4,2,4,0],[2,4,2,0]],
    end:[0,2,7],
    motifs:[
      [-1,0,2],[-3,-1,0],[0,2,5],[2,5,7],[5,7,11],[7,11,12],[11,12],
      [12,10,9],[10,9,7],[9,7,5],[7,5,4,2],[5,4,2],[4,2,0],[5,4,2,4,0],
      [2,5,7,5],[0,2,5,4,2],[12,14,12,10,9],[7,11,12,10,9]]
  },
  yaman:{
    asc:[0,2,4,6,7,9,11], desc:[0,2,4,6,7,9,11],
    resolve:{},
    weakAsc:[7],
    vakra:[[6,4,2,0],[11,9,7,6]],
    end:[0,2,4,11],
    motifs:[
      [-1,2,4],[-1,2,4,2,0],[2,4,6],[4,6,9],[6,9,11],[9,11,12],[4,6,7],
      [12,11,9],[11,9,7],[9,7,6],[7,6,4],[6,4,2],[4,2,0],[2,0,-1],
      [7,6,4,2,0],[2,4,6,7],[11,12,14,12],[4,6,9,11]]
  },
  hamsadhvani:{
    asc:[0,2,4,7,11], desc:[0,2,4,7,11],
    resolve:{}, vakra:[], end:[0,4,7],
    motifs:[
      [-1,0,2],[0,2,4],[2,4,7],[4,7,11],[7,11,12],[12,11,7],[11,7,4],
      [7,4,2],[4,2,0],[0,4,7,11],[12,11,7,4],[2,4,7,4,2],[11,12,14,12]]
  },
  durga:{
    asc:[0,2,5,7,9], desc:[0,2,5,7,9],
    resolve:{}, vakra:[[5,7,9,5]], end:[0,5,7],
    motifs:[
      [-5,-3,0],[0,2,5],[2,5,7],[5,7,9],[7,9,12],[5,7,9,5],[12,9,7],
      [9,7,5],[7,5,2],[5,2,0],[2,0,-3],[9,12,9,7],[0,2,5,7,5]]
  },
  all:{
    asc:[0,1,2,3,4,5,6,7,8,9,10,11], desc:[0,1,2,3,4,5,6,7,8,9,10,11],
    resolve:{}, vakra:[], end:[0,7], motifs:[]
  }
};

/* Does a candidate phrase obey the raga? Returns null when fine, else the reason. */
function grammarFault(phrase, raga){
  const g = GRAMMAR[raga];
  if (!g) return null;
  const pc = s => ((s % 12) + 12) % 12;

  /* a whitelisted vakra turn suspends the directional rule over its span */
  const exempt = new Array(phrase.length).fill(false);
  for (const v of (g.vakra || [])){
    for (let i = 0; i + v.length <= phrase.length; i++){
      let ok = true;
      for (let k = 0; k < v.length; k++) if (pc(phrase[i+k]) !== v[k]) { ok = false; break; }
      if (ok) for (let k = 0; k < v.length; k++) exempt[i+k] = true;
    }
  }
  for (let i = 1; i < phrase.length; i++){
    const cur = pc(phrase[i]), rising = phrase[i] > phrase[i-1];
    if (!exempt[i]){
      const set = rising ? g.asc : g.desc;
      if (!set.includes(cur))
        return (rising ? 'ascending onto ' : 'descending onto ') + cur + ' is outside the raga';
    }
    const prev = pc(phrase[i-1]);
    if (g.resolve[prev] && !exempt[i-1] && !g.resolve[prev].includes(cur))
      return prev + ' must resolve to ' + g.resolve[prev].join(' or ');
  }
  const last = pc(phrase[phrase.length-1]);
  if (g.resolve[last]) return 'a phrase cannot be left hanging on ' + last;
  return null;
}
