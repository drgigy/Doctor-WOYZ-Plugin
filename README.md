# Doctor WOYZ — Direct Gemini Edition

A static, installable web app for recording clinical audio and generating structured notes with the Gemini API.

## Architecture

- No Firebase
- No Firestore
- No Cloud Functions
- No backend server
- The browser sends recordings directly to the Google Gemini API
- The Gemini API key is stored only in this browser's `localStorage`

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload every file in this folder to the repository root.
3. Open **Settings → Pages** in GitHub.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then save.
6. Open the GitHub Pages URL after deployment completes.
7. In Doctor WOYZ, open **Settings**, paste a Gemini API key, and click **Save Key**.

## Local testing

The app must be served over HTTP rather than opened directly as a `file://` URL. From this folder, one simple option is:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

Microphone access requires HTTPS in production; GitHub Pages supplies HTTPS.

## API key safety

This app intentionally uses a browser-held key. Anyone with access to the browser profile may be able to retrieve it. Use a dedicated Gemini API key, restrict it to the Gemini API and your GitHub Pages referrer where supported, set a conservative quota, and remove/rotate it if the device is lost or shared.

Never commit an API key to this repository.
