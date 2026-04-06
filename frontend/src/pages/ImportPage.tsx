import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getImports, uploadFile, processImport, getStagedTransactions, updateStagedTransactions, confirmImport, getCategories } from '../api/client'
import ImportReview from '../components/ImportReview'

export default function ImportPage() {
  const queryClient = useQueryClient()
  const [activeImportId, setActiveImportId] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const { data: imports } = useQuery({ queryKey: ['imports'], queryFn: getImports })
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories })
  const { data: staged } = useQuery({
    queryKey: ['staged', activeImportId],
    queryFn: () => getStagedTransactions(activeImportId!),
    enabled: !!activeImportId,
  })

  const uploadMut = useMutation({
    mutationFn: uploadFile,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['imports'] })
      setActiveImportId(data.id)
    },
  })

  const processMut = useMutation({
    mutationFn: processImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] })
      queryClient.invalidateQueries({ queryKey: ['staged', activeImportId] })
    },
  })

  const confirmMut = useMutation({
    mutationFn: confirmImport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imports'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      setActiveImportId(null)
    },
  })

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    uploadMut.mutate(files[0])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleStagedUpdate = async (updates: { id: number; category_id?: number; accepted?: boolean }[]) => {
    if (!activeImportId) return
    await updateStagedTransactions(activeImportId, updates)
    queryClient.invalidateQueries({ queryKey: ['staged', activeImportId] })
  }

  const activeImport = imports?.find((i) => i.id === activeImportId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Importar Extrato</h2>
        <p className="text-sm text-secondary">Envie seu extrato bancário e a IA irá categorizar automaticamente.</p>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container'
        }`}
      >
        <span className="material-symbols-outlined text-5xl text-secondary mb-3 block">upload_file</span>
        <p className="text-on-surface mb-2">Arraste seu extrato bancário aqui</p>
        <p className="text-xs text-secondary mb-4">Formatos aceitos: CSV, PDF</p>
        <label className="bg-primary text-on-primary px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary-container cursor-pointer transition-colors">
          Escolher arquivo
          <input type="file" accept=".csv,.pdf" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </label>
        {uploadMut.isPending && <p className="mt-3 text-sm text-primary">Enviando...</p>}
        {uploadMut.isError && <p className="mt-3 text-sm text-error">Erro no upload.</p>}
      </div>

      {/* Process Button */}
      {activeImport && activeImport.status === 'pending' && (
        <div className="bg-surface-container border border-outline-variant p-6 rounded-xl flex items-center justify-between">
          <div>
            <p className="font-medium">{activeImport.filename}</p>
            <p className="text-sm text-secondary">Pronto para processar com IA.</p>
          </div>
          <button
            onClick={() => processMut.mutate(activeImportId!)}
            disabled={processMut.isPending}
            className="bg-primary text-on-primary px-6 py-2 rounded-lg text-sm font-medium hover:bg-primary-container disabled:opacity-50 transition-colors"
          >
            {processMut.isPending ? 'Processando...' : 'Processar com IA'}
          </button>
        </div>
      )}

      {activeImport && activeImport.status === 'processing' && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center">
          <p className="text-primary font-medium">Processando com IA...</p>
          <p className="text-sm text-secondary">Isso pode levar alguns segundos</p>
        </div>
      )}

      {activeImport && activeImport.status === 'failed' && (
        <div className="bg-error-container border border-error/20 rounded-xl p-6">
          <p className="text-on-error-container font-medium">Erro no processamento</p>
          <p className="text-sm text-error">{activeImport.error_message}</p>
        </div>
      )}

      {/* Review */}
      {activeImport && activeImport.status === 'review' && staged && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Revisar ({staged.length} transações)</h3>
            <button
              onClick={() => confirmMut.mutate(activeImportId!)}
              disabled={confirmMut.isPending}
              className="bg-tertiary text-on-tertiary px-6 py-2 rounded-lg text-sm font-medium hover:bg-tertiary-container disabled:opacity-50 transition-colors"
            >
              {confirmMut.isPending ? 'Confirmando...' : 'Confirmar Importação'}
            </button>
          </div>
          <ImportReview staged={staged} categories={categories || []} onUpdate={handleStagedUpdate} />
        </div>
      )}

      {/* Past Imports */}
      {imports && imports.length > 0 && (
        <div className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-6 border-b border-outline-variant">
            <h3 className="font-bold text-lg">Importações Anteriores</h3>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-secondary border-b border-outline-variant">
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Arquivo</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Transações</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-medium uppercase tracking-wider">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {imports.map((imp) => (
                <tr
                  key={imp.id}
                  className="hover:bg-surface-variant transition-colors cursor-pointer"
                  onClick={() => imp.status === 'review' && setActiveImportId(imp.id)}
                >
                  <td className="px-6 py-4 text-sm">{imp.filename}</td>
                  <td className="px-6 py-4 text-sm text-secondary uppercase">{imp.file_type}</td>
                  <td className="px-6 py-4 text-sm text-secondary">{imp.row_count ?? '—'}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={imp.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-secondary">
                    {new Date(imp.created_at).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'text-yellow-400',
    processing: 'text-primary',
    review: 'text-primary',
    completed: 'text-tertiary',
    failed: 'text-error',
  }
  const labels: Record<string, string> = {
    pending: 'Pendente',
    processing: 'Processando',
    review: 'Em Revisão',
    completed: 'Concluído',
    failed: 'Falhou',
  }
  return (
    <div className={`flex items-center gap-1.5 ${styles[status] || 'text-secondary'} text-[10px] font-bold uppercase tracking-widest`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'completed' ? 'bg-tertiary' : status === 'failed' ? 'bg-error' : 'bg-primary'}`} />
      {labels[status] || status}
    </div>
  )
}
