export const moment = Object.assign(
	() => ({
		format: () => "2026-09-22",
		day: () => 2,
		month: () => 8,
		isValid: () => true
	}),
	{ locale: () => "en" }
);

export class TFile {
	extension = "md";
	name = "";
	path = "";
	basename = "";
}

export class TFolder {}

export class Notice {
	constructor(_message: string, _timeout?: number) {}
	hide(): void {}
}

export const Vault = {
	recurseChildren: () => undefined
};

export function normalizePath(path: string): string {
	return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export async function requestUrl(): Promise<never> {
	throw new Error("requestUrl is not available in localization tests");
}
