# =============================================================================
# Coding Helper - write .env.local
#
# Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File .\setup-env.ps1
#
# Prompts for each value and writes .env.local next to this script. Secrets are
# typed masked and never echoed. Nothing leaves your machine.
#
# NOTE: this file is deliberately pure ASCII. Windows PowerShell 5.1 decodes
# .ps1 files as Windows-1252 unless they carry a BOM, and a UTF-8 em dash comes
# back as a curly quote, which the parser treats as a string delimiter.
# =============================================================================

$ErrorActionPreference = 'Stop'

function Read-Secret([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try   { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-Masked([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return '(empty)' }
    if ($Value.Length -le 12) { return ('*' * $Value.Length) }
    return $Value.Substring(0, 8) + '...' + $Value.Substring($Value.Length - 4)
}

Write-Host ''
Write-Host '  Coding Helper - environment setup' -ForegroundColor Cyan
Write-Host '  Paste each value and press Enter. Secrets stay hidden as you type.'
Write-Host ''

# --- 1. Anthropic ------------------------------------------------------------
Write-Host '  [1/4] Anthropic API key' -ForegroundColor Yellow
Write-Host '        platform.claude.com -> Settings -> API keys -> Create key'
Write-Host '        Starts with sk-ant- and is shown only once, at creation.'
$anthropic = Read-Secret '        Key'

if ($anthropic -notlike 'sk-ant-*') {
    Write-Host '        WARNING: that does not start with sk-ant-. Check you copied it all.' -ForegroundColor Red
}
if ($anthropic -match '\.\.\.') {
    Write-Host '        WARNING: that contains "..." - you copied the masked preview from' -ForegroundColor Red
    Write-Host '        the key list, not the real key. Create a new key and copy it from' -ForegroundColor Red
    Write-Host '        the dialog shown right after you click Create.' -ForegroundColor Red
}
Write-Host ''

# --- 2-4. Supabase -----------------------------------------------------------
Write-Host '  Supabase: your project -> Project Settings -> API Keys' -ForegroundColor Yellow
Write-Host ''

Write-Host '  [2/4] Project URL  (looks like https://abcdefgh.supabase.co)'
$supabaseUrl = (Read-Host '        URL').Trim().TrimEnd('/')
if ($supabaseUrl -notmatch '^https://.+\.supabase\.(co|in)$') {
    Write-Host '        WARNING: expected https://<something>.supabase.co' -ForegroundColor Red
}
Write-Host ''

Write-Host '  [3/4] anon / publishable key  (safe for the browser)'
$anonKey = Read-Secret '        Key'
Write-Host ''

Write-Host '  [4/4] service_role / secret key  (server only, never commit this)'
$serviceKey = Read-Secret '        Key'
if ($serviceKey -eq $anonKey) {
    Write-Host '        WARNING: same as the anon key. These are two different keys, and' -ForegroundColor Red
    Write-Host '        the app cannot read uploaded photos without the service one.' -ForegroundColor Red
}
Write-Host ''

# --- write -------------------------------------------------------------------
$envPath = Join-Path $PSScriptRoot '.env.local'

if (Test-Path $envPath) {
    $stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $PSScriptRoot (".env.local.backup-" + $stamp)
    Copy-Item $envPath $backup
    Write-Host ('  Existing .env.local backed up to ' + (Split-Path $backup -Leaf)) -ForegroundColor DarkGray
}

$lines = @(
    '# ---- Anthropic ----'
    ('ANTHROPIC_API_KEY=' + $anthropic)
    ''
    '# ---- Supabase ----'
    ('NEXT_PUBLIC_SUPABASE_URL=' + $supabaseUrl)
    ('NEXT_PUBLIC_SUPABASE_ANON_KEY=' + $anonKey)
    ('SUPABASE_SERVICE_ROLE_KEY=' + $serviceKey)
    ''
    '# ---- App ----'
    'NEXT_PUBLIC_SITE_URL=http://localhost:3000'
    ''
)

# UTF-8 without BOM. A BOM here would corrupt the first variable name.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($envPath, ($lines -join "`r`n"), $utf8NoBom)

Write-Host ''
Write-Host '  Wrote .env.local' -ForegroundColor Green
Write-Host ('    ANTHROPIC_API_KEY             = ' + (Get-Masked $anthropic))
Write-Host ('    NEXT_PUBLIC_SUPABASE_URL      = ' + $supabaseUrl)
Write-Host ('    NEXT_PUBLIC_SUPABASE_ANON_KEY = ' + (Get-Masked $anonKey))
Write-Host ('    SUPABASE_SERVICE_ROLE_KEY     = ' + (Get-Masked $serviceKey))
Write-Host '    NEXT_PUBLIC_SITE_URL          = http://localhost:3000'
Write-Host ''
Write-Host '  This file is already in .gitignore. Never share it.' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Next:  npm run dev' -ForegroundColor Cyan
Write-Host ''
