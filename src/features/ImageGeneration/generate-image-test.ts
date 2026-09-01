import { generateImage } from "./image-generation";

export async function generateImageTest(model: string, prompt: string) {
	const result = await generateImage({ model, prompt });
	return `data:${result.image.mediaType};base64,${result.image.base64}`;
}
