$ErrorActionPreference = "Stop"

$pluginRoot = $PSScriptRoot
$marketplaceRoot = $pluginRoot
$marketplaceManifestPath = Join-Path $pluginRoot ".agents\plugins\marketplace.json"
if (-not (Test-Path -LiteralPath $marketplaceManifestPath)) {
  throw "Marketplace manifest not found: $marketplaceManifestPath"
}
$marketplaceManifest = Get-Content -LiteralPath $marketplaceManifestPath -Raw | ConvertFrom-Json
$marketplaceName = $marketplaceManifest.name
$pluginName = $marketplaceManifest.plugins[0].name
$pluginSelector = "$pluginName@$marketplaceName"

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
  throw "Bun not found. Install Bun, then reopen PowerShell."
}

$previousLocation = Get-Location
try {
  Set-Location -LiteralPath $pluginRoot
  & $bunPath install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "Could not install the locked Bun dependencies." }
} finally {
  Set-Location -LiteralPath $previousLocation
}

$codexCommand = Get-Command codex.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $codexCommand) {
  throw "Codex CLI not found. Install or update Codex Desktop, then reopen PowerShell."
}

# Detached daemons outlive MCP conversations. Stop only Bun processes whose
# command line points at this plugin so the next conversation starts the version
# that was just installed.
$daemonPattern = '(?i)codex-project-concierge[\\/].*(broker|codex-bridge)\.ts'
$staleDaemons = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq "bun.exe" -and $_.CommandLine -match $daemonPattern
}
foreach ($daemon in $staleDaemons) {
  Stop-Process -Id $daemon.ProcessId -Force
}

$marketplaces = & $codexCommand.Source plugin marketplace list 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Could not read Codex plugin marketplaces. Fix the reported marketplace error, then retry."
}
if (($marketplaces | Out-String) -notmatch [regex]::Escape($marketplaceName)) {
  & $codexCommand.Source plugin marketplace add $marketplaceRoot
  if ($LASTEXITCODE -ne 0) { throw "Could not register this repository as a local marketplace." }
}

& $codexCommand.Source plugin add $pluginSelector --json
if ($LASTEXITCODE -ne 0) {
  throw "Plugin installation failed. Confirm the Knowledgebase Tools marketplace is configured. If Codex reports a locked cache entry, restart Codex and rerun this installer."
}

Write-Output "Concierge is installed. Restart Codex, then open a new local conversation to load its bundled MCP tools. Do not add a second global MCP entry for this plugin."
