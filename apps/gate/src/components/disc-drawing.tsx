import { englishPart, type ParsedLicenceDisc } from '@digigate/core';
import { colors, fontFamily } from '@digigate/design';
import { useMemo } from 'react';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { formatDate, formatPlate } from '@/lib/format';

// A lookalike of a South African licence disc, drawn from what its barcode holds, so the guard can hold the screen up
// to the windscreen and compare. It is plainly a drawing: the real disc's colours and layout change every year, and the
// barcode here is decoration, not data.

const SIZE = 300;
const CENTRE = SIZE / 2;
const DISC_RADIUS = 140;

/** A wavy ring like the fine print that makes a real disc hard to copy. */
function rosette(radius: number, depth: number, waves: number, phase: number): string {
  const points = Array.from({ length: 361 }, (_, step) => {
    const angle = (step / 360) * Math.PI * 2;
    const reach = radius + depth * Math.sin(waves * angle + phase);
    return `${(CENTRE + reach * Math.cos(angle)).toFixed(2)},${(CENTRE + reach * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${points.join('L')}Z`;
}

/** Stripes in the shape of a PDF417 barcode, the same for the same disc every time. Not a real barcode. */
function barcodeLookalike(seed: string, left: number, top: number, width: number, height: number): string {
  let state = Array.from(seed).reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0, 2166136261) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const rows = 7;
  const rowHeight = height / rows;
  const unit = width / 96;
  const start = [8, 1, 1, 1, 1, 1, 1, 3];
  const stop = [7, 1, 1, 3, 1, 1, 1, 2, 1];
  const bars: string[] = [];
  const pattern = (widths: readonly number[], from: number, y: number) =>
    widths.reduce((x, modules, index) => {
      if (index % 2 === 0) bars.push(`M${x.toFixed(2)},${y.toFixed(2)}h${(modules * unit).toFixed(2)}v${rowHeight.toFixed(2)}h${(-modules * unit).toFixed(2)}Z`);
      return x + modules * unit;
    }, from);
  const stopWidth = stop.reduce((sum, modules) => sum + modules, 0) * unit;
  for (let row = 0; row < rows; row++) {
    const y = top + row * rowHeight;
    let x = pattern(start, left, y);
    let bar = true;
    while (x + 4 * unit < left + width - stopWidth) {
      const modules = 1 + Math.floor(next() * 4);
      if (bar) bars.push(`M${x.toFixed(2)},${y.toFixed(2)}h${(modules * unit).toFixed(2)}v${rowHeight.toFixed(2)}h${(-modules * unit).toFixed(2)}Z`);
      x += modules * unit;
      bar = !bar;
    }
    pattern(stop, left + width - stopWidth, y);
  }
  return bars.join('');
}

const trimmed = (value: string, length: number) => (value.length > length ? `${value.slice(0, length - 1)}…` : value);

function Label({ x, y, children, anchor = 'start' }: { x: number; y: number; children: string; anchor?: 'start' | 'middle' }) {
  return (
    <SvgText x={x} y={y} fontFamily={fontFamily.textMedium} fontSize={6.5} fill={colors.inkMuted} textAnchor={anchor} letterSpacing={0.3}>
      {children}
    </SvgText>
  );
}

function Value({ x, y, children, size = 10, anchor = 'start' }: { x: number; y: number; children: string; size?: number; anchor?: 'start' | 'middle' }) {
  return (
    <SvgText x={x} y={y} fontFamily={fontFamily.textSemibold} fontSize={size} fill={colors.ink} textAnchor={anchor}>
      {children}
    </SvgText>
  );
}

/** `plateShown` is false until the check, so the guard reads the plate off the car rather than off the screen. */
export function DiscDrawing({ disc, plateShown, size }: { disc: ParsedLicenceDisc; plateShown: boolean; size: number }) {
  const rings = useMemo(() => [rosette(122, 5, 28, 0), rosette(118, 4, 36, 1.3), rosette(126, 3, 44, 2.1)], []);
  const barcode = useMemo(() => barcodeLookalike(`${disc.vin}${disc.discNumber}`, 84, 234, 132, 26), [disc.discNumber, disc.vin]);
  const left = 62;
  const right = 160;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`} accessibilityLabel={`Drawing of the licence disc for a ${disc.make} ${disc.model}`}>
      <Circle cx={CENTRE} cy={CENTRE} r={148} fill={colors.surface} stroke={colors.inkSubtle} strokeWidth={1} strokeDasharray="1.5 3" />
      <Circle cx={CENTRE} cy={CENTRE} r={DISC_RADIUS} fill={colors.tileMint} />
      {rings.map((ring) => (
        <Path key={ring.slice(0, 24)} d={ring} fill="none" stroke={colors.clear} strokeOpacity={0.22} strokeWidth={0.6} />
      ))}
      <Circle cx={CENTRE} cy={CENTRE} r={132} fill="none" stroke={colors.clear} strokeOpacity={0.4} strokeWidth={1} />
      <Circle cx={CENTRE} cy={CENTRE} r={108} fill={colors.surface} fillOpacity={0.55} />

      <SvgText x={CENTRE} y={50} fontFamily={fontFamily.display} fontSize={10.5} fill={colors.brand} textAnchor="middle" letterSpacing={0.6}>
        MOTOR VEHICLE LICENCE
      </SvgText>
      <SvgText x={CENTRE} y={60} fontFamily={fontFamily.textMedium} fontSize={6.5} fill={colors.inkMuted} textAnchor="middle" letterSpacing={0.6}>
        MOTORVOERTUIGLISENSIE
      </SvgText>

      <Label x={left} y={80}>LICENCE NO. / LISENSIENR.</Label>
      {plateShown ? (
        <Value x={left} y={93} size={12}>
          {formatPlate(disc.plate)}
        </Value>
      ) : (
        <SvgText x={left} y={92} fontFamily={fontFamily.textMedium} fontSize={7.5} fill={colors.inkMuted}>
          Read it off the car
        </SvgText>
      )}
      <Label x={right} y={80}>VEH. REGISTER NO.</Label>
      <Value x={right} y={93}>{disc.registerNumber}</Value>

      <Label x={left} y={110}>VIN</Label>
      <Value x={left} y={122} size={10.5}>{disc.vin}</Value>

      <Label x={left} y={139}>ENGINE NO. / ENJINNR.</Label>
      <Value x={left} y={151} size={9}>{trimmed(disc.engineNumber, 16)}</Value>
      <Label x={right} y={139}>DISC NO.</Label>
      <Value x={right} y={151} size={9}>{trimmed(disc.discNumber, 16)}</Value>

      <Label x={left} y={168}>MAKE / FABRIKAAT</Label>
      <Value x={left} y={180} size={9}>{trimmed(`${disc.make} ${disc.model}`, 18)}</Value>
      <Label x={right} y={168}>DESCRIPTION</Label>
      <Value x={right} y={180} size={9}>{trimmed(englishPart(disc.description), 18)}</Value>

      <Label x={CENTRE} y={199} anchor="middle">DATE OF EXPIRY / VERVALDATUM</Label>
      <Value x={CENTRE} y={220} size={19} anchor="middle">{formatDate(disc.expiresOn)}</Value>

      <Path d={barcode} fill={colors.ink} />
    </Svg>
  );
}
