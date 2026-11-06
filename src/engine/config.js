// Everything Nib can be set to: hands, pens, inks, papers, presets and defaults.
export const PAGE_W = 794, PAGE_H = 1123; // A4 at 96 dpi, the page's own units
export const PAD = { l:52, r:40, t:44, b:34 }; // room around a text box for markers, ascenders, jitter

// group: real = looks like a real person's pen; neat = tidy or school hands; fun = marker and comic.
// conn = joined-up script: letters keep their joins, so per-letter jitter is kept small.
export const FONTS = [
  { id:'labelle',    name:'La Belle Aurore',         family:'La Belle Aurore',         weight:400, scale:0.92, group:'real', conn:true },
  { id:'sunrise',    name:'Waiting for the Sunrise', family:'Waiting for the Sunrise', weight:400, scale:0.90, group:'real' },
  { id:'dawning',    name:'Dawning of a New Day',    family:'Dawning of a New Day',    weight:400, scale:1.05, group:'real', conn:true },
  { id:'cedarville', name:'Cedarville Cursive',      family:'Cedarville Cursive',      weight:400, scale:0.86, group:'real', conn:true },
  { id:'zeyada',     name:'Zeyada',                  family:'Zeyada',                  weight:400, scale:1.04, group:'real' },
  { id:'nothing',    name:'Nothing You Could Do',    family:'Nothing You Could Do',    weight:400, scale:0.86, group:'real' },
  { id:'loved',      name:'Loved by the King',       family:'Loved by the King',       weight:400, scale:0.70, group:'real' },
  { id:'badscript',  name:'Bad Script',              family:'Bad Script',              weight:400, scale:0.74, group:'real', conn:true },
  { id:'grapenuts',  name:'Grape Nuts',              family:'Grape Nuts',              weight:400, scale:1.08, group:'real' },
  { id:'oooh',       name:'Oooh Baby',               family:'Oooh Baby',               weight:400, scale:0.98, group:'real', conn:true },
  { id:'squarepeg',  name:'Square Peg',              family:'Square Peg',              weight:400, scale:1.22, group:'real' },
  { id:'girl',       name:'The Girl Next Door',      family:'The Girl Next Door',      weight:400, scale:0.84, group:'real' },
  { id:'glory',      name:'Give You Glory',          family:'Give You Glory',          weight:400, scale:0.78, group:'real' },
  { id:'annie',      name:'Annie Use Your Telescope',family:'Annie Use Your Telescope',weight:400, scale:0.84, group:'real' },
  { id:'liujian',    name:'Liu Jian Mao Cao',        family:'Liu Jian Mao Cao',        weight:400, scale:0.82, group:'real' },
  { id:'sueellen',   name:'Sue Ellen Francisco',     family:'Sue Ellen Francisco',     weight:400, scale:0.84, group:'real' },
  { id:'justme',     name:'Just Me Again Down Here', family:'Just Me Again Down Here', weight:400, scale:1.22, group:'real' },
  { id:'reenie',     name:'Reenie Beanie',           family:'Reenie Beanie',           weight:400, scale:1.10, group:'real' },
  { id:'shadows',    name:'Shadows Into Light',      family:'Shadows Into Light',      weight:400, scale:0.90, group:'real' },
  { id:'apple',      name:'Homemade Apple',          family:'Homemade Apple',          weight:400, scale:0.62, group:'real', conn:true },
  { id:'rainbow',    name:'Over the Rainbow',        family:'Over the Rainbow',        weight:400, scale:0.62, group:'real' },
  { id:'playwrite',  name:'School cursive',          family:'Playwrite GB S',          weight:400, scale:0.72, group:'neat', conn:true },
  { id:'edu',        name:'School print',            family:'Edu NSW ACT Foundation',  weight:400, scale:0.88, group:'neat' },
  { id:'marck',      name:'Marck Script',            family:'Marck Script',            weight:400, scale:1.00, group:'neat', conn:true },
  { id:'caveat',     name:'Caveat',                  family:'Caveat',                  weight:400, scale:1.00, group:'neat', forms:3 },
  { id:'playpen',    name:'Playpen Sans',            family:'Playpen Sans',            weight:400, scale:0.78, group:'neat', forms:7 },
  { id:'mynerve',    name:'Mynerve',                 family:'Mynerve',                 weight:400, scale:0.92, group:'neat', forms:3 },
  { id:'kalam',      name:'Kalam',                   family:'Kalam',                   weight:300, scale:0.80, group:'neat' },
  { id:'patrick',    name:'Patrick Hand',            family:'Patrick Hand',            weight:400, scale:0.92, group:'neat' },
  { id:'nanum',      name:'Nanum Pen Script',        family:'Nanum Pen Script',        weight:400, scale:1.12, group:'neat' },
  { id:'indie',      name:'Indie Flower',            family:'Indie Flower',            weight:400, scale:0.82, group:'fun' },
  { id:'gloria',     name:'Gloria Hallelujah',       family:'Gloria Hallelujah',       weight:400, scale:0.74, group:'fun' },
  { id:'covered',    name:'Covered By Your Grace',   family:'Covered By Your Grace',   weight:400, scale:0.82, group:'fun' },
];
export const FONT_GROUPS = [['real', 'Realistic pen'], ['neat', 'Neat and school'], ['fun', 'Marker and fun'], ['mine', 'Your fonts']];
// w: line width the pen lays down, in page units (A4 = 794 wide). halo: ink soaking into the paper.
// dn: how much harder downstrokes press than side strokes. flow: how much pressure wanders.
export const PENS = [
  { id:'fine',   name:'Fineliner', note:'0.4 mm', w:1.25, a:0.99, grain:0.08, halo:0.05, dn:0.25, flow:0.55 },
  { id:'ball',   name:'Ballpoint', note:'0.7 mm', w:1.65, a:0.98, grain:0.20, halo:0.00, dn:0.35, flow:1.00 },
  { id:'gel',    name:'Gel pen',   note:'1.0 mm', w:2.25, a:0.99, grain:0.05, halo:0.10, dn:0.45, flow:0.70 },
  { id:'felt',   name:'Felt tip',  note:'1.5 mm', w:3.10, a:0.96, grain:0.04, halo:0.18, dn:0.30, flow:0.50 },
  { id:'pencil', name:'Pencil',    note:'HB',     w:1.55, a:0.82, grain:0.48, halo:0.00, dn:0.40, flow:1.10 },
  { id:'font',   name:'As drawn',  note:'font’s own', w:0, a:0.95, grain:0.14, halo:0.12, dn:0.30, flow:0.70 },
];
export const INKS = [
  { id:'blue',      name:'Blue',       c:'#1f3c9e' },
  { id:'blueblack', name:'Blue-black', c:'#1c2448' },
  { id:'black',     name:'Black',      c:'#232427' },
  { id:'red',       name:'Red',        c:'#b4262d' },
  { id:'green',     name:'Green',      c:'#1e6b40' },
  { id:'purple',    name:'Purple',     c:'#4b2a8c' },
];
export const PRESETS = [
  { id:'neat',    name:'Neat',    v:{ mess:15, wobble:12, variety:35, flow:30 } },
  { id:'natural', name:'Natural', v:{ mess:45, wobble:30, variety:60, flow:55 } },
  { id:'hurried', name:'Hurried', v:{ mess:72, wobble:50, variety:75, flow:70 } },
  { id:'messy',   name:'Messy',   v:{ mess:100, wobble:80, variety:95, flow:90 } },
];
export const PAPERS = {
  ruled:  { name:'Ruled',      bg:[251,251,247], rule:'#8fb1d9', margin:'#de7f80', holes:true },
  spiral: { name:'Spiral',     bg:[250,250,245], rule:'#8fb1d9', margin:'#de7f80', spiral:true },
  yellow: { name:'Yellow pad', bg:[249,238,170], rule:'#8aa4bf', margin:'#d36c6c', double:true },
  grid:   { name:'Grid',       bg:[250,250,246], grid:'#a9c0dc', holes:true },
  plain:  { name:'Plain',      bg:[249,249,246], holes:true },
  photo:  { name:'Photo',      bg:[201,198,203], photo:true }, // a real sheet photographed on a cloth
};
export const DEFAULTS = { font:'labelle', ink:'blue', customInk:'#5a2d82', tip:'ball', weight:100, size:30, gap:34, mess:45, wobble:30, variety:60, flow:55, track:0, words:0, mistakes:0, paper:'ruled', holes:false, lighting:true, ghost:true, crease:false, look:'none', tilt:true, seed:7 };
export const LIMITS = { size:[18,44], gap:[24,48], mess:[0,100], wobble:[0,100], variety:[0,100], flow:[0,100], weight:[50,160], track:[-3,8], words:[-50,150], mistakes:[0,100] };
export const TOGGLES = ['lighting', 'ghost', 'crease', 'holes', 'tilt'];
export const KEY = 'longhand.v2', OLD_KEY = 'longhand.v1';

export const SAMPLE_HEAD = `Name: Aarav Mehta
Class: 8-B
Date: 29 October 2026`;
export const SAMPLE_BODY = `# The Water Cycle

## What it is
The water cycle is the **continuous movement** of water between the earth’s surface and the atmosphere. It has *four main stages*.

1. Evaporation: the sun heats water in oceans, rivers and lakes.
2. Condensation: water vapour cools and forms clouds.
3. Precipitation: water falls back as ==rain, snow or hail==.
4. Collection: water gathers in rivers, lakes and underground.

> The same water has been moving through this cycle for billions of years.

## Why it matters
Without the water cycle, plants could not grow and ~~rivers would~~ fresh water would run out. It also helps control the earth’s temperature.`;

