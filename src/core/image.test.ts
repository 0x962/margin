import { describe, expect, test } from "bun:test";
import { imageFetchUrl, imageProxyPath, imageSource } from "./image";

const SHOT = "https://github.com/o/r/blob/fm/x-shots/shot-before.png?raw=1";

describe("imageProxyPath", () => {
	test("a picture on a branch points at margin's own route", () => {
		expect(imageProxyPath(SHOT)).toBe(`/api/image?url=${encodeURIComponent(SHOT)}`);
	});
	test("a dragged-in attachment points at margin's own route", () => {
		const url = "https://github.com/user-attachments/assets/8f3b1a20-0f0e-4d1b-9d3a-2b7c1e5a0d44";
		expect(imageProxyPath(url)).toBe(`/api/image?url=${encodeURIComponent(url)}`);
	});
	test("another site keeps the address the author wrote", () => {
		expect(imageProxyPath("https://example.com/shot.png")).toBeNull();
	});
});

describe("imageSource", () => {
	test("the three GitHub hosts are allowed", () => {
		expect(imageSource(SHOT)?.hostname).toBe("github.com");
		expect(imageSource("https://raw.githubusercontent.com/o/r/main/shot.png")?.hostname).toBe(
			"raw.githubusercontent.com",
		);
		expect(imageSource("https://private-user-images.githubusercontent.com/1/2.png?jwt=x")?.hostname).toBe(
			"private-user-images.githubusercontent.com",
		);
	});
	test("every other host is refused", () => {
		expect(imageSource("https://example.com/shot.png")).toBeNull();
		expect(imageSource("https://githubusercontent.com.evil.test/shot.png")).toBeNull();
		expect(imageSource("https://gist.github.com/o/r/blob/main/shot.png")).toBeNull();
	});
	test("http and a relative address are refused", () => {
		expect(imageSource("http://github.com/o/r/blob/main/shot.png")).toBeNull();
		expect(imageSource("./shot.png")).toBeNull();
		expect(imageSource("")).toBeNull();
	});
	test("a github.com page that is not a file is refused", () => {
		expect(imageSource("https://github.com/settings/tokens")).toBeNull();
		expect(imageSource("https://github.com/o/r/pull/1")).toBeNull();
		expect(imageSource("https://github.com/user-attachments/../settings")).toBeNull();
	});
});

describe("imageFetchUrl", () => {
	test("a blob page becomes the raw file, branch slashes and all", () => {
		expect(imageFetchUrl(new URL(SHOT))).toBe(
			"https://raw.githubusercontent.com/o/r/fm/x-shots/shot-before.png",
		);
	});
	test("an attachment address is fetched as it is", () => {
		const url = "https://github.com/user-attachments/assets/8f3b1a20-0f0e-4d1b-9d3a-2b7c1e5a0d44";
		expect(imageFetchUrl(new URL(url))).toBe(url);
	});
	test("a raw address is fetched as it is", () => {
		const url = "https://raw.githubusercontent.com/o/r/main/shot.png";
		expect(imageFetchUrl(new URL(url))).toBe(url);
	});
});
