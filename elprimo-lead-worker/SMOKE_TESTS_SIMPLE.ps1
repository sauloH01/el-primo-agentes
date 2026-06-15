# Smoke Tests - Simplified Version
# Execute post-deployment validation

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SMOKE TESTS - elprimo-lead-worker" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead"
$passedTests = 0
$failedTests = 0

# TEST 1: Lead with UTM
Write-Host "TEST 1: Lead with UTM" -ForegroundColor Green
Write-Host "────────────────────────" -ForegroundColor Gray

try {
    $body = @{
        nombre = "Smoke Test UTM"
        telefono = "3001111111"
        zona = "Finca en Chinauta"
        tipo = "Cocina Integral"
        presupuesto = "`$15M - `$30M"
        mensaje = "Smoke test"
        source = "test"
        utm_campaign = "smoke_test_campaign"
        utm_source = "facebook"
        utm_medium = "cpc"
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
      -Uri $baseUrl `
      -Method POST `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 10

    Write-Host "Response:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json | Out-String)

    if ($response.success -eq $true -and $response.contactId -and $response.dealId -and $response.correlationId) {
        Write-Host "PASS: Test 1" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "FAIL: Test 1" -ForegroundColor Red
        $failedTests++
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "FAIL: Test 1" -ForegroundColor Red
    $failedTests++
}

Write-Host ""

# TEST 2: Lead without UTM
Write-Host "TEST 2: Lead without UTM (Defaults)" -ForegroundColor Green
Write-Host "────────────────────────" -ForegroundColor Gray

try {
    $body = @{
        nombre = "Smoke Test No UTM"
        telefono = "3002222222"
        zona = "Bogota"
        tipo = "Vestier"
        presupuesto = "`$4M - `$8M"
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
      -Uri $baseUrl `
      -Method POST `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 10

    Write-Host "Response:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json | Out-String)

    if ($response.success -eq $true -and $response.contactId) {
        Write-Host "PASS: Test 2" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "FAIL: Test 2" -ForegroundColor Red
        $failedTests++
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "FAIL: Test 2" -ForegroundColor Red
    $failedTests++
}

Write-Host ""

# TEST 3: Honeypot
Write-Host "TEST 3: Honeypot Detection (Spam)" -ForegroundColor Green
Write-Host "────────────────────────" -ForegroundColor Gray

try {
    $body = @{
        nombre = "Spam Bot"
        telefono = "3003333333"
        website = "spam-bot.com"
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
      -Uri $baseUrl `
      -Method POST `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 10

    Write-Host "Response:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json | Out-String)

    if ($response.success -eq $true -and $response.contactId -eq "honeypot") {
        Write-Host "PASS: Test 3 (Spam blocked)" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "FAIL: Test 3" -ForegroundColor Red
        $failedTests++
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "FAIL: Test 3" -ForegroundColor Red
    $failedTests++
}

Write-Host ""

# TEST 4: Validation error
Write-Host "TEST 4: Input Validation (Error 400)" -ForegroundColor Green
Write-Host "────────────────────────" -ForegroundColor Gray

try {
    $body = @{
        nombre = ""
        telefono = "3004444444"
    } | ConvertTo-Json

    # PowerShell 5.1 no soporta -SkipHttpErrorCheck: un 400 lanza excepcion.
    # Capturamos la WebException para leer el status code y el cuerpo de la respuesta.
    $statusCode = 0
    $content = $null
    try {
        $response = Invoke-WebRequest `
          -Uri $baseUrl `
          -Method POST `
          -ContentType "application/json" `
          -Body $body `
          -TimeoutSec 10 `
          -UseBasicParsing
        $statusCode = [int]$response.StatusCode
        $content = $response.Content | ConvertFrom-Json
    } catch {
        $errResponse = $_.Exception.Response
        if ($errResponse) {
            $statusCode = [int]$errResponse.StatusCode
            # En PowerShell 5.1 el cuerpo de una respuesta de error queda en ErrorDetails.Message
            $rawBody = $_.ErrorDetails.Message
            if (-not $rawBody) {
                $reader = New-Object System.IO.StreamReader($errResponse.GetResponseStream())
                $rawBody = $reader.ReadToEnd()
                $reader.Close()
            }
            if ($rawBody) { $content = $rawBody | ConvertFrom-Json }
        } else {
            throw
        }
    }

    Write-Host "Status Code: $statusCode" -ForegroundColor Yellow
    Write-Host "Response:" -ForegroundColor Green
    Write-Host ($content | ConvertTo-Json | Out-String)

    if ($statusCode -eq 400 -and $content.success -eq $false) {
        Write-Host "PASS: Test 4 (Validation working)" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "FAIL: Test 4" -ForegroundColor Red
        $failedTests++
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "FAIL: Test 4" -ForegroundColor Red
    $failedTests++
}

Write-Host ""

# TEST 5: Phone normalization
Write-Host "TEST 5: Phone Normalization" -ForegroundColor Green
Write-Host "────────────────────────" -ForegroundColor Gray

try {
    # Format 1: 10 digits
    $body1 = @{
        nombre = "Test Format 1"
        telefono = "3005555555"
    } | ConvertTo-Json

    $response1 = Invoke-RestMethod `
      -Uri $baseUrl `
      -Method POST `
      -ContentType "application/json" `
      -Body $body1 `
      -TimeoutSec 10

    # Format 2: 12 digits
    $body2 = @{
        nombre = "Test Format 2"
        telefono = "573006666666"
    } | ConvertTo-Json

    $response2 = Invoke-RestMethod `
      -Uri $baseUrl `
      -Method POST `
      -ContentType "application/json" `
      -Body $body2 `
      -TimeoutSec 10

    Write-Host "Response 1 (10 digits):" -ForegroundColor Green
    Write-Host "  contactId: $($response1.contactId)" -ForegroundColor White
    Write-Host "Response 2 (12 digits):" -ForegroundColor Green
    Write-Host "  contactId: $($response2.contactId)" -ForegroundColor White

    if ($response1.success -eq $true -and $response2.success -eq $true) {
        Write-Host "PASS: Test 5 (Normalization OK)" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "FAIL: Test 5" -ForegroundColor Red
        $failedTests++
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "FAIL: Test 5" -ForegroundColor Red
    $failedTests++
}

Write-Host ""

# SUMMARY
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESULTS SUMMARY" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Passed: $passedTests" -ForegroundColor Green
Write-Host "Failed: $failedTests" -ForegroundColor $(if ($failedTests -eq 0) { 'Green' } else { 'Red' })
Write-Host ""

if ($failedTests -eq 0 -and $passedTests -eq 5) {
    Write-Host "SUCCESS! All smoke tests passed!" -ForegroundColor Green
    Write-Host "Worker is ready for production use." -ForegroundColor Green
} else {
    Write-Host "WARNING: Some tests failed" -ForegroundColor Red
    Write-Host "Review output above for details" -ForegroundColor Red
}

Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Check HubSpot Dashboard for new cont