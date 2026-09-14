[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Node
)

$ErrorActionPreference = 'Stop'

# The Explorer desktop is the launch broker, so this GUI is not a child of the
# MCP/app-server Job object. No task, service, registry entry or elevated token
# is created. Only this installation's native desktop executable can be opened.
$expectedRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
if (-not [String]::Equals($resolvedRoot, $expectedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Root must be the installation containing this launch script.'
}
$resolvedNode = (Resolve-Path -LiteralPath $Node).Path
if (-not (Test-Path -LiteralPath $resolvedNode -PathType Leaf) -or
    -not [String]::Equals([System.IO.Path]::GetFileName($resolvedNode), 'node.exe', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Node must identify an existing node.exe file.'
}
$whaleExecutable = Join-Path $expectedRoot 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $whaleExecutable -PathType Leaf)) {
    throw 'Electron is missing. Run npm ci and node node_modules/electron/install.js first.'
}
# Neither string is evaluated by a shell. Windows filenames cannot contain a
# double quote, and neither absolute path ends in a backslash here.
if ($expectedRoot.Contains('"') -or $resolvedNode.Contains('"')) { throw 'Invalid path.' }
$whaleArguments = '"{0}"' -f (Join-Path $expectedRoot 'desktop\main.cjs')

try {
    $shell = New-Object -ComObject Shell.Application
    $shellWindows = $shell.Windows()
    $desktopHandle = 0
    # SWC_DESKTOP = 8, SWFO_NEEDDISPATCH = 1. Use the actual Explorer desktop's
    # application object rather than creating an in-process ShellExecute call.
    $desktop = $shellWindows.FindWindowSW(0, 0, 8, [ref]$desktopHandle, 1)
    if ($null -eq $desktop) { throw 'Explorer desktop is unavailable.' }
    $broker = $desktop.Document.Application
    $broker.ShellExecute($whaleExecutable, $whaleArguments, $expectedRoot, 'open', 0)
} catch {
    throw "Explorer could not launch Codex Whale: $($_.Exception.Message)"
}
# Acceptance is asynchronous: the caller must wait for desktop-status.json.
