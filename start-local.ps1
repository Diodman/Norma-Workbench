param([int]$Port = 4267, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$siteRoot = Join-Path $PSScriptRoot 'app'
if (!(Test-Path (Join-Path $siteRoot 'index.html'))) {
    throw 'The app folder is missing. Extract the entire ZIP before starting.'
}
if ($Port -lt 1 -or $Port -gt 65535) { throw 'Port must be between 1 and 65535.' }
$localServer = $null
try {
    $sourceCode = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'local-server.cs'))
    Add-Type -TypeDefinition $sourceCode -Language CSharp
    $localServer = New-Object NormaLocalServer -ArgumentList $siteRoot, $Port
    $url = 'http://127.0.0.1:' + $Port + '/'
    Write-Host ''
    Write-Host 'Norma Workbench' -ForegroundColor Cyan
    Write-Host $url
    Write-Host 'Keep this window open. Press Ctrl+C to stop.'
    Write-Host ''
    if (!$NoBrowser) {
        try { Start-Process $url } catch { Write-Host ('Open this address in your browser: ' + $url) }
    }
    while ($true) { Start-Sleep -Seconds 1 }
}
catch {
    Write-Host ('Cannot start Norma: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Close a previous Norma window if the port is already in use.'
    Write-Host 'For another port, run: powershell -NoProfile -ExecutionPolicy Bypass -File .\start-local.ps1 -Port 4268'
    exit 1
}
finally {
    if ($null -ne $localServer) { $localServer.Dispose() }
}
