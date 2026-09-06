import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { encodeQRToDataURL } from '@/core/qr';
import { buildOTPAuthURI } from '@/core/otp';
import { useI18n } from '@/popup/i18n/use-i18n';
import type { Algorithm, Digits, OTPType } from '@/types';

interface QRModalProps {
  type?: OTPType;
  issuer: string;
  label: string;
  secret: string;
  algorithm: Algorithm;
  digits: Digits;
  period: number;
  counter?: number;
  onClose: () => void;
}

/**
 * Modal that builds an otpauth:// URI from the OTP info and shows it as a QR code.
 * Users can scan it with a phone authenticator app to register the OTP.
 */
export function QRModal({
  type,
  issuer,
  label,
  secret,
  algorithm,
  digits,
  period,
  counter,
  onClose,
}: QRModalProps) {
  const { t } = useI18n();
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function generate() {
      try {
        const uri = buildOTPAuthURI({
          type,
          issuer,
          label,
          secret,
          algorithm,
          digits,
          period,
          counter,
        });
        const dataUrl = await encodeQRToDataURL(uri, 220);
        setQrDataUrl(dataUrl);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t('qrModal.generateFailed'),
        );
      }
    }
    generate();
  }, [type, issuer, label, secret, algorithm, digits, period, counter, t]);

  // Close on ESC
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('qrModal.title')}
    >
      <div
        className="relative flex w-full max-w-[300px] flex-col items-center gap-3 rounded-lg bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t('qrModal.close')}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Title */}
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{issuer}</p>
          {label && (
            <p className="text-xs text-muted-foreground">{label}</p>
          )}
        </div>

        {/* QR code */}
        {error ? (
          <p className="py-8 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={t('qrModal.title')}
            className="rounded bg-white p-2"
            width={220}
            height={220}
          />
        ) : (
          <div className="flex h-[220px] w-[220px] items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {t('qrModal.generating')}
            </p>
          </div>
        )}

        {/* Hint text */}
        <p className="text-center text-xs text-muted-foreground">
          {t('qrModal.scanHint')}
        </p>
      </div>
    </div>
  );
}
