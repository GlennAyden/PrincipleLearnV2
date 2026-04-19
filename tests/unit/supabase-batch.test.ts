import { chunkValues, collectBatchedInResults } from '@/lib/supabase-batch'

describe('supabase batch helpers', () => {
  it('chunks values according to the requested batch size', () => {
    expect(chunkValues([1, 2, 3, 4, 5], 2)).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ])
  })

  it('returns the original values as one chunk when size is zero or negative', () => {
    expect(chunkValues(['a', 'b', 'c'], 0)).toEqual([['a', 'b', 'c']])
    expect(chunkValues(['a', 'b', 'c'], -5)).toEqual([['a', 'b', 'c']])
  })

  it('aggregates results from every chunk in order', async () => {
    const fetchChunk = jest.fn(async (chunk: string[]) => ({
      data: chunk.map((value) => ({ value })),
      error: null,
    }))

    const result = await collectBatchedInResults({
      values: ['a', 'b', 'c', 'd', 'e'],
      chunkSize: 2,
      fetchChunk,
    })

    expect(fetchChunk.mock.calls.map(([chunk]) => chunk)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ])
    expect(result).toEqual({
      data: [
        { value: 'a' },
        { value: 'b' },
        { value: 'c' },
        { value: 'd' },
        { value: 'e' },
      ],
      error: null,
    })
  })

  it('returns partial data and stops on the first chunk error', async () => {
    const error = new Error('headers overflow')
    const fetchChunk = jest
      .fn()
      .mockResolvedValueOnce({
        data: [{ value: 'a' }, { value: 'b' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error,
      })

    const result = await collectBatchedInResults({
      values: ['a', 'b', 'c', 'd'],
      chunkSize: 2,
      fetchChunk,
    })

    expect(fetchChunk).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      data: [{ value: 'a' }, { value: 'b' }],
      error,
    })
  })
})
