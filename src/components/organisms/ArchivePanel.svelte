<script lang="ts">
/**
 * 归档面板：分组切换（SegmentedButton，按年 / 按分类 / 按标签）+ 时间轴列表（组折叠见 ArchiveList 原子）。
 * URL 参数（?category= / ?tag= / ?uncategorized）是定向浏览视图：隐藏分组切换，
 * 顶部显示筛选头（面包屑）——索引页链接 › 当前筛选值，一键回溯到分类/标签索引页；
 * 无筛选时显示分组切换，可按年 / 按分类 / 按标签切换全量归档的分组。
 */
import ArchiveList, {
	type ArchiveGroup,
	type ArchiveItem,
} from "@components/atoms/blog/ArchiveList.svelte";
import Card from "@components/atoms/display/Card.svelte";
import SegmentedButton from "@components/atoms/selection/SegmentedButton.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { formatCalendarDate } from "@utils/content-date";
import { getPostUrlBySlug, url } from "@utils/url-utils";
import { onMount } from "svelte";

interface Post {
	slug: string;
	url?: string;
	data: {
		title: string;
		tags: string[];
		category: string | null;
		published: Date;
	};
}

let { sortedPosts = [] as Post[] }: { sortedPosts?: Post[] } = $props();

let category = $state("");
let tag = $state("");
let uncategorized = $state(false);
/** 分组维度（SegmentedButton 驱动）：year / category / tag，string 以匹配 bind:value */
let groupBy = $state<string>("year");
let restoredCollapsed = $state<Record<string, boolean> | undefined>(undefined);

// 列表 / 表格视图切换
const VIEW_KEY = "ak-archive-view";
type ArchiveView = "timeline" | "table";
let archiveView = $state<ArchiveView>("timeline");
let viewInitialized = false;
$effect(() => {
	if (!viewInitialized) return;
	try {
		localStorage.setItem(VIEW_KEY, archiveView);
	} catch {}
});
onMount(() => {
	try {
		const v = localStorage.getItem(VIEW_KEY);
		if (v === "table" || v === "timeline") archiveView = v;
	} catch {}
	viewInitialized = true;
});

const COLLAPSED_STORAGE_KEY = "shirone:archive-collapsed";

function collapsedViewKey() {
	if (uncategorized) return `${groupBy}:uncategorized`;
	if (category) return `${groupBy}:category:${category}`;
	if (tag) return `${groupBy}:tag:${tag}`;
	return groupBy;
}

function readCollapsedState() {
	try {
		const stored = JSON.parse(
			localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? "{}",
		) as Record<string, Record<string, boolean>>;
		restoredCollapsed = stored[collapsedViewKey()];
	} catch {
		restoredCollapsed = undefined;
	}
}

function persistCollapsedState(next: Record<string, boolean>) {
	try {
		const stored = JSON.parse(
			localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? "{}",
		) as Record<string, Record<string, boolean>>;
		stored[collapsedViewKey()] = next;
		localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(stored));
	} catch {
		// Storage can be unavailable in privacy-restricted contexts.
	}
}

/** 筛选头数据：类别（决定索引链接）+ 展示值；无筛选为 null */
const filterCrumb = $derived.by(() => {
	if (uncategorized) {
		return {
			href: url("/categories/"),
			label: i18n(I18nKey.categories),
			value: i18n(I18nKey.uncategorized),
		};
	}
	if (category) {
		return {
			href: url("/categories/"),
			label: i18n(I18nKey.categories),
			value: category,
		};
	}
	if (tag) {
		return {
			href: url("/tags/"),
			label: i18n(I18nKey.tags),
			value: `#${tag}`,
		};
	}
	return null;
});

const groupOptions = [
	{ value: "year", label: i18n(I18nKey.archiveGroupYear) },
	{ value: "category", label: i18n(I18nKey.archiveGroupCategory) },
	{ value: "tag", label: i18n(I18nKey.archiveGroupTag) },
];

/** 筛选后的文章（分组维度与之正交，均在下方消费） */
const filtered = $derived(
	sortedPosts.filter((p) => {
		if (uncategorized && p.data.category) return false;
		if (category && p.data.category !== category) return false;
		if (tag && !p.data.tags.includes(tag)) return false;
		return true;
	}),
);

function formatDate(date: Date) {
	return formatCalendarDate(date).slice(5);
}

function toItem(post: Post): ArchiveItem {
	return {
		title: post.data.title,
		href: post.url ?? getPostUrlBySlug(post.slug),
		date: formatDate(post.data.published),
		category: post.data.category ?? undefined,
		tags: post.data.tags,
		// 只有绝对路径（/ 开头）或远程 URL 才直接用；
		// 文章内的相对路径（如 ./cover.jpeg）在归档页无法解析，交给占位图
		image:
			typeof post.data.image === "string" &&
			/^(https?:\/\/|\/)/.test(post.data.image.trim())
				? post.data.image.trim()
				: undefined,
	};
}

function countLabel(count: number) {
	return `${count} ${i18n(count === 1 ? I18nKey.postCount : I18nKey.postsCount)}`;
}

/** 按当前分组维度构建组；组内保持筛选后顺序（时间倒序）。 */
const groups = $derived.by((): ArchiveGroup[] => {
	if (filtered.length === 0) return [];
	const buckets = new Map<string, ArchiveItem[]>();
	const add = (key: string, item: ArchiveItem) => {
		const list = buckets.get(key);
		if (list) list.push(item);
		else buckets.set(key, [item]);
	};
	if (groupBy === "category") {
		for (const p of filtered) {
			add(p.data.category ?? i18n(I18nKey.uncategorized), toItem(p));
		}
	} else if (groupBy === "tag") {
		for (const p of filtered) {
			for (const t of p.data.tags) add(`#${t}`, toItem(p));
		}
	} else {
		for (const p of filtered) {
			add(formatCalendarDate(p.data.published).slice(0, 4), toItem(p));
		}
	}
	const list = [...buckets.entries()].map(([id, items]) => ({
		id,
		title: id,
		items,
	}));
	if (groupBy === "year") {
		return list.sort((a, b) => Number(b.title) - Number(a.title));
	}
	return list.sort((a, b) =>
		a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
	);
});

onMount(() => {
	const params = new URLSearchParams(window.location.search);
	category = params.get("category") || "";
	tag = params.get("tag") || "";
	uncategorized = params.has("uncategorized");
	readCollapsedState();
});

$effect(() => {
	groupBy;
	category;
	tag;
	uncategorized;
	if (typeof window !== "undefined") readCollapsedState();
});
</script>

<Card color="var(--card-bg)" radius="l" class="archive-panel px-8 py-6">
	<!-- 带筛选参数（?category= / ?tag= / ?uncategorized）是定向浏览视图：
	    隐藏分组切换，只留面包屑 + 筛选后时间轴；无筛选才显示分组切换。 -->
	{#if !filterCrumb}
		<div class="archive-panel__view-switch">
			<button
				type="button"
				class:active={archiveView === "timeline"}
				aria-pressed={archiveView === "timeline"}
				title="列表视图"
				onclick={() => (archiveView = "timeline")}
			>
				<Icon icon="material-symbols:view-list-outline" />
			</button>
			<button
				type="button"
				class:active={archiveView === "table"}
				aria-pressed={archiveView === "table"}
				title="卡片视图"
				onclick={() => (archiveView = "table")}
			>
				<Icon icon="material-symbols:grid-view-outline-rounded" />
			</button>
		</div>

		<div class="archive-panel__group-switch">
			<SegmentedButton
				options={groupOptions}
				bind:value={groupBy}
				label={i18n(I18nKey.archiveGroup)}
			/>
		</div>
	{/if}
	{#if filterCrumb}
		<nav class="archive-panel__crumb" aria-label={i18n(I18nKey.breadcrumb)}>
			<ol class="archive-panel__crumb-list">
				<li class="archive-panel__crumb-item">
					<a class="archive-panel__crumb-link m3-state-layer" href={filterCrumb.href}>
						{filterCrumb.label}
					</a>
				</li>
				<li class="archive-panel__crumb-separator" aria-hidden="true">
					<Icon icon="material-symbols:chevron-right-rounded" />
				</li>
				<li class="archive-panel__crumb-current">
					<span
						class="archive-panel__crumb-value"
						aria-current="page"
						title={filterCrumb.value}
					>{filterCrumb.value}</span>
				</li>
			</ol>
		</nav>
	{/if}
	{#if groups.length > 0}
		<ArchiveList
			{groups}
			{countLabel}
			{restoredCollapsed}
	view={archiveView}
			onCollapsedChange={persistCollapsedState}
		/>
	{:else}
		<div class="archive-panel__empty">
			<span>{i18n(I18nKey.noData)}</span>
		</div>
	{/if}
</Card>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

:global(.archive-panel)
	@media (max-width: bp-sm - 1px)
		padding: 1rem

.archive-panel
	/* 分组切换（SegmentedButton，站内 pill 语言）与下方时间轴之间的节奏 */
	:global(&__group-switch)
		margin-bottom: var(--m3e-space-4)

	:global(&__empty)
		display: flex
		align-items: center
		justify-content: center
		min-height: 11rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-large)

	:global(&__crumb)
		min-width: 0
		padding: 0 var(--m3e-space-1) var(--m3e-space-3)
		margin-bottom: var(--m3e-space-5)
		border-bottom: 1px solid var(--outline-variant)

	:global(&__crumb-list)
		display: flex
		align-items: center
		min-width: 0
		margin: 0
		padding: 0
		list-style: none

	:global(&__crumb-item)
		flex-shrink: 0

	:global(&__crumb-link)
		display: inline-flex
		align-items: center
		min-height: 2rem
		padding: 0 0.5rem
		margin-left: -0.5rem
		border-radius: var(--shape-corner-m)
		color: var(--on-surface-variant)
		font: var(--m3e-type-label-medium)
		font-weight: 600
		text-decoration: none
		--m3e-state-color: var(--primary)
		> :global(svg)
			width: 1.125rem
			height: 1.125rem
		&:hover
			color: var(--primary)

	:global(&__crumb-separator)
		display: inline-flex
		align-items: center
		justify-content: center
		flex-shrink: 0
		width: 1.5rem
		color: var(--outline)
		> :global(svg)
			width: 1rem
			height: 1rem

	:global(&__crumb-current)
		display: block
		min-width: 0

	:global(&__crumb-value)
		display: block
		min-width: 0
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap
		color: var(--primary)
		font: var(--m3e-type-body-medium)
		font-weight: 600

	@media (max-width: bp-sm - 1px)
		:global(&__crumb)
			padding-inline: 0
			padding-bottom: 0.75rem
			margin-bottom: 1rem

/* 列表 / 表格 切换按钮 追加 */
.archive-panel__view-switch
	display: flex
	gap: 0.25rem
	justify-content: flex-end
	margin-bottom: 0.6rem

	button
		display: inline-flex
		align-items: center
		justify-content: center
		width: 2.1rem
		height: 2.1rem
		padding: 0
		border: none
		cursor: pointer
		color: var(--on-surface-variant)
		background: transparent
		box-shadow: inset 0 0 0 1px var(--outline-variant)
		clip-path: polygon(5px 0, 100% 0, 100% 100%, 0 100%, 0 5px)
		transition: color 0.2s, background-color 0.2s, box-shadow 0.2s

		hover-bg = rgba(128, 128, 128, 0.1)

		&:hover
			background: hover-bg

		&.active
			color: var(--primary)
			background: var(--primary-container)
			box-shadow: inset 0 0 0 1px var(--primary)

		:global(svg)
			width: 1.2rem
			height: 1.2rem
</style>