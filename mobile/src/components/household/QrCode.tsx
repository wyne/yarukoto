import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';

interface Props {
  value: string;
  size: number;
  color: string;
  background: string;
}

/** Modules of margin, the "quiet zone" a scanner needs to find the edges. */
const QUIET = 2;

/**
 * A QR code drawn as one SVG path, a square per dark module.
 *
 * Always dark on light, whatever the theme: plenty of camera apps cannot read
 * an inverted code, and this one exists to be read by a camera.
 */
export default function QrCode({ value, size, color, background }: Props) {
  const { d, count } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    let path = '';
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        if (modules.get(row, col)) path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
      }
    }
    return { d: path, count: modules.size + QUIET * 2 };
  }, [value]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`} accessibilityLabel="Sign-in QR code">
      <Rect x={0} y={0} width={count} height={count} fill={background} />
      <Path d={d} fill={color} />
    </Svg>
  );
}
