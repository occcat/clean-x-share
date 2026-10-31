# Privacy

Clean X Share runs entirely in your browser. It has no server, sends no network requests, and collects no analytics.

## What it reads

- **The text of a copy on x.com or twitter.com, while that copy happens.** When you copy, the extension looks at the selected text, or at the text the page passes to `navigator.clipboard.writeText()`. If the text is a single X link with a `?` part, the clipboard gets the link without that part. The text is not stored or sent anywhere.
- **The page's background colour**, so the note matches X's light, dim or dark theme.

It never reads what is already on your clipboard, and it never reads your posts, messages, cookies or account.

## What it stores

One `settings` entry in `chrome.storage.local`, in this browser only:

| Field | Meaning |
| --- | --- |
| `enabled` | Clean links on copy |
| `notify` | Show a note after cleaning |
| `locale` | `en` or `zh`, the settings page and note language |
| `version` | Settings format version |

Removing the extension removes this entry.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save the settings above |
| Content scripts on `x.com`, `mobile.x.com`, `twitter.com`, `mobile.twitter.com` | Handle copies on those sites. The extension doesn't run on any other site. |

It doesn't request `clipboardRead`, `tabs`, `history`, any `<all_urls>` host access, or remote code.

## The settings page

The **Try a link** box on the settings page cleans the link you paste, in the page itself. **Copy** writes the clean link to your clipboard only when you click it.
