export interface CharacterPackage {
	id: string;
	name: string;
	nickname?: string;
	icon: string;
	description?: string;
	categoryId?: string | null;
	order: number;
	pinned?: boolean;
	syncEnabled?: boolean;
}

export interface PackageCategory {
	id: string;
	name: string;
	order: number;
}
