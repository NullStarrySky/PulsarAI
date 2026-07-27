import { registerGenerationComponent } from "@/features/Resources/Conversation/presentation/generation-component-registry";
import AskUserComponent from "./AskUserComponent.vue";

registerGenerationComponent("agent.ask-user", AskUserComponent);
