export function toggleSttRecordingAction() {
	window.dispatchEvent(new CustomEvent("pulsar:stt-toggle"));
}
