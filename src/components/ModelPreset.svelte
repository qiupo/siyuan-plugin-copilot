<script lang="ts">
    import { createEventDispatcher, tick, onMount } from 'svelte';
    import { t } from '../utils/i18n';
    import { pushMsg } from '@/api';
    import { confirm } from 'siyuan';
    import MultiModelSelector from './MultiModelSelector.svelte';
    import type { ThinkingEffort } from '../ai-chat';

    export let providers: Record<string, any> = {};
    export let currentProvider = '';
    export let currentModelId = '';
    export let appliedSettings = {
        contextCount: 50,
        maxContextTokens: 16384,
        temperature: 1,
        temperatureEnabled: true,
        systemPrompt: '',
        modelSelectionEnabled: false,
        selectedModels: [] as Array<{
            provider: string;
            modelId: string;
            thinkingEnabled?: boolean;
            thinkingEffort?: ThinkingEffort;
        }>,
        enableMultiModel: false,
        chatMode: 'ask' as 'ask' | 'edit' | 'agent',
        modelThinkingSettings: {} as Record<string, { thinkingEnabled: boolean; thinkingEffort: ThinkingEffort }>,
    };
    export let plugin: any;

    const dispatch = createEventDispatcher();

    let isSettingsOpen = false;
    let isPresetListOpen = false;

    let settingsTop = 0;
    let settingsLeft = 0;
    let presetListTop = 0;
    let presetListLeft = 0;

    let presetButtonElement: HTMLButtonElement;
    let settingsDropdownElement: HTMLDivElement;
    let presetDropdownElement: HTMLDivElement;

    // 模型设置（临时值，用于编辑）
    let tempContextCount = 50;
    let tempMaxContextTokens = 16384; // 最大上下文Token数
    let tempTemperature = 1;
    let tempTemperatureEnabled = false;
    let tempSystemPrompt = '';
    let tempModelSelectionEnabled = false;
    let tempSelectedModels: Array<{
        provider: string;
        modelId: string;
        thinkingEnabled?: boolean;
        thinkingEffort?: ThinkingEffort;
    }> = [];
    let tempEnableMultiModel = false;
    let tempChatMode: 'ask' | 'edit' | 'agent' = 'ask';
    let tempModelThinkingSettings: Record<string, { thinkingEnabled: boolean; thinkingEffort: ThinkingEffort }> = {};

    // 当前正在编辑的预设ID（空字符串表示新建/默认）
    let editingPresetId = '';

    // 预设管理
    interface Preset {
        id: string;
        name: string;
        contextCount: number;
        maxContextTokens?: number; // 最大上下文Token数
        temperature: number;
        temperatureEnabled: boolean;
        systemPrompt: string;
        modelSelectionEnabled: boolean;
        selectedModels: Array<{
            provider: string;
            modelId: string;
            thinkingEnabled?: boolean;
            thinkingEffort?: ThinkingEffort;
        }>;
        enableMultiModel: boolean;
        chatMode: 'ask' | 'edit' | 'agent';
        createdAt: number;
        modelThinkingSettings?: Record<string, { thinkingEnabled: boolean; thinkingEffort: ThinkingEffort }>;
    }

    let presets: Preset[] = [];
    let selectedPresetId: string = '';
    let newPresetName = '新预设';

    // 拖拽排序相关（预设列表）
    let dragSrcIndex: number | null = null;
    let dragOverIndex: number | null = null;
    let dragDirection: 'above' | 'below' | null = null;

    // MultiModelSelector 打开状态
    let isModelSelectorOpen = false;

    // 模型拖拽相关
    let draggedModelIndex: number | null = null;
    let dropModelIndicatorIndex: number | null = null;

    // 预设搜索筛选
    let presetSearchQuery = '';

    // 保存初始状态，用于检测是否有未保存的更改
    let initialState = {
        presetName: '',
        contextCount: 10,
        temperature: 1,
        temperatureEnabled: true,
        systemPrompt: '',
        modelSelectionEnabled: false,
        selectedModels: [] as Array<{
            provider: string;
            modelId: string;
            thinkingEnabled?: boolean;
            thinkingEffort?: ThinkingEffort;
        }>,
        enableMultiModel: false,
        chatMode: 'ask' as 'ask' | 'edit' | 'agent',
        modelThinkingSettings: {} as Record<string, { thinkingEnabled: boolean; thinkingEffort: ThinkingEffort }>,
    };

    // 处理MultiModelSelector的选择事件（单模型模式）
    function handleModelSelect(event: CustomEvent<{ provider: string; modelId: string }>) {
        const { provider, modelId } = event.detail;
        tempSelectedModels = [{ provider, modelId }];
        applySettings();
        isModelSelectorOpen = false;
    }

    // 处理MultiModelSelector的变化事件（多模型模式）
    function handleModelsChange(
        event: CustomEvent<
            Array<{
                provider: string;
                modelId: string;
                thinkingEnabled?: boolean;
                thinkingEffort?: ThinkingEffort;
            }>
        >
    ) {
        tempSelectedModels = event.detail;
        applySettings();
    }

    // 处理MultiModelSelector的多模型开关事件
    function handleToggleMultiModel(event: CustomEvent<boolean>) {
        tempEnableMultiModel = event.detail;
        if (!tempEnableMultiModel && tempSelectedModels.length > 1) {
            tempSelectedModels = [];
        }
        applySettings();
    }

    // 响应式过滤后的预设列表（支持空格分隔的 AND 搜索）
    $: filteredPresets = ((): Preset[] => {
        const q = presetSearchQuery.trim().toLowerCase();
        if (!q) return presets;
        const terms = q.split(/\s+/).filter(Boolean);
        return presets.filter(preset => {
            const hay = (
                (preset.name || '') +
                ' ' +
                (preset.systemPrompt || '') +
                ' ' +
                (preset.chatMode || '') +
                ' ' +
                (preset.selectedModels || [])
                    .map(m => getModelDisplayName(m.provider, m.modelId))
                    .join(' ') +
                ' ' +
                (preset.selectedModels || []).map(m => m.provider).join(' ') +
                ' ' +
                (preset.selectedModels || []).map(m => m.modelId).join(' ')
            ).toLowerCase();
            return terms.every(term => hay.includes(term));
        });
    })();

    // 获取当前模型配置
    function getCurrentModelConfig() {
        if (!currentProvider || !currentModelId) return null;

        let providerConfig: any = null;
        if (providers[currentProvider] && !Array.isArray(providers[currentProvider])) {
            providerConfig = providers[currentProvider];
        } else if (providers.customProviders && Array.isArray(providers.customProviders)) {
            providerConfig = providers.customProviders.find((p: any) => p.id === currentProvider);
        }

        if (!providerConfig) return null;
        return providerConfig.models.find((m: any) => m.id === currentModelId);
    }

    // 获取模型显示名称
    function getModelDisplayName(provider: string, modelId: string): string {
        let providerConfig: any = null;

        // 查找内置平台
        if (providers[provider] && !Array.isArray(providers[provider])) {
            providerConfig = providers[provider];
        } else if (providers.customProviders && Array.isArray(providers.customProviders)) {
            // 查找自定义平台
            providerConfig = providers.customProviders.find((p: any) => p.id === provider);
        }

        if (providerConfig && providerConfig.models) {
            const model = providerConfig.models.find((m: any) => m.id === modelId);
            return model ? model.name : modelId;
        }

        return modelId;
    }

    // 获取当前模型提供商和模型ID的helper函数（单模型模式使用）
    function getCurrentModelSelection(): { provider: string; modelId: string } {
        if (tempSelectedModels.length > 0) {
            return {
                provider: tempSelectedModels[0].provider,
                modelId: tempSelectedModels[0].modelId,
            };
        }
        return { provider: currentProvider, modelId: currentModelId };
    }

    // 格式化预设的模型列表显示
    function formatPresetModels(
        selectedModels: Array<{
            provider: string;
            modelId: string;
            thinkingEnabled?: boolean;
            thinkingEffort?: ThinkingEffort;
        }>
    ): string {
        const modelCounts: Record<string, number> = {};
        selectedModels.forEach(m => {
            const provider =
                providers[m.provider] || providers.customProviders?.find(p => p.id === m.provider);
            const model = provider?.models?.find(model => model.id === m.modelId);
            const modelName = model?.name || m.modelId;
            modelCounts[modelName] = (modelCounts[modelName] || 0) + 1;
        });

        // 格式化显示：模型名 × 次数
        return Object.entries(modelCounts)
            .map(([name, count]) => (count > 1 ? `${name} × ${count}` : name))
            .join(', ');
    }

    // 加载预设
    async function loadPresets() {
        const settings = await plugin.loadSettings();
        presets = settings.modelPresets || [];
        selectedPresetId = settings.selectedModelPresetId || '';
    }

    // 保存预设到设置
    async function savePresetsToStorage() {
        const settings = await plugin.loadSettings();
        settings.modelPresets = presets;
        await plugin.saveSettings(settings);
    }

    // 保存选中的预设ID
    async function saveSelectedPresetId(presetId: string) {
        const settings = await plugin.loadSettings();
        settings.selectedModelPresetId = presetId;
        await plugin.saveSettings(settings);
    }

    // 加载选中的预设ID
    async function loadSelectedPresetId(): Promise<string> {
        const settings = await plugin.loadSettings();
        return settings.selectedModelPresetId || '';
    }

    // 保存当前设置为预设
    async function saveAsPreset() {
        if (!newPresetName.trim()) {
            pushMsg(t('aiSidebar.modelSettings.enterPresetName'));
            return;
        }

        const preset: Preset = {
            id: Date.now().toString(),
            name: newPresetName.trim(),
            contextCount: tempContextCount,
            maxContextTokens: tempMaxContextTokens,
            temperature: tempTemperature,
            temperatureEnabled: tempTemperatureEnabled,
            systemPrompt: tempSystemPrompt,
            modelSelectionEnabled: tempModelSelectionEnabled,
            selectedModels: tempSelectedModels,
            enableMultiModel: tempEnableMultiModel,
            chatMode: tempChatMode,
            modelThinkingSettings: tempModelThinkingSettings,
            createdAt: Date.now(),
        };

        presets = [...presets, preset];
        await savePresetsToStorage();
        newPresetName = '新预设';

        // 自动选择新建的预设
        selectedPresetId = preset.id;
        await saveSelectedPresetId(preset.id);

        pushMsg(t('aiSidebar.modelSettings.presetSaved'));

        // 关闭设置面板
        isSettingsOpen = false;
        openPresetList();
    }

    // 加载预设
    async function loadPreset(presetId: string) {
        if (selectedPresetId === presetId) {
            isPresetListOpen = false;
            return;
        }

        const preset = presets.find(p => p.id === presetId);
        if (preset) {
            tempContextCount = preset.contextCount ?? 50;
            tempMaxContextTokens = preset.maxContextTokens ?? 16384;
            tempTemperature = preset.temperature;
            tempTemperatureEnabled = preset.temperatureEnabled ?? true;
            tempSystemPrompt = preset.systemPrompt;
            tempModelSelectionEnabled = preset.modelSelectionEnabled ?? false;
            tempSelectedModels = [...(preset.selectedModels || [])];
            tempEnableMultiModel = preset.enableMultiModel ?? false;
            tempChatMode = preset.chatMode || 'ask';
            tempModelThinkingSettings = { ...(preset.modelThinkingSettings || {}) };

            selectedPresetId = presetId;
            await saveSelectedPresetId(presetId);

            // 应用预设设置
            dispatch('apply', {
                contextCount: preset.contextCount,
                maxContextTokens: preset.maxContextTokens ?? 16384,
                temperature: preset.temperature,
                temperatureEnabled: preset.temperatureEnabled ?? true,
                systemPrompt: preset.systemPrompt,
                modelSelectionEnabled: preset.modelSelectionEnabled ?? false,
                selectedModels: preset.selectedModels || [],
                enableMultiModel: preset.enableMultiModel ?? false,
                chatMode: preset.chatMode || 'ask',
            });

            pushMsg(`已应用预设: ${preset.name}`);
            isPresetListOpen = false;
        }
    }

    async function selectPreset(presetId: string) {
        await loadPreset(presetId);
    }

    // 编辑预设（打开设置面板）
    async function editPreset(presetId: string) {
        const preset = presets.find(p => p.id === presetId);
        if (!preset) return;

        editingPresetId = presetId;
        newPresetName = preset.name;
        tempContextCount = preset.contextCount ?? 50;
        tempMaxContextTokens = preset.maxContextTokens ?? 16384;
        tempTemperature = preset.temperature;
        tempTemperatureEnabled = preset.temperatureEnabled ?? false;
        tempSystemPrompt = preset.systemPrompt;
        tempModelSelectionEnabled = preset.modelSelectionEnabled ?? false;
        tempSelectedModels = [...(preset.selectedModels || [])];
        tempEnableMultiModel = preset.enableMultiModel ?? false;
        tempChatMode = preset.chatMode || 'ask';

        // 保存初始状态
        saveInitialState();

        isPresetListOpen = false;
        isSettingsOpen = true;
        updateSettingsPosition();
        setTimeout(() => {
            document.addEventListener('click', closeSettingsOnOutsideClick);
        }, 0);
    }

    async function configurePreset(presetId: string) {
        await editPreset(presetId);
    }

    function backToPresetList() {
        isSettingsOpen = false;
        editingPresetId = '';
        document.removeEventListener('click', closeSettingsOnOutsideClick);
        openPresetList();
    }

    // 删除预设
    function deletePreset(presetId: string) {
        // 临时移除外部点击监听器
        document.removeEventListener('click', closePresetListOnOutsideClick);

        confirm(
            t('aiSidebar.modelSettings.deletePreset'),
            t('aiSidebar.modelSettings.confirmDelete'),
            async () => {
                presets = presets.filter(p => p.id !== presetId);
                await savePresetsToStorage();
                if (selectedPresetId === presetId) {
                    if (presets.length > 0) {
                        // 如果还有其他预设，自动加载第一个
                        await loadPreset(presets[0].id);
                    } else {
                        // 如果没有预设了，重置为默认
                        await resetToDefaults();
                    }
                }
                pushMsg(t('aiSidebar.modelSettings.presetDeleted'));

                // 重新添加外部点击监听器
                setTimeout(() => {
                    if (isPresetListOpen) {
                        document.addEventListener('click', closePresetListOnOutsideClick);
                    }
                }, 0);
            },
            () => {
                // 用户取消删除，重新添加外部点击监听器
                setTimeout(() => {
                    if (isPresetListOpen) {
                        document.addEventListener('click', closePresetListOnOutsideClick);
                    }
                }, 0);
            }
        );
    }

    // 拖拽开始
    function handleDragStart(e: DragEvent, index: number) {
        dragSrcIndex = index;
        dragDirection = null;
        try {
            e.dataTransfer?.setData('text/plain', String(index));
            e.dataTransfer!.effectAllowed = 'move';
        } catch (err) {
            // ignore
        }
        const el = e.currentTarget as HTMLElement | null;
        if (el) el.classList.add('dragging');
    }

    function handleDragOver(e: DragEvent, index: number) {
        e.preventDefault();
        dragOverIndex = index;
        if (dragSrcIndex !== null) {
            if (index < dragSrcIndex) {
                dragDirection = 'above';
            } else if (index > dragSrcIndex) {
                dragDirection = 'below';
            } else {
                dragDirection = null;
            }
        }
    }

    async function handleDrop(e: DragEvent, index: number) {
        e.preventDefault();
        if (dragSrcIndex === null) return;
        const src = dragSrcIndex;
        let dest = index;
        if (src === dest) {
            cleanupDrag();
            return;
        }

        // 根据拖拽方向调整目标位置
        if (dragDirection === 'below') {
            dest = index + 1;
        }

        const item = presets[src];
        presets.splice(src, 1);
        const adjustedDest = src < dest ? dest - 1 : dest;
        presets.splice(adjustedDest, 0, item);
        presets = [...presets];
        await savePresetsToStorage();
        cleanupDrag();
    }

    function handleDragEnd() {
        cleanupDrag();
    }

    function cleanupDrag() {
        dragSrcIndex = null;
        dragOverIndex = null;
        dragDirection = null;
        const els = document.querySelectorAll('.model-settings-preset-list-item.dragging');
        els.forEach(el => el.classList.remove('dragging'));
    }

    // 模型拖拽开始
    function handleModelDragStart(event: DragEvent, index: number) {
        event.stopPropagation();
        draggedModelIndex = index;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('application/model-sort', 'true');
        }
    }

    // 模型拖拽经过
    function handleModelDragOver(event: DragEvent, index: number) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }

        if (draggedModelIndex !== null && draggedModelIndex !== index) {
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            const y = event.clientY - rect.top;
            const height = rect.height;

            if (y < height / 2) {
                dropModelIndicatorIndex = index;
            } else {
                dropModelIndicatorIndex = index + 1;
            }
        }
    }

    // 模型拖拽放置
    function handleModelDrop(event: DragEvent, dropIndex: number) {
        event.preventDefault();
        event.stopPropagation();
        if (draggedModelIndex !== null) {
            let targetIndex = dropModelIndicatorIndex;

            if (targetIndex === null) {
                targetIndex = dropIndex;
            }

            if (
                targetIndex !== null &&
                targetIndex !== draggedModelIndex &&
                targetIndex !== draggedModelIndex + 1
            ) {
                const newModels = [...tempSelectedModels];
                const [draggedItem] = newModels.splice(draggedModelIndex, 1);

                let adjustedTargetIndex = targetIndex;
                if (targetIndex > draggedModelIndex) {
                    adjustedTargetIndex -= 1;
                }

                newModels.splice(adjustedTargetIndex, 0, draggedItem);
                tempSelectedModels = newModels;
            }
        }
        draggedModelIndex = null;
        dropModelIndicatorIndex = null;
    }

    // 模型拖拽结束
    function handleModelDragEnd() {
        draggedModelIndex = null;
        dropModelIndicatorIndex = null;
    }

    // 上移模型
    function moveModelUp(index: number) {
        if (index > 0) {
            const newModels = [...tempSelectedModels];
            [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
            tempSelectedModels = newModels;
        }
    }

    // 下移模型
    function moveModelDown(index: number) {
        if (index < tempSelectedModels.length - 1) {
            const newModels = [...tempSelectedModels];
            [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
            tempSelectedModels = newModels;
        }
    }

    // 移除选中的模型
    function removeSelectedModel(index: number) {
        const newModels = tempSelectedModels.filter((_, i) => i !== index);
        tempSelectedModels = newModels;
    }
    // 实时应用设置
    function applySettings() {
        dispatch('apply', {
            contextCount: tempContextCount,
            maxContextTokens: tempMaxContextTokens,
            temperature: tempTemperature,
            temperatureEnabled: tempTemperatureEnabled,
            systemPrompt: tempSystemPrompt,
            modelSelectionEnabled: tempModelSelectionEnabled,
            selectedModels: tempSelectedModels,
            enableMultiModel: tempEnableMultiModel,
            chatMode: tempChatMode,
        });

        // 注意：编辑预设时不自动保存，只有点击保存按钮才保存
    }

    // 比较两个模型数组是否相等
    function areModelsEqual(
        models1: Array<{
            provider: string;
            modelId: string;
            thinkingEnabled?: boolean;
            thinkingEffort?: ThinkingEffort;
        }>,
        models2: Array<{
            provider: string;
            modelId: string;
            thinkingEnabled?: boolean;
            thinkingEffort?: ThinkingEffort;
        }>
    ): boolean {
        if (models1.length !== models2.length) return false;
        return models1.every((m1, index) => {
            const m2 = models2[index];
            return (
                m1.provider === m2.provider &&
                m1.modelId === m2.modelId &&
                m1.thinkingEnabled === m2.thinkingEnabled &&
                m1.thinkingEffort === m2.thinkingEffort
            );
        });
    }

    // 比较两个thinking settings对象是否相等
    function areThinkingSettingsEqual(
        settings1: Record<string, boolean>,
        settings2: Record<string, boolean>
    ): boolean {
        const keys1 = Object.keys(settings1);
        const keys2 = Object.keys(settings2);
        if (keys1.length !== keys2.length) return false;
        return keys1.every(key => settings1[key] === settings2[key]);
    }

    // 监听设置值的变化，自动应用
    $: if (
        isSettingsOpen &&
        (!editingPresetId || editingPresetId === selectedPresetId) &&
        (tempContextCount !== appliedSettings.contextCount ||
            tempMaxContextTokens !== (appliedSettings.maxContextTokens ?? 16384) ||
            tempTemperature !== appliedSettings.temperature ||
            tempTemperatureEnabled !== appliedSettings.temperatureEnabled ||
            tempSystemPrompt !== appliedSettings.systemPrompt ||
            tempModelSelectionEnabled !== (appliedSettings.modelSelectionEnabled ?? false) ||
            !areModelsEqual(tempSelectedModels, appliedSettings.selectedModels || []) ||
            tempEnableMultiModel !== (appliedSettings.enableMultiModel ?? false) ||
            tempChatMode !== (appliedSettings.chatMode ?? 'ask') ||
            !areThinkingSettingsEqual(
                tempModelThinkingSettings,
                appliedSettings.modelThinkingSettings || {}
            ))
    ) {
        applySettings();
    }
    
    // 计算当前是否与选中的预设不一致
    $: isModified = (() => {
        const targetId = editingPresetId || selectedPresetId;
        if (!targetId) return false;
        const preset = presets.find(p => p.id === targetId);
        if (!preset) return false;
        
        return (
            preset.contextCount !== tempContextCount ||
            (preset.maxContextTokens ?? 16384) !== tempMaxContextTokens ||
            preset.temperature !== tempTemperature ||
            (preset.temperatureEnabled ?? true) !== tempTemperatureEnabled ||
            preset.systemPrompt !== tempSystemPrompt ||
            (preset.modelSelectionEnabled ?? false) !== tempModelSelectionEnabled ||
            !areModelsEqual(preset.selectedModels || [], tempSelectedModels) ||
            (preset.enableMultiModel ?? false) !== tempEnableMultiModel ||
            (preset.chatMode || 'ask') !== tempChatMode ||
            !areThinkingSettingsEqual(preset.modelThinkingSettings || {}, tempModelThinkingSettings)
        );
    })();

    // 更新预设
    async function updatePreset(presetId: string) {
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
            // 如果名称有变更且不为空，则更新名称
            if (newPresetName.trim() && newPresetName.trim() !== preset.name) {
                preset.name = newPresetName.trim();
            }
            preset.contextCount = tempContextCount;
            preset.maxContextTokens = tempMaxContextTokens;
            preset.temperature = tempTemperature;
            preset.temperatureEnabled = tempTemperatureEnabled;
            preset.systemPrompt = tempSystemPrompt;
            preset.modelSelectionEnabled = tempModelSelectionEnabled;
            preset.selectedModels = tempSelectedModels;
            preset.enableMultiModel = tempEnableMultiModel;
            preset.chatMode = tempChatMode;
            preset.modelThinkingSettings = tempModelThinkingSettings;
            await savePresetsToStorage();
            // 触发响应式更新
            presets = [...presets];

            // 关闭设置面板
            isSettingsOpen = false;
            openPresetList();
        }
    }

    // 重置临时值为当前应用的设置
    async function resetToAppliedSettings() {
        tempContextCount = appliedSettings.contextCount ?? 50;
        tempMaxContextTokens = appliedSettings.maxContextTokens ?? 16384;
        tempTemperature = appliedSettings.temperature;
        tempTemperatureEnabled = appliedSettings.temperatureEnabled ?? false;
        tempSystemPrompt = appliedSettings.systemPrompt;
        tempModelSelectionEnabled = appliedSettings.modelSelectionEnabled ?? false;
        tempSelectedModels = [...(appliedSettings.selectedModels || [])];
        tempEnableMultiModel = appliedSettings.enableMultiModel ?? false;
        tempChatMode = appliedSettings.chatMode ?? 'ask';

        // 检查当前应用的设置是否与某个预设匹配
        const savedPresetId = await loadSelectedPresetId();
        if (savedPresetId) {
            const preset = presets.find(p => p.id === savedPresetId);
            if (preset) {
                // 原本的逻辑会检查参数是否一致，如果不一致则置空选中状态
                // 现在保留这个检查逻辑结构，但修改行为：即使参数不一致，也保持选中状态，避免预设自动跳变
                const isMatch =
                    preset.contextCount === appliedSettings.contextCount &&
                    (preset.maxContextTokens ?? 16384) === (appliedSettings.maxContextTokens ?? 16384) &&
                    preset.temperature === appliedSettings.temperature &&
                    (preset.temperatureEnabled ?? true) ===
                        (appliedSettings.temperatureEnabled ?? true) &&
                    preset.systemPrompt === appliedSettings.systemPrompt &&
                    (preset.modelSelectionEnabled ?? false) ===
                        (appliedSettings.modelSelectionEnabled ?? false) &&
                    areModelsEqual(preset.selectedModels || [], appliedSettings.selectedModels || []) &&
                    (preset.enableMultiModel ?? false) ===
                        (appliedSettings.enableMultiModel ?? false) &&
                    (preset.chatMode || 'ask') === (appliedSettings.chatMode ?? 'ask') &&
                    areThinkingSettingsEqual(
                        preset.modelThinkingSettings || {},
                        appliedSettings.modelThinkingSettings || {}
                    );

                if (isMatch) {
                    selectedPresetId = savedPresetId;
                } else {
                    // 即使不匹配，也保持选中状态（用户需求：预设只能在点击列表时变化）
                    selectedPresetId = savedPresetId;
                }
            } else {
                selectedPresetId = '';
                // 如果预设不存在了，清除保存的选中状态
                await saveSelectedPresetId('');
            }
        } else {
            selectedPresetId = '';
        }
    }

    function initTempVarsToDefaults() {
        const modelConfig = getCurrentModelConfig();
        tempContextCount = 50;
        tempTemperature = modelConfig?.temperature ?? 0.7;
        tempTemperatureEnabled = true;
        tempSystemPrompt = '';
        tempModelSelectionEnabled = false;
        tempSelectedModels = [];
        tempEnableMultiModel = false;
        tempChatMode = 'ask';
        tempModelThinkingSettings = {};
        editingPresetId = '';
        newPresetName = '新预设';
    }

    // 重置为默认值
    async function resetToDefaults() {
        initTempVarsToDefaults();
        selectedPresetId = '';
        await saveSelectedPresetId('');
        // 保存初始状态
        saveInitialState();
    }
    // 关闭设置下拉菜单
    function closeSettingsOnOutsideClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (
            !target.closest('.model-settings-preset-btn') &&
            !target.closest('.model-settings-dropdown')
        ) {
            isSettingsOpen = false;
            editingPresetId = '';
            document.removeEventListener('click', closeSettingsOnOutsideClick);
        }
    }

    // 打开设置面板
    async function openSettingsPanel() {
        await resetToAppliedSettings();
        isPresetListOpen = false;
        isSettingsOpen = true;
        editingPresetId = '';
        updateSettingsPosition();
        setTimeout(() => {
            document.addEventListener('click', closeSettingsOnOutsideClick);
        }, 0);
    }

    async function openNewPresetPanel() {
        initTempVarsToDefaults();
        isPresetListOpen = false;
        isSettingsOpen = true;
        editingPresetId = '';
        updateSettingsPosition();
        setTimeout(() => {
            document.addEventListener('click', closeSettingsOnOutsideClick);
        }, 0);
    }

    // 打开预设列表
    async function openPresetList() {
        isPresetListOpen = true;
    }

    // 保存初始状态
    function saveInitialState() {
        initialState = {
            presetName: newPresetName,
            contextCount: tempContextCount,
            temperature: tempTemperature,
            temperatureEnabled: tempTemperatureEnabled,
            systemPrompt: tempSystemPrompt,
            modelSelectionEnabled: tempModelSelectionEnabled,
            selectedModels: [...tempSelectedModels],
            enableMultiModel: tempEnableMultiModel,
            chatMode: tempChatMode,
            modelThinkingSettings: { ...tempModelThinkingSettings },
        };
    }

    // 检查是否有未保存的更改
    function hasUnsavedChanges(): boolean {
        if (newPresetName !== initialState.presetName) return true;
        if (tempContextCount !== initialState.contextCount) return true;
        if (tempTemperature !== initialState.temperature) return true;
        if (tempTemperatureEnabled !== initialState.temperatureEnabled) return true;
        if (tempSystemPrompt !== initialState.systemPrompt) return true;
        if (tempModelSelectionEnabled !== initialState.modelSelectionEnabled) return true;
        if (tempEnableMultiModel !== initialState.enableMultiModel) return true;
        if (tempChatMode !== initialState.chatMode) return true;
        if (!areModelsEqual(tempSelectedModels, initialState.selectedModels)) return true;
        if (!areThinkingSettingsEqual(tempModelThinkingSettings, initialState.modelThinkingSettings || {})) return true;
        return false;
    }

    // 安全关闭设置面板（带未保存更改确认）
    async function safeCloseSettings() {
        if (!hasUnsavedChanges()) {
            isSettingsOpen = false;
            openPresetList();
            return;
        }

        // 临时移除外部点击监听器
        document.removeEventListener('click', closeOnOutsideClick);

        confirm(
            t('aiSidebar.modelSettings.unsavedChanges') || '未保存的更改',
            t('aiSidebar.modelSettings.confirmClose') || '您有未保存的更改，是否保存预设？',
            async () => {
                // 用户选择保存
                if (editingPresetId) {
                    await updatePreset(editingPresetId);
                } else {
                    await saveAsPreset();
                }
                // 重新添加外部点击监听器
                setTimeout(() => {
                    if (isPresetListOpen) {
                        document.addEventListener('click', closeOnOutsideClick);
                    }
                }, 0);
            },
            () => {
                // 用户选择不保存，直接关闭
                isSettingsOpen = false;
                openPresetList();
                // 重新添加外部点击监听器
                setTimeout(() => {
                    if (isPresetListOpen) {
                        document.addEventListener('click', closeOnOutsideClick);
                    }
                }, 0);
            }
        );
    }

    // 关闭所有弹窗
    async function closeAll() {
        isPresetListOpen = false;
        isSettingsOpen = false;
        await loadPresets();
        await resetToAppliedSettings();
        updatePresetListPosition();
        setTimeout(() => {
            document.addEventListener('click', closePresetListOnOutsideClick);
        }, 0);
    }

    // 关闭预设列表
    function closePresetListOnOutsideClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (
            !target.closest('.model-settings-preset-btn') &&
            !target.closest('.model-settings-preset-list-popup')
        ) {
            isPresetListOpen = false;
            document.removeEventListener('click', closePresetListOnOutsideClick);
        }
    }

    // 打开/关闭预设列表
    function togglePresetList() {
        if (!isPresetListOpen) {
            openPresetList();
        } else {
            isPresetListOpen = false;
            document.removeEventListener('click', closePresetListOnOutsideClick);
        }
    }

    // 计算设置下拉菜单位置
    async function updateSettingsPosition() {
        if (!presetButtonElement || !isSettingsOpen) return;

        await tick();

        const rect = presetButtonElement.getBoundingClientRect();
        const dropdownWidth = settingsDropdownElement?.offsetWidth || 360;
        const dropdownHeight = settingsDropdownElement?.offsetHeight || 400;

        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        if (spaceAbove >= dropdownHeight || spaceAbove >= spaceBelow) {
            settingsTop = rect.top - dropdownHeight - 4;
        } else {
            settingsTop = rect.bottom + 4;
        }

        settingsLeft = rect.left;

        if (settingsLeft + dropdownWidth > window.innerWidth - 8) {
            settingsLeft = window.innerWidth - dropdownWidth - 8;
        }

        if (settingsLeft < 8) {
            settingsLeft = 8;
        }
    }

    // 计算预设列表下拉菜单位置
    async function updatePresetListPosition() {
        if (!presetButtonElement || !isPresetListOpen) return;

        await tick();

        const rect = presetButtonElement.getBoundingClientRect();
        const dropdownWidth = presetDropdownElement?.offsetWidth || 360;
        const dropdownHeight = presetDropdownElement?.offsetHeight || 400;

        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        if (spaceAbove >= dropdownHeight || spaceAbove >= spaceBelow) {
            presetListTop = rect.top - dropdownHeight - 4;
        } else {
            presetListTop = rect.bottom + 4;
        }

        presetListLeft = rect.left;

        if (presetListLeft + dropdownWidth > window.innerWidth - 8) {
            presetListLeft = window.innerWidth - dropdownWidth - 8;
        }

        if (presetListLeft < 8) {
            presetListLeft = 8;
        }
    }

    // 关闭下拉菜单
    async function closeOnOutsideClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.model-settings-button')) {
            // 如果设置面板打开，检查未保存的更改
            if (isSettingsOpen && hasUnsavedChanges()) {
                event.preventDefault();
                event.stopPropagation();
                await safeCloseSettings();
                return;
            }
            isPresetListOpen = false;
            isSettingsOpen = false;
            document.removeEventListener('click', closeOnOutsideClick);
        }
    }

    // 处理设置面板内的点击，关闭模型选择器（如果点击的不是选择器区域）
    function handleSettingsPanelClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        // 如果点击的不是 MultiModelSelector 区域，则关闭选择器
        if (isModelSelectorOpen && !target.closest('.multi-model-selector')) {
            isModelSelectorOpen = false;
        }
    }

    // 打开/关闭弹窗
    function toggleDropdown() {
        if (!isPresetListOpen && !isSettingsOpen) {
            openPresetList();
        } else {
            isPresetListOpen = false;
            document.removeEventListener('click', closeOnOutsideClick);
        }
    }

    $: if (isPresetListOpen && presets) {
        updatePresetListPosition();
    }

    $: if (isSettingsOpen) {
        updateSettingsPosition();
    }

    // 组件挂载时，自动加载上次选择的预设
    onMount(() => {
        (async () => {
            await loadPresets();
            const savedPresetId = await loadSelectedPresetId();
            if (savedPresetId) {
                const preset = presets.find(p => p.id === savedPresetId);
                if (preset) {
                    // 自动应用保存的预设
                    dispatch('apply', {
                        contextCount: preset.contextCount,
                        temperature: preset.temperature,
                        temperatureEnabled: preset.temperatureEnabled ?? true,
                        systemPrompt: preset.systemPrompt,
                        modelSelectionEnabled: preset.modelSelectionEnabled ?? false,
                        selectedModels: [...(preset.selectedModels || [])],
                        enableMultiModel: preset.enableMultiModel ?? false,
                        chatMode: preset.chatMode || 'ask',
                    });
                    selectedPresetId = savedPresetId;
                } else {
                    // 预设已被删除，清除保存的ID
                    await saveSelectedPresetId('');
                }
            }
        })();
    });

    // 计算当前按钮上要显示的预设名称
    $: currentPresetName = (() => {
        if (selectedPresetId) {
            const preset = presets.find(p => p.id === selectedPresetId);
            return preset ? preset.name : '预设';
        }
        return '';
    })();

    // 计算设置面板标题上要显示的预设名称
    $: settingsPanelTitle = (() => {
        const targetId = editingPresetId || selectedPresetId;
        if (targetId) {
            const preset = presets.find(p => p.id === targetId);
            return preset ? preset.name : t('aiSidebar.modelSettings.title');
        }
        return t('aiSidebar.modelSettings.title');
    })();
</script>

<div class="model-settings-button-group">
    <!-- 1. 预设切换按钮 -->
    <button
        bind:this={presetButtonElement}
        class="b3-button b3-button--text model-settings-preset-btn"
        on:click|stopPropagation={togglePresetList}
        title={t('aiSidebar.modelSettings.switchPreset') || '切换预设'}
    >
        {#if currentPresetName !== '预设'}
            <span class="model-settings-button__label">
                {currentPresetName}
            </span>
        {:else}
             <span>{t('aiSidebar.modelSettings.preset') || '预设'}</span>
        {/if}
        <svg class="b3-button__icon b3-button__icon--small"><use xlink:href="#iconDown"></use></svg>
    </button>
    
    <!-- 2. 设置按钮 (已移至列表内) -->
    <!--
    <button
        bind:this={settingsButtonElement}
        class="b3-button b3-button--text model-settings-trigger-btn"
        on:click|stopPropagation={toggleSettings}
        title={t('aiSidebar.modelSettings.title')}
    >
        <svg class="b3-button__icon"><use xlink:href="#iconModelSetting"></use></svg>
    </button>
    -->

    <!-- 预设列表弹窗 -->
    {#if isPresetListOpen}
        <div
            bind:this={presetDropdownElement}
            class="model-settings-preset-list-popup"
            style="top: {presetListTop}px; left: {presetListLeft}px;"
            on:click|stopPropagation
        >
            <div class="model-settings-preset-list-header">
                <h4>{t('aiSidebar.modelSettings.title')}</h4>
                <div class="model-settings-preset-list-actions">
                    <button
                        class="b3-button b3-button--text"
                        on:click={() => (isPresetListOpen = false)}
                        title={t('common.close')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
            </div>

            <div class="model-settings-preset-list-content">
                <!-- 新建预设按钮 -->
                <div class="model-settings-preset-list-new">
                    <button
                        class="b3-button b3-button--primary"
                        on:click={openNewPresetPanel}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconAdd"></use></svg>
                        {t('aiSidebar.modelSettings.createNewPreset') || '新建预设'}
                    </button>
                </div>

                <!-- 预设搜索框 -->
                {#if presets.length > 0}
                    <div class="model-settings-preset-search">
                        <input
                            type="text"
                            class="b3-text-field"
                            placeholder={t('aiSidebar.modelSettings.searchPresets') || '搜索预设'}
                            bind:value={presetSearchQuery}
                        />
                    </div>
                {/if}

                <!-- 预设列表 -->
                {#if presets.length > 0}
                    {#if filteredPresets.length > 0}
                        <div class="model-settings-preset-list-items">
                            {#each filteredPresets as preset, index}
                                <div
                                    class="model-settings-preset-list-item"
                                    class:selected={selectedPresetId === preset.id}
                                    draggable="true"
                                    on:dragstart|stopPropagation={e => handleDragStart(e, index)}
                                    on:dragover|preventDefault|stopPropagation={e =>
                                        handleDragOver(e, index)}
                                    on:drop|stopPropagation={e => handleDrop(e, index)}
                                    on:dragend={handleDragEnd}
                                    class:drag-over={dragOverIndex === index}
                                    class:drag-over-above={dragOverIndex === index &&
                                        dragDirection === 'above'}
                                    class:drag-over-below={dragOverIndex === index &&
                                        dragDirection === 'below'}
                                >
                                    <div
                                        class="model-settings-preset-list-item-info"
                                        on:click={() => selectPreset(preset.id)}
                                        role="button"
                                        tabindex="0"
                                        on:keydown={e =>
                                            e.key === 'Enter' && selectPreset(preset.id)}
                                    >
                                        {#if selectedPresetId === preset.id}
                                            <svg class="model-settings-preset-selected-icon">
                                                <use xlink:href="#iconCheck"></use>
                                            </svg>
                                        {:else}
                                            <div class="model-settings-preset-empty-icon"></div>
                                        {/if}
                                        <div class="model-settings-preset-list-item-content">
                                            <span class="preset-name">{preset.name}</span>
                                            <div class="model-settings-preset-details">
                                                {t('aiSidebar.modelSettings.contextCount')}: {preset.contextCount}
                                                {#if preset.temperatureEnabled ?? true}
                                                    | {t('aiSidebar.modelSettings.temperature')}: {preset.temperature.toFixed(
                                                        2
                                                    )}
                                                {/if}
                                                {#if preset.chatMode}
                                                    | {t('aiSidebar.modelSettings.chatMode')}: {t(
                                                        `aiSidebar.mode.${preset.chatMode}`
                                                    ) || preset.chatMode}
                                                {/if}
                                                {#if preset.modelSelectionEnabled && preset.selectedModels && preset.selectedModels.length > 0}
                                                    <br />
                                                    <span class="model-settings-preset-models">
                                                        {#if preset.enableMultiModel}
                                                            {t(
                                                                'aiSidebar.modelSettings.multiModel'
                                                            ) || '多模型'}:
                                                        {:else}
                                                            {t('aiSidebar.modelSettings.model') ||
                                                                '模型'}:
                                                        {/if}
                                                        {formatPresetModels(preset.selectedModels)}
                                                    </span>
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                    <div class="model-settings-preset-list-item-actions">
                                        <button
                                            class="b3-button b3-button--text"
                                            on:click|stopPropagation={() => editPreset(preset.id)}
                                            title={t('aiSidebar.modelSettings.editPreset') ||
                                                '编辑预设'}
                                        >
                                            <svg class="b3-button__icon">
                                                <use xlink:href="#iconEdit"></use>
                                            </svg>
                                        </button>
                                        <button
                                            class="b3-button b3-button--text"
                                            on:click|stopPropagation={() => deletePreset(preset.id)}
                                            title={t('aiSidebar.modelSettings.deletePreset')}
                                        >
                                            <svg class="b3-button__icon">
                                                <use xlink:href="#iconTrashcan"></use>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else if presetSearchQuery.trim()}
                        <div class="model-settings-preset-list-empty">
                            {t('aiSidebar.modelSettings.noResults') || '无匹配结果'}
                        </div>
                    {:else}
                        <div class="model-settings-preset-list-empty">
                            {t('aiSidebar.modelSettings.noPresets')}
                        </div>
                    {/if}
                {:else}
                    <div class="model-settings-preset-list-empty">
                        {t('aiSidebar.modelSettings.noPresets')}
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- 4. 详细设置面板 -->
    {#if isSettingsOpen}
        <div
            bind:this={settingsDropdownElement}
            class="model-settings-dropdown"
            style="top: {settingsTop}px; left: {settingsLeft}px;"
            on:click|stopPropagation={handleSettingsPanelClick}
        >
            <div class="model-settings-header">
                <h4>
                    {#if editingPresetId || selectedPresetId}
                        {settingsPanelTitle} {isModified ? '*' : ''}
                    {:else}
                        {t('aiSidebar.modelSettings.title')}
                    {/if}
                </h4>
                <div class="model-settings-header-actions">
                    <!-- 如果有修改，显示更新按钮 -->
                    {#if (editingPresetId || selectedPresetId) && isModified}
                        <button 
                            class="b3-button b3-button--small b3-button--text"
                            on:click={() => updatePreset(editingPresetId || selectedPresetId)}
                            title={t('aiSidebar.modelSettings.updatePreset') || '更新预设'}
                        >
                             <svg class="b3-button__icon"><use xlink:href="#iconRefresh"></use></svg>
                             {t('aiSidebar.modelSettings.save') || '保存'}
                        </button>
                    {/if}

                    <button
                        class="b3-button b3-button--text"
                        on:click={safeCloseSettings}
                        title={t('common.back') || '返回'}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconBack"></use></svg>
                    </button>
                    <button
                        class="b3-button b3-button--text"
                        on:click={safeCloseSettings}
                        title={t('common.close')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
            </div>

            <div class="model-settings-content">
                <!-- 预设名称 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.presetName')}
                    </label>
                    <div class="model-settings-preset-new">
                        <input
                            type="text"
                            bind:value={newPresetName}
                            on:input={applySettings}
                            class="b3-text-field"
                            placeholder={t('aiSidebar.modelSettings.enterPresetName')}
                        />
                    </div>
                </div>

                <!-- 上下文数设置 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.contextCount')}
                        <span class="model-settings-value">{tempContextCount}</span>
                    </label>
                    <input
                        type="range"
                        min="1"
                        max="1000"
                        step="1"
                        bind:value={tempContextCount}
                        on:change={applySettings}
                        class="b3-slider"
                    />
                    <div class="model-settings-hint">
                        {t('aiSidebar.modelSettings.contextCountHint')}
                    </div>
                </div>

                <!-- Max Context Tokens Setting -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.maxContextTokens') || 'Max Tokens'}
                        <span class="model-settings-value">{tempMaxContextTokens}</span>
                    </label>
                    <input
                        type="range"
                        min="1024"
                        max="200000"
                        step="1024"
                        bind:value={tempMaxContextTokens}
                        on:change={applySettings}
                        class="b3-slider"
                    />
                    <div class="model-settings-hint">
                        {t('aiSidebar.modelSettings.maxContextTokensHint') || 'Limit context by token count (approximate)'}
                    </div>
                </div>

                <!-- Temperature设置 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.temperature')}
                        <span class="model-settings-value">{tempTemperature.toFixed(2)}</span>
                    </label>
                    <div class="model-settings-checkbox">
                        <input
                            type="checkbox"
                            id="temperature-enabled"
                            bind:checked={tempTemperatureEnabled}
                            on:change={applySettings}
                            class="b3-switch"
                        />
                        <label for="temperature-enabled">
                            {t('aiSidebar.modelSettings.enableTemperature') ||
                                '启用Temperature调整'}
                        </label>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.01"
                        bind:value={tempTemperature}
                        on:change={applySettings}
                        class="b3-slider"
                        disabled={!tempTemperatureEnabled}
                    />
                    <div class="model-settings-hint">
                        {t('aiSidebar.modelSettings.temperatureHint')}
                    </div>
                </div>

                <!-- 系统提示词设置 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.systemPrompt')}
                    </label>
                    <textarea
                        bind:value={tempSystemPrompt}
                        on:change={applySettings}
                        class="b3-text-field model-settings-textarea"
                        placeholder={t('aiSidebar.modelSettings.systemPromptPlaceholder')}
                        rows="4"
                    ></textarea>
                    <div class="model-settings-hint">
                        {t('aiSidebar.modelSettings.systemPromptHint')}
                    </div>
                </div>

                <!-- 聊天模式设置 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.chatMode') || '聊天模式'}
                    </label>
                    <select
                        bind:value={tempChatMode}
                        class="b3-select"
                        on:change={() => {
                            if (tempChatMode !== 'ask' && tempEnableMultiModel) {
                                tempEnableMultiModel = false;
                            }
                            applySettings();
                        }}
                    >
                        <option value="ask">{t('aiSidebar.mode.ask') || '问答模式'}</option>
                        <option value="edit">{t('aiSidebar.mode.edit') || '编辑模式'}</option>
                        <option value="agent">{t('aiSidebar.mode.agent') || 'Agent模式'}</option>
                    </select>
                    <div class="model-settings-hint">
                        {t('aiSidebar.modelSettings.chatModeHint') ||
                            '选择聊天模式，只有问答模式支持多模型'}
                    </div>
                </div>

                <!-- 模型选择设置 -->
                <div class="model-settings-item">
                    <div class="model-settings-checkbox">
                        <input
                            type="checkbox"
                            id="model-selection-enabled"
                            bind:checked={tempModelSelectionEnabled}
                            on:change={applySettings}
                            class="b3-switch"
                        />
                        <label for="model-selection-enabled">
                            {t('aiSidebar.modelSettings.enableModelSelection') || '启用模型选择'}
                        </label>
                    </div>

                    {#if tempModelSelectionEnabled}
                        <div class="model-settings-model-selector">
                            <!-- 使用 MultiModelSelector 组件 -->
                            <MultiModelSelector
                                {providers}
                                selectedModels={tempSelectedModels}
                                bind:isOpen={isModelSelectorOpen}
                                enableMultiModel={tempEnableMultiModel}
                                currentProvider={getCurrentModelSelection().provider}
                                currentModelId={getCurrentModelSelection().modelId}
                                chatMode={tempChatMode}
                                on:select={handleModelSelect}
                                on:change={handleModelsChange}
                                on:toggleEnable={handleToggleMultiModel}
                            />
                        </div>
                    {/if}

                    <div class="model-settings-hint">
                        {t('aiSidebar.modelSettings.modelSelectionHint') ||
                            '启用后，应用预设时会自动切换到选择的模型'}
                    </div>
                </div>

                <!-- 保存为新预设 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.saveAsPreset') || '保存为新预设'}
                    </label>
                    <div class="model-settings-save-preset">
                        <input
                            type="text"
                            bind:value={newPresetName}
                            class="b3-text-field"
                            placeholder={t('aiSidebar.modelSettings.presetName')}
                            on:keydown={e => e.key === 'Enter' && saveAsPreset()}
                        />
                        <button
                            class="b3-button b3-button--primary"
                            on:click={saveAsPreset}
                        >
                            {t('aiSidebar.modelSettings.save') || '保存'}
                        </button>
                    </div>
                </div>
            </div>

            <div class="model-settings-footer">
                <button class="b3-button b3-button--text" on:click={resetToDefaults}>
                    {t('aiSidebar.modelSettings.reset')}
                </button>
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .model-settings-button-group {
        display: flex;
        align-items: center;
        gap: 2px;
        position: relative;
    }

    .model-settings-preset-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        max-width: 160px;
        padding-inline: 6px 8px;
        
        span {
             max-width: 120px;
             overflow: hidden;
             text-overflow: ellipsis;
             white-space: nowrap;
        }
        
        .b3-button__icon--small {
            width: 10px;
            height: 10px;
            opacity: 0.8;
        }
    }

    .model-settings-button__label {
        max-width: 150px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
    }

    // 预设列表弹窗
    .model-settings-preset-list-popup {
        position: fixed;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        box-shadow: var(--b3-dialog-shadow);
        width: 360px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        z-index: 1000;
    }

    .model-settings-preset-list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--b3-border-color);

        h4 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
        }
    }

    .model-settings-preset-list-actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .model-settings-preset-list-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .model-settings-preset-list-new {
        display: flex;
        justify-content: center;

        button {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
        }
    }

    .model-settings-preset-list-items {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .model-settings-preset-list-item {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        cursor: grab;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-background);
            border-color: var(--b3-theme-primary-light);
        }

        &:active {
            cursor: grabbing;
        }

        &.selected {
            background: var(--b3-theme-primary-lightest);
            border-color: var(--b3-theme-primary);

            .preset-name {
                color: var(--b3-theme-primary);
                font-weight: 600;
            }
        }

        &.dragging {
            opacity: 0.5;
        }

        &.drag-over {
            border: 1px dashed var(--b3-theme-primary);
            background: var(--b3-theme-surface);
        }

        &.drag-over-above {
            border-top: 2px solid var(--b3-theme-primary);
        }

        &.drag-over-below {
            border-bottom: 2px solid var(--b3-theme-primary);
        }
    }

    .model-settings-preset-list-item-info {
        flex: 1;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        cursor: pointer;
        min-width: 0;
    }

    .model-settings-preset-empty-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        margin-top: 2px;
    }

    .model-settings-preset-list-item-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
    }

    .preset-name {
        font-size: 13px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .model-settings-preset-details {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        line-height: 1.5;
    }

    .model-settings-preset-models {
        color: var(--b3-theme-on-surface);
        font-weight: 500;
    }

    .model-settings-preset-list-item-actions {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
    }

    .model-settings-preset-list-empty {
        padding: 24px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 13px;
    }

    // 设置面板
    .model-settings-dropdown {
        position: fixed;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 8px;
        box-shadow: var(--b3-dialog-shadow);
        width: 360px;
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        z-index: 1000;
    }
    
    .model-settings-preset-dropdown {
        position: fixed;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 6px;
        box-shadow: var(--b3-dialog-shadow);
        width: 280px;
        max-height: 400px;
        display: flex;
        flex-direction: column;
        z-index: 1000;
        padding: 8px;
    }

    .model-settings-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--b3-border-color);

        h4 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--b3-theme-on-background);
        }
    }

    .model-settings-header-left {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .model-settings-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .model-settings-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .model-settings-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .model-settings-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 13px;
        font-weight: 500;
        color: var(--b3-theme-on-surface);
    }

    .model-settings-value {
        font-size: 12px;
        color: var(--b3-theme-primary);
        font-weight: 600;
    }

    .model-settings-hint {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        margin-top: -4px;
    }

    .model-settings-checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;

        label {
            font-size: 12px;
            color: var(--b3-theme-on-surface);
            cursor: pointer;

            &.disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        }
    }

    .model-settings-textarea {
        resize: vertical;
        min-height: 60px;
        font-family: var(--b3-font-family);
        font-size: 12px;
    }

    .model-settings-preset-details {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
    }
    
    .model-settings-preset-selected-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        color: var(--b3-theme-primary);
    }
    .model-settings-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 12px 16px;
        border-top: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
    }

    .b3-slider {
        width: 100%;
    }

    .model-settings-model-selector {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .model-settings-preset-search {
        display: flex;
        padding: 6px 0;
    }

    .model-settings-preset-search .b3-text-field {
        width: 100%;
        padding: 6px 8px;
        font-size: 12px;
    }

    .model-settings-disabled-hint {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        font-weight: normal;
    }

    .model-settings-preset-selected-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        color: var(--b3-theme-primary);
        margin-top: 2px;
    }
</style>
