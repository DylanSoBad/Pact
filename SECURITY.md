# Security policy

PACT is testnet software and has not been audited. Do not use it with assets of real value.

Report vulnerabilities privately to the maintainers. Do not include seed phrases, private keys, signed transactions, wallet exports, or production credentials. A report should include affected commit, reproducible steps, impact, and a minimal proof of concept.

## Deployment gate

Before any release: all unit, fuzz, invariant, and Arc fork tests must pass; Slither findings must be triaged; the Safe address and threshold must be independently verified; token and protocol addresses must match Arc explorer records; deployment must be simulated; bytecode and constructor arguments must be verified; and the frontend build-time address must be updated only after verification.
