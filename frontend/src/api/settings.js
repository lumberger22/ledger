import { api, BASE_URL, getStoredApiKey } from './client'

export const getSettings = () => api.get('/api/settings')
export const updateSettings = (data) => api.put('/api/settings', data)

export async function downloadBackup() {
  const res = await fetch(`${BASE_URL}/api/settings/backup`, {
    headers: getStoredApiKey() ? { 'X-API-Key': getStoredApiKey() } : {},
  })
  if (!res.ok) throw new Error('Backup download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'budget-app-backup.zip'
  a.click()
  URL.revokeObjectURL(url)
}

export async function restoreBackup(file) {
  const formData = new FormData()
  formData.append('file', file)
  return api.postForm('/api/settings/restore', formData)
}

export const resetAllData = () => api.post('/api/settings/reset?confirm=true')
