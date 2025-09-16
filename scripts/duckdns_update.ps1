param(
    [string]$Domain,
    [string]$Token
)

# If params not provided, try to read from scripts/duckdns.env (KEY=VALUE)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $ScriptDir 'duckdns.env'
if ((-not $Domain -or -not $Token) -and (Test-Path $EnvFile)) {
    $lines = Get-Content $EnvFile | Where-Object { $_ -and ($_ -notmatch '^\s*#') }
    foreach ($l in $lines) {
        if ($l -match '^(?<k>[^=]+)=(?<v>.*)$') {
            $k = $Matches['k'].Trim()
            $v = $Matches['v'].Trim()
            if ($k -eq 'DUCKDNS_DOMAIN' -and -not $Domain) { $Domain = $v }
            if ($k -eq 'DUCKDNS_TOKEN' -and -not $Token) { $Token = $v }
        }
    }
}

if (-not $Domain -or -not $Token) {
    Write-Error "Please provide -Domain and -Token or fill scripts/duckdns.env"
    exit 1
}

$uri = "https://www.duckdns.org/update?domains=$Domain&token=$Token&ip="
try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $uri -Method GET -TimeoutSec 15
    $content = $resp.Content
    Write-Output $content
} catch {
    Write-Error $_
    exit 2
}


