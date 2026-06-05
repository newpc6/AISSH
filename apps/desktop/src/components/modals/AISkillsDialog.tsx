import type { ChangeEvent } from 'react'
import type { AISkill } from '@ai-ssh/shared-contracts'
import { useTranslation } from 'react-i18next'

type AISkillsDialogProps = {
  open: boolean
  skills: AISkill[]
  savedMessage: string
  onClose: () => void
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<Pick<AISkill, 'name' | 'prompt'>>) => void
  onRemove: (id: string) => void
  onSave: () => void
}

export function AISkillsDialog({
  open,
  skills,
  savedMessage,
  onClose,
  onAdd,
  onUpdate,
  onRemove,
  onSave,
}: AISkillsDialogProps) {
  const { t } = useTranslation()

  if (!open) {
    return null
  }

  const updateName = (id: string) => (event: ChangeEvent<HTMLInputElement>) => {
    onUpdate(id, { name: event.target.value })
  }

  const updatePrompt = (id: string) => (event: ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate(id, { prompt: event.target.value })
  }

  return (
    <div className="modal-backdrop">
      <section className="skills-modal">
        <div className="modal-header">
          <div>
            <p className="section-label">{t('skillsDialog.title')}</p>
            <h3>{t('skillsDialog.heading')}</h3>
          </div>
          <button type="button" title={t('skillsDialog.close')} onClick={onClose}>×</button>
        </div>

        <div className="skills-modal-toolbar">
          <p className="ai-model-help">{t('skillsDialog.help')}</p>
          <button type="button" title={t('skillsDialog.add')} onClick={onAdd}>{t('skillsDialog.add')}</button>
        </div>

        <div className="table-modal-scroll">
          {skills.length === 0 ? <p className="hint-text">{t('skillsDialog.empty')}</p> : null}
          {skills.length > 0 ? (
            <div className="skills-table-wrap">
              <table className="skills-table">
                <thead>
                  <tr>
                    <th>{t('skillsDialog.table.name')}</th>
                    <th>{t('skillsDialog.table.prompt')}</th>
                    <th>{t('skillsDialog.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map((skill) => (
                    <tr key={skill.id}>
                      <td>
                        <input
                          value={skill.name}
                          placeholder={t('settings.skills.namePlaceholder')}
                          onChange={updateName(skill.id)}
                        />
                      </td>
                      <td>
                        <textarea
                          value={skill.prompt}
                          placeholder={t('settings.skills.promptPlaceholder')}
                          onChange={updatePrompt(skill.id)}
                        />
                      </td>
                      <td>
                        <button type="button" title={t('skillsDialog.remove')} onClick={() => onRemove(skill.id)}>
                          {t('app.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {savedMessage ? <p className="success-text">{savedMessage}</p> : null}
        <div className="modal-actions">
          <button type="button" title={t('skillsDialog.close')} onClick={onClose}>{t('app.close')}</button>
          <button className="primary-button" type="button" title={t('skillsDialog.save')} onClick={onSave}>{t('app.save')}</button>
        </div>
      </section>
    </div>
  )
}
