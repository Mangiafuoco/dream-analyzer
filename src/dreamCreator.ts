import { App, TFile, Notice, Modal, Setting, moment } from "obsidian";
import { DreamAnalyzerSettings, ENTITY_TYPES } from "./types";
import { t, tList } from "./i18n";
import {
	getDreamsSubfolder,
	getEntitiesSubfolder,
	getEntityCategorySubfolder,
	getIndexSubfolder
} from "./embeddings";

interface TypedMoment {
	format(fmt: string): string;
	day(): number;
	month(): number;
	isValid(): boolean;
}

function getMoment(date?: string | number | Date | string[], format?: string | string[]): TypedMoment {
	const fn = moment as unknown as (d?: unknown, f?: unknown) => TypedMoment;
	return fn(date, format);
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const normalizedPath = path.trim().replace(/\/$/, "");
	if (!app.vault.getAbstractFileByPath(normalizedPath)) {
		await app.vault.createFolder(normalizedPath);
	}
}

export class DatePickerModal extends Modal {
	private onSubmit: (dateStr: string) => void;

	constructor(app: App, onSubmit: (dateStr: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: t("dateModalTitle") });

		let selectedDate = getMoment().format("YYYY-MM-DD");

		new Setting(contentEl)
			.setName(t("dateModalLabel"))
			.addText(text => {
				text.inputEl.type = "date";
				text.setValue(selectedDate);
				text.onChange(value => {
					if (value) selectedDate = value;
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText(t("dateModalButton"))
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(selectedDate);
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export async function createDreamNoteForDate(
	app: App,
	settings: DreamAnalyzerSettings,
	targetDateInput?: string
): Promise<TFile | void> {
	const now = targetDateInput ? getMoment(targetDateInput, ["YYYY-MM-DD", "D.MM.YYYY", "DD.MM.YYYY"]) : getMoment();
	if (!now.isValid()) {
		new Notice(t("invalidDate"));
		return;
	}

	const dateStr = now.format("YYYY-MM-DD");
	const dreamsFolder = getDreamsSubfolder(app, settings);
	await ensureFolder(app, dreamsFolder);

	const yearFolder = now.format("YYYY");
	const months = tList("months");
	const monthFolderName = months[now.month()] || now.format("MM");

	const yearFolderPath = `${dreamsFolder}/${yearFolder}`;
	await ensureFolder(app, yearFolderPath);

	const monthFolderPath = `${yearFolderPath}/${monthFolderName}`;
	await ensureFolder(app, monthFolderPath);

	const days = tList("days");
	const dayName = days[now.day()] || "";
	const fileName = `${now.format("D.MM.YYYY")} ${dayName}`.trim();
	const filePath = `${monthFolderPath}/${fileName}.md`;

	const existingFile = app.vault.getAbstractFileByPath(filePath);
	if (existingFile instanceof TFile) {
		new Notice(t("dreamAlreadyExists"));
		const leaf = app.workspace.getLeaf(true);
		await leaf.openFile(existingFile);
		return existingFile;
	}

	const templateContent = `---
type: dream
date: ${dateStr}
lucid: false
entities_checked: false
characters: []
places: []
objects: []
emotions: []
symbols: []
concepts: []
keywords: []
---

${t("dreamHeader")}

${t("dreamPlaceholder")}

${t("aiHeader")}

${t("summaryHeader")}

-

${t("connectionsHeader")}

-
`;

	const newFile = await app.vault.create(filePath, templateContent);
	new Notice(t("dreamCreated"));

	const leaf = app.workspace.getLeaf(true);
	await leaf.openFile(newFile);

	await ensureDreamDashboard(app, settings);
	await ensureEntityIndexes(app, settings);

	return newFile;
}

export async function createTodayDreamNote(
	app: App,
	settings: DreamAnalyzerSettings
): Promise<TFile | void> {
	return await createDreamNoteForDate(app, settings);
}

export async function ensureDreamDashboard(app: App, settings: DreamAnalyzerSettings): Promise<void> {
	const dreamsBase = settings.dreamsFolder.trim().replace(/\/$/, "") || "Dreams";
	const dashboardFileName = t("dashboardFileName");
	const targetPath = `${dreamsBase}/${dashboardFileName}`;

	const dreamsSubfolder = getDreamsSubfolder(app, settings);
	const entitiesSubfolder = getEntitiesSubfolder(app, settings);

	const existingFile = app.vault.getAbstractFileByPath(targetPath);

	const content = `${t("dashboardTitle")}

${t("dashboardCallout")}

${t("dashboardSectionStats")}

\`\`\`dataview
TABLE WITHOUT ID
length(rows) AS "${t("dashboardTotalDreams")}",
length(filter(rows, (r) => r.lucid)) AS "${t("dashboardLucidDreams")}",
round(length(filter(rows, (r) => r.lucid)) / length(rows) * 100, 1) + "%" AS "${t("dashboardLucidPercent")}"
FROM "${dreamsSubfolder}"
WHERE type = "dream"
GROUP BY type
\`\`\`

${t("dashboardSectionSigns")}

\`\`\`dataview
TABLE WITHOUT ID
file.link AS "${t("dashboardTrigger")}",
entity_type AS "${t("dashboardCategory")}",
dream_count AS "${t("dashboardFrequency")}",
last_seen AS "${t("dashboardLastSeen")}"
FROM "${entitiesSubfolder}"
WHERE type = "entity" AND contains(list("character", "place", "symbol", "object"), entity_type)
SORT dream_count DESC
LIMIT 15
\`\`\`

${t("dashboardSectionEmotions")}

\`\`\`dataview
TABLE WITHOUT ID
file.link AS "${t("dashboardEmotion")}",
dream_count AS "${t("dashboardAppearances")}",
last_seen AS "${t("dashboardLastDream")}"
FROM "${entitiesSubfolder}"
WHERE entity_type = "emotion"
SORT dream_count DESC
LIMIT 15
\`\`\`

${t("dashboardSectionCreative")}

\`\`\`dataview
TABLE WITHOUT ID
file.link AS "${t("dashboardIdea")}",
entity_type AS "${t("dashboardType")}",
description AS "${t("dashboardDescription")}",
dream_count AS "${t("dashboardMentions")}"
FROM "${entitiesSubfolder}"
WHERE type = "entity" AND contains(list("concept", "character", "place"), entity_type) AND length(description) > 0
SORT dream_count DESC
LIMIT 20
\`\`\`

${t("dashboardSectionLucid")}

\`\`\`dataview
TABLE WITHOUT ID
file.link AS "${t("dashboardDream")}",
date AS "${t("dashboardDate")}"
FROM "${dreamsSubfolder}"
WHERE type = "dream" AND lucid = true
SORT date DESC
\`\`\`

${t("dashboardSectionRecent")}

\`\`\`dataview
TABLE WITHOUT ID
file.link AS "${t("dashboardDream")}",
date AS "${t("dashboardDate")}",
choice(lucid, "${t("lucidOption")}", "${t("dashboardNormal")}") AS "${t("dashboardType")}",
characters AS "${t("dashboardCharacters")}",
places AS "${t("dashboardPlaces")}",
concepts AS "${t("dashboardConcepts")}"
FROM "${dreamsSubfolder}"
WHERE type = "dream"
SORT date DESC
LIMIT 10
\`\`\`
`;

	if (existingFile instanceof TFile) {
		await app.vault.modify(existingFile, content);
	} else {
		await app.vault.create(targetPath, content);
	}
}

export async function ensureEntityIndexes(app: App, settings: DreamAnalyzerSettings): Promise<void> {
	const indexFolderPath = getIndexSubfolder(app, settings);

	await ensureFolder(app, indexFolderPath);

	const baseEntitiesFolder = getEntitiesSubfolder(app, settings);

	// Clean up old "! Індекс.md" files if created inside category folders by previous versions using trashFile
	for (const type of ENTITY_TYPES) {
		const categoryFolder = getEntityCategorySubfolder(app, baseEntitiesFolder, type.field);
		const oldPath = `${categoryFolder}/! Індекс.md`;
		const oldFile = app.vault.getAbstractFileByPath(oldPath);
		if (oldFile instanceof TFile) {
			await app.fileManager.trashFile(oldFile);
		}
	}

	const indexFilesInfo = [
		{ name: t("indexCharactersFile"), header: t("indexCharactersHeader"), category: "characters" as const },
		{ name: t("indexPlacesFile"), header: t("indexPlacesHeader"), category: "places" as const },
		{ name: t("indexObjectsFile"), header: t("indexObjectsHeader"), category: "objects" as const },
		{ name: t("indexEmotionsFile"), header: t("indexEmotionsHeader"), category: "emotions" as const },
		{ name: t("indexSymbolsFile"), header: t("indexSymbolsHeader"), category: "symbols" as const },
		{ name: t("indexConceptsFile"), header: t("indexConceptsHeader"), category: "concepts" as const },
		{ name: t("indexAllFile"), header: t("indexAllHeader"), category: null }
	];

	const typeCol = t("colType");
	const dreamsCol = t("colDreams");
	const lastSeenCol = t("colLastSeen");

	for (const info of indexFilesInfo) {
		const filePath = `${indexFolderPath}/${info.name}`;
		const targetFromFolder = info.category
			? getEntityCategorySubfolder(app, baseEntitiesFolder, info.category)
			: baseEntitiesFolder;

		const indexContent = `${info.header}

\`\`\`dataview
TABLE
entity_type AS "${typeCol}",
dream_count AS "${dreamsCol}",
last_seen AS "${lastSeenCol}"
FROM "${targetFromFolder}"
WHERE type = "entity"
SORT dream_count DESC
\`\`\`
`;

		const existingFile = app.vault.getAbstractFileByPath(filePath);
		if (existingFile instanceof TFile) {
			await app.vault.modify(existingFile, indexContent);
		} else {
			await app.vault.create(filePath, indexContent);
		}
	}
}

export async function exportTemplaterTemplate(app: App, settings: DreamAnalyzerSettings): Promise<void> {
	const templatePath = (settings.templateFilePath || "Templates/Dream Template.md").trim().replace(/\/$/, "");
	const parentFolder = templatePath.substring(0, templatePath.lastIndexOf("/"));

	if (parentFolder) {
		await ensureFolder(app, parentFolder);
	}

	const content = `---
type: dream
date: <% tp.file.creation_date("YYYY-MM-DD") %>
lucid: false
entities_checked: false
characters: []
places: []
objects: []
emotions: []
symbols: []
concepts: []
keywords: []
---

${t("dreamHeader")}

${t("dreamPlaceholder")}

${t("aiHeader")}

${t("summaryHeader")}

-

${t("connectionsHeader")}

-
`;

	const existingFile = app.vault.getAbstractFileByPath(templatePath);
	if (existingFile instanceof TFile) {
		await app.vault.modify(existingFile, content);
	} else {
		await app.vault.create(templatePath, content);
	}

	new Notice(t("templateExportSuccess", { path: templatePath }));
}
