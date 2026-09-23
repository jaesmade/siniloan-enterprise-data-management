# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Municipal personnel use the system to work with assigned operational datasets. The current implementation recognizes Data Privacy Officers (DPOs), Data Stewards, and Staff.

A future build will replace the current roles with this hierarchy: System Admin > Data Admin > Office Focal > Office Representative > Staff. Each planned role's specific permissions remain undecided.

## Product Purpose

Siniloan Enterprise Data Management is an internal municipal data governance application. It manages jobseeker records, research and data requests, and biometric device event metadata through controlled access, record workflows, imports, dashboards, and audit activity.

## Operating Context

Personnel request accounts and await approval before access. Authorized users search and edit records, review dashboards, and preview and commit spreadsheet imports. Administrative users review accounts, grants, and activity. The repository documents a local Windows and Supabase setup for testing; operational use with real sensitive records requires additional security and governance controls.

## Capabilities and Constraints

- The current application uses independent role and dataset grants. Dataset access can be read only or read/write; no grant means no access. Database policies enforce authorization.
- The current DPO approves accounts and manages access. The Data Steward can see administrative summaries and system activity; source-record access still requires a dataset grant. Staff use only granted datasets.
- The three current modules are Jobseeker Registry, Research & Data Requests, and Biometrics Data.
- Imports support CSV and XLSX in all modules, and legacy XLS for biometrics. Imports preview rows, reject invalid or duplicate entries, and record jobs and errors.
- Record edits use version checks and audit activity. The system must avoid exposing credentials or sensitive personal data in repository content and logs.
- Planned role permissions, approval authority, and migration from the current access model are open decisions. The five-role hierarchy will replace the current roles.

## Brand Commitments

The established product name is Siniloan Enterprise Data Management. No additional brand commitment has been confirmed for future work.

## Evidence on Hand

- [README.md](README.md) describes the current features, access model, stack, and deployment caveats.
- [docs/enterprise-data-management-plan.md](docs/enterprise-data-management-plan.md) records the data governance rationale and intended workflows.
- [docs/database-implementation.md](docs/database-implementation.md) documents the implemented database controls.
- The supplied `sampla-data/` workbooks are sample inputs, not approved production data or proof of lawful operational use.

## Product Principles

- Make strict access control and auditability the top priority as the role model expands.
- Grant access deliberately at the role and dataset levels.
- Keep record changes and imports reviewable and auditable.
- Support the daily record tasks of authorized municipal personnel.
- Distinguish implemented behavior from planned roles and policies.
