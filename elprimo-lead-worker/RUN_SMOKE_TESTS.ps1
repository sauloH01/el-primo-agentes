# 🧪 SMOKE TESTS — Copy & Paste Ready
# Post-Deployment Validation Script
# Ejecuta en PowerShell después del despliegue

Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🧪 SMOKE TESTS — elprimo-lead-worker" -ForegroundColor Yellow
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead"
$passedTests = 0
$failedTests = 0

# ═══════════════════════════════════════════════════════════
# TEST 1: Lead Normal con UTM (Validación Principal)
# ═══════════════════════════════════════════════════════════

Write-Host "TEST 1️⃣: Lead Normal con UTM" -ForegroundColor Green
Write-Host "──────────────────────────────────" -ForegroundColor Gray

try {
    $body = @{
        nombre = "Smoke Test UTM"
        telefono = "3001111111"
        zona = "Finca en Chinauta"
        tipo = "Cocina Integral"
        presupuesto = "`$15M - `$30M"
        mensaje = "Prueba de humo"
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

    Write-Host "✅ Response received:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json | Out-String) -ForegroundColor White

    # Validaciones
    $validations = @(
        @{ Check = "success = true"; Pass = ($response.success -eq $true) }
        @{ Check = "contactId not null"; Pass = ($response.contactId -ne $null) }
        @{ Check = "dealId not null"; Pass = ($response.dealId -ne $null) }
        @{ Check = "correlationId exists"; Pass = ($response.correlationId -ne $null) }
        @{ Check = "correlationId format"; Pass = ($response.correlationId -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}_[a-f0-9]{8}$') }
        @{ Check = "message contains Ref-ID"; Pass = ($response.message -like "*Ref-ID*") }
    )

    $allPass = $true
    foreach ($validation in $validations) {
        $status = if ($validation.Pass) { "✅" } else { "❌" }
        Write-Host "$status $($validation.Check)" -ForegroundColor $(if ($validation.Pass) { 'Green' } else { 'Red' })
        if (-not $validation.Pass) { $allPass = $false }
    }

    if ($allPass) {
        $passedTests++
        Write-Host "RESULT: ✅ PASSED" -ForegroundColor Green
    } else {
        $failedTests++
        Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
    }

} catch {
    $failedTests++
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
}

Write-Host ""

# ═══════════════════════════════════════════════════════════
# TEST 2: Lead sin UTM (Validación de Defaults)
# ═══════════════════════════════════════════════════════════

Write-Host "TEST 2️⃣: Lead sin UTM (Valores por Defecto)" -ForegroundColor Green
Write-Host "──────────────────────────────────" -ForegroundColor Gray

try {
    $body = @{
        nombre = "Smoke Test Sin UTM"
        telefono = "3002222222"
        zona = "Bogotá"
        tipo = "Vestier"
        presupuesto = "`$4M - `$8M"
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
      -Uri $baseUrl `
      -Method POST `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 10

    Write-Host "✅ Response received:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json | Out-String) -ForegroundColor White

    $validations = @(
        @{ Check = "success = true"; Pass = ($response.success -eq $true) }
        @{ Check = "contactId not null"; Pass = ($response.contactId -ne $null) }
        @{ Check = "correlationId exists"; Pass = ($response.correlationId -ne $null) }
    )

    $allPass = $true
    foreach ($validation in $validations) {
        $status = if ($validation.Pass) { "✅" } else { "❌" }
        Write-Host "$status $($validation.Check)" -ForegroundColor $(if ($validation.Pass) { 'Green' } else { 'Red' })
        if (-not $validation.Pass) { $allPass = $false }
    }

    if ($allPass) {
        $passedTests++
        Write-Host "RESULT: ✅ PASSED" -ForegroundColor Green
    } else {
        $failedTests++
        Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
    }

} catch {
    $failedTests++
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
}

Write-Host ""

# ═══════════════════════════════════════════════════════════
# TEST 3: Honeypot Detection (Spam)
# ═══════════════════════════════════════════════════════════

Write-Host "TEST 3️⃣: Honeypot Detection (Spam)" -ForegroundColor Green
Write-Host "──────────────────────────────────" -ForegroundColor Gray

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

    Write-Host "✅ Response received:" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json | Out-String) -ForegroundColor White

    $validations = @(
        @{ Check = "success = true"; Pass = ($response.success -eq $true) }
        @{ Check = "contactId = honeypot"; Pass = ($response.contactId -eq "honeypot") }
        @{ Check = "dealId is null"; Pass = ($response.dealId -eq $null) }
    )

    $allPass = $true
    foreach ($validation in $validations) {
        $status = if ($validation.Pass) { "✅" } else { "❌" }
        Write-Host "$status $($validation.Check)" -ForegroundColor $(if ($validation.Pass) { 'Green' } else { 'Red' })
        if (-not $validation.Pass) { $allPass = $false }
    }

    if ($allPass) {
        $passedTests++
        Write-Host "RESULT: ✅ PASSED (Spam blocked)" -ForegroundColor Green
    } else {
        $failedTests++
        Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
    }

} catch {
    $failedTests++
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
}

Write-Host ""

# ═══════════════════════════════════════════════════════════
# TEST 4: Validación de Entrada (Error 400)
# ═══════════════════════════════════════════════════════════

Write-Host "TEST 4️⃣: Validación de Entrada (Campo Requerido Vacío)" -ForegroundColor Green
Write-Host "──────────────────────────────────" -ForegroundColor Gray

try {
    $body = @{
        nombre = ""
        telefono = "3004444444"
    } | ConvertTo-Json

    $response = Invoke-RestMethod `
      -Uri $baseUrl `
      -Method POST `
      -ContentType "application/json" `
      -Body $body `
      -TimeoutSec 10 `
      -SkipHttpErrorCheck

    $statusCode = $response.StatusCode
    $content = $response.Content | ConvertFrom-Json

    Write-Host "Status Code: $statusCode" -ForegroundColor Yellow
    Write-Host "Response: " -ForegroundColor Green
    Write-Host ($content | ConvertTo-Json | Out-String) -ForegroundColor White

    $validations = @(
        @{ Check = "status = 400"; Pass = ($statusCode -eq 400) }
        @{ Check = "success = false"; Pass = ($content.success -eq $false) }
        @{ Check = "error contains 'nombre'"; Pass = ($content.error -like "*nombre*") }
    )

    $allPass = $true
    foreach ($validation in $validations) {
        $status = if ($validation.Pass) { "✅" } else { "❌" }
        Write-Host "$status $($validation.Check)" -ForegroundColor $(if ($validation.Pass) { 'Green' } else { 'Red' })
        if (-not $validation.Pass) { $allPass = $false }
    }

    if ($allPass) {
        $passedTests++
        Write-Host "RESULT: ✅ PASSED (Validation working)" -ForegroundColor Green
    } else {
        $failedTests++
        Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
    }

} catch {
    $failedTests++
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
}

Write-Host ""

# ═══════════════════════════════════════════════════════════
# TEST 5: Normalización de Teléfono
# ═══════════════════════════════════════════════════════════

Write-Host "TEST 5️⃣: Normalización de Teléfono" -ForegroundColor Green
Write-Host "──────────────────────────────────" -ForegroundColor Gray

try {
    # Formato 1: 10 dígitos
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

    # Formato 2: 12 dígitos
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

    Write-Host "Response 1 (10 dígitos): " -ForegroundColor Green
    Write-Host "  contactId: $($response1.contactId)" -ForegroundColor White
    Write-Host "  correlationId: $($response1.correlationId)" -ForegroundColor White

    Write-Host "Response 2 (12 dígitos): " -ForegroundColor Green
    Write-Host "  contactId: $($response2.contactId)" -ForegroundColor White
    Write-Host "  correlationId: $($response2.correlationId)" -ForegroundColor White

    $validations = @(
        @{ Check = "Format 1 success"; Pass = ($response1.success -eq $true) }
        @{ Check = "Format 2 success"; Pass = ($response2.success -eq $true) }
        @{ Check = "Both have correlationId"; Pass = ($response1.correlationId -ne $null -and $response2.correlationId -ne $null) }
    )

    $allPass = $true
    foreach ($validation in $validations) {
        $status = if ($validation.Pass) { "✅" } else { "❌" }
        Write-Host "$status $($validation.Check)" -ForegroundColor $(if ($validation.Pass) { 'Green' } else { 'Red' })
        if (-not $validation.Pass) { $allPass = $false }
    }

    if ($allPass) {
        $passedTests++
        Write-Host "RESULT: ✅ PASSED" -ForegroundColor Green
    } else {
        $failedTests++
        Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
    }

} catch {
    $failedTests++
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "RESULT: ❌ FAILED" -ForegroundColor Red
}

Write-Host ""

# ═══════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════

Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 SMOKE TEST SUMMARY" -ForegroundColor Yellow
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan

Write-Host ""
Write-Host "✅ Passed: $passedTests" -ForegroundColor Green
Write-Host "❌ Failed: $failedTests" -ForegroundColor $(if ($failedTests -eq 0) { 'Green' } else { 'Red' })
Write-Host ""

if ($failedTests -eq 0 -and $passedTests -eq 5) {
    Write-Host "🎉 ALL SMOKE TESTS PASSED!" -ForegroundColor Green
    Write-Host "Worker is ready for production use." -ForegroundColor Green
} else {
    Write-Host "⚠️  SOME TESTS FAILED" -ForegroundColor Red
    Write-Host "Check the output above for details." -ForegroundColor Red
}

Write-Host ""
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📋 NEXT STEPS:" -ForegroundColor Yellow
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. ✅ Review responses above"
Write-Host "2. 📊 Check HubSpot Dashboard for new contacts"
Write-Host "3. 📝 Verify Cloudflare Logs:"
Write-Host "     https://dash.cloudflare.com → Workers → elprimo-lead-worker → Logs"
Write-Host "4. 🔍 Look for '[LEAD_INGESTION_START]' or '[FALLBACK_LEAD]' tags"
Write-Host ""
