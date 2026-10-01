# Disha

Disha is a voice- and text-first guide to Indian government services. It is designed for first-time digital users and explains common tasks in simple steps, with links to official sources.

## Features

- English and the 22 scheduled Indian languages in the language picker
- Voice input where supported by the browser, plus simple text input
- Tamil Nadu selected by default, with all 28 states and 8 Union Territories available
- Built-in guidance for common services when an AI connection is unavailable
- Optional AI answers with official-source search when an OpenAI API key and API credits are available
- Scheme details shown inside Disha; official links open only when selected

## Run locally

1. Install Node.js 20.6 or later.
2. Copy `.env.example` to `.env` and add your OpenAI API key if you want live AI answers. Do not commit or share `.env`.
3. Open a terminal in this folder and run `npm start`.
4. Open `http://127.0.0.1:4173` in a browser.

## Checks

Run `npm test` to check the local server routes, default language, response security headers, and handling of malformed requests. The browser voice feature depends on the speech recognition support available in the user's browser and language; typing remains available as a fallback.

The built-in guides do not need an API key. Live AI answers require OpenAI API billing and are billed separately from a ChatGPT subscription.

## Privacy and safety

Never enter Aadhaar numbers, OTPs, PINs, passwords, or bank details. When live AI is enabled, Disha sends the question, selected state/UT, and recent conversation to OpenAI to prepare an answer. The local server only listens on `127.0.0.1` for development; review security, privacy, and hosting before deploying it publicly.

Government rules can change and may differ by location. Confirm eligibility and application details with the official source before applying. Disha is not a government website and does not submit applications.

