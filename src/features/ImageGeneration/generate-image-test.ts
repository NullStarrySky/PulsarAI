import { generateImageToPath } from "./image-generation";
import { mediaLink, resolveMediaUrl } from "@/features/Media/media-link";

export async function generateImageTest(model: string, prompt: string) {
	return resolveMediaUrl(mediaLink(await generateImageToPath({ model, prompt })));
}
