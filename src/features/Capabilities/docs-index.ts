import type { FeatureDocs } from "./types";
import { docs as selfDocs } from "./docs";
import { docs as aboutDocs } from "@/features/About/docs";
import { docs as agentDocs } from "@/features/Agent/docs";
import { docs as backupDocs } from "@/features/Backup/docs";
import { docs as databaseDocs } from "@/features/Database/docs";
import { docs as defaultConfigsDocs } from "@/features/defaultConfigs/docs";
import { docs as hotkeyDocs } from "@/features/Hotkey/docs";
import { docs as miscDocs } from "@/features/Misc/docs";
import { docs as modelConnectionDocs } from "@/features/ModelConnection/docs";
import { docs as notificationDocs } from "@/features/Notification/docs";
import { docs as resourcesDocs } from "@/features/Resources/docs";
import { docs as conversationDocs } from "@/features/Resources/Conversation/docs";
import { docs as pluginDocs } from "@/features/Resources/Plugin/docs";
import { docs as sandboxDocs, globalDocs } from "@/features/Sandbox/docs";
import { docs as settingDocs } from "@/features/Setting/docs";
import { docs as statisticDocs } from "@/features/Statistic/docs";
import { docs as subWindowDocs } from "@/features/SubWindow/docs";
import { docs as translateDocs } from "@/features/Translate/docs";
import { docs as uiDocs } from "@/features/UI/docs";
import { docs as webSearchDocs } from "@/features/WebSearch/docs";

/**
 * 全部 Feature 的公开 API 文档元数据。
 * 本模块只依赖各 Feature 的 docs.ts（纯元数据），
 * 供 read_docs、文档生成脚本在不加载运行时的情况下消费。
 */
export const featureDocs: FeatureDocs[] = [
  selfDocs,
  aboutDocs,
  agentDocs,
  backupDocs,
  databaseDocs,
  defaultConfigsDocs,
  hotkeyDocs,
  miscDocs,
  modelConnectionDocs,
  notificationDocs,
  resourcesDocs,
  conversationDocs,
  pluginDocs,
  sandboxDocs,
  globalDocs,
  settingDocs,
  statisticDocs,
  subWindowDocs,
  translateDocs,
  uiDocs,
  webSearchDocs,
];
