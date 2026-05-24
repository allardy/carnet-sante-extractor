import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeAppointments } from '../src/normalize/appointments.js'

describe('normalizeAppointments', () => {
  it('sorts and flattens to CleanAppointment[]', async () => {
    const raw = JSON.parse(await readFile(resolve(__dirname, 'fixtures/appointments/list.json'), 'utf8'))
    const result = normalizeAppointments(raw)

    expect(result).toHaveLength(2)
    expect(result[0]?.doctor).toBe('JOHN SMITH')
    expect(result[0]?.time).toBe('10:00')
    expect(result[1]?.specialty).toBe('Cardiologie')
  })

  it('handles empty array', () => {
    expect(normalizeAppointments([])).toEqual([])
  })
})
