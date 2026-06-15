# 🔧 TROUBLESHOOTING: 401 Unauthorized Error

## Problem

Smoke tests are failing with:
```
"error": "Failed to create/get contact: 401 Unauthorized"
```

This means the HUBSPOT_ACCESS_TOKEN is invalid, expired, or has insufficient permissions.

## Root Cause Analysis

The worker code is correct:
```typescript
const hsHeaders = {
  Authorization: `Bearer ${env.HUBSPOT_ACCESS_TOKEN}`,
};
```

But the token stored in Cloudflare secrets is one of:
- ❌ Expired (HubSpot tokens can expire)
- ❌ Revoked (deleted from HubSpot account)
- ❌ Invalid format (not a valid HubSpot API key)
- ❌ Missing permissions (created with limited scope)

## Solution (Step by Step)

### Step 1: Get a Valid HubSpot Token

1. **Go to HubSpot Account Settings:**
   ```
   https://app.hubspot.com/l/account-settings/integrations/api-key/
   ```

2. **If you see an existing API Key:**
   - Copy it
   - Skip to Step 2

3. **If you don't see an API Key:**
   - Click "Create API Key"
   - Copy the generated key
   - Name it: "Cloudflare Workers"

**Important:** Keep this tab open. You'll need it for Step 2.

### Step 2: Update the Secret in Cloudflare

```powershell
cd C:\Users\saulo\.antigravity\agente\elprimo-lead-worker

# Update the secret
npx wrangler secret put HUBSPOT_ACCESS_TOKEN

# When prompted:
# Paste your API key from Step 1
# Press Enter
# Confirm: "Yes, save this secret"
```

Expected output:
```
✓ Uploaded secret HUBSPOT_ACCESS_TOKEN
```

### Step 3: Redeploy the Worker

```powershell
npm run deploy

# Expected output:
# Deployed elprimo-lead-worker
# https://elprimo-lead-worker.saulo-hernandez-s.workers.dev
```

### Step 4: Run Smoke Tests Again

```powershell
.\SMOKE_TESTS_SIMPLE.ps1

# Expected: All tests pass (or at least 1-3 and 5)
```

## Verification Checklist

- [ ] HubSpot API key is valid (not expired)
- [ ] Secret was successfully uploaded to Cloudflare
- [ ] Worker was redeployed
- [ ] Smoke tests executed
- [ ] Test 1 & 2 now pass (success = true)

## If Still Failing

### Check 1: Token Format

Your HubSpot token should look like:
```
pat-us1-1234567890abcdefghijklmnop
```

If it looks different, it might be the wrong type of key.

### Check 2: Token Permissions

The token must have at least these scopes:
- `contacts` (read/write)
- `crm.objects.contacts` (read/write)
- `crm.objects.deals` (read/write)

To verify:
1. Go to HubSpot API key settings
2. Click on your key
3. Check "Scopes" section
4. Should see checkmarks for contact and deal permissions

### Check 3: Manual Test

Test the token directly with curl:

```powershell
$token = "YOUR_TOKEN_HERE"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$body = @{
    filterGroups = @(
        @{ filters = @(@{ propertyName = "firstname"; operator = "EQ"; value = "test" }) }
    )
    properties = @("firstname")
} | ConvertTo-Json

$response = Invoke-RestMethod `
  -Uri "https://api.hubapi.com/crm/v3/objects/contacts/search" `
  -Method POST `
  -Headers $headers `
  -Body $body

Write-Host $response | ConvertTo-Json
```

If you get data back, your token is valid.
If you get 401, your token is invalid.

## Rollback (If Needed)

If this doesn't work:

```powershell
# Revert to previous version
git checkout elprimo-worker/v1.0-stable
npm run deploy
```

Wait ~5 seconds for deployment, then verify endpoint still responds.

## Prevention for Future Deployments

- **Rotation:** Rotate HubSpot tokens every 90 days
- **Monitoring:** Set alerts if error rate spikes
- **Testing:** Always run smoke tests post-deploy
- **Documentation:** Keep API key creation date documented

---

**Status:** ⏳ AWAITING TOKEN UPDATE
**Next Action:** Provide valid HubSpot API token and re-run smoke tests
