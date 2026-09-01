import { mkdir } from "node:fs/promises";
import { surrealdbNodeEngines } from "@surrealdb/node";
import { RecordId, Surreal } from "surrealdb";

const resourceTables = [
	"resource_conversation_memory_segments",
	"resource_message_containers",
	"resource_conversations",
	"resource_package_categories",
	"resource_packages",
	"resource_worlds",
];

function assertTable(table) {
	if (typeof table !== "string" || !/^[A-Za-z0-9_]+$/.test(table)) {
		throw new Error(`Invalid table name: ${String(table)}`);
	}
	return table;
}

function assertId(id) {
	if (typeof id !== "string" || !id.trim())
		throw new Error("A non-empty record ID is required.");
	return id;
}

function recordId(table, id) {
	return new RecordId(assertTable(table), assertId(id));
}

function sortRecords(records) {
	return [...records].sort((a, b) =>
		String(a.resource_key).localeCompare(String(b.resource_key)),
	);
}

export async function createDatabase(userDataPath) {
	await mkdir(userDataPath, { recursive: true });
	process.chdir(userDataPath);

	const database = new Surreal({ engines: surrealdbNodeEngines() });
	await database.connect("surrealkv://surrealdb");
	await database.use({ namespace: "pulsar", database: "pulsar" });

	async function selectAll(table) {
		return sortRecords(await database.select(assertTable(table))).map(
			({ resource_key, value }) => ({
				id: resource_key ?? null,
				value,
			}),
		);
	}

	async function selectByField(table, field, value) {
		if (field !== "packageId" && field !== "conversationid")
			throw new Error("Unsupported resource field.");
		return (await selectAll(table)).filter(
			(record) => record.value?.[field] === value,
		);
	}

	async function selectOne(table, id) {
		const record = await database.select(recordId(table, id));
		return record?.value ?? null;
	}

	async function upsert(table, id, value) {
		await database.upsert(recordId(table, id), { resource_key: id, value });
	}

	async function update(table, id, patches) {
		await database.update(recordId(table, id)).patch(patches);
	}

	async function remove(table, id) {
		await database.delete(recordId(table, id));
	}

	async function resetCharacterData() {
		await Promise.all(
			resourceTables.map((table) => database.delete(assertTable(table))),
		);
	}

	return {
		selectAll,
		selectByField,
		selectOne,
		upsert,
		update,
		remove,
		resetCharacterData,
		async close() {
			await database.close();
		},
	};
}
