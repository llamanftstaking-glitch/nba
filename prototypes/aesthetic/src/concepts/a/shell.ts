import { createContext, useContext } from 'react'

export type ShellCtx = { portal: HTMLElement | null; openAssistant: () => void; openSearch: () => void }
export const Ctx = createContext<ShellCtx>({ portal: null, openAssistant: () => {}, openSearch: () => {} })
export const useShell = () => useContext(Ctx)
