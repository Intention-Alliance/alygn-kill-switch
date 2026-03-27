# EMAIL VALIDATION REPORT

**Generated:** 2026-03-19T05:36:16.495Z

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **Total Emails Checked** | 4 |
| **Valid** | 4 ✅ |
| **Invalid** | 0 ❌ |
| **Risky** | 0 ⚠️ |
| **Unknown** | 0 ❓ |

---

## VC Validation Results

| Name | Email | Status | Details |
|------|-------|--------|---------|


---

## Municipal Validation Results

| Canton | Email Type | Email | Status | Details |
|--------|------------|-------|--------|---------|
| San José | mayor | jvasquez@msj.go.cr | ✅ Valid | valid |
| Cartago | mayor | alcaldia@muni-carta.go.cr | ✅ Valid | valid |
| Heredia | mayor | aaguilar@heredia.go.cr | ✅ Valid | valid |
| Liberia | mayor | calvodj@muniliberia.go.cr | ✅ Valid | valid |

---

## Recommendations

### Safe to Send (Valid Emails)
The following emails passed validation and are safe for outreach:

**VCs:**
*None*

**Municipalities:**
- San José (mayor): jvasquez@msj.go.cr
- Cartago (mayor): alcaldia@muni-carta.go.cr
- Heredia (mayor): aaguilar@heredia.go.cr
- Liberia (mayor): calvodj@muniliberia.go.cr

### Alternative Contact Methods Needed

**Invalid Emails (Will Bounce):**
*None*

**Risky Emails (May Bounce):**
*None*

### Should Be Removed from Outreach

Emails marked as **invalid** should be removed from outreach lists to avoid bounce penalties and protect sender reputation.

---

## Raw Validation Data

```json
{
  "vcs": [],
  "municipalities": [
    {
      "canton": "San José",
      "emailType": "mayor",
      "email": "jvasquez@msj.go.cr",
      "status": "valid",
      "details": {
        "catchAll": false,
        "disposable": false,
        "roleBased": false,
        "freeDomain": false,
        "didYouMean": null,
        "processedAt": "2026-03-19 05:36:13.207",
        "rawStatus": "valid"
      },
      "raw": {
        "address": "jvasquez@msj.go.cr",
        "status": "valid",
        "sub_status": "",
        "free_email": false,
        "did_you_mean": null,
        "account": "jvasquez",
        "domain": "msj.go.cr",
        "domain_age_days": "735",
        "smtp_provider": "microsoft",
        "mx_found": "true",
        "mx_record": "msj-go-cr.mail.protection.outlook.com",
        "firstname": null,
        "lastname": null,
        "gender": null,
        "country": null,
        "region": null,
        "city": null,
        "zipcode": null,
        "processed_at": "2026-03-19 05:36:13.207"
      }
    },
    {
      "canton": "Cartago",
      "emailType": "mayor",
      "email": "alcaldia@muni-carta.go.cr",
      "status": "valid",
      "details": {
        "catchAll": false,
        "disposable": false,
        "roleBased": false,
        "freeDomain": false,
        "didYouMean": null,
        "processedAt": "2026-03-19 05:36:13.639",
        "rawStatus": "valid"
      },
      "raw": {
        "address": "alcaldia@muni-carta.go.cr",
        "status": "valid",
        "sub_status": "",
        "free_email": false,
        "did_you_mean": null,
        "account": "alcaldia",
        "domain": "muni-carta.go.cr",
        "domain_age_days": "735",
        "smtp_provider": "microsoft",
        "mx_found": "true",
        "mx_record": "municarta-go-cr01b.mail.eo.outlook.com",
        "firstname": null,
        "lastname": null,
        "gender": null,
        "country": null,
        "region": null,
        "city": null,
        "zipcode": null,
        "processed_at": "2026-03-19 05:36:13.639"
      }
    },
    {
      "canton": "Heredia",
      "emailType": "mayor",
      "email": "aaguilar@heredia.go.cr",
      "status": "valid",
      "details": {
        "catchAll": false,
        "disposable": false,
        "roleBased": false,
        "freeDomain": false,
        "didYouMean": null,
        "processedAt": "2026-03-19 05:36:14.693",
        "rawStatus": "valid"
      },
      "raw": {
        "address": "aaguilar@heredia.go.cr",
        "status": "valid",
        "sub_status": "",
        "free_email": false,
        "did_you_mean": null,
        "account": "aaguilar",
        "domain": "heredia.go.cr",
        "domain_age_days": "735",
        "smtp_provider": "microsoft",
        "mx_found": "true",
        "mx_record": "heredia-go-cr.mail.protection.outlook.com",
        "firstname": null,
        "lastname": null,
        "gender": null,
        "country": null,
        "region": null,
        "city": null,
        "zipcode": null,
        "processed_at": "2026-03-19 05:36:14.693"
      }
    },
    {
      "canton": "Liberia",
      "emailType": "mayor",
      "email": "calvodj@muniliberia.go.cr",
      "status": "valid",
      "details": {
        "catchAll": false,
        "disposable": false,
        "roleBased": false,
        "freeDomain": false,
        "didYouMean": null,
        "processedAt": "2026-03-19 05:36:16.317",
        "rawStatus": "valid"
      },
      "raw": {
        "address": "calvodj@muniliberia.go.cr",
        "status": "valid",
        "sub_status": "",
        "free_email": false,
        "did_you_mean": null,
        "account": "calvodj",
        "domain": "muniliberia.go.cr",
        "domain_age_days": "735",
        "smtp_provider": "",
        "mx_found": "true",
        "mx_record": "mx01.hornetsecurity.com",
        "firstname": null,
        "lastname": null,
        "gender": null,
        "country": null,
        "region": null,
        "city": null,
        "zipcode": null,
        "processed_at": "2026-03-19 05:36:16.317"
      }
    }
  ],
  "summary": {
    "total": 4,
    "valid": 4,
    "invalid": 0,
    "risky": 0,
    "unknown": 0
  }
}
```
