import { Search, X } from 'lucide-react';
import { Input } from '@/popup/components/ui/input';
import { cn } from '@/popup/lib/utils';
import { useI18n } from '@/popup/i18n/use-i18n';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchBar({ value, onChange, className }: SearchBarProps) {
  const { t } = useI18n();
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        placeholder={t('main.searchPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-8 pr-8 text-xs"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={t('main.clearSearch')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
