import { storeToRefs } from "pinia";
import { computed, watchEffect } from "vue";
import { useUIStore } from "@/features/UI/store";

export function useSettingsState() {
	const layout = useUIStore();
	const {
		settingsOpen,
		settingsPageId: activePageId,
		settingsTabId: activeTabId,
		settingsSearch,
	} = storeToRefs(layout);

	const pages = computed(() => layout.settingPages);
	const activePage = computed(
		() =>
			layout.settingPages.find((page) => page.meta.id === activePageId.value) ??
			pages.value[0],
	);
	const activeTabs = computed(() => activePage.value?.tabs ?? []);
	const activeComponent = computed(() => {
		const page = activePage.value;
		if (!page) return null;
		if (!page.tabs?.length) return page.component ?? null;
		return (
			page.tabs.find((tab) => tab.id === activeTabId.value)?.component ??
			page.tabs[0]?.component ??
			null
		);
	});
	const filteredPages = computed(() => {
		const keyword = settingsSearch.value.trim().toLocaleLowerCase();
		return pages.value.filter(
			(page) =>
				!keyword ||
				page.meta.title.toLocaleLowerCase().includes(keyword) ||
				page.tabs?.some((tab) =>
					tab.title.toLocaleLowerCase().includes(keyword),
				),
		);
	});
	const activePageIndex = computed(() =>
		filteredPages.value.findIndex(
			(p) => p.meta.id === activePage.value?.meta.id,
		),
	);

	watchEffect(() => {
		if (!activePageId.value && pages.value[0])
			activePageId.value = pages.value[0].meta.id;
		const tabs = activePage.value?.tabs ?? [];
		if (tabs.length && !tabs.some((tab) => tab.id === activeTabId.value)) {
			activeTabId.value = tabs[0]?.id;
		}
	});

	function selectPage(pageId: string) {
		activePageId.value = pageId;
		const page = layout.settingPages.find((item) => item.meta.id === pageId);
		activeTabId.value = page?.tabs?.[0]?.id ?? "";
	}

	function closeSettings() {
		layout.settingsOpen = false;
	}

	return {
		settingsOpen,
		activePageId,
		activeTabId,
		settingsSearch,
		pages,
		activePage,
		activeTabs,
		activeComponent,
		filteredPages,
		activePageIndex,
		selectPage,
		closeSettings,
	};
}
