# 🚀 POST-DEPLOYMENT INSTRUCTIONS
## elprimo-lead-worker — Production Live

**Deployment Date:** 2026-06-15 02:34:47 UTC  
**Status:** ✅ **LIVE IN PRODUCTION**  
**URL:** `https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead`

---

## 📊 Deployment Summary

| Aspect | Details |
|--------|---------|
| **Version Deployed** | v1.1 (Production-Grade Audit) |
| **Features Added** | UTM Attribution, Fallback Logging, Correlation IDs, Type Safety |
| **Tests Passed** | 14/14 unit tests ✅ |
| **Build Time** | ~5 seconds |
| **Worker Startup** | 4ms (excellent) |
| **Version ID** | `2550fc23-cf0e-4f92-ad9f-4dfc26ab6ba0` |

---

## 🧪 STEP 1: Execute Smoke Tests

**CRITICAL:** Run these tests immediately to validate deployment.

### Option A: Automated Script (Recommended)

```powershell
# En PowerShell, ejecuta:
cd C:\Users\saulo\.antigravity\agente\elprimo-lead-worker
.\RUN_SMOKE_TESTS.ps1
```

This will automatically:
- ✅ Test 1: Lead with UTM parameters
- ✅ Test 2: Lead without UTM (defaults)
- ✅ Test 3: Honeypot spam detection
- ✅ Test 4: Input validation errors
- ✅ Test 5: Phone number normalization

**Expected output:** 5/5 tests passed ✅

### Option B: Manual Tests (If script doesn't work)

See `SMOKE_TEST_PLAN.md` for individual curl/PowerShell commands.

---

## 📊 STEP 2: Verify in HubSpot

After smoke tests pass, verify in HubSpot CRM:

### 2.1 Check Contact Properties

```
HubSpot Dashboard → Contacts
Search: "Smoke Test UTM"

Verify these fields are populated:
✅ firstname: "Smoke Test UTM"
✅ hs_analytics_source: "PAID_SEARCH"
✅ hs_analytics_source_data_1: "smoke_test_campaign"
✅ hs_analytics_source_data_2: "facebook"
✅ hs_analytics_source_data_3: "cpc"
✅ telefono_whatsapp_normalizado: "+573001111111"
```

**Screenshot location:** Save to `elprimo-lead-worker/verification/hubspot-screenshot.png`

### 2.2 Check Deal Association

```
Same contact → Deals tab

Verify:
✅ Deal exists
✅ Deal name: "Cocina Integral - Finca en Chinauta - Smoke Test UTM"
✅ Deal amount: Matches budget range ($15M-$30M = 22,500,000)
✅ Deal stage: "appointmentscheduled" (or configured value)
✅ Deal associated correctly
```

---

## 📝 STEP 3: Check Cloudflare Logs

Worker logs are essential for monitoring and debugging.

### 3.1 Access Logs

```
https://dash.cloudflare.com/
→ Workers → elprimo-lead-worker → View Details → Logs
```

### 3.2 Expected Log Tags

Look for these structured logs (should see them within 1 minute of running tests):

```
[LEAD_INGESTION_START] 2026-06-15T02:34:50_a1b2c3d4 | phone: +573001111111 | campaign: smoke_test_campaign

[CONTACT_CREATED] 2026-06-15T02:34:50_a1b2c3d4 | contactId: 12345

[DEAL_CREATED] 2026-06-15T02:34:50_a1b2c3d4 | dealId: 67890

[DEAL_CONTACT_ASSOCIATED] 2026-06-15T02:34:50_a1b2c3d4 | dealId: 67890 ↔ contactId: 12345

[LEAD_INGESTION_SUCCESS] 2026-06-15T02:34:50_a1b2c3d4 { success: true, ... }
```

### 3.3 If You See This Log

```
[FALLBACK_LEAD] 2026-06-15T02:34:50_... | { hubspotError: ... }
```

**This means:** HubSpot API failed but lead was logged. This is **NORMAL** and shows the fallback mechanism working. Do NOT panic.

---

## ✅ STEP 4: Validation Checklist

Complete all checks before declaring deployment successful:

- [ ] **Smoke Test 1** — Lead with UTM creates contact, deal, correlation ID
- [ ] **Smoke Test 2** — Lead without UTM applies defaults
- [ ] **Smoke Test 3** — Honeypot blocks spam silently
- [ ] **Smoke Test 4** — Invalid input returns 400 error
- [ ] **Smoke Test 5** — Phone numbers normalized correctly
- [ ] **HubSpot Contact** — Analytics properties populated
- [ ] **HubSpot Deal** — Amount mapped correctly, associated to contact
- [ ] **Cloudflare Logs** — `[LEAD_INGESTION_START]` visible
- [ ] **No Errors** — Zero unexpected errors in logs
- [ ] **Response Time** — < 500ms (typical: 200-300ms)

---

## 🚀 STEP 5: Integration with Frontend

Update your landing page/form to:

### 5.1 Include UTM Parameters

```javascript
// Capture UTMs from URL
const utm = {
  campaign: new URLSearchParams(location.search).get('utm_campaign'),
  source: new URLSearchParams(location.search).get('utm_source'),
  medium: new URLSearchParams(location.search).get('utm_medium'),
};
```

### 5.2 Send Lead Request

```javascript
const leadData = {
  nombre: form.nombre.value,
  telefono: form.telefono.value,
  zona: form.zona.value || '',
  tipo: form.tipo.value || '',
  presupuesto: form.presupuesto.value || '',
  mensaje: form.mensaje.value || '',
  utm_campaign: utm.campaign || undefined,
  utm_source: utm.source || undefined,
  utm_medium: utm.medium || undefined,
};

const response = await fetch('https://elprimo-lead-worker.saulo-hernandez-s.workers.dev/lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(leadData),
});

const { success, contactId, dealId, correlationId } = await response.json();
```

### 5.3 Use Correlation ID in WhatsApp

```javascript
if (success) {
  // Include Ref-ID in WhatsApp message for audit trail
  const whatsappMsg = `
Hola ${leadData.nombre},

Recibimos tu solicitud. Aquí viene tu presupuesto personalizado.

[Ref-ID: ${correlationId}]
  `.trim();

  const whatsappUrl = `https://wa.me/${leadData.telefono}?text=${encodeURIComponent(whatsappMsg)}`;
  window.location.href = whatsappUrl;
}
```

**Why?** This correlation ID links the WhatsApp message to HubSpot for manual audit when the deal closes.

---

## 🔍 Monitoring & Observability

### Daily Checks

Every morning, verify:

```
Cloudflare Dashboard
  → Workers → elprimo-lead-worker → View Details
  → Metrics tab
```

Monitor:
- ✅ **Request Rate** — should align with form submissions
- ✅ **Error Rate** — should be 0% (or < 1%)
- ✅ **CPU Time** — should be < 50ms per request
- ✅ **Wall Clock Time** — should be < 300ms

### Weekly Reports

Generate and archive:
```
1. Cloudflare Logs export (CSV)
2. HubSpot contact count (screenshot)
3. Deal creation rate (screenshot)
4. Error summary (if any)
```

---

## 🚨 Troubleshooting

### Issue: "success: false, error: HubSpot API error"

**Cause:** HubSpot API rejected the request.

**Solution:**
1. Check `HUBSPOT_ACCESS_TOKEN` is valid
2. Verify pipeline and dealstage exist in HubSpot
3. Check Cloudflare Logs for full error details
4. If persists, check HubSpot status page

### Issue: "correlationId missing from response"

**Cause:** Worker code issue.

**Solution:**
1. Redeploy: `npm run deploy`
2. Check `src/index.ts` line ~450 for `generateCorrelationId()`
3. Verify `types.ts` has `SuccessResponse` interface

### Issue: "Honeypot not blocking spam"

**Cause:** Spam filter not working.

**Solution:**
1. Check `website` field is being sent in request
2. Verify `src/index.ts` line ~180 has honeypot check
3. Re-deploy if code was modified

### Issue: Rollback needed

**If all else fails, rollback immediately:**

```bash
cd C:\Users\saulo\.antigravity\agente\elprimo-lead-worker

# Rollback to previous version
git checkout elprimo-worker/v1.0-stable
npm run deploy

# Wait ~5 seconds for deployment
# Verify endpoint still works

# Document in INCIDENT_LOG.md what went wrong
```

---

## 📞 Support & Documentation

| Document | Purpose |
|----------|---------|
| `AUDIT_AND_IMPROVEMENTS.md` | Technical details of changes |
| `QUICK_START_POSTAUDIT.md` | Quick reference guide |
| `SMOKE_TEST_PLAN.md` | Detailed test cases |
| `DEPLOYMENT_LOG.md` | Deployment record |
| `RUN_SMOKE_TESTS.ps1` | Automated test script |

---

## ✨ Success Criteria

Deployment is **SUCCESSFUL** if:

1. ✅ All 5 smoke tests pass
2. ✅ HubSpot contacts have analytics properties populated
3. ✅ Cloudflare Logs show `[LEAD_INGESTION_SUCCESS]` tags
4. ✅ Response time < 500ms
5. ✅ Error rate = 0% (no new errors)
6. ✅ Correlation IDs present in all successful responses
7. ✅ Honeypot detects spam

---

## 📋 Sign-Off

| Role | Sign | Date |
|------|------|------|
| Deployer | Claude DevOps | 2026-06-15 02:34:47 UTC |
| Approver | Saulo Hernández | 2026-06-15 |
| Validator | [Run smoke tests] | [Your date] |

---

## 🎯 Next Steps

1. **Now:** Execute `RUN_SMOKE_TESTS.ps1`
2. **Within 5 min:** Verify HubSpot contacts created
3. **Within 10 min:** Check Cloudflare Logs
4. **Within 1 hour:** Complete validation checklist
5. **Today:** Update landing page to include UTM forwarding

---

**Deployment complete. Worker is LIVE. Execute smoke tests now. ✅**
