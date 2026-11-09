import type { IScannerControls } from '@zxing/browser';
import { normalizeBarcode, isSupportedBarcode } from '../lib/barcode';

export type ScannerErrorKind = 'insecure' | 'unsupported' | 'denied' | 'no-camera' | 'in-use' | 'unknown';

export class ScannerError extends Error {
  constructor(public kind: ScannerErrorKind, message: string) {
    super(message);
  }
}

export interface ScannerHandle {
  stop(): void;
  /** Taschenlampe, sofern vom Gerät unterstützt (auf iPhones meist nicht im Browser) */
  setTorch?: (on: boolean) => Promise<void>;
}

export function cameraAvailable(): { ok: true } | { ok: false; kind: ScannerErrorKind } {
  if (typeof window !== 'undefined' && !window.isSecureContext) return { ok: false, kind: 'insecure' };
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return { ok: false, kind: 'unsupported' };
  return { ok: true };
}

export function describeScannerError(kind: ScannerErrorKind): string {
  switch (kind) {
    case 'insecure':
      return 'Die Kamera ist nur über eine sichere Verbindung (HTTPS) verfügbar.';
    case 'unsupported':
      return 'Dieser Browser unterstützt keinen Kamerazugriff.';
    case 'denied':
      return 'Kein Kamerazugriff. Du kannst ihn in den Safari-Einstellungen erlauben (Einstellungen › Apps › Safari › Kamera) – oder den Barcode bzw. Preis einfach manuell eingeben.';
    case 'no-camera':
      return 'Es wurde keine Kamera gefunden.';
    case 'in-use':
      return 'Die Kamera wird gerade von einer anderen App verwendet.';
    default:
      return 'Die Kamera konnte nicht gestartet werden.';
  }
}

function mapError(e: unknown): ScannerError {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return new ScannerError('denied', describeScannerError('denied'));
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new ScannerError('no-camera', describeScannerError('no-camera'));
  if (name === 'NotReadableError' || name === 'AbortError') return new ScannerError('in-use', describeScannerError('in-use'));
  return new ScannerError('unknown', describeScannerError('unknown'));
}

/**
 * Startet den Barcode-Scanner mit der Rückkamera (EAN-8 / EAN-13).
 * Nutzt die Open-Source-Bibliothek ZXing (Apache-2.0) – die Erkennung läuft vollständig lokal.
 * Ein Code wird erst gemeldet, wenn er zweimal hintereinander identisch erkannt wurde
 * und die Prüfziffer stimmt – das verhindert Fehlerkennungen.
 */
export async function startScanner(
  video: HTMLVideoElement,
  onDetected: (code: string) => void,
): Promise<ScannerHandle> {
  const avail = cameraAvailable();
  if (!avail.ok) throw new ScannerError(avail.kind, describeScannerError(avail.kind));

  // Bibliothek erst bei Bedarf laden (kleineres Start-Bundle)
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);

  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 120,
    delayBetweenScanSuccess: 600,
  });

  let last = '';
  let lastCount = 0;
  let done = false;

  const constraints: MediaStreamConstraints = {
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  };

  let controls: IScannerControls;
  try {
    controls = await reader.decodeFromConstraints(constraints, video, (result) => {
      if (!result || done) return;
      const code = normalizeBarcode(result.getText());
      if (!isSupportedBarcode(code)) return;
      if (code === last) lastCount++;
      else {
        last = code;
        lastCount = 1;
      }
      if (lastCount >= 2) {
        done = true;
        onDetected(code);
      }
    });
  } catch (e) {
    throw mapError(e);
  }

  return {
    stop: () => {
      done = true;
      try {
        controls.stop();
      } catch {
        /* bereits gestoppt */
      }
    },
    setTorch: controls.switchTorch ? (on) => controls.switchTorch!(on) : undefined,
  };
}
