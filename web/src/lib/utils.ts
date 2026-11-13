import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Une clases de Tailwind resolviendo conflictos (la última gana). Lo usan los componentes de shadcn/ui. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
