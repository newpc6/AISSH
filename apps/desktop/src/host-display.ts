import type { HostRecord } from '@ai-ssh/shared-contracts'

export function hostConnectionLabel(host: HostRecord | null | undefined) {
  if (!host) return ''
  if ((host.protocol ?? 'ssh') === 'wsl') {
    const distro = host.wslDistro?.trim() || host.name
    const user = host.username?.trim()
    return user ? `WSL ${distro} (${user})` : `WSL ${distro}`
  }
  return `${host.username}@${host.address}:${host.port}`
}

export function hostAddressLabel(host: HostRecord | null | undefined) {
  if (!host) return '-'
  if ((host.protocol ?? 'ssh') === 'wsl') {
    return host.wslDistro?.trim() || 'WSL'
  }
  return `${host.address}:${host.port}`
}

export function hostProtocolLabel(host: HostRecord | null | undefined) {
  if (!host) return ''
  return (host.protocol ?? 'ssh') === 'wsl' ? 'WSL' : 'SSH'
}

