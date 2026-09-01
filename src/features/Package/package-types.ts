interface CharacterPackageConversationLink {
	id: string;
	lastContainerid: string;
	title: string;
}

export interface CharacterPackage {
	id: string;
	name: string;
	nickname?: string;
	icon: string;
	description?: string;
	categoryId?: string | null;
	order: number;
	pinned?: boolean;
	conversations: CharacterPackageConversationLink[];
	syncEnabled?: boolean;
}

export interface PackageCategory {
	id: string;
	name: string;
	order: number;
}
