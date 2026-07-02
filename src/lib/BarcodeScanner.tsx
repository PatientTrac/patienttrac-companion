// Camera barcode scanner for UDI capture. Lazy-loads ZXing so it stays out of
// the main bundle; prefers the rear camera; decodes GS1 DataMatrix / Code-128 /
// QR. Calls onScan(rawText) once, then stops. Falls back to a clear message if
// the camera is unavailable — the form still supports manual entry.
import { useEffect, useRef, useState } from 'react'
import { C } from './ui'

export function BarcodeScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onScanRef = useRef(onScan); onScanRef.current = onScan
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let controls: { stop: () => void } | null = null
    let cancelled = false
    ;(async () => {
      try {
        const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        const hints = new Map<number, unknown>()
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.DATA_MATRIX, BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE,
          BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.ITF,
        ])
        const reader = new BrowserMultiFormatReader(hints as never)
        if (cancelled || !videoRef.current) return
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result) => { if (result) { onScanRef.current(result.getText()); controls?.stop() } },
        )
      } catch (e) {
        const name = (e as { name?: string })?.name
        setError(name === 'NotAllowedError' || name === 'NotFoundError'
          ? 'Camera unavailable or permission denied — enter the details by hand below.'
          : 'Could not start the camera — enter the details by hand below.')
      }
    })()
    return () => { cancelled = true; try { controls?.stop() } catch { /* already stopped */ } }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,10,20,0.9)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
          <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text }}>Scan device barcode</span>
          <button onClick={onClose} aria-label="Close scanner" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ position: 'relative', background: '#000', aspectRatio: '4 / 3' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {!error && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
              <div style={{ width: '62%', aspectRatio: '1', border: `2px solid ${C.cyan}`, borderRadius: 14, boxShadow: `0 0 24px ${C.cyan}66, inset 0 0 24px ${C.cyan}33` }} />
            </div>
          )}
        </div>
        <div style={{ padding: '12px 16px', fontSize: 13, color: error ? C.amber : C.muted, lineHeight: 1.5 }}>
          {error || 'Point the camera at the UDI / GS1 barcode on the device label.'}
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${C.subtle}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 14 }}>
            {error ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}
