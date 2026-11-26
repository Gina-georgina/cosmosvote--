/**
 * LanguageSwitcher – locale selector for the CosmosVote header.
 *
 * Issue #275 – Add language localization framework and default i18n support
 * Issue #385 – Internationalise all hardcoded English strings
 *
 * Renders a <select> populated from SUPPORTED_LOCALES.
 * Changing the selection calls setLocale() from useI18n().
 */
import { useI18n, SUPPORTED_LOCALES } from '../i18n';

interface Props {
  /** Optional extra className for styling */
  className?: string;
}

export function LanguageSwitcher({ className }: Props) {
  const { locale, setLocale, t } = useI18n();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as typeof locale)}
      aria-label={t('languageSwitcher.selectLanguage')}
      className={className}
      style={{
        background: 'none',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 6,
        color: 'inherit',
        padding: '0.3rem 0.5rem',
        fontSize: '0.8rem',
        cursor: 'pointer',
      }}
    >
      {SUPPORTED_LOCALES.map(({ code, nativeLabel }) => (
        <option key={code} value={code}>
          {nativeLabel}
        </option>
      ))}
    </select>
  );
}