# Sharing a test build

Two ways to let other people try Buckets. The web link is the easiest for them.

## A link to the web app (recommended)

The web app runs entirely in the browser. Nothing is installed, and there is no account. Each person's buckets stay in their own browser on their own computer; nothing is sent anywhere.

### Switch it on (once, about two minutes)

1. On GitHub, open the repository's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open the **Actions** tab, choose **Publish web app** on the left, press **Run workflow**, and wait about two minutes.
4. The address appears in the finished run (and under Settings → Pages). It looks like `https://<your-github-name>.github.io/<repository-name>/`.

To publish a new version automatically after every push to `main`, add a repository variable (**Settings → Secrets and variables → Actions → Variables**) named `PUBLISH_WEB` with the value `true`. Without it, press **Run workflow** whenever you want a new version out.

Things to know:

- **A Pages site is public.** Anyone with the link can open it, even though the repository is private. It holds no secrets (it is only the app), but don't post the link anywhere you wouldn't post the app.
- **Free GitHub accounts can only use Pages for public repositories.** If Settings → Pages says it isn't available, you have two choices: make the repository public, or use the drag-and-drop route below.

### If Pages isn't available: drag and drop

1. Run `pnpm build:web` in the project folder. The finished site is the folder `apps/web/dist`.
2. Go to <https://app.netlify.com/drop> (a free account is fine) and drag the `dist` folder onto the page. You get a link at once.
3. To send a new version, drag the new folder onto the same site's **Deploys** page.

Any static host works the same way (the app uses relative paths, so it can sit at the root of a site or in a sub-folder).

### What to tell testers

> This is an early test version of Buckets. Open the link, press **New bucket**, add some items, and press **Draw**.
>
> - **Your buckets stay in this browser on this computer.** If you clear the browser's site data, or open the link in a different browser, they won't be there. There is no export or backup yet, so don't put anything in it you can't lose.
> - It works best in a current Chrome, Edge, Firefox or Safari window.
> - Tell me what was confusing, what felt slow, and what you expected to happen. There are no wrong answers.

For a structured session, use [design/m3-usability-check.md](design/m3-usability-check.md).

## The desktop app (for people comfortable with a terminal)

Every push to `main` builds an unsigned desktop app for macOS, Windows and Linux (the **tauri build** jobs). Download it from the finished run on the **Actions** tab, under **Artifacts**. They are kept for 14 days. Only people with access to the repository can download them, so you would need to pass the file on yourself.

These are test builds, not installers:

- **macOS:** the file is a bare program, not an app you double-click. Unzip it, then in Terminal run `chmod +x buckets-desktop && xattr -d com.apple.quarantine buckets-desktop && ./buckets-desktop`. macOS shows a security warning because the build is unsigned.
- **Windows:** unzip and run `buckets-desktop.exe`. SmartScreen says "Windows protected your PC": choose **More info → Run anyway**.
- **Linux:** unzip, `chmod +x buckets-desktop`, then run it. It needs the WebKitGTK libraries installed.

Real installers and signing come in M12 (plan.md §15). Until then, the web link is the better thing to send.
