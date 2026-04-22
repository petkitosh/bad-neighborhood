# Bad Neighborhood Fullstack

This version starts with:
- no example chapters
- no demo reader account
- no public demo admin credentials in the UI
- easier chapter editing from the writer page and admin dashboard

## First-time setup

Open `backend/server.js` or set environment variables before first run:
- `ADMIN_USERNAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `JWT_SECRET`

Example:

```bash
export ADMIN_USERNAME="youradmin"
export ADMIN_EMAIL="you@example.com"
export ADMIN_PASSWORD="your-strong-password"
export JWT_SECRET="change-this-secret"
```

Then run:

```bash
cd backend
npm install
npm start
```

Open:

```text
http://localhost:3000
```

## Editing stories

- Create a chapter: `write.html`
- Edit a chapter: use the **Edit** button in the admin dashboard, or open `write.html?id=CHAPTER_ID`
- Published chapters appear on `chapters.html` and `chapter.html`

## Important note

The first admin user is created automatically only if no admin exists yet, and the password is stored hashed with bcrypt in the database.
