import { api } from './client'

export const listCharges = (filters = {}) => {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, v)
  })
  return api.get(`/api/charges?${params.toString()}`)
}

export const createCharge = (data) => api.post('/api/charges', data)
export const updateCharge = (id, data) => api.put(`/api/charges/${id}`, data)
export const deleteCharge = (id) => api.del(`/api/charges/${id}`)
