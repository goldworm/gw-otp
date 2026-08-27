import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { encodeQRToDataURL } from '@/core/qr';
import { buildOTPAuthURI } from '@/core/otp';
import type { Algorithm, Digits } from '@/types';

interface QRModalProps {
  issuer: string;
  label: string;
  secret: string;
  algorithm: Algorithm;
  digits: Digits;
  period: number;
  onClose: () => void;
}

/**
 * OTP 정보를 otpauth:// URI로 만들어 QR 코드로 표시하는 모달.
 * 폰의 인증 앱으로 스캔하여 OTP를 등록할 수 있다.
 */
export function QRModal({
  issuer,
  label,
  secret,
  algorithm,
  digits,
  period,
  onClose,
}: QRModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function generate() {
      try {
        const uri = buildOTPAuthURI({
          issuer,
          label,
          secret,
          algorithm,
          digits,
          period,
        });
        const dataUrl = await encodeQRToDataURL(uri, 220);
        setQrDataUrl(dataUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'QR 생성에 실패했습니다.');
      }
    }
    generate();
  }, [issuer, label, secret, algorithm, digits, period]);

  // ESC로 닫기
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
      aria-label="OTP QR 코드"
    >
      <div
        className="relative flex w-full max-w-[300px] flex-col items-center gap-3 rounded-lg bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 제목 */}
        <div className="text-center">
          <p className="text-sm font-semibold text-foreground">{issuer}</p>
          {label && (
            <p className="text-xs text-muted-foreground">{label}</p>
          )}
        </div>

        {/* QR 코드 */}
        {error ? (
          <p className="py-8 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="OTP QR 코드"
            className="rounded bg-white p-2"
            width={220}
            height={220}
          />
        ) : (
          <div className="flex h-[220px] w-[220px] items-center justify-center">
            <p className="text-sm text-muted-foreground">생성 중...</p>
          </div>
        )}

        {/* 안내 문구 */}
        <p className="text-center text-xs text-muted-foreground">
          폰의 인증 앱으로 스캔하여 등록하세요.
        </p>
      </div>
    </div>
  );
}
