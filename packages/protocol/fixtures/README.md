Contract fixtures live here. Each fixture is a frozen JSON frame exercising one
arm of the protocol. They serve two roles (§10 step 8):

- golden inputs for Deno-side schema validation (packages/protocol tests),
- golden inputs for Swift-side Codable decoding (TS↔Swift round-trip tests).

Fixtures are added incrementally as params/results are filled in (step 2+).
