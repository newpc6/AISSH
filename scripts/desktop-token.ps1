function Get-AISSHDesktopTokenPath {
  $base = $env:APPDATA
  if ([string]::IsNullOrWhiteSpace($base)) {
    $base = $env:HOME
  }
  if ([string]::IsNullOrWhiteSpace($base)) {
    $base = [Environment]::GetFolderPath([Environment+SpecialFolder]::ApplicationData)
  }
  if ([string]::IsNullOrWhiteSpace($base)) {
    throw "Unable to resolve desktop token directory"
  }
  Join-Path $base "ai-ssh\desktop-token"
}

function New-AISSHDesktopToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Get-AISSHDesktopToken {
  $tokenPath = Get-AISSHDesktopTokenPath
  if (Test-Path -LiteralPath $tokenPath) {
    $token = (Get-Content -LiteralPath $tokenPath -Raw -ErrorAction Stop).Trim()
    if (-not [string]::IsNullOrWhiteSpace($token)) {
      return [pscustomobject]@{
        Token = $token
        Path = $tokenPath
        Created = $false
      }
    }
  }

  $token = New-AISSHDesktopToken
  $parent = Split-Path -Parent $tokenPath
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  Set-Content -LiteralPath $tokenPath -Value $token -Encoding ascii -NoNewline
  [pscustomobject]@{
    Token = $token
    Path = $tokenPath
    Created = $true
  }
}
