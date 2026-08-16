import { registerGenerationComponent } from "@/features/Resources/Conversation/generation-components/generation-component-registry";
import AskUserComponent from "./AskUserComponent.vue";
import RecommendationCard from "./RecommendationCard.vue";

registerGenerationComponent("agent.ask-user", AskUserComponent);
registerGenerationComponent("agent.ask-suggestion", RecommendationCard);

