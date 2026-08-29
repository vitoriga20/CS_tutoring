# ZCode Stop-hook adapter for turn_align (host wiring generated at bootstrap, not part of the template).
# ZCode differences handled here:
#   1) Stop event stdin carries no status field turn_align understands -> feed {"status":"completed"}
#      so drift_lite actually runs on every turn end.
#   2) ZCode hook stdout is a strict JSON schema -> map nudge.message to additionalContext,
#      emit nothing when there is no risk.
$ErrorActionPreference = 'Continue'
$ScriptDir = $PSScriptRoot
$TurnAlign = Join-Path $ScriptDir 'turn_align.ps1'

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'powershell'
$psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$TurnAlign`""
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.WorkingDirectory = $ScriptDir
$p = [Diagnostics.Process]::Start($psi)
$p.StandardInput.Write('{"status":"completed","loop_count":0}')
$p.StandardInput.Close()
$stdout = $p.StandardOutput.ReadToEnd()
$stderr = $p.StandardError.ReadToEnd()
$p.WaitForExit()
if ($stderr) { [Console]::Error.WriteLine($stderr.TrimEnd()) }

try { $parsed = $stdout | ConvertFrom-Json } catch { $parsed = $null }
if ($parsed -and $parsed.nudge -and $parsed.message) {
    $payload = [ordered]@{ additionalContext = [string]$parsed.message }
    [Console]::Out.Write(($payload | ConvertTo-Json -Compress))
}
exit 0
