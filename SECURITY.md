# Security Policy

## Supported versions

Security fixes are applied on the `master` branch of this repository.

## Reporting a vulnerability

Do **not** open a public GitHub issue for security problems.

Email the maintainer via GitHub: [@m0llusca](https://github.com/m0llusca), or use GitHub Security Advisories on [m0llusca/Stemma](https://github.com/m0llusca/Stemma) if enabled.

Please include:

- Affected component / path
- Reproduction steps or proof of concept
- Impact assessment (auth bypass, secret leak, RCE, etc.)

You should receive an acknowledgement within a few days. Please give reasonable time for a fix before public disclosure.

## Secrets and live environments

- Never commit `.env`, service-account JSON keys, OAuth tokens, or production URLs with credentials.
- Live smoke tests (`OTRS_LIVE_SMOKE`, `HELPDESK_LIVE_SMOKE`, `DATA_SOURCE_LIVE_SMOKE`, `IDENTITY_LIVE_SMOKE`) are opt-in and must run only against environments you own or are authorized to test.
