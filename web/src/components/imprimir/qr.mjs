// QR en SVG para la contraportada (se dibuja al construir, sin JavaScript).
import QRCode from 'qrcode';

export const qrSvg = (url, color = '#000000') =>
  QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: color, light: '#0000' } });
