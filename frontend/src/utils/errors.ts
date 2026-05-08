export function extractError(err: unknown): string {
  const e = err as {
    response?: { data?: { detail?: unknown }; status?: number }
    message?: string
    code?: string
  }
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d: { msg?: string }) => d?.msg ?? '').filter(Boolean).join('; ') || 'Erro de validação'
  }
  if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error') {
    return 'Sem conexão com o servidor. Verifique se o backend está rodando.'
  }
  if (e?.response?.status === 500) return 'Erro interno do servidor.'
  return e?.message ?? 'Erro desconhecido'
}
