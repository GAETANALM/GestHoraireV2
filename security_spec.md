# Security Specification: GestHoraire Firestore Access Control

This document defines the security boundaries, data invariants, and a set of test payloads ("The Dirty Dozen") to verify the correctness of the Firestore security rules.

## Data Invariants

1.  **User Isolation**: Employees can only read and write their own sheets and profile, ensuring no cross-user tampering.
2.  **Validator Authority**: Only validators (users with `role == 'validator'`) can manage users, delete timesheets, or change statuses on other users' timesheets (e.g., approving/rejecting).
3.  **No Direct Privilege Escalation**: A user cannot modify their own `role` field.
4.  **Terminal State Locking**: Once a timesheet status is validated, it can no longer be updated (except by a validator).
5.  **Strict State Transition**: Employees can only save a timesheet as a `draft` or transition it to `submitted`. They cannot set states like `validated`.
6.  **Immutable Identity**: The `userId` of a timesheet cannot be mutated once it has been created.

---

## The "Dirty Dozen" Payloads (Expected Behavior: PERMISSION_DENIED)

1.  **Tampering with Role**: An employee tries to update their own role from `'employee'` to `'validator'`.
    *   *Operation*: UPDATE `/users/user_jean`
    *   *Payload*: `{ ...user_jean, role: 'validator' }`
    *   *Result*: `PERMISSION_DENIED`
2.  **Viewing Other Employees' Drafts (Insecure Query)**: An employee tries to read another user's timesheet.
    *   *Operation*: GET `/timesheets/ts_user_marie_2026-06-01`
    *   *Result*: `PERMISSION_DENIED`
3.  **Forging Timesheet User ID on Create**: Employee Jean tries to create a timesheet with `userId` set to `'user_marie'`.
    *   *Operation*: CREATE `/timesheets/ts_user_marie_2026-06-15`
    *   *Result*: `PERMISSION_DENIED`
4.  **Changing Saved Timesheet Owned By Sibling**: Employee Lucas tries to modify a timesheet that belongs to Marie.
    *   *Operation*: UPDATE `/timesheets/ts_user_marie_2026-06-01`
    *   *Result*: `PERMISSION_DENIED`
5.  **Self-Approving a Timesheet**: Employee Jean tries to change the status of their own timesheet directly to `'validated'`.
    *   *Operation*: UPDATE `/timesheets/ts_user_jean_2026-06-01` with status `'validated'`
    *   *Result*: `PERMISSION_DENIED`
6.  **Bypassing Validation Reason**: Employee Lucas tries to modify a 'rejected' sheet to status 'submitted' but inserts arbitrary field overrides like changing `userId`.
    *   *Operation*: UPDATE `/timesheets/ts_user_lucas_2026-06-01`
    *   *Result*: `PERMISSION_DENIED`
7.  **Deleting Timesheets as Employee**: Employee Jean tries to delete a historic timesheet.
    *   *Operation*: DELETE `/timesheets/ts_user_jean_2026-05-25`
    *   *Result*: `PERMISSION_DENIED`
8.  **Creating a Duplicate Admin Entry**: A normal user tries to construct custom profile attributes.
    *   *Operation*: CREATE `/users/attacker_uid` with `{ role: 'validator' }`
    *   *Result*: `PERMISSION_DENIED`
9.  **Updating Validated Timesheet**: An employee attempts to modify their timesheet after it has already been approved (status `'validated'`).
    *   *Operation*: UPDATE `/timesheets/ts_user_jean_2026-05-25`
    *   *Result*: `PERMISSION_DENIED`
10. **Resource Poisoning via Extended Fields**: An attacker attempts to inject a ghost field `isSystemApproved: true` into a timesheet update.
    *   *Operation*: UPDATE `/timesheets/ts_user_jean_2026-06-01`
    *   *Result*: `PERMISSION_DENIED`
11. **Malicious Empty Query Scraping**: A tenant tries to query `/timesheets` without restriction.
    *   *Operation*: LIST `/timesheets` (without applying ownership filters)
    *   *Result*: `PERMISSION_DENIED`
12. **Tampering with Identity Metadata**: An attacker attempts to modify `userName` on an existing timesheet to spoof an authority figure.
    *   *Operation*: UPDATE `/timesheets/ts_user_jean_2026-06-01`
    *   *Result*: `username: 'Sophie Dubois'`
    *   *Result*: `PERMISSION_DENIED`
