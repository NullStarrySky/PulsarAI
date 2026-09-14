import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useBackupStore } from "../backup/backup-store";

describe("backup settings", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		localStorage.clear();
	});

	it("persists local backup settings", () => {
		const store = useBackupStore();
		store.updateLocal({ directory: "C:/backup", maxBackups: "20" });
		expect(store.local).toMatchObject({
			directory: "C:/backup",
			maxBackups: "20",
		});
	});
});
