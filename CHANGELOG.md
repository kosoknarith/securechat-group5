# Changelog

## [0.6.6]

### Added / Changed (LAN + setup)
- The chat can now be accessed via `https://<SERVER_LAN_IP>:8080` (not just `localhost`).
- Added a template OpenSSL config (`server/openssl.cnf.example`) for generating a self-signed cert with a LAN IP SAN.
- Implemented **password hashing** for stored credentials (bcrypt-based; no plaintext passwords).
- Added **brute-force protection** for authentication.

## [0.6.1] - 2026-02-11
### Fixed
- Resolved merge conflict in `server/package.json`.
- Corrected quoting issue in configuration/script work.

### Documentation
- Added/updated user guide documentation.

## [0.6.0] - 2026-02-11
### Added
- Added script to generate certification and required dependencies.
- Updated certificate script to generate files in the correct folder.

## [0.5.1] - 2026-02-11
### Changed
- Updated server behavior so visiting `https://localhost:8080` can default to the login page.

### Fixed
- Improved disconnect handling (graceful leave behavior).
- Switched from WS to WSS

## [0.5.0] - 2026-02-11
### Added
- Rate limiting to reduce abuse/spam.
- Heartbeat ping/pong cleanup to detect dropped connections.

## [0.4.0] - 2026-02-11
### Added
- Client login/chat pages connected to the WebSocket backend.
- Added logout button/behavior in the client.
- Initial UI for chat interface and login page.

### Changed
- Moved client files into the `public/` folder.

## [0.3.0] - 2026-02-11
### Maintenance
- Removed test folder.
- Removed `node_modules` from the repository.

## [0.2.0] - 2026-02-09
### Added
- Authentication-gated WebSocket chat (users must log in before chatting).
- Basic security logout behavior.

## [0.1.0] - 2026-01-30
### Added
- Initial project structure setup.
