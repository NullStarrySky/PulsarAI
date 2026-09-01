import { defineStore } from "pinia";
import { fallbackDefaultConfigs } from "./default-config";
import {
	getDefaultChatModel,
	getEmbeddingModel,
	getFastModel,
	getImageModel,
	getSpeechModel,
	getSttAutoPolish,
	getSttLanguage,
	getSttPolishModel,
	getSttPolishPrompt,
	getTranscriptionModel,
	setDefaultChatModel,
	setEmbeddingModel,
	setFastModel,
	setImageModel,
	setSpeechModel,
	setSttAutoPolish,
	setSttLanguage,
	setSttPolishModel,
	setSttPolishPrompt,
	setTranscriptionModel,
} from "./default-config-service";

export const useDefaultConfigStore = defineStore("defaultConfigs", {
	state: () => ({
		defaultChatModel: fallbackDefaultConfigs.defaultChatModel,
		fastModel: fallbackDefaultConfigs.fastModel,
		embeddingModel: fallbackDefaultConfigs.embeddingModel,
		imageModel: fallbackDefaultConfigs.imageModel,
		speechModel: fallbackDefaultConfigs.speechModel,
		transcriptionModel: fallbackDefaultConfigs.transcriptionModel,
		sttLanguage: fallbackDefaultConfigs.sttLanguage,
		sttAutoPolish: fallbackDefaultConfigs.sttAutoPolish,
		sttPolishModel: fallbackDefaultConfigs.sttPolishModel,
		sttPolishPrompt: fallbackDefaultConfigs.sttPolishPrompt,
		loaded: false,
	}),
	actions: {
		async load() {
			const [
				defaultChatModel,
				fastModel,
				embeddingModel,
				imageModel,
				speechModel,
				transcriptionModel,
				sttLanguage,
				sttAutoPolish,
				sttPolishModel,
				sttPolishPrompt,
			] = await Promise.all([
				getDefaultChatModel(),
				getFastModel(),
				getEmbeddingModel(),
				getImageModel(),
				getSpeechModel(),
				getTranscriptionModel(),
				getSttLanguage(),
				getSttAutoPolish(),
				getSttPolishModel(),
				getSttPolishPrompt(),
			]);
			this.defaultChatModel = migrateModelRef(defaultChatModel);
			this.fastModel = migrateModelRef(fastModel || defaultChatModel);
			this.embeddingModel = migrateModelRef(embeddingModel);
			this.imageModel = migrateModelRef(imageModel);
			this.speechModel = migrateModelRef(speechModel);
			this.transcriptionModel = migrateModelRef(transcriptionModel);
			this.sttLanguage = sttLanguage;
			this.sttAutoPolish = sttAutoPolish;
			this.sttPolishModel = migrateModelRef(sttPolishModel || defaultChatModel);
			this.sttPolishPrompt = sttPolishPrompt;
			await Promise.all([
				this.defaultChatModel !== defaultChatModel
					? setDefaultChatModel(this.defaultChatModel)
					: Promise.resolve(),
				this.fastModel !== fastModel
					? setFastModel(this.fastModel)
					: Promise.resolve(),
				this.embeddingModel !== embeddingModel
					? setEmbeddingModel(this.embeddingModel)
					: Promise.resolve(),
				this.imageModel !== imageModel
					? setImageModel(this.imageModel)
					: Promise.resolve(),
				this.speechModel !== speechModel
					? setSpeechModel(this.speechModel)
					: Promise.resolve(),
				this.transcriptionModel !== transcriptionModel
					? setTranscriptionModel(this.transcriptionModel)
					: Promise.resolve(),
				this.sttPolishModel !== sttPolishModel
					? setSttPolishModel(this.sttPolishModel)
					: Promise.resolve(),
			]);
			this.loaded = true;
		},
		async setDefaultChatModel(model: string) {
			this.defaultChatModel = model;
			await setDefaultChatModel(model);
		},
		async setFastModel(model: string) {
			this.fastModel = model;
			await setFastModel(model);
		},
		async setEmbeddingModel(model: string) {
			this.embeddingModel = model;
			await setEmbeddingModel(model);
		},
		async setImageModel(model: string) {
			this.imageModel = model;
			await setImageModel(model);
		},
		async setSpeechModel(model: string) {
			this.speechModel = model;
			await setSpeechModel(model);
		},
		async setTranscriptionModel(model: string) {
			this.transcriptionModel = model;
			await setTranscriptionModel(model);
		},
		async setSttLanguage(language: string) {
			this.sttLanguage = language;
			await setSttLanguage(language);
		},
		async setSttAutoPolish(autoPolish: boolean) {
			this.sttAutoPolish = autoPolish;
			await setSttAutoPolish(autoPolish);
		},
		async setSttPolishModel(model: string) {
			this.sttPolishModel = model;
			await setSttPolishModel(model);
		},
		async setSttPolishPrompt(prompt: string) {
			this.sttPolishPrompt = prompt;
			await setSttPolishPrompt(prompt);
		},
	},
});

function migrateModelRef(model: string) {
	if (model === "deepseek/deepseek-chat") {
		return "deepseek/deepseek-v4-flash";
	}
	if (model === "deepseek/deepseek-reasoner") {
		return "deepseek/deepseek-v4-pro";
	}
	return model;
}
