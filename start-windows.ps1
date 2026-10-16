$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath $PSScriptRoot
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:ProgramFiles 'nodejs\node.exe' }
    if (-not (Test-Path -LiteralPath $nodePath)) { throw '请先安装 Node.js 22 或更新版本。' }
    $major = & $nodePath -p "process.versions.node.split('.')[0]"
    if ([int]$major -lt 22) { throw '请先更新 Node.js 到 22 或更新版本。' }
    & $nodePath --input-type=module -e "await import('mssql')" 2>$null
    if ($LASTEXITCODE -ne 0) { throw '运行依赖缺失。请在本文件夹运行 npm ci --omit=dev 后重试。' }
    $portText = & $nodePath -e "try{process.loadEnvFile('.env')}catch(e){if(e.code!=='ENOENT')throw e};console.log(process.env.PORT||3210)"
    if ($LASTEXITCODE -ne 0) { throw '无法读取 .env 配置。' }
    $appPort = 0
    if (-not [int]::TryParse([string]$portText, [ref]$appPort) -or $appPort -lt 1 -or $appPort -gt 65535) { throw 'PORT 必须是 1 到 65535 之间的端口。' }
    $appUrl = "http://127.0.0.1:$appPort"
    function Test-LedgerHealth {
        try { return ((Invoke-RestMethod -Uri "$appUrl/api/health" -TimeoutSec 2).app -eq 'montra') } catch { return $false }
    }
    if (Test-LedgerHealth) { Start-Process $appUrl; exit 0 }
    $listener = [System.Net.Sockets.TcpClient]::new()
    $occupied = $false
    try {
        $pendingConnection = $listener.BeginConnect('127.0.0.1', $appPort, $null, $null)
        if ($pendingConnection.AsyncWaitHandle.WaitOne(1000)) { $listener.EndConnect($pendingConnection); $occupied = $listener.Connected }
    } catch {
        $occupied = $false
    } finally { $listener.Dispose() }
    if ($occupied) { throw "端口 $appPort 已被其他服务使用，请先检查占用情况。" }
    $dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
    if ($dockerCommand) {
        # Only start a container that already exists; never create or initialize a database.
        $dockerProcess = Start-Process -FilePath $dockerCommand.Source -ArgumentList @('start','sqlserver') -WindowStyle Hidden -PassThru
        if (-not $dockerProcess.WaitForExit(10000)) { $dockerProcess.Kill() }
    }
    $logDir = Join-Path $PSScriptRoot '运行日志'
    [System.IO.Directory]::CreateDirectory($logDir) | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $env:LEDGER_OPEN_BROWSER = '0'
    $serverProcess = Start-Process -FilePath $nodePath -ArgumentList @('server.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir "$stamp-out.log") -RedirectStandardError (Join-Path $logDir "$stamp-error.log") -PassThru
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        if ($serverProcess.HasExited) { throw '界面服务未能启动，请查看“运行日志”文件夹。' }
        if (Test-LedgerHealth) { Start-Process $appUrl; exit 0 }
    }
    throw '启动等待超时，请查看“运行日志”文件夹。'
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '记账软件启动提示', 'OK', 'Warning') | Out-Null
    exit 1
}
