# Security policy

Buckets is pre-release. There are no supported versions yet, but we want to hear about problems early.

## Reporting a vulnerability

Please **don't** open a public issue for a security problem. Use GitHub's private vulnerability reporting on the repository's **Security** tab (**Report a vulnerability**). If that isn't available, contact the maintainer privately through the address on their GitHub profile.

Include what you found, the steps to reproduce it, and which part is affected (a package, the desktop app, the web app, or the sync server). You'll get an acknowledgement as soon as the maintainer can send one. This is a volunteer project, so no response time is promised yet.

## Scope

- The apps and packages in this repository, including `@buckets/crypto` once it exists.
- The sync server in `server/`, and the hosted service when it launches.
- Anything that could expose bucket names, items, notes, images or member names to a server, a cloud-folder provider, or another user.

## Cryptography status

End-to-end encryption is planned for M5 (plan.md §9.4) and **hasn't been written or reviewed yet**. An independent review of `@buckets/crypto` and the sync protocol is planned before the hosted service launches (M11). Until then, don't rely on Buckets to protect sensitive data in transit or at rest.

## Disclosure

We'll agree a disclosure date with you once a fix is ready, and credit you if you want that.
