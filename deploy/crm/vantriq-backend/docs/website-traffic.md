# Website traffic (v9.27.0)

CRM → Vantriq Pulse → Website traffic shows opted-in activity on vantriqai.com.
Filters: Today, last 7/30/90/180 calendar days in Asia/Karachi. Excel exports
contain daily activity and every approximate country/state/city breakdown.
Page views are not unique visitors; actions are independent, not a conversion funnel.
Pakistan / Global is the website version, not the visitor's country.

## Data flow

The browser sends only consent, event, section and website version to the
same-origin /api/analytics route. After origin and consent validation, the
server forwards the proxy's client IP over HTTPS to the authenticated CRM
webhook. The CRM resolves it locally with geoip-lite2, then atomically updates
website_activity and website_location_activity. Only aggregate location
counters reach SQL; IPs, coordinates, IDs and message content are not stored.
Unresolved IPs and pre-release activity show as Unknown location. Geolocation
is approximate and mobile/VPN locations may differ from physical locations.
Both tables retain at most 180 calendar days. Existing consent version 1 is
re-requested before location measurement; version 2 is still optional.

The hosting proxy must provide a sanitized X-Forwarded-For client address.
The browser cannot supply client_ip in its event payload. If no valid client
IP is available, the event is still counted with Unknown location.

## Database maintenance

The pinned geoip-lite2 4.0.5 package includes GeoLite country/city databases
from 18 September 2026. Lookups never call an external location service.
GeoLite data is provided by MaxMind (https://www.maxmind.com), under the
dependency's included licenses. Refresh via a reviewed package update with
new bundled data, or the dependency's official MaxMind updater with a server
license key. Never put a license key or CRM webhook key in public code.

## Verification

- node test/privacy.test.cjs from repository root.
- npm run build from repository root.
- npm run test:site-analytics from the CRM backend.
- npm run test:website-ui with Playwright Chromium installed (or CHROMIUM_PATH).
- API and Excel endpoints inherit authenticated CRM staff access; no portal access.

The scoped release workflow runs tests, uses the existing verified backup and
migration, then checks the local location lookup and unauthenticated access
protection. It triggers only on a change to its own release file on main.
