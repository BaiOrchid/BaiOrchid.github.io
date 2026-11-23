<script lang="ts">
/**
 * M3E 博客原子 — ArchiveList 归档时间轴（分组可折叠，组标题数据驱动）。
 * 数据驱动：groups 为 { id, title, items: { title, href, date, tags? } }[]；
 * 组头可折叠（chevron 旋转，m3-state-layer），时间轴节点行，
 * hover 标题变 primary 右移、节点放大；分类以 primary 小徽标前置。
 * Svelte 实现：ArchivePanel（Svelte）与 Astro 演示页均可复用。
 */
import Icon from "@iconify/svelte";
import { collapse } from "@utils/motion";

export interface ArchiveItem {
	title: string;
	href: string;
	/** 展示日期（如 "08-13"） */
	date: string;
	category?: string;
	tags?: string[];
	/** 封面图 URL（网格视图用） */
	image?: string;
}
export interface ArchiveGroup {
	/** 折叠状态键（组内唯一）：年份 / 分类名 / 标签名 */
	id: string;
	/** 头部主文本：年份数字 / 分类名 / #标签名 */
	title: string;
	items: ArchiveItem[];
}

let {
	groups = [],
	/** 单复数文案回调，如 (n) => `${n} 篇` */
	countLabel = (count: number) => `${count} 篇`,
	/** none 全部展开 / firstExpanded 多于一排时仅首年展开 */
	collapsedByDefault = "firstExpanded" as "none" | "firstExpanded",
	/** 由上层持久化后恢复的折叠状态 */
	restoredCollapsed = undefined as Record<string, boolean> | undefined,
	onCollapsedChange = undefined as
		| ((collapsed: Record<string, boolean>) => void)
		| undefined,
	class: className = "",
	view = "timeline" as "timeline" | "table",
}: {
	groups?: ArchiveGroup[];
	countLabel?: (count: number) => string;
	collapsedByDefault?: "none" | "firstExpanded";
	restoredCollapsed?: Record<string, boolean>;
	onCollapsedChange?: (collapsed: Record<string, boolean>) => void;
	class?: string;
	view?: "timeline" | "table";
} = $props();

function createCollapsedState(nextGroups: ArchiveGroup[]) {
	const collapseAllButFirst =
		collapsedByDefault === "firstExpanded" && nextGroups.length > 1;
	const next: Record<string, boolean> = {};
	nextGroups.forEach((group, index) => {
		next[group.id] =
			restoredCollapsed?.[group.id] ?? (collapseAllButFirst && index > 0);
	});
	return next;
}

let collapsed = $state<Record<string, boolean>>(createCollapsedState(groups));
let previousGroups = groups;
let previousRestoredCollapsed = restoredCollapsed;
let animatedGroupId = $state<string | null>(null);

// 数据重组或持久状态恢复时直接落到终态；只有用户点击的组播放动画。
$effect(() => {
	if (
		groups === previousGroups &&
		restoredCollapsed === previousRestoredCollapsed
	) {
		return;
	}
	previousGroups = groups;
	previousRestoredCollapsed = restoredCollapsed;
	animatedGroupId = null;
	collapsed = createCollapsedState(groups);
});

function toggleGroup(id: string) {
	animatedGroupId = id;
	collapsed[id] = !collapsed[id];
	onCollapsedChange?.({ ...collapsed });
}
</script>

<div class="m3-blog-archive {className}" data-view={view}>
	{#if view === "timeline"}
	{#each groups as g (g.id)}
		<section class="m3-blog-archive__group">
			<button
				type="button"
				class="m3-blog-archive__header m3-state-layer"
				aria-expanded={!collapsed[g.id]}
				onclick={() => toggleGroup(g.id)}
			>
				<span class="m3-blog-archive__group-title">{g.title}</span>
				<span class="m3-blog-archive__dot" aria-hidden="true"></span>
				<span class="m3-blog-archive__count">{countLabel(g.items.length)}</span>
				<span
					class="m3-blog-archive__chevron"
					class:m3-blog-archive__chevron--open={!collapsed[g.id]}
					aria-hidden="true"
				>
					<Icon icon="material-symbols:keyboard-arrow-down" />
				</span>
			</button>
			<div
				class="m3-blog-archive__body"
				use:collapse={{
					open: !collapsed[g.id],
					animate: animatedGroupId === g.id,
					resetKey: groups,
				}}
			>
				<ul class="m3-blog-archive__list">
					{#each g.items as it, gi (it.href)}
						<li>
							<a class="m3-blog-archive__item" href={it.href}>
								<span class="m3-blog-archive__date">{it.date}</span>
								<span class="m3-blog-archive__node" aria-hidden="true"></span>
								<span class="m3-blog-archive__title">
									{#if it.category}
										<span class="m3-blog-archive__cat">{it.category}</span>
									{/if}
									<span class="m3-blog-archive__title-text">{it.title}</span>
								</span>
								{#if it.tags && it.tags.length > 0}
									<span class="m3-blog-archive__tags">{it.tags.map((t) => `#${t}`).join(" ")}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{/each}
	{/if}

	{#if view === "table"}
		<div class="m3-blog-archive__grid">
			{#each groups as g (g.id)}
				<div class="grid-group-title">
					<span class="grid-group-year">{g.title}</span>
					<span class="grid-group-count">{countLabel(g.items.length)}</span>
				</div>
				<div class="grid-cards">
					{#each g.items as it, gi (it.href)}
						<a class="grid-card" href={it.href}>
							<div class="grid-card__cover">
								{#if it.image && it.image.trim() !== ""}
									<img src={it.image} alt="" loading="lazy" />
								{:else}
									<div class="grid-card__placeholder" data-idx={gi % 6}>
										<span class="grid-card__placeholder-mark"></span>
										<span class="grid-card__placeholder-text">NO COVER</span>
									</div>
								{/if}
							</div>
							<div class="grid-card__body">
								<span class="grid-card__date">{it.date}</span>
								<h3 class="grid-card__title">{it.title}</h3>
								{#if it.tags && it.tags.length > 0}
									<div class="grid-card__tags">
										{#each it.tags.slice(0, 3) as t}
											<span class="grid-card__tag">{t}</span>
										{/each}
									</div>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style lang="stylus">
@import "../../../styles/breakpoints.styl"

.m3-blog-archive
	&__group + &__group
		margin-top: 1.5rem

	&__header
		display: flex
		align-items: center
		gap: 1rem
		width: 100%
		height: 3.75rem
		box-sizing: border-box
		padding: 0 0.75rem 0 0.5rem
		border: none
		border-radius: var(--shape-corner-m)
		background: transparent
		box-shadow: none
		text-align: left
		cursor: pointer
		color: inherit
		--m3e-state-color: var(--on-surface)
		transition:
			background-color var(--m3e-duration-short) var(--m3e-easing-standard),
			border-radius var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
			box-shadow var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-standard)
		&:hover
			background: var(--surface-container)
			border-radius: var(--shape-corner-l)
			box-shadow: var(--m3e-elevation-1)
		&:active
			background: unquote("color-mix(in oklab, var(--primary) 7%, transparent)")
			border-radius: var(--shape-corner-l)
			box-shadow: var(--m3e-elevation-1)
			transform: translateY(1px)
		&:focus-visible
			outline-offset: -2px
		&:focus-within:not(:focus-visible)::before
			opacity: 0

	&__group-title
		flex: 1 1 auto
		min-width: 3.5rem
		text-align: left
		font: var(--m3e-type-title-large)
		font-weight: 700
		color: var(--on-surface)
		white-space: nowrap
		overflow: hidden
		text-overflow: ellipsis

	&__dot
		flex-shrink: 0
		width: 0.75rem
		height: 0.75rem
		border-radius: var(--shape-corner-full)
		border: 3px solid var(--primary)
		background: var(--surface)

	&__count
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__chevron
		display: inline-flex
		align-items: center
		justify-content: center
		flex-shrink: 0
		width: 2rem
		height: 2rem
		margin-left: auto
		border-radius: var(--shape-corner-full)
		color: var(--on-surface-variant)
		transition:
			color var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-emphasized-decelerate)
		> :global(svg)
			width: 1.25rem
			height: 1.25rem
		.m3-blog-archive__header:hover &
			color: var(--primary)
		.m3-blog-archive__header:active &
			color: var(--primary)

		&--open
			transform: rotate(180deg)

	&__list
		display: flex
		flex-direction: column
		list-style: none
		margin: 0
		padding: 0

	&__item
		display: flex
		align-items: center
		gap: 0.75rem
		width: 100%
		min-height: 2.5rem
		padding: 0.25rem 0.5rem
		border-radius: var(--shape-corner-s)
		text-decoration: none
		transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)
		&:hover
			background: unquote("color-mix(in oklab, var(--on-surface) 5%, transparent)")
		&:active
			background: unquote("color-mix(in oklab, var(--on-surface) 10%, transparent)")
		&:focus-visible
			outline: 2px solid var(--secondary)
			outline-offset: -2px

	&__date
		flex-shrink: 0
		width: 4rem
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)

	&__node
		flex-shrink: 0
		width: 0.375rem
		height: 0.375rem
		border-radius: var(--shape-corner-full)
		background: var(--on-surface-variant)
		transition:
			background-color var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-emphasized-decelerate)
		.m3-blog-archive__item:hover &
			background: var(--primary)
			transform: scale(1.6)

	&__title
		flex: 1
		min-width: 0
		display: flex
		align-items: center
		gap: 0.5rem
		font: var(--m3e-type-body-medium)
		font-weight: 700
		color: var(--on-surface)
		transition:
			color var(--m3e-duration-short) var(--m3e-easing-standard),
			transform var(--m3e-duration-short) var(--m3e-easing-emphasized-decelerate)
		.m3-blog-archive__item:hover &
			color: var(--primary)
			transform: translateX(0.25rem)

	&__title-text
		min-width: 0
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap

	&__cat
		flex-shrink: 0
		display: inline-flex
		align-items: center
		height: 1.25rem
		padding: 0 0.375rem
		border-radius: var(--shape-corner-xs)
		background: var(--primary-container)
		color: var(--on-primary-container)
		font: var(--m3e-type-label-small)
		font-weight: 600
		transition:
			background-color var(--m3e-duration-short) var(--m3e-easing-standard),
			color var(--m3e-duration-short) var(--m3e-easing-standard)
		.m3-blog-archive__item:hover &
			background: var(--primary)
			color: var(--on-primary)

	&__tags
		flex-shrink: 1
		min-width: 0
		overflow: hidden
		text-overflow: ellipsis
		white-space: nowrap
		max-width: 20%
		font: var(--m3e-type-body-small)
		color: var(--on-surface-variant)
		@media (max-width: bp-md - 1px)
			display: none

	@media (max-width: bp-sm - 1px)
		&__group + &__group
			margin-top: 1rem
		&__header
			gap: 0.75rem
			padding-right: 0.5rem
		&__group-title
			min-width: 3.25rem
		&__item
			gap: 0.5rem
		&__date
			width: 3.5rem
		&__cat
			max-width: 6rem
			overflow: hidden
			text-overflow: ellipsis
			white-space: nowrap

	@media (hover: none)
		&__header:not(:active)
			background: transparent
			box-shadow: none
			transform: none
			&::before
				opacity: 0
/* ==================== 卡片网格视图 ==================== */
.m3-blog-archive[data-view="table"]
	padding-left: 0 !important
	border-left: none !important

.m3-blog-archive__grid
	display: flex
	flex-direction: column
	gap: 1.5rem

.grid-group-title
	display: flex
	align-items: baseline
	gap: 0.7rem
	margin-bottom: 0.85rem
	padding-bottom: 0.5rem
	border-bottom: 1px solid var(--outline-variant)

.grid-group-year
	font-family: var(--ak-mono, monospace)
	font-size: 1.05rem
	font-weight: 700
	letter-spacing: 0.12em
	color: var(--primary)

.grid-group-count
	font-size: 0.72rem
	color: var(--on-surface-variant)

/* 一行两张 */
.grid-cards
	display: grid
	grid-template-columns: repeat(2, minmax(0, 1fr))
	gap: 1rem

/* 卡片 */
.grid-card
	display: flex
	flex-direction: column
	overflow: hidden
	text-decoration: none
	color: var(--on-surface)
	background-color: var(--panel-solid, var(--surface-container-low))
	box-shadow: inset 0 0 0 1px var(--outline-variant)
	clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))
	transition: box-shadow 0.25s, transform 0.25s

	&:hover
		box-shadow: inset 0 0 0 1px var(--primary)
		transform: translateY(-2px)

.grid-card__cover
	position: relative
	width: 100%
	aspect-ratio: 16 / 9
	overflow: hidden
	background: var(--surface-container)

	img
		width: 100%
		height: 100%
		object-fit: cover
		transition: transform 0.4s

.grid-card:hover .grid-card__cover img
	transform: scale(1.04)

.grid-card__placeholder
	position: relative
	display: flex
	align-items: center
	justify-content: center
	width: 100%
	height: 100%
	overflow: hidden

	&[data-idx="0"]
		background: linear-gradient(135deg, #1a3a5c 0%, #0d1f33 100%)
	&[data-idx="1"]
		background: linear-gradient(135deg, #3a2a5c 0%, #1a0d33 100%)
	&[data-idx="2"]
		background: linear-gradient(135deg, #1a5c4a 0%, #0d3329 100%)
	&[data-idx="3"]
		background: linear-gradient(135deg, #5c3a1a 0%, #331f0d 100%)
	&[data-idx="4"]
		background: linear-gradient(135deg, #5c1a2e 0%, #330d19 100%)
	&[data-idx="5"]
		background: linear-gradient(135deg, #2a2a2a 0%, #141414 100%)

	&::before
		content: ""
		position: absolute
		inset: 0
		background-image: linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px)
		background-size: 22px 22px

	&::after
		content: ""
		position: absolute
		top: -50%
		left: -30%
		width: 60%
		height: 200%
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.07), transparent)
		transform: rotate(18deg)

.grid-card__placeholder-mark
	position: relative
	width: 32px
	height: 32px
	border: 1px solid rgba(255, 255, 255, 0.35)
	transform: rotate(45deg)
	box-shadow: 0 0 18px rgba(43, 179, 255, 0.25)

	&::after
		content: ""
		position: absolute
		inset: 9px
		background: rgba(43, 179, 255, 0.6)

.grid-card__placeholder-text
	position: absolute
	bottom: 0.55rem
	right: 0.7rem
	font-family: var(--ak-mono, monospace)
	font-size: 0.5rem
	letter-spacing: 0.26em
	color: rgba(255, 255, 255, 0.4)

.grid-card__body
	display: flex
	flex-direction: column
	gap: 0.45rem
	padding: 0.9rem 1rem 1rem

.grid-card__date
	font-family: var(--ak-mono, monospace)
	font-size: 0.68rem
	letter-spacing: 0.06em
	color: var(--on-surface-variant)

.grid-card__title
	margin: 0
	font-size: 1rem
	font-weight: 700
	line-height: 1.38
	color: var(--on-surface)
	display: -webkit-box
	-webkit-line-clamp: 2
	-webkit-box-orient: vertical
	overflow: hidden

.grid-card:hover .grid-card__title
	color: var(--primary)

.grid-card__tags
	display: flex
	flex-wrap: wrap
	gap: 0.3rem
	margin-top: auto
	padding-top: 0.3rem

.grid-card__tag
	padding: 0.05rem 0.4rem
	font-size: 0.62rem
	color: var(--on-surface-variant)
	background: var(--primary-container)
	box-shadow: inset 0 0 0 1px var(--outline-variant)

@media (max-width: 900px)
	.grid-cards
		grid-template-columns: minmax(0, 1fr)
</style>
