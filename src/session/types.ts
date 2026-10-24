export type From = 'guest' | 'employee'
export type Via = 'spoken' | 'typed' | 'phrase' | 'signed'

export interface Message {
  id: number
  from: From
  text: string
  at: Date
  via: Via
  voiceUrl?: string | null
  voice?: 'making' | 'ready' | 'none'
}

export const VIA_LABEL: Record<Via, string> = {
  spoken: 'spoken',
  typed: 'typed',
  phrase: 'quick phrase',
  signed: 'taught sign',
}

export const ROLE_LABEL: Record<From, string> = {
  guest: 'Guest',
  employee: 'Receptionist',
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
