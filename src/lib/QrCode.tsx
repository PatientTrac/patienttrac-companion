// QrCode.tsx — inline SVG QR code component (amendment 6)
// Uses qrcode.react QRCodeSVG which renders a native <svg> element — no data URI,
// no dangerouslySetInnerHTML. The QR payload must contain only a pairing URL or
// code; callers are responsible for ensuring no PHI is included.

import { QRCodeSVG } from 'qrcode.react'
import { C } from './ui'

type Props = {
  value: string
  size?: number
  label?: string
}

export function QrCode({ value, size = 200, label }: Props) {
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 12,
        padding: 16,
        display: 'inline-block',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}>
        <QRCodeSVG
          value={value}
          size={size}
          bgColor="#ffffff"
          fgColor="#0a1628"
          level="M"
        />
      </div>
      {label && (
        <span style={{ fontSize: 12, color: C.muted, textAlign: 'center', maxWidth: size + 32 }}>
          {label}
        </span>
      )}
    </div>
  )
}
