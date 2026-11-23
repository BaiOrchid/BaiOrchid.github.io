<script lang="ts">
/**
 * 显示设置面板
 *
 * 只保留真正生效的两项：
 *   1. 亮色 / 暗色主题
 *   2. 减少动态效果
 *
 * 已移除（方舟皮肤接管，改了不生效）：
 *   - 主题色色相 / 配色风格 / Color Spec / 页面背景 / 背景纹理
 *   - 卡片密度（首页卡片尺寸由 arknights.css 固定）
 */
import AccentBar from "@components/atoms/display/AccentBar.svelte";
import PanelStack from "@components/atoms/display/PanelStack.svelte";
import SegmentedButton from "@components/atoms/selection/SegmentedButton.svelte";
import Switch from "@components/atoms/selection/Switch.svelte";
import {
	AUTO_MODE,
	DARK_MODE,
	LIGHT_MODE,
	THEME_CHANGE_EVENT,
} from "@constants/constants";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import {
	getMotionPreference,
	getStoredTheme,
	setMotionPreference,
	setTheme,
} from "@utils/setting-utils";
import { onMount } from "svelte";
import type { LIGHT_DARK_MODE } from "@/types/config";

let { class: className = "" }: { class?: string } = $props();

let themeMode = $state<LIGHT_DARK_MODE>(AUTO_MODE);
let motionReduced = $state(false);
let lastAppliedTheme: LIGHT_DARK_MODE | null = null;

// 初始值在挂载后读取，避免 SSR 不一致
onMount(() => {
	themeMode = getStoredTheme();
	motionReduced = getMotionPreference();
});

// 主题变化时写入 localStorage 并应用到 <html>
$effect(() => {
	if (lastAppliedTheme === null) {
		lastAppliedTheme = themeMode;
		return;
	}
	if (themeMode === lastAppliedTheme) return;
	lastAppliedTheme = themeMode;
	setTheme(themeMode);
	window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
});

$effect(() => {
	setMotionPreference(motionReduced);
});

const themeOptions = [
	{ value: LIGHT_MODE as LIGHT_DARK_MODE, label: i18n(I18nKey.lightMode) },
	{ value: DARK_MODE as LIGHT_DARK_MODE, label: i18n(I18nKey.darkMode) },
	{ value: AUTO_MODE as LIGHT_DARK_MODE, label: i18n(I18nKey.systemMode) },
];
</script>

<div id="display-setting" class="float-panel float-panel-closed absolute transition-all w-72 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain m3-scroll-contain {className}">
    <PanelStack>
        <!-- 段一：主题 -->
        <div class="p-4 flex flex-col gap-3">
            <div class="flex gap-2 font-bold text-lg text-(--on-surface) relative ml-3">
                <AccentBar size="small" class="absolute -left-3 top-[0.33rem]" />
                {i18n(I18nKey.lightDarkMode)}
            </div>
            <SegmentedButton
                options={themeOptions}
                bind:value={themeMode}
                label={i18n(I18nKey.lightDarkMode)}
            />
        </div>

        <!-- 段二：动效 -->
        <div class="p-4 flex flex-row items-center justify-between gap-3">
            <span class="text-sm font-bold text-(--on-surface) ml-3">{i18n(I18nKey.reduceMotion)}</span>
            <Switch bind:checked={motionReduced} label={i18n(I18nKey.reduceMotion)} icons />
        </div>
    </PanelStack>
</div>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

#display-setting
    z-index: 50
    @media (max-width: bp-sm - 1px)
        width: calc(100vw - 2rem)
</style>
