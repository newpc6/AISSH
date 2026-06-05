import { useTranslation } from 'react-i18next'
import { normalizeAppLanguage } from '../../i18n'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()

  const changeLanguage = (lng: string) => {
    void i18n.changeLanguage(normalizeAppLanguage(lng))
  }

  return (
    <div className="language-switcher">
      <label>
        <span>{t('settings.general.language')}</span>
        <select value={normalizeAppLanguage(i18n.language)} onChange={(e) => changeLanguage(e.target.value)}>
          <option value="zh">{t('app.chinese')}</option>
          <option value="en">{t('app.english')}</option>
        </select>
      </label>
    </div>
  )
}
