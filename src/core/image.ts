/**
 * A pull request body on a private repository points its screenshots at
 * github.com. A person reads that body on http://margin.localhost, so the
 * browser's request for the picture goes to a different site than the page
 * came from. GitHub's login cookie is marked SameSite=Lax, so the browser
 * holds it back, GitHub answers 404, and the person sees a broken image.
 *
 * margin fetches the file itself with the person's `gh` credentials and
 * serves the bytes from its own address. This file decides which addresses
 * margin will fetch (`imageSource`), where the page points an <img> instead
 * (`imageProxyPath`), and which address holds the file (`imageFetchUrl`).
 */

/** The only hosts margin will fetch a picture from. */
const IMAGE_HOSTS = new Set([
	"github.com",
	"raw.githubusercontent.com",
	"private-user-images.githubusercontent.com",
]);

/**
 * github.com serves the whole website, and margin's fetch carries the
 * person's GitHub token, so a token-signed request must never reach an
 * account page. A pull request body names a picture in one of two shapes: a
 * file on a branch (`/owner/repo/blob/<branch>/<file>`) and a file the author
 * dragged into the text box (`/user-attachments/assets/<id>`).
 */
const BLOB_PATH = /^\/[^/]+\/[^/]+\/blob\/.+$/;
const ATTACHMENT_PATH = /^\/user-attachments\/assets\/[\w-]+$/;

/** The picture's address on GitHub, or null for an address margin leaves alone. */
export function imageSource(src: string): URL | null {
	const url = URL.parse(src);
	if (!url || url.protocol !== "https:") return null;
	if (!IMAGE_HOSTS.has(url.hostname)) return null;
	if (url.hostname !== "github.com") return url;
	if (BLOB_PATH.test(url.pathname) || ATTACHMENT_PATH.test(url.pathname)) return url;
	return null;
}

/** The address the page gives an <img>, or null to keep the author's own address. */
export function imageProxyPath(src: string): string | null {
	const url = imageSource(src);
	return url ? `/api/image?url=${encodeURIComponent(url.href)}` : null;
}

/**
 * `github.com/<owner>/<repo>/blob/<branch>/<file>` is the web page around the
 * file. raw.githubusercontent.com serves the file itself and works out where
 * the branch name ends and the file path starts, which the address alone does
 * not say: the branch `fm/x-shots` and the path `docs/shot.png` both hold a
 * slash. A `/user-attachments/` address is fetched as it is; GitHub redirects
 * it to the signed address of the stored file.
 */
export function imageFetchUrl(url: URL): string {
	const blob = /^\/([^/]+\/[^/]+)\/blob\/(.+)$/.exec(url.pathname);
	if (url.hostname !== "github.com" || !blob) return url.href;
	return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}`;
}
