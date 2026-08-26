import { mkdir } from "node:fs/promises";
import { Surreal, RecordId } from "surrealdb";
import { surrealdbNodeEngines } from "@surrealdb/node";

const resourceTables = [
  "resource_conversation_memory_segments",
  "resource_message_containers",
  "resource_conversations",
  "resource_package_categories",
  "resource_packages",
  "resource_plugin_nodes",
  "resource_plugins",
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

  async function remove(table, id) {
    await database.delete(recordId(table, id));
  }

  async function resetCharacterData() {
    await Promise.all(
      resourceTables.map((table) => database.delete(assertTable(table))),
    );
  }

  async function loadPlugins() {
    return (await selectAll("resource_plugins")).map((record) => record.value);
  }

  async function savePlugin(plugin) {
    if (
      !plugin ||
      typeof plugin !== "object" ||
      typeof plugin.id !== "string"
    ) {
      throw new Error("插件记录缺少 ID。");
    }
    await upsert("resource_plugins", plugin.id, plugin);
  }

  async function deletePlugin(pluginId) {
    await remove("resource_plugins", pluginId);
  }

  async function searchPluginNodes(query, limit = 40) {
    const normalized = String(query ?? "")
      .trim()
      .toLocaleLowerCase();
    if (!normalized) return [];
    const cappedLimit = Math.min(Math.max(Number(limit) || 40, 1), 100);
    const plugins = await loadPlugins();
    return plugins
      .flatMap((plugin) =>
        (plugin.files ?? []).map((node) => ({ plugin, node })),
      )
      .filter(({ plugin, node }) =>
        [plugin.name, node.name, node.path, node.content].some((value) =>
          String(value ?? "")
            .toLocaleLowerCase()
            .includes(normalized),
        ),
      )
      .sort((a, b) =>
        `${a.plugin.name}/${a.node.path}`.localeCompare(
          `${b.plugin.name}/${b.node.path}`,
          "zh-Hans",
        ),
      )
      .slice(0, cappedLimit)
      .map(({ plugin, node }) => ({
        pluginId: plugin.id,
        pluginName: plugin.name,
        nodeId: node.id,
        path: node.path,
        name: node.name,
        kind: node.kind,
        excerpt:
          typeof node.content === "string"
            ? node.content.slice(0, 180)
            : JSON.stringify(node.content ?? "").slice(0, 180),
      }));
  }

  return {
    selectAll,
    selectByField,
    selectOne,
    upsert,
    remove,
    resetCharacterData,
    loadPlugins,
    savePlugin,
    deletePlugin,
    searchPluginNodes,
    async close() {
      await database.close();
    },
  };
}
