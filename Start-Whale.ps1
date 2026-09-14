$ErrorActionPreference='Stop'
$nodePath=(Get-Command node.exe -ErrorAction Stop).Source
& (Join-Path $PSScriptRoot 'desktop/launch-detached.ps1') -Root $PSScriptRoot -Node $nodePath
