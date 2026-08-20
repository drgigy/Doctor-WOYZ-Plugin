# Firebase Setup

This project uses Firebase project `woyz-be9e5` only for device approval.

## One-Time Console Setup

1. Open Firebase Console for `woyz-be9e5`.
2. Enable Authentication providers:
   - Anonymous
   - Email/Password
3. Create an Email/Password admin user for `drgigy@gmail.com`.
4. Open Project settings, create or select a Web app, and copy the web config.
5. Paste the values into `firebase-config.js`.

## Deploy Rules

```sh
firebase login --reauth
firebase deploy --only firestore:rules --project woyz-be9e5
```

## Delete Previous Data

If the old project has unused data, delete any old collections from Firebase Console > Firestore Database > Data.

For command-line deletion after reauth:

```sh
firebase firestore:delete deviceApprovals --recursive --project woyz-be9e5
```

Delete only old collections you no longer need. The current device-lock code uses the `deviceApprovals` collection.
