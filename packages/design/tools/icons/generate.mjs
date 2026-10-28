import { Path2D, PathOp, StrokeCap, StrokeJoin, createCanvas } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

// Original DigiGate geometry. Skia expands the construction strokes into filled paths.
const here = path.dirname(fileURLToPath(import.meta.url));
const design = path.resolve(here, '../..');
const out = path.join(design, 'assets');
const icons = new Map();
const P = d => new Path2D(d);
const clone = p => new Path2D(p);
const stroke = (d, width = 1.75) => (typeof d === 'string' ? P(d) : clone(d)).stroke({ width, cap: StrokeCap.Round, join: StrokeJoin.Round });
const union = (...ps) => ps.reduce((a, p) => a.op(p, PathOp.Union), new Path2D());
const cut = (a, ...bs) => bs.reduce((p, b) => p.op(b, PathOp.Difference), clone(a));
const circle = (x, y, r) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); p.closePath(); return p; };
const ring = (x, y, r, w = 1.75) => stroke(circle(x, y, r), w);
const rect = (x, y, w, h, r = 2) => { const p = new Path2D(); p.roundRect(x, y, w, h, r); return p; };
const box = (x, y, w, h, r = 2) => stroke(rect(x, y, w, h, r));
const tx = (p, s = 1, x = 0, y = 0) => clone(p).transform({ a: s, b: 0, c: 0, d: s, e: x, f: y });
const mirror = p => clone(p).transform({ a: -1, b: 0, c: 0, d: 1, e: 24, f: 0 });
const fit = (p, x, y, w, h) => { const [l,t,r,b] = p.computeTightBounds(); const s = Math.min(w/(r-l),h/(b-t)); return tx(p,s,x+(w-(r-l)*s)/2-l*s,y+(h-(b-t)*s)/2-t*s); };
const check = stroke('M7 12l3.2 3.2L17 8.5');
const cross = stroke('M8 8l8 8M16 8l-8 8');
const plus = stroke('M12 7v10M7 12h10');
const minus = stroke('M7 12h10');
const question = union(stroke('M9.4 8.7C9.4 5.5 15.2 5.4 15.2 8.8c0 2.4-3.2 2.3-3.2 4.5'), circle(12,16.3,.9));
const bang = union(stroke('M12 7.5v5.3'),circle(12,16.2,.95));
const clock = union(ring(12,12,9),stroke('M12 6.5V12l3.5 2'));
const person = union(ring(12,7,3.1),stroke('M5 20v-1.6c0-3.1 2.8-5.4 7-5.4s7 2.3 7 5.4V20'));
const personFilled = union(circle(12,7,3.6),P('M4 20v-1.5C4 14.7 7.5 12.5 12 12.5s8 2.2 8 6V20Z').round(1));
const shieldShape = P('M12 3l8 3v6c0 4.2-3.1 7.1-8 9-4.9-1.9-8-4.8-8-9V6Z');
const shield = stroke(shieldShape);
const badge = (base, symbol, cx = 18, cy = 18) => {
  const cleared=cut(base,circle(cx,cy,4.4));
  if(symbol===clock) return union(cleared,ring(cx,cy,3.125),stroke(`M${cx} ${cy-1.5}v1.5l1.2.7`,1.2));
  // A shield, bell, calendar or gear is already shape-coded; no second circular frame.
  if([shield,shieldShape,bell,calendar,gear,gearFilled].includes(symbol)) return union(cleared,fit(symbol,cx-3.6,cy-3.6,7.2,7.2));
  return union(cleared,ring(cx,cy,3.125),fit(symbol,cx-2,cy-2,4,4));
};
const bracket = stroke('M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3');
const barcode = union(rect(7,7,1.5,10,.2),rect(10,7,2,10,.2),rect(13.5,7,1,10,.2),rect(16,7,1,10,.2));
const carBody = P('M3 15v-2l3-1 2.7-5h6.4l3.9 5 2 1v4h-2M7 17h7M3 15v2h1');
const car = union(stroke(carBody),stroke('M6 12h12M12 7v5'),ring(5.5,17,2),ring(16.5,17,2));
const carFilled = union(cut(P('M3 12l3-1 2.5-4.5h7L19 11.5l2 1V17H3Z').round(.8),P('M8.1 11h8.3l-2-2.7H9.7Z')),circle(6,17.2,2.3),circle(17.4,17.2,2.3));
const plate = union(box(3,7,18,10),...[6,10,14,18].map(x=>rect(x-.6,10,1.2,4,.3)));
const walk = union(circle(13.3,4.2,1.5),stroke('M12 8l-2 5 4 2 1 6M10 13l-3 7M12 8l3 4h3M11.7 8.5 8 10l-2 3'));
const wheel = union(ring(12,16,5),stroke('M7 15h10M12 16v5'));
const driver = union(ring(12,6,2.8),stroke('M4 18v-3c0-2.8 2-4.5 4-5M20 18v-3c0-2.8-2-4.5-4-5'),wheel);
const occupants = union(ring(12,7.5,2.6),stroke('M6.5 20v-3c0-2.5 2-4.2 5.5-4.2s5.5 1.7 5.5 4.2v3'),stroke('M5.4 10a2.5 2.5 0 1 1 2-4M18.6 10a2.5 2.5 0 1 0-2-4M3 18v-2c0-2 1.2-3.3 3.1-3.5M21 18v-2c0-2-1.2-3.3-3.1-3.5'));
const calendarFrame = rect(3,5,18,16);
const calendar = union(stroke(calendarFrame),stroke('M7 3v4M17 3v4M3 10h18'),rect(7,13,2,2,.4),rect(11,13,2,2,.4));
const cloudShape = P('M7 18a4 4 0 0 1-.6-7.95A5.8 5.8 0 0 1 17.7 8.8 4.6 4.6 0 0 1 17 18Z');
const cloud = stroke(cloudShape);
const cloudMark = symbol => union(cut(cloud,rect(8,12,9,9,0)),fit(symbol,9.5,12.5,6.5,7));
const arrows = stroke('M7 8h12l-3-3M19 16H5l3 3');
const refresh = stroke('M20 9a8 8 0 0 0-13.5-3L3 9M3 4v5h5M4 15a8 8 0 0 0 13.5 3l3.5-3M21 20v-5h-5');
const door = stroke('M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7');
const rightArrow = stroke('M8 12h13M17 8l4 4-4 4');
const phoneFrame = rect(6,3,12,18);
const phone = union(stroke(phoneFrame),stroke('M10 6h4M11 18h2'));
const bellShape = P('M6 10a6 6 0 0 1 12 0v5l2 3H4l2-3Z');
const bell = union(stroke(bellShape),stroke('M10 21h4M12 3v1'));
const bellFilled = union(bellShape.round(.8),rect(10,20,4,2,1),rect(11,2,2,3,1));
const gearShape = P('M9.5 3h5l.6 2.4 1.5.9 2.4-.7 2.5 4.3-1.8 1.7v1.8l1.8 1.7-2.5 4.3-2.4-.7-1.5.9-.6 2.4h-5l-.6-2.4-1.5-.9-2.4.7-2.5-4.3 1.8-1.7v-1.8L2.5 9.9 5 5.6l2.4.7 1.5-.9Z').round(.6);
const gear = union(stroke(fit(gearShape,3,3,18,18)),ring(12,12,3));
const gearFilled = cut(fit(gearShape,2,2,20,20),circle(12,12,3.2));
const documentShape = P('M5 3h9l5 5v13H5Z').round(.8);
const document = union(stroke(documentShape),stroke('M14 3v5h5'));
const houseShape = P('M3 11l9-8 9 8M5 10v11h14V10');
const house = union(stroke(houseShape),box(10,15,4,6,.5));
const key = union(ring(8,10,3),stroke('M10.3 12.3 18 20M14 16l2-2M16.5 18.5l2-2'));
let section = '', priority = '';
function group(name,p) { section=name; priority=p; }
function add(name, shape, filled) {
  assert(!icons.has(name), `Duplicate: ${name}`);
  icons.set(name,{ shape,section,priority,variant:'outline' });
  if (filled) icons.set(`${name}-filled`,{shape:filled,section,priority:['vehicle','on-site','device'].includes(name)?'P2':priority,variant:'filled'});
}
function solid(name, shape) { add(name,shape); icons.get(name).variant='filled'; }

group('Scanning and documents','P1');
add('scan',union(bracket,cut(barcode,rect(5,10.7,14,2.6,0)),stroke('M5 12h14')));
add('licence-card',union(box(3,5,18,14),box(6,8,4,8,.7),stroke('M13 9h5M13 12h5M13 15h3')));
add('licence-disc',union(stroke(P(Array.from({length:48},(_,i)=>{const a=i*Math.PI/24;const r=i%2?8.6:9.1;return `${i?'L':'M'}${12+Math.cos(a)*r} ${12+Math.sin(a)*r}`;}).join(' ')+'Z')),fit(barcode,7.5,9,9,6)));
add('id-card',union(box(3,5,18,14),ring(8,10,1.4),stroke('M5.8 15c0-2.2 4.4-2.2 4.4 0'),box(14,8,4,3,.5),stroke('M14 15h4')));
add('id-book',union(box(5,3,14,18),stroke('M8 3v18M11 8h5M11 11h3')));
add('manual-entry',union(stroke('M3 20h18M6 15l1-4L17 3l4 4-10 8-5 0M15 5l4 4')));
add('camera',union(stroke('M3 8h4l2-3h6l2 3h4v12H3Z'),ring(12,13,3.2),circle(18,10.5,.75)));
add('rescan',union(bracket,fit(refresh,7,7,10,10)));
add('scan-failed',union(bracket,cut(barcode,stroke('M5 15l5-4 3 3 6-5',3))));

group('Vehicles and people','P1');
add('vehicle',car,carFilled); add('number-plate',plate); add('occupants',occupants); add('driver',driver); add('co-driver',badge(driver,plus)); add('pedestrian',walk);
add('visitor',union(person,box(13.5,14.8,3.5,4,.5),stroke('M15.2 14v1')));
const staff = union(person,stroke('M8.5 13.6l3.5 3 3.5-3'),box(10,16.5,4,4,.5));
add('staff',staff); add('staff-pending',badge(staff,clock));
add('contractor',union(stroke('M5 17v-4a7 7 0 0 1 14 0v4M10 6V4h4v2M12 7v7'),box(3,17,18,3,1)));
add('delivery',union(stroke('M3 7l9-4 9 4v10l-9 4-9-4ZM3 7l9 4 9-4M12 11v10M7.5 5l9 4v4')));
add('patient-dropoff',union(fit(car,3,7,14,11),stroke('M19.5 3v8M17 8.5l2.5 2.5L22 8.5M3 21h18')));
add('emergency',union(fit(car,3,7,18,13),box(9,6,6,2,.6),stroke('M12 3v1M6 4l1 1M18 4l-1 1')));
add('unfamiliar-vehicle',badge(car,question));

group('Gate and movement','P1');
const entry = union(box(4,3,4,18,1),stroke('M11 12h10M17 8l4 4-4 4'));
add('entry',entry); add('exit',mirror(entry));
const gatePost = box(3,12,5,9,1);
add('boom-gate-closed',union(gatePost,box(8,9,13,3,1),stroke('M11 9l2 3M16 9l2 3')));
add('boom-gate-open',union(gatePost,stroke('M6 12l3.3-9 2.1.8L8 13M7.5 8l2.1.8')));
add('pedestrian-gate',union(box(10,4,4,17,1),stroke('M3 11h7M14 11h7M12 12l6 7M12 12l-6 7')));
const pinShape = P('M12 3a6 6 0 0 1 6 6c0 4-6 9-6 9S6 13 6 9a6 6 0 0 1 6-6Z');
const pulse = stroke('M6 17c-5 2-1 4 6 4s11-2 6-4');
add('on-site',union(stroke(pinShape),ring(12,9,1.8),pulse),union(cut(pinShape,circle(12,9,2)),pulse));
add('duration',clock);
add('overstay',badge(union(stroke('M6 3h12M6 21h12M7 3v4l5 5-5 5v4M17 3v4l-5 5 5 5v4')),bang));

group('Results','P1');
solid('result-clear',cut(circle(12,12,10),stroke('M7 12l3.3 3.3L17.3 8.6',2.4)));
solid('result-warning',cut(P('M10.35 3.5Q12 .8 13.65 3.5L21.6 18.5Q23 21 20 21H4Q1 21 2.4 18.5Z'),bang));
solid('result-blocked',cut(P('M8 2h8l6 6v8l-6 6H8l-6-6V8Z').round(.6),stroke('M8.5 8.5l7 7M15.5 8.5l-7 7',2.4)));
solid('info',cut(circle(12,12,10),union(circle(12,7.4,1.2),stroke('M11 11h1v6M10.5 17h3',2))));
add('override',union(cut(shield,rect(9,10,14,13,0)),fit(key,9,10,13,12)));

group('Rule icons','P1');
add('rule-vehicle-swap',union(fit(car,3,3,13,7),fit(car,8,14,13,7),stroke('M3 14v4h3M21 10V6h-3'),stroke('M4 16l2 2-2 2M20 4l-2 2 2 2')));
add('rule-unknown-driver',badge(driver,question));
add('rule-walked-in-driving-out',union(fit(walk,3,3,8,14),fit(car,11,13,10,8),stroke('M12 8h7M16 5l3 3-3 3')));
add('rule-no-entry-record',union(cut(entry,stroke('M3 21 21 3',3.5)),stroke('M3 21 21 3')));
add('rule-plate-mismatch',badge(plate,stroke('M7 9h10M7 15h10M15 6l-6 12')));
add('rule-clone',union(cut(fit(plate,3,5,15,8.5),rect(5.3,10.3,16.4,10,1)),fit(plate,6,11,15,8.5)));
add('rule-duplicate-entry',union(box(4,3,4,18,1),stroke('M11 8h10M18 5l3 3-3 3M11 16h10M18 13l3 3-3 3')));
add('rule-expired',badge(calendar,cross));
add('rule-occupant-drop',badge(occupants,minus));

group('Guard session and device','P1');
const guard = union(stroke('M8 9a4 4 0 0 0 8 0M5 21v-2c0-3 3-5 7-5s7 2 7 5v2M7 7V4l5-1 5 1v3ZM6 7h12'));
add('guard',guard);
const star = P('M12 3l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z');
add('supervisor',badge(guard,star));
solid('pin',union(...[6,12,18].flatMap(x=>[6,12,18].map(y=>circle(x,y,1.6)))));
const lockBody = union(box(5,10,14,11),stroke('M12 14v3'));
add('lock',union(lockBody,stroke('M8 10V7a4 4 0 0 1 8 0v3')));
add('unlock',union(lockBody,stroke('M8 10V7a4 4 0 0 1 7.5-2')));
add('switch-guard',union(fit(person,3,6,8,12),fit(person,13,6,8,12),stroke('M7 3h9l2 2M18 3v2h-2M17 21H8l-2-2M6 21v-2h2')));
add('sign-out',union(door,rightArrow));
add('offline',union(cut(cloud,stroke('M3 3l18 18',3.5)),stroke('M3 3l18 18')));
add('synced',cloudMark(check)); add('syncing',cloudMark(refresh)); add('pending-upload',cloudMark(stroke('M12 20V5M7 10l5-5 5 5')));
const device = union(box(6,3,12,18),box(8.7,5.5,6.6,3,1),stroke('M6 11H4v4h2M18 11h2v4h-2M10 17h4'));
add('device',device,union(cut(rect(5,2,14,20),rect(8.5,5,7,3.5,.8),rect(9,16,6,2,1)),rect(3,10,2,6,.5),rect(19,10,2,6,.5)));

group('Dashboard navigation','P2');
const tiles = [rect(3,3,7,7),rect(14,3,7,7),rect(3,14,7,7),rect(14,14,7,7)];
add('overview',union(...tiles.map(p=>stroke(p))),union(...tiles));
const visits = union(stroke('M11 6h10M11 12h10M11 18h10M3 6h4L5 4M7 12H3l2-2M3 18h4l-2-2'));
add('visits',visits,union(rect(10,4.5,12,3,1),rect(10,10.5,12,3,1),rect(10,16.5,12,3,1),stroke('M3 6h4L5 4M7 12H3l2-2M3 18h4l-2-2')));
add('alerts',badge(bell,bang,18,7),badge(bellFilled,bang,18,7));
const people = union(tx(person,.85,0,2),stroke('M17 4a3 3 0 0 1 0 6M18 13c2 .5 3 2 3 4v3'));
add('people',people,union(tx(personFilled,.85,0,2),cut(tx(personFilled,.7,8,2),rect(0,8,17,16,0))));
add('approvals',badge(person,check),badge(personFilled,check));
add('users',badge(person,gear),badge(personFilled,gearFilled));
const building = union(box(4,3,12,18),stroke('M8 7h4M8 11h4M8 15h2'));
const smallGate = union(box(13,15,4,6,1),box(17,12,4,3,.5));
add('sites',union(cut(building,rect(11,12,11,10,0)),smallGate),union(cut(rect(3,2,14,20),rect(7,6,6,2,.5),rect(7,10,6,2,.5),rect(11,12,11,10,0)),smallGate));
const bars = union(rect(8,14,1.8,4,.3),rect(11,11,1.8,7,.3),rect(14,13,1.8,5,.3));
add('reports',union(document,bars),cut(documentShape,bars,stroke('M14 3v5h5',1.5)));
const auditLines = stroke('M8 8h8M8 12h8M9 16h6');
add('audit-log',union(shield,auditLines),cut(shieldShape,auditLines));
add('settings',gear,gearFilled);
const sliders = union(stroke('M3 6h3M10 6h11M3 12h11M18 12h3M3 18h3M10 18h11'),ring(8,6,2),ring(16,12,2),ring(8,18,2));
add('site-config',sliders,union(stroke('M3 6h18M3 12h18M3 18h18'),circle(8,6,3),circle(16,12,3),circle(8,18,3)));

group('Common interface','P1/P2');
function lineIcon(name,d) { add(name,stroke(d),stroke(d,2.6)); }
add('search',union(ring(10.5,10.5,6.5),stroke('M15.5 15.5 21 21')),union(ring(10.5,10.5,7,2.8),stroke('M15.5 15.5 21 21',2.8)));
const filterShape=P('M3 4h18l-7 8v7l-4 2v-9Z');
add('filter',stroke(filterShape),filterShape.round(.5));
lineIcon('sort','M7 3v18M3 7l4-4 4 4M17 21V3M13 17l4 4 4-4');
lineIcon('add','M12 4v16M4 12h16'); lineIcon('remove','M4 12h16');
const pencilShape=P('M4 15 15 4l5 5L9 20l-6 1Z');
add('edit',union(stroke(pencilShape),stroke('M12 7l5 5M4 15l5 5')),cut(pencilShape,stroke('M12 7l5 5',1.5)));
const binShape=P('M6 7h12l-1 14H7Z').round(.6);
add('delete',union(stroke(binShape),stroke('M4 7h16M9 7V3h6v4M10 11v6M14 11v6')),union(cut(binShape,stroke('M10 11v6M14 11v6',1.5)),stroke('M4 6h16M9 6V3h6v3')));
lineIcon('close','M5 5l14 14M19 5 5 19'); lineIcon('back','M15 5l-7 7 7 7'); lineIcon('chevron-right','M9 5l7 7-7 7'); lineIcon('chevron-down','M5 9l7 7 7-7'); lineIcon('chevron-up','M5 15l7-7 7 7');
add('more',union(...[5,12,19].map(y=>circle(12,y,1.5))),union(...[5,12,19].map(y=>circle(12,y,2))));
lineIcon('menu','M3 5h18M3 12h18M3 19h18');
add('refresh',refresh,union(refresh,stroke('M3 4v5h5M21 20v-5h-5',2.8)));
add('check',check,stroke('M6 12l4 4L18 7.5',2.6));
add('copy',union(box(8,8,13,13),stroke('M16 5V3H3v13h2')),union(rect(8,8,14,14),stroke('M16 5V3H3v13h2')));
const tray=stroke('M3 16v5h18v-5');
add('download',union(tray,stroke('M12 3v12M7 10l5 5 5-5')),union(tray,P('M10.5 3h3v8H18l-6 6-6-6h4.5Z')));
add('upload',union(tray,stroke('M12 15V3M7 8l5-5 5 5')),union(tray,P('M10.5 16h3V8H18l-6-6-6 6h4.5Z')));
const exportBox=stroke('M10 6H3v15h15v-7');
add('export',union(exportBox,stroke('M10 14 21 3M14 3h7v7')),union(exportBox,stroke('M10 14 21 3M14 3h7v7',2.6)));
add('calendar',calendar,union(cut(calendarFrame,rect(6,11,12,7,1)),stroke('M7 3v4M17 3v4')));
const rangeBar=rect(7,13,10,3,1);
add('date-range',union(stroke(calendarFrame),stroke('M7 3v4M17 3v4M3 10h18'),rangeBar),union(cut(calendarFrame,rect(6,11,12,7,1)),rangeBar,stroke('M7 3v4M17 3v4')));
add('external-link',union(exportBox,stroke('M10 14 21 3M14 3h7v7')),union(exportBox,stroke('M10 14 21 3M14 3h7v7',2.6)));
const eyeShape=P('M3 12c4-9 14-9 18 0-4 9-14 9-18 0Z');
const eye=union(stroke(eyeShape),ring(12,12,3)); const eyeFilled=cut(eyeShape,ring(12,12,3,2));
add('reveal',eye,eyeFilled);
add('masked',union(cut(eye,stroke('M3 3l18 18',3.5)),stroke('M3 3l18 18')),union(cut(eyeFilled,stroke('M3 3l18 18',4)),stroke('M3 3l18 18',2.5)));
add('help',union(ring(12,12,9),question),cut(circle(12,12,10),question));
add('bell',bell,bellFilled); add('user',person,personFilled);
const qr=union(...[[3,3],[15,3],[3,15]].map(([x,y])=>union(box(x,y,6,6,.4),rect(x+2,y+2,2,2,.2))),stroke('M15 15h3v3h3M15 21h3M21 14v1'));
add('qr-code',qr,union(...[[2.5,2.5],[14.5,2.5],[2.5,14.5]].map(([x,y])=>cut(rect(x,y,7,7,.5),rect(x+2,y+2,3,3,.2))),rect(14.5,14.5,3,3,.2),rect(18,18,3,3,.2),rect(14.5,19,2,2,.2),rect(19,14.5,2,2,.2)));
add('mfa',badge(phone,shield),badge(cut(phoneFrame,rect(9,6,6,9,1)),shieldShape));
const signIn = union(mirror(door),stroke('M3 12h13M12 8l4 4-4 4'));
add('sign-in',signIn,union(mirror(door),stroke('M3 12h13M12 8l4 4-4 4',2.6)));

group('Estates','P4');
add('resident',union(cut(house,rect(3,11,12,12,0)),fit(person,3,11,10,10)));
add('unit',union(house,box(15,13,3,2,.3)));
add('invite',union(stroke('M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4Z'),fit(qr,6,8,8,8),stroke('M17 8v1M17 12v1M17 16v1')));
add('arrival-notification',badge(phone,bell));
add('worker',badge(person,calendar));
add('worker-permit',badge(icons.get('licence-card').shape,calendar));
add('ehailing',union(fit(car,3,10,18,11),fit(union(stroke(pinShape),circle(12,9,1.5)),8,2,8,10)));

group('Later','Later');
add('nfc-tap',union(box(3,7,10,14),stroke('M6 17h4M16 4c4 3 5 6 5 10M14 7c2.5 2 3.5 4 3.5 7M14 11c.8.8 1 1.8 1 3')));
add('card-revoked',union(cut(icons.get('licence-card').shape,stroke('M3 3l18 18',3.5)),stroke('M3 3l18 18')));
add('panic',union(stroke('M6 18v-7a6 6 0 0 1 12 0v7M12 3V2.9M3 5l2 2M21 5l-2 2M3 12h1M20 12h1'),box(3,18,18,3,1),stroke('M9 13v-2c0-1.5 1-2.5 2-2.5')));
add('lockdown',union(stroke('M3 21V4M21 21V4M3 7h18M7 7v5M12 7v2M17 7v5'),fit(icons.get('lock').shape,7,11,10,11)));
add('incident-pack',union(stroke('M3 20V5h7l2 3h9v12Z'),fit(shield,8,10,9,9)));
add('watchlist',union(stroke('M4 4h16M4 8h10M4 12h5M4 16h4'),fit(eye,10,11,12,10)));
add('parking',union(box(3,3,18,18),stroke('M9 17V7h4a3 3 0 0 1 0 6H9')));
add('evacuation',union(stroke('M15 3h6v18h-6M3 21h8'),circle(10,5,1.5),stroke('M9 9l-3 5 4 2-2 5M7 12l-3 2M9 9l4 3h4M10 16l5 3')));

// Numeric rounding removes float noise while retaining subpixel precision at 64 px.
const pathData = shape => clone(shape).simplify().toSVGString().replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi,n=>String(Number(Number(n).toFixed(3))));
const svgFor = (d,viewBox='0 0 24 24',fill='#000000') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path fill="${fill}" fill-rule="evenodd" d="${d}"/></svg>\n`;
await mkdir(path.join(out,'icons'),{recursive:true});
await mkdir(path.join(out,'identity'),{recursive:true});
await mkdir(path.join(out,'previews'),{recursive:true});
const manifest=[];
for (const [name,item] of icons) {
  // Protect the specified 2 px clear margin, including badges and diagonals.
  const bounds=item.shape.computeTightBounds();
  if(bounds[0]<2 || bounds[1]<2 || bounds[2]>22 || bounds[3]>22) item.shape=fit(item.shape,2,2,20,20);
  item.d=pathData(item.shape);
  await writeFile(path.join(out,'icons',`${name}.svg`),svgFor(item.d));
  manifest.push({name,file:`icons/${name}.svg`,section:item.section,priority:item.priority,variant:item.variant});
}

// The source SVG contains a wordmark and a separate emblem. Reuse the emblem paths.
const logo=await readFile(path.resolve(design,'../../DigiGate-logo.svg'),'utf8');
const markPart=logo.slice(logo.indexOf('<svg x="358"'));
assert(markPart.startsWith('<svg x="358"'),'Cannot identify the original logo mark; inspect the source before regenerating.');
const logoPaths=[...markPart.matchAll(/<path\b[^>]*fill="([^"]+)"[^>]*d="([^"]+)"[^>]*\/>/g)];
assert.equal(logoPaths.length,11,'Original logo mark changed; review extraction.');
const originalMark=union(...logoPaths.map(m=>P(m[2])));
const checkMark=P(logoPaths.find(m=>m[1].includes('84, 191, 244'))[2]);
const monoMark=cut(originalMark,checkMark);
const safeMark=fit(monoMark,174,174,676,676);
const originalBounds=originalMark.computeTightBounds();
const markScale=676/Math.max(originalBounds[2]-originalBounds[0],originalBounds[3]-originalBounds[1]);
const markOffsetX=512-(originalBounds[0]+originalBounds[2])/2*markScale;
const markOffsetY=512-(originalBounds[1]+originalBounds[3])/2*markScale;
function identityCanvas(size,bg,color,original=false) {
  const c=createCanvas(size,size),ctx=c.getContext('2d');
  if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,size,size);}
  ctx.scale(size/1024,size/1024);
  if(original){
    ctx.translate(markOffsetX,markOffsetY);ctx.scale(markScale,markScale);
    for(const m of logoPaths){ctx.fillStyle=m[1];ctx.fill(P(m[2]));}
  } else {ctx.fillStyle=color;ctx.fill(safeMark,'evenodd');}
  return c;
}
const identityFiles=[];
async function saveIdentity(name,c){await writeFile(path.join(out,'identity',name),c.toBuffer('image/png'));identityFiles.push(name);}
await saveIdentity('app-icon.png',identityCanvas(1024,'#062C65','#FFFFFF'));
await saveIdentity('android-icon-foreground.png',identityCanvas(1024,null,'#FFFFFF'));
const bg=createCanvas(1024,1024);bg.getContext('2d').fillStyle='#062C65';bg.getContext('2d').fillRect(0,0,1024,1024);
await saveIdentity('android-icon-background.png',bg);
await saveIdentity('android-icon-monochrome.png',identityCanvas(1024,null,'#000000'));
await saveIdentity('splash-icon.png',identityCanvas(1024,null,null,true));
await saveIdentity('notification-icon.png',identityCanvas(96,null,'#FFFFFF'));
await saveIdentity('apple-icon.png',identityCanvas(180,'#062C65','#FFFFFF'));
// Simplify tiny browser-tab artwork to the outline of the supplied lock and its check.
const faviconMark=fit(monoMark,2,2,20,20);
await writeFile(path.join(out,'identity','icon.svg'),svgFor(pathData(faviconMark),'0 0 24 24','#062C65'));
identityFiles.push('icon.svg');
const icoPngs=[16,32].map(size=>{
 const c=createCanvas(size,size),ctx=c.getContext('2d');ctx.fillStyle='#062C65';ctx.scale(size/24,size/24);ctx.fill(faviconMark,'evenodd');return c.toBuffer('image/png');
});
const icoHeader=Buffer.alloc(6+16*2);icoHeader.writeUInt16LE(1,2);icoHeader.writeUInt16LE(2,4);let icoOffset=icoHeader.length;
icoPngs.forEach((png,i)=>{const start=6+i*16;icoHeader[start]=[16,32][i];icoHeader[start+1]=[16,32][i];icoHeader.writeUInt16LE(1,start+4);icoHeader.writeUInt16LE(32,start+6);icoHeader.writeUInt32LE(png.length,start+8);icoHeader.writeUInt32LE(icoOffset,start+12);icoOffset+=png.length;});
await writeFile(path.join(out,'identity','favicon.ico'),Buffer.concat([icoHeader,...icoPngs]));identityFiles.push('favicon.ico');

// Standalone review document: inline vectors, no server, network or application changes.
const sections=[...new Set(manifest.map(i=>i.section))];
const card=(i)=>`<article data-name="${i.name}" data-priority="${i.priority}"><div class="samples"><span class="light">${svgFor(icons.get(i.name).d)}${svgFor(icons.get(i.name).d)}</span><span class="dark">${svgFor(icons.get(i.name).d)}${svgFor(icons.get(i.name).d)}</span></div><a href="icons/${i.name}.svg">${i.name}</a><small>${i.priority} · ${i.variant}</small></article>`;
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DigiGate icon review</title><style>
*{box-sizing:border-box}body{margin:0;background:#f1f3f6;color:#15243a;font:14px system-ui,sans-serif}header,main{max-width:1480px;margin:auto;padding:32px}h1{font-size:32px;margin:0 0 8px}p{line-height:1.6}nav{display:flex;gap:12px;position:sticky;top:0;padding:16px 32px;background:#f1f3f6ed;border-bottom:1px solid #d7dde5;z-index:2}input,select{font:inherit;border:1px solid #bac4d1;border-radius:8px;padding:10px}input{width:min(420px,65vw)}section{margin-bottom:40px}h2{font-size:18px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:12px}article{background:white;border:1px solid #dce2ea;border-radius:10px;padding:12px;min-width:0}.samples{display:flex;gap:8px;margin-bottom:12px}.samples span{display:flex;align-items:center;justify-content:space-around;gap:8px;width:50%;height:88px;border-radius:6px}.light{background:#fff;border:1px solid #e5e8ed}.dark{background:#101827}.dark path{fill:#fff}.samples svg:first-child{width:20px;height:20px;flex:none}.samples svg:last-child{width:64px;height:64px;flex:none}a{font-size:12px;color:#062c65;text-decoration:none;overflow-wrap:anywhere}a:hover{text-decoration:underline}small{display:block;color:#65748a;margin-top:5px}.identity{display:flex;flex-wrap:wrap;gap:16px}.identity figure{margin:0;background:#e3e8ef;padding:16px;border-radius:12px}.identity img{height:160px;width:160px;object-fit:contain;background:repeating-conic-gradient(#d2d8e0 0 25%,#edf0f4 0 50%) 0/16px 16px}.identity figcaption{margin-top:8px;font-size:11px}[hidden]{display:none!important}
</style><header><h1>DigiGate icons</h1><p>${manifest.length} SVGs · 24 × 24 grid · 1.75 px construction strokes expanded to paths.<br>Each pair shows actual 20 px and 64 px sizes. Black on white, white on dark. Review at 100% browser zoom.</p><p>Original DigiGate mark reused for identity. Status symbols use transparent knockouts. The file names below link to the individual SVGs.</p></header><nav><input id="search" type="search" aria-label="Search icons" placeholder="Search icons…"><select id="priority" aria-label="Priority"><option value="">All priorities</option><option>P1</option><option>P2</option><option>P4</option><option>Later</option></select><span id="count" aria-live="polite"></span></nav><main><section><h2>App identity</h2><div class="identity">${identityFiles.filter(n=>n.endsWith('.png')).map(n=>`<figure><a href="identity/${n}"><img src="identity/${n}" alt="${n}"></a><figcaption>${n}</figcaption></figure>`).join('')}</div></section>${sections.map(s=>`<section class="icon-section"><h2>${s}</h2><div class="grid">${manifest.filter(i=>i.section===s).map(card).join('')}</div></section>`).join('')}</main><script>const search=document.querySelector('#search'),priority=document.querySelector('#priority');function filter(){let count=0;document.querySelectorAll('article').forEach(el=>{el.hidden=!(el.dataset.name.includes(search.value.toLowerCase())&&el.dataset.priority.includes(priority.value));if(!el.hidden)count++});document.querySelectorAll('.icon-section').forEach(el=>el.hidden=![...el.querySelectorAll('article')].some(card=>!card.hidden));document.querySelector('#count').textContent=count+' icons'}search.addEventListener('input',filter);priority.addEventListener('change',filter);filter();</script></html>`;
await writeFile(path.join(out,'preview.html'),html);
await writeFile(path.join(out,'manifest.json'),JSON.stringify({grid:24,padding:2,constructionStroke:1.75,icons:manifest,identity:identityFiles},null,2)+'\n');

// Review sheets use the exact exported paths, including the final numeric rounding.
for(const s of sections){
 const entries=manifest.filter(i=>i.section===s);const columns=4,cellW=280,cellH=140;
 const c=createCanvas(columns*cellW,90+Math.ceil(entries.length/columns)*cellH),ctx=c.getContext('2d');
 ctx.fillStyle='#edf0f4';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#062C65';ctx.font='bold 24px Arial';ctx.fillText(s,24,35);ctx.font='13px Arial';ctx.fillText('20 px + 64 px / light + dark',24,62);
 entries.forEach((i,index)=>{const x=(index%columns)*cellW,y=90+Math.floor(index/columns)*cellH;ctx.fillStyle='#fff';ctx.fillRect(x+8,y,132,90);ctx.fillStyle='#101827';ctx.fillRect(x+140,y,132,90);
  for(const [dx,size,color] of [[19,20,'#000'],[62,64,'#000'],[151,20,'#fff'],[194,64,'#fff']]){ctx.save();ctx.translate(x+dx,y+(90-size)/2);ctx.scale(size/24,size/24);ctx.fillStyle=color;ctx.fill(P(icons.get(i.name).d),'evenodd');ctx.restore();}
  ctx.fillStyle='#15243a';ctx.font='12px Arial';ctx.fillText(i.name,x+12,y+111);ctx.fillStyle='#65748a';ctx.font='11px Arial';ctx.fillText(i.priority+' / '+i.variant,x+12,y+129);
 });
 await writeFile(path.join(out,'previews',s.toLowerCase().replaceAll(' ','-')+'.png'),c.toBuffer('image/png'));
}

// Validate deliverables, not implementation details: finite geometry, margins and alpha.
for(const [name,item] of icons){
 assert(item.d.length>10&&!/NaN|Infinity/.test(item.d),name);
 const [l,t,r,b]=P(item.d).computeTightBounds();
 assert(l>=1.995&&t>=1.995&&r<=22.005&&b<=22.005,`${name}: outside live area`);
 for(const size of [20,64]){const c=createCanvas(size,size),ctx=c.getContext('2d');ctx.scale(size/24,size/24);ctx.fill(P(item.d),'evenodd');const pixels=ctx.getImageData(0,0,size,size).data;assert(pixels.some((v,i)=>i%4===3&&v>128),`${name}: blank at ${size}`);}
 const svg=await readFile(path.join(out,'icons',name+'.svg'),'utf8');assert(!/<(?:text|image|use|mask|clipPath)|stroke=|<[^>]*transform=/.test(svg),`${name}: non-path output`);
}
console.log(`Generated and validated ${icons.size} SVG icons and ${identityFiles.length} identity assets.`);
console.log(path.join(out,'preview.html'));
