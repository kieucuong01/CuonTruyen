param(
  [string]$Port = "54533",
  [Parameter(Mandatory = $true)][string]$PublicApiUrl,
  [Parameter(Mandatory = $true)][string]$FrontendOrigin,
  [Parameter(Mandatory = $true)][string]$AdminToken
)

$env:PORT = $Port
$env:PUBLIC_IMPORTS_BASE_URL = $PublicApiUrl.TrimEnd("/")
$env:PUBLIC_SITE_URL = $FrontendOrigin.TrimEnd("/")
$env:CORS_ALLOW_ORIGIN = $FrontendOrigin.TrimEnd("/")
$env:ADMIN_TOKEN = $AdminToken

npm run dev
