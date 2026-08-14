param(
    [Parameter(Mandatory = $true)]
    [string]$InstallDirectory
)

$installPath = [System.IO.Path]::GetFullPath($InstallDirectory)
$executable = Join-Path $installPath 'DevWannaCode.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "DevWannaCode.exe was not found in: $installPath"
}

$launcherPath = Join-Path $installPath 'dwc.cmd'
@'
@echo off
start "" "%~dp0DevWannaCode.exe" %*
'@ | Set-Content -LiteralPath $launcherPath -Encoding ASCII

$currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$pathEntries = @($currentPath -split ';' | Where-Object { $_ })
if ($pathEntries -notcontains $installPath) {
    [Environment]::SetEnvironmentVariable('Path', (($pathEntries + $installPath) -join ';'), 'User')
}

Write-Host "Installed: $launcherPath"
Write-Host 'Open a new terminal, then run: dwc .'
