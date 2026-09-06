import { useState, useEffect, useCallback } from 'react';
import {
  Copy,
  Check,
  Pencil,
  Trash2,
  QrCode,
  Pin,
  PinOff,
  RefreshCw,
  Hash,
} from 'lucide-react';
import { cn } from '@/popup/lib/utils';
import { CountdownBar } from './countdown-bar';
import { QRModal } from './qr-modal';
import { generateTOTP, generateHOTP } from '@/core/otp';
import { useI18n } from '@/popup/i18n/use-i18n';
import type { Algorithm, Digits, OTPType } from '@/types';

interface OTPCardProps {
  id: string;
  type?: OTPType;
  issuer: string;
  label: string;
  secret: string;
  algorithm: Algorithm;
  digits: Digits;
  period: number;
  counter?: number;
  pinned?: boolean;
  hideCode: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onGenerateNext: (id: string) => void;
}

export function OTPCard({
  id,
  type,
  issuer,
  label,
  secret,
  algorithm,
  digits,
  period,
  counter,
  pinned,
  hideCode,
  onEdit,
  onDelete,
  onTogglePin,
  onGenerateNext,
}: OTPCardProps) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const isHOTP = type === 'hotp';

  const refreshCode = useCallback(async () => {
    try {
      if (isHOTP) {
        const token = await generateHOTP(
          secret,
          counter ?? 0,
          algorithm,
          digits,
        );
        setCode(token);
      } else {
        const token = await generateTOTP(secret, algorithm, digits, period);
        setCode(token);
      }
    } catch {
      setCode('------');
    }
  }, [isHOTP, secret, counter, algorithm, digits, period]);

  // TOTP: refresh every second; HOTP: refresh only when the counter changes
  useEffect(() => {
    refreshCode();
    if (isHOTP) return; // HOTP does not auto-refresh

    const interval = setInterval(() => {
      refreshCode();
    }, 1000);
    return () => clearInterval(interval);
  }, [refreshCode, isHOTP]);

  // Copy to clipboard
  async function handleCopy() {
    if (!code || code === '------') return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Format the code (split into groups)
  function formatCode(raw: string): string {
    if (raw.length === 6) return `${raw.slice(0, 3)} ${raw.slice(3)}`;
    if (raw.length === 8) return `${raw.slice(0, 4)} ${raw.slice(4)}`;
    return raw;
  }

  const showCode = !hideCode || hovered;
  const displayCode = showCode ? formatCode(code) : '••• •••';

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
        pinned
          ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
          : 'bg-card hover:bg-accent/50',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Left indicator: countdown for TOTP, counter icon for HOTP */}
      {isHOTP ? (
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground"
          title={`HOTP · counter ${counter ?? 0}`}
        >
          <Hash className="h-4 w-4" />
        </div>
      ) : (
        <CountdownBar period={period} size={32} />
      )}

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Issuer + Label */}
        <p className="truncate text-sm font-medium text-foreground">{issuer}</p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>

        {/* OTP Code */}
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'mt-0.5 inline-flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-base font-bold tracking-wider transition-colors',
            'hover:bg-secondary',
            showCode ? 'text-foreground' : 'text-muted-foreground',
          )}
          aria-label={t('otpCard.copyCode')}
          title={t('otpCard.copyCode')}
        >
          <span aria-live="off">{displayCode}</span>
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {copied && (
          <span className="sr-only" aria-live="polite">
            {t('otpCard.copied')}
          </span>
        )}
      </div>

      {/* Actions */}
      <div
        className={cn(
          'flex items-center gap-0.5 transition-opacity',
          // Pinned items always show the buttons; others reveal them on hover
          pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        {/* HOTP: generate-next-code button */}
        {isHOTP && (
          <button
            type="button"
            onClick={() => onGenerateNext(id)}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={t('otpCard.nextCode')}
            title={t('otpCard.nextCode')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onTogglePin(id)}
          className={cn(
            'rounded p-1 hover:bg-secondary',
            pinned
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label={pinned ? t('otpCard.unpin') : t('otpCard.pin')}
          title={pinned ? t('otpCard.unpin') : t('otpCard.pin')}
        >
          {pinned ? (
            <PinOff className="h-3.5 w-3.5" />
          ) : (
            <Pin className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setShowQR(true)}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t('otpCard.showQR')}
          title={t('otpCard.showQRTitle')}
        >
          <QrCode className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onEdit(id)}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={t('otpCard.edit')}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(id)}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={t('otpCard.delete')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* QR modal */}
      {showQR && (
        <QRModal
          type={type}
          issuer={issuer}
          label={label}
          secret={secret}
          algorithm={algorithm}
          digits={digits}
          period={period}
          counter={counter}
          onClose={() => setShowQR(false)}
        />
      )}
    </div>
  );
}
