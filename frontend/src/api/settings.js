import { api, BASE_URL } from './client'

export const getSettings = () => api.get('/api/settings')
export const updateSettings = (data) => api.put('/api/settings', data)
export const backupUrl = () => `${BASE_URL}/api/settings/backup`
export const resetAllData = () => api.post('/api/settings/reset?confirm=true')
