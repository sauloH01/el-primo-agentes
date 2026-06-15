# =============================================================================
# setup-hubspot-properties.ps1
# Crea las propiedades personalizadas en HubSpot para EL PRIMO Lead Worker
# Ejecutar UNA SOLA VEZ con tu token de la app privada de HubSpot
#
# Uso:
#   .\setup-hubspot-properties.ps1 -Token "pat-na1-xxxxxxxxxxxx"
# =============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type"  = "application/json"
}

$baseUrl = "https://api.hubapi.com/crm/v3/properties/contacts"

# Propiedades a crear
$properties = @(
    @{
        name        = "telefono_whatsapp_normalizado"
        label       = "Teléfono WhatsApp (Normalizado)"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Número en formato E.164 (+57XXXXXXXXXX) para envío por WhatsApp"
    },
    @{
        name        = "zona_proyecto"
        label       = "Zona del Proyecto"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Zona donde el cliente quiere instalar el mueble (Fusagasugá, Chinauta, etc.)"
    },
    @{
        name        = "tipo_proyecto"
        label       = "Tipo de Proyecto"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Tipo de mueble solicitado (Cocina, Closet, Baño, etc.)"
    },
    @{
        name        = "presupuesto_rango"
        label       = "Rango de Presupuesto"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Rango de presupuesto seleccionado en el formulario (ej: $8M - $15M)"
    },
    @{
        name        = "mensaje_lead"
        label       = "Mensaje del Lead"
        type        = "string"
        fieldType   = "textarea"
        groupName   = "contactinformation"
        description = "Mensaje libre que el cliente escribió en el formulario de contacto"
    },
    @{
        name        = "fuente_lead"
        label       = "Fuente del Lead"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Canal de origen del lead (Meta Ads, WhatsApp directo, etc.)"
    },
    @{
        name        = "utm_source_lead"
        label       = "UTM Source (Lead)"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Red publicitaria de origen. Ej: facebook, instagram, google"
    },
    @{
        name        = "utm_medium_lead"
        label       = "UTM Medium (Lead)"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Medio de la campaña. Ej: cpc, paid_social, email"
    },
    @{
        name        = "utm_campaign_lead"
        label       = "UTM Campaign (Lead)"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Nombre de la campaña publicitaria. Ej: fusa-mvp-cocinas-jun26"
    },
    @{
        name        = "utm_content_lead"
        label       = "UTM Content (Lead)"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Variación del anuncio. Ej: carrusel-antes-despues, video-testimonial"
    },
    @{
        name        = "utm_term_lead"
        label       = "UTM Term (Lead)"
        type        = "string"
        fieldType   = "text"
        groupName   = "contactinformation"
        description = "Keyword o audiencia segmentada. Ej: cocinas-fusagasuga, closets-chinauta"
    }
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup: Propiedades HubSpot EL PRIMO  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$created = 0
$skipped = 0
$failed  = 0

foreach ($prop in $properties) {
    $body = $prop | ConvertTo-Json
    try {
        $response = Invoke-RestMethod `
            -Uri $baseUrl `
            -Method POST `
            -Headers $headers `
            -Body $body `
            -ErrorAction Stop

        Write-Host "  [OK] $($prop.name)" -ForegroundColor Green
        $created++
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        if ($status -eq 409) {
            Write-Host "  [YA EXISTE] $($prop.name)" -ForegroundColor Yellow
            $skipped++
        }
        else {
            Write-Host "  [ERROR $status] $($prop.name): $_" -ForegroundColor Red
            $failed++
        }
    }
}

Write-Host ""
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "  Creadas:       $created" -ForegroundColor Green
Write-Host "  Ya existían:   $skipped" -ForegroundColor Yellow
if ($failed -gt 0) {
    Write-Host "  Fallidas:      $failed" -ForegroundColor Red
}
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

if ($failed -eq 0) {
    Write-Host "✅ HubSpot listo. Ahora corre:" -ForegroundColor Green
    Write-Host ""
    Write-Host "  npx wrangler secret put HUBSPOT_ACCESS_TOKEN" -ForegroundColor White
    Write-Host "  (pega tu token cuando lo pida)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  npx wrangler deploy" -ForegroundColor White
    Write-Host ""
    Write-Host "  .\SMOKE_TESTS_SIMPLE.ps1" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "⚠️  Revisa los errores arriba antes de continuar." -ForegroundColor Yellow
}
