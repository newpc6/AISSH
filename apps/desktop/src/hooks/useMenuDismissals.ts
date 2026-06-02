import { useEffect } from 'react'
import type { TopMenu } from '../types'

type SessionTabMenuState = { sessionId: string; x: number; y: number } | null

type UseMenuDismissalsArgs = {
  openHostMenuId: string
  openTopMenu: TopMenu
  sessionTabMenu: SessionTabMenuState
  sessionTabMenuRef: React.RefObject<HTMLDivElement | null>
  setOpenHostMenuId: React.Dispatch<React.SetStateAction<string>>
  setOpenTopMenu: React.Dispatch<React.SetStateAction<TopMenu>>
  setSessionTabMenu: React.Dispatch<React.SetStateAction<SessionTabMenuState>>
}

export function useMenuDismissals({
  openHostMenuId,
  openTopMenu,
  sessionTabMenu,
  sessionTabMenuRef,
  setOpenHostMenuId,
  setOpenTopMenu,
  setSessionTabMenu,
}: UseMenuDismissalsArgs) {
  useEffect(() => {
    if (!openHostMenuId) {
      return
    }

    const closeMenu = () => setOpenHostMenuId('')
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openHostMenuId, setOpenHostMenuId])

  useEffect(() => {
    if (!sessionTabMenu) {
      return
    }

    const closeMenu = (event: MouseEvent) => {
      if (sessionTabMenuRef.current?.contains(event.target as Node)) {
        return
      }
      setSessionTabMenu(null)
    }
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [sessionTabMenu, sessionTabMenuRef, setSessionTabMenu])

  useEffect(() => {
    if (!openTopMenu) {
      return
    }

    const closeMenu = () => setOpenTopMenu('')
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [openTopMenu, setOpenTopMenu])
}
