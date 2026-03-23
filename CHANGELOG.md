# Changelog

## [0.8.0] - 2026-03-22 committed by Kosoknarith
### Added / Updated
- Added client-side encrypted DM send and receive flow.
- Updated server to relay encrypted DM payloads.
- Added automatic key generation during user registration.
- Added public key storage and lookup for encrypted messaging.

## [0.7.0] - 2026-03-22 committed by Julian
### Added / Updated
- Implemented Direct Message (DM) feature.
- Added a User sidebar that displays currently online users.
- Updated to support routing for General Chat and DMs.
- It now shows sender and recipient of messages.
- Server now broadcasts online user updates via `{ type: "user_list", users: [...] }` to keep the sidebar in sync

## [0.6.10] - 2026-03-21 committed by Julian
### Added / Changed (LAN + setup)
- The chat can now be accessed via `https://<SERVER_LAN_IP>:8080` (not just `localhost`).
- Added a template OpenSSL config (`server/openssl.cnf.example`) for generating a self-signed cert with a LAN IP SAN.
- Implemented **password hashing** for stored credentials (bcrypt-based; no plaintext passwords).
- Added **brute-force protection** for authentication.

## [0.6.6] - 2026-03-21 committed by Jude
- Implemented and enchanced UI updates

## [0.6.5] - 2026-03-15 Commited by Kosoknarith
### Added new file
- Add working RSA and AES encryption test

## [0.6.4] - 2026-03-12 Commited by Kosoknarith
### Added new file
- Add encryption files to server

## [0.6.3] - 2026-02-20 Commited by Jude
### Update
- Updated the user interface for improved visual design
- Refined layout and styling for a more modern look and feel
- Added initial sidebar implementation

## [0.6.1] - 2026-02-11 Commited by Julian
### Fixed
- Resolved merge conflict in `server/package.json`.
- Corrected quoting issue in configuration/script work.

### Documentation
- Added/updated user guide documentation.

## [0.6.0] - 2026-02-11 Commited by Julian
### Added
- Added script to generate certification and required dependencies.
- Updated certificate script to generate files in the correct folder.

## [0.5.1] - 2026-02-11 Commited by Julian
### Changed
- Updated server behavior so visiting `https://localhost:8080` can default to the login page.

### Fixed
- Improved disconnect handling (graceful leave behavior).
- Switched from WS to WSS

## [0.5.0] - 2026-02-11 Commited by Kosoknarith
### Added
- Rate limiting to reduce abuse/spam.
- Heartbeat ping/pong cleanup to detect dropped connections.

## [0.4.0] - 2026-02-11 Commited by Jude
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

## [0.2.0] - 2026-02-09 Commited by Kosoknarith
### Added
- Authentication-gated WebSocket chat (users must log in before chatting).
- Basic security logout behavior.

## [0.1.0] - 2026-01-30 Commited by Kosoknarith
### Added
- Initial project structure setup.
