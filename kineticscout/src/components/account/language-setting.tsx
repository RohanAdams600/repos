import { setLocaleAction } from '@/i18n/actions'
import { LANGUAGE_NAME, LOCALES, type Locale } from '@/i18n/config'
import { Select } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'

/** Settings form for the account language. Works without JavaScript; the action saves it on the account and this device. */
export function LanguageSetting({ current, label, save }: { current: Locale; label: string; save: string }) {
  return (
    <form action={setLocaleAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
      <input type="hidden" name="returnTo" value="/dashboard/settings" />
      <div className="flex flex-col gap-2">
        <label htmlFor="settings-locale" className="font-bold">
          {label}
        </label>
        <Select id="settings-locale" name="locale" defaultValue={current}>
          {LOCALES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LANGUAGE_NAME[l]}
            </option>
          ))}
        </Select>
      </div>
      <SubmitButton pendingLabel={save} className="self-start sm:self-auto">
        {save}
      </SubmitButton>
    </form>
  )
}
