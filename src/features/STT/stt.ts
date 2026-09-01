export interface SystemSpeechRecognitionOptions {
	language?: string;
	maxDuration?: number;
	onDevice?: boolean;
}

export interface SystemSpeechRecognitionResult {
	transcript: string;
	isFinal: boolean;
	confidence?: number;
}

export interface SystemSpeechRecognitionError {
	code: string;
	message: string;
	details?: string;
}
