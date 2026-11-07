$ErrorActionPreference = "Stop"

if (-not $env:HOME -and $env:USERPROFILE) {
  $env:HOME = $env:USERPROFILE
}

$pluginRoot = Split-Path -Parent $PSScriptRoot
$bunCandidates = @(
  (Join-Path $env:APPDATA "npm\node_modules\bun\bin\bun.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\Bun\bun.exe")
)
$bunPath = $bunCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $bunPath) {
  $bunCommand = Get-Command bun.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($bunCommand) { $bunPath = $bunCommand.Source }
}
if (-not $bunPath) {
  throw "Bun executable not found. Install Bun, then reopen Codex."
}

if (-not $env:CODEX_CLI_PATH) {
  $codexCommand = Get-Command codex.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($codexCommand) {
    $env:CODEX_CLI_PATH = $codexCommand.Source
  } else {
    $codexRoot = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin"
    $codexPath = Get-ChildItem -LiteralPath $codexRoot -Filter codex.exe -File -Recurse -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1 -ExpandProperty FullName
    if ($codexPath) { $env:CODEX_CLI_PATH = $codexPath }
  }
}

& $bunPath (Join-Path $pluginRoot "server.ts")
exit $LASTEXITCODE
