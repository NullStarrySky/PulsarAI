import conversationDocs from "@/features/Plugin/builtIn/core/docs/conversation.md?raw";
import packageDocs from "@/features/Plugin/builtIn/core/docs/package.md?raw";
import worldDocs from "@/features/Plugin/builtIn/core/docs/plugin.md?raw";

const builtinAgentDocs = Object.freeze({
	package: packageDocs,
	world: worldDocs,
	conversation: conversationDocs,
});

export function readBuiltinAgentDocs(id?: string) {
	if (!id) return Object.keys(builtinAgentDocs);
	return builtinAgentDocs[id as keyof typeof builtinAgentDocs] ?? null;
}
