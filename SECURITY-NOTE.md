# Security note: the same design in a healthcare-like context

If LendLoop lent medical equipment (wheelchairs, blood-pressure monitors, nebulisers) rather than drills, the fact that a named person borrowed a given device becomes health-related data, and the automation layer is the weakest point.

1. **Treat n8n as a processor, not a trusted peer.** Today the overdue endpoint hands n8n the borrower's email; in a regulated setting I would hand it only an opaque notification token and let Convex (or a dedicated mailer under a signed DPA) resolve the address, so the workflow engine never stores PHI in execution logs.
2. **Turn execution-data retention down, not up.** `EXECUTIONS_DATA_SAVE_ON_SUCCESS=all` is convenient for review but keeps payloads; for PHI it should be `none`, with `EXECUTIONS_DATA_MAX_AGE` measured in hours and the n8n database encrypted at rest.
3. **Minimise the message itself.** Reminders would say "an item is due back", not which device, since the device name alone can reveal a condition.
4. **Audit everything with purpose.** The `automationEvents` table already records who was notified when; it would need an actor field, immutability, and a retention schedule aligned with the applicable regulation (HIPAA six years, GDPR "no longer than necessary").
5. **Access control gets a third dimension.** Role (admin/user) and ownership are not enough; a caregiver borrowing on behalf of a patient needs a delegated relationship, checked in the same Convex helpers.
6. **Keys and secrets.** The shared HMAC secret becomes per-integration asymmetric signing with rotation, and Clerk would be configured with MFA required and short session lifetimes.

The underlying rule is unchanged from this project: enforce authorisation in the backend, send third parties only the fields they need, and make every automated touch visible to the person it concerns.
