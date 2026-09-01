export interface StatisticEvent {
	id: string;
	type: "app.launch" | "message.user" | "message.assistant";
	createdAt: string;
}

export function createStatisticEvent(
	type: StatisticEvent["type"],
): StatisticEvent {
	return {
		id: crypto.randomUUID(),
		type,
		createdAt: new Date().toISOString(),
	};
}

export interface HeatmapDay {
	date: string;
	count: number;
}

export function createYearHeatmap(
	events: StatisticEvent[],
	today = new Date(),
): HeatmapDay[] {
	const start = new Date(today);
	start.setDate(start.getDate() - 364);
	start.setHours(0, 0, 0, 0);

	const counts = new Map<string, number>();
	for (const event of events) {
		const key = event.createdAt.slice(0, 10);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return Array.from({ length: 365 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const key = date.toISOString().slice(0, 10);
		return { date: key, count: counts.get(key) ?? 0 };
	});
}
