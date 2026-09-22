import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Module from "node:module";
import { build } from "esbuild";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(testDir);

const testSource = `
import { getLocale, getLocaleStructure, setLocalePreference, t, tList } from "./src/i18n";
import { getDreamsSubfolder, getEntitiesSubfolder, getEntityCategorySubfolder } from "./src/embeddings";
import { extractDreamTextOnly } from "./src/analyzer";

const assert = globalThis.__testAssert;

globalThis.window = { getLanguage: () => "ru-RU" };
Object.defineProperty(globalThis, "navigator", { value: { language: "en-US" }, configurable: true });

setLocalePreference("auto");
assert.equal(getLocale(), "ru");
assert.equal(t("dreamsSubfolder"), "Сны");

setLocalePreference("ru");
assert.equal(t("summaryHeader"), "## Краткое описание");
assert.equal(tList("days")[1], "понедельник");
assert.equal(getLocaleStructure().entityFolders.concepts, "Концепции");

setLocalePreference("uk");
assert.equal(t("summaryHeader"), "## Короткий опис");

setLocalePreference("en");
assert.equal(t("summaryHeader"), "## Summary");

setLocalePreference("ru");
const existingPaths = new Set(["Dreams/Сни", "Dreams/Сутності", "Dreams/Сутності/Персонажі"]);
const app = { vault: { getAbstractFileByPath: (value) => existingPaths.has(value) ? { path: value } : null } };
assert.equal(getDreamsSubfolder(app, { dreamsFolder: "Dreams" }), "Dreams/Сни");
assert.equal(getEntitiesSubfolder(app, { dreamsFolder: "Dreams" }), "Dreams/Сутності");
assert.equal(getEntityCategorySubfolder(app, "Dreams/Сутності", "characters"), "Dreams/Сутності/Персонажі");

const emptyApp = { vault: { getAbstractFileByPath: () => null } };
assert.equal(getDreamsSubfolder(emptyApp, { dreamsFolder: "Dreams" }), "Dreams/Сны");
assert.equal(getEntitiesSubfolder(emptyApp, { dreamsFolder: "Dreams" }), "Dreams/Сущности");

const russianDream = "---\\ntype: dream\\n---\\n# Сон\\n\\n> Я летел над морем.\\n\\n# AI анализ\\n\\n## Краткое описание\\n\\nСтарый анализ";
assert.equal(extractDreamTextOnly(russianDream), "Я летел над морем.");

const ukrainianDream = "# Сон\\n\\n> Я летів над морем.\\n\\n# AI аналіз\\n\\nСтарий аналіз";
assert.equal(extractDreamTextOnly(ukrainianDream), "Я летів над морем.");

const englishDream = "# Dream\\n\\n> I flew over the sea.\\n\\n# AI Analysis\\n\\nOld analysis";
assert.equal(extractDreamTextOnly(englishDream), "I flew over the sea.");
`;

const result = await build({
	stdin: {
		contents: testSource,
		resolveDir: projectRoot,
		sourcefile: "localization-tests.ts",
		loader: "ts"
	},
	bundle: true,
	write: false,
	platform: "node",
	format: "cjs",
	alias: {
		obsidian: path.join(testDir, "obsidianMock.ts")
	}
});

globalThis.__testAssert = assert;
const testModule = new Module("localization-tests");
testModule.filename = path.join(projectRoot, "localization-tests.cjs");
testModule.paths = Module._nodeModulePaths(projectRoot);
testModule._compile(result.outputFiles[0].text, testModule.filename);

console.log("Localization tests passed");
