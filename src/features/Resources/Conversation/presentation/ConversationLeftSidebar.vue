<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  ImagePlus,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plug,
  Plus,
  Search,
  Settings,
  Trash2,
} from "lucide-vue-next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { saveImageFile } from "@/features/Resources/application/resource-file-service";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import ResourceAvatar from "@/features/Resources/Conversation/presentation/ResourceAvatar.vue";
import { useLayoutStore } from "@/features/UI/application/layout-store";
import InlineEditInput from "@/features/UI/presentation/InlineEditInput.vue";

const layout = useLayoutStore();
const conversation = useConversationStore();
const { leftSidebarOpen } = storeToRefs(layout);
const mode = ref<"packages" | "tasks" | "plugins">("packages");
const packageViewMode = ref<"list" | "grid">("list");
const collapsedCategoryIds = ref<string[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const uploadPackageId = ref("");
const editing = ref<{ kind: "package-name" | "package-description" | "category-name"; id: string } | null>(null);
const editingValue = ref("");
const deleteCategoryId = ref("");

onMounted(() => {
  void conversation.initialize();
});

const categorySections = computed(() => [
  ...conversation.sortedCategories.map((category) => ({
    id: category.id,
    name: category.name,
    virtual: false,
    packages: conversation.packagesByCategory(category.id),
  })),
  {
    id: "uncategorized",
    name: "未分类",
    virtual: true,
    packages: conversation.packagesByCategory(null),
  },
]);

async function openPackage(packageId: string) {
  await conversation.openPackage(packageId);
  const active = conversation.activeConversation;
  if (active) {
    layout.openResourceTab({
      resourceType: "conversation",
      resourceId: active.id,
      packageId: active.packageId,
      title: active.title,
    });
  }
}

async function createPackage(categoryId: string | null) {
  await conversation.createPackage({ categoryId });
}

function toggleCategory(categoryId: string) {
  collapsedCategoryIds.value = collapsedCategoryIds.value.includes(categoryId)
    ? collapsedCategoryIds.value.filter((id) => id !== categoryId)
    : [...collapsedCategoryIds.value, categoryId];
}

function isCategoryCollapsed(categoryId: string) {
  return collapsedCategoryIds.value.includes(categoryId);
}

async function movePackageToCategory(packageId: string, categoryId: string | null) {
  await conversation.updatePackage(packageId, { categoryId });
}

function beginEdit(kind: "package-name" | "package-description" | "category-name", id: string, value: string) {
  editing.value = { kind, id };
  editingValue.value = value;
}

async function confirmEdit() {
  if (!editing.value) {
    return;
  }

  const value = editingValue.value.trim();
  if (editing.value.kind === "category-name") {
    await conversation.updateCategory(editing.value.id, { name: value || "未命名分类" });
  } else if (editing.value.kind === "package-name") {
    const item = conversation.packages.find((packageItem) => packageItem.id === editing.value?.id);
    await conversation.updatePackage(editing.value.id, { name: value || item?.name || "未命名角色包" });
  } else {
    await conversation.updatePackage(editing.value.id, { description: value });
  }

  editing.value = null;
  editingValue.value = "";
}

function chooseIcon(packageId: string) {
  uploadPackageId.value = packageId;
  fileInput.value?.click();
}

async function deletePackage(packageId: string) {
  layout.closeTabsByPackage(packageId);
  await conversation.deletePackage(packageId);
}

async function deleteCategoryWithTabs(categoryId: string) {
  for (const item of conversation.packagesByCategory(categoryId)) {
    layout.closeTabsByPackage(item.id);
  }
  await conversation.deleteCategoryWithPackages(categoryId);
}

async function uploadIcon(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file && uploadPackageId.value) {
    await conversation.updatePackage(uploadPackageId.value, { icon: await saveImageFile(file) });
  }

  if (fileInput.value) {
    fileInput.value.value = "";
  }
}
</script>

<template>
  <aside
    :class="
      cn(
        'flex shrink-0 flex-col overflow-hidden border-r bg-background transition-[width,opacity] duration-300 ease-out',
        leftSidebarOpen ? 'w-72 opacity-100' : 'w-0 opacity-0',
      )
    "
  >
    <div class="min-w-72 border-b p-2">
      <div class="flex items-center justify-between gap-2 rounded-md bg-muted p-1">
        <div class="flex items-center gap-1">
          <Button :variant="mode === 'packages' ? 'secondary' : 'ghost'" size="icon" class="size-8" title="角色包" @click="mode = 'packages'">
            <Search class="size-4" />
          </Button>
          <Button :variant="mode === 'tasks' ? 'secondary' : 'ghost'" size="icon" class="size-8" title="定时任务" @click="mode = 'tasks'">
            <Clock class="size-4" />
          </Button>
          <Button :variant="mode === 'plugins' ? 'secondary' : 'ghost'" size="icon" class="size-8" title="插件" @click="mode = 'plugins'">
            <Plug class="size-4" />
          </Button>
        </div>
        <Button
          v-if="mode === 'packages'"
          variant="ghost"
          size="icon"
          class="size-8"
          :title="packageViewMode === 'list' ? '切换为宫格' : '切换为列表'"
          @click="packageViewMode = packageViewMode === 'list' ? 'grid' : 'list'"
        >
          <LayoutGrid v-if="packageViewMode === 'list'" class="size-4" />
          <List v-else class="size-4" />
        </Button>
      </div>
    </div>

    <div v-if="mode === 'packages'" class="min-w-72 flex-1 overflow-y-auto p-2">
      <section v-for="section in categorySections" :key="section.id" class="group/category mb-2">
        <div
          class="relative flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent/60"
          @click="toggleCategory(section.id)"
        >
          <InlineEditInput
            v-if="editing?.kind === 'category-name' && editing.id === section.id"
            v-model="editingValue"
            placeholder="分类名称"
            @click.stop
            @confirm="confirmEdit"
            @cancel="editing = null"
          />
          <ChevronRight v-if="isCategoryCollapsed(section.id)" class="size-3.5 shrink-0" />
          <ChevronDown v-else class="size-3.5 shrink-0" />
          <span class="min-w-0 flex-1 truncate">{{ section.name }}</span>
          <Button
            v-if="!(editing?.kind === 'category-name' && editing.id === section.id)"
            size="icon"
            variant="ghost"
            class="size-7 opacity-0 transition-opacity group-hover/category:opacity-100"
            title="新建角色包"
            @click.stop="createPackage(section.virtual ? null : section.id)"
          >
            <Plus class="size-3.5" />
          </Button>

          <DropdownMenu v-if="!(editing?.kind === 'category-name' && editing.id === section.id)">
            <DropdownMenuTrigger as-child>
              <Button
                size="icon"
                variant="ghost"
                class="size-7 opacity-0 transition-opacity group-hover/category:opacity-100"
                title="分类菜单"
                @click.stop
              >
                <MoreHorizontal class="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-52">
              <DropdownMenuItem @click="conversation.createCategory()">添加新分类</DropdownMenuItem>
              <DropdownMenuItem
                :disabled="section.virtual"
                @click="beginEdit('category-name', section.id, section.name)"
              >
                重命名分类
              </DropdownMenuItem>
              <DropdownMenuItem :disabled="section.virtual" @click="conversation.moveCategory(section.id, -1)">
                <ArrowUp class="mr-2 size-4" />
                上移分类
              </DropdownMenuItem>
              <DropdownMenuItem :disabled="section.virtual" @click="conversation.moveCategory(section.id, 1)">
                <ArrowDown class="mr-2 size-4" />
                下移分类
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem :disabled="section.virtual" @click="conversation.deleteCategory(section.id)">删除分类</DropdownMenuItem>
              <DropdownMenuItem
                :disabled="section.virtual"
                class="text-destructive focus:text-destructive"
                @click="deleteCategoryId = section.id"
              >
                删除分类及其中角色包
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div
          v-if="!isCategoryCollapsed(section.id)"
          :class="packageViewMode === 'grid' ? 'grid grid-cols-2 gap-1.5' : 'space-y-1'"
        >
          <div
            v-for="item in section.packages"
            :key="item.id"
            role="button"
            :class="
              cn(
                packageViewMode === 'grid'
                  ? 'relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-md px-2 py-2 text-center transition-colors hover:bg-accent'
                  : 'relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent',
                item.id === conversation.activePackageId && 'bg-accent text-accent-foreground',
              )
            "
            @click="openPackage(item.id)"
          >
            <ResourceAvatar :name="item.name" :icon="item.icon" />
            <span :class="packageViewMode === 'grid' ? 'min-w-0 max-w-full' : 'min-w-0'">
              <span class="block truncate text-sm font-medium">{{ item.name }}</span>
              <span v-if="packageViewMode === 'list' && item.description" class="block truncate text-xs text-muted-foreground">{{ item.description }}</span>
            </span>

            <InlineEditInput
              v-if="editing?.kind === 'package-name' && editing.id === item.id"
              v-model="editingValue"
              placeholder="角色包名称"
              @confirm="confirmEdit"
              @cancel="editing = null"
            />
            <InlineEditInput
              v-else-if="editing?.kind === 'package-description' && editing.id === item.id"
              v-model="editingValue"
              placeholder="描述"
              @confirm="confirmEdit"
              @cancel="editing = null"
            />

            <DropdownMenu v-if="editing?.id !== item.id">
              <DropdownMenuTrigger as-child>
                <Button
                  size="icon"
                  variant="ghost"
                  :class="cn('size-7 opacity-70', packageViewMode === 'grid' && 'absolute right-1 top-1')"
                  title="角色包菜单"
                  @click.stop
                >
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-44">
                <DropdownMenuItem @click="beginEdit('package-name', item.id, item.name)">重命名</DropdownMenuItem>
                <DropdownMenuItem @click="beginEdit('package-description', item.id, item.description ?? '')">修改描述</DropdownMenuItem>
                <DropdownMenuItem @click="chooseIcon(item.id)">
                  <ImagePlus class="mr-2 size-4" />
                  修改头像
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>移动到分类</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent class="w-44">
                    <DropdownMenuItem
                      :disabled="(item.categoryId ?? null) === null"
                      @click="movePackageToCategory(item.id, null)"
                    >
                      <Check v-if="(item.categoryId ?? null) === null" class="mr-2 size-4" />
                      <span v-else class="mr-2 size-4" />
                      未分类
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      v-for="targetCategory in conversation.sortedCategories"
                      :key="targetCategory.id"
                      :disabled="item.categoryId === targetCategory.id"
                      @click="movePackageToCategory(item.id, targetCategory.id)"
                    >
                      <Check v-if="item.categoryId === targetCategory.id" class="mr-2 size-4" />
                      <span v-else class="mr-2 size-4" />
                      {{ targetCategory.name }}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive focus:text-destructive" @click="deletePackage(item.id)">
                  <Trash2 class="mr-2 size-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>
    </div>

    <div v-else class="min-w-72 flex-1 p-4 text-sm text-muted-foreground">
      {{ mode === "tasks" ? "定时任务将在后续阶段接入。" : "插件将在后续阶段接入。" }}
    </div>

    <div class="min-w-72 border-t p-2">
      <Button class="w-full justify-start text-muted-foreground" variant="ghost" @click="layout.openSettings">
        <Settings data-icon="inline-start" />
        设置
      </Button>
    </div>

    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="uploadIcon" />

    <AlertDialog :open="Boolean(deleteCategoryId)" @update:open="!$event && (deleteCategoryId = '')">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除分类及其中角色包</AlertDialogTitle>
          <AlertDialogDescription>这个操作会删除该分类下的所有角色包和对话。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="deleteCategoryId = ''">取消</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="deleteCategoryWithTabs(deleteCategoryId); deleteCategoryId = ''"
          >
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </aside>
</template>
