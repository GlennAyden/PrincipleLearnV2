export const DEFAULT_SUPABASE_IN_BATCH_SIZE = 100

export function chunkValues<T>(values: T[], size: number = DEFAULT_SUPABASE_IN_BATCH_SIZE): T[][] {
  if (values.length === 0) return []
  if (size <= 0) return [values]

  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

export async function collectBatchedInResults<T, TValue extends string | number>(params: {
  values: TValue[]
  fetchChunk: (chunk: TValue[]) => Promise<{ data: T[] | null; error: unknown | null | undefined }>
  chunkSize?: number
}): Promise<{ data: T[]; error: unknown | null }> {
  const { values, fetchChunk, chunkSize = DEFAULT_SUPABASE_IN_BATCH_SIZE } = params

  if (values.length === 0) {
    return { data: [], error: null }
  }

  const aggregated: T[] = []

  for (const chunk of chunkValues(values, chunkSize)) {
    const { data, error } = await fetchChunk(chunk)
    if (error) {
      return { data: aggregated, error }
    }

    aggregated.push(...(data ?? []))
  }

  return { data: aggregated, error: null }
}
