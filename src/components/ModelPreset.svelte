<script lang="ts">
    import { createEventDispatcher, tick, onMount } from 'svelte';
    import { t } from '../utils/i18n';
    import { pushMsg } from '@/api';
    import { confirm } from 'siyuan';

    export let providers: Record<string, any> = {};
    export let currentProvider = '';
    export let currentModelId = '';
    export let appliedSettings = {
        contextCount: 10,
        maxContextTokens: 16384,
        temperature: 0.7,
        temperatureEnabled: true,
        systemPrompt: '',
        modelSelectionEnabled: false,
        selectedModels: [] as Array<{ provider: string; modelId: string }>,
        enableMultiModel: false,
        chatMode: 'ask' as 'ask' | 'edit' | 'agent',
        modelThinkingSettings: {} as Record<string, boolean>,
    };
    export let plugin: any;

    const dispatch = createEventDispatcher();

    let isSettingsOpen = false;
    let isPresetListOpen = false;

    let settingsTop = 0;
    let settingsLeft = 0;
    let presetListTop = 0;
    let presetListLeft = 0;

    // let settingsButtonElement: HTMLButtonElement; // Removed
    let presetButtonElement: HTMLButtonElement;
    let settingsDropdownElement: HTMLDivElement;
    let presetDropdownElement: HTMLDivElement;

    // 模型设置（临时值，用于编辑）
    let tempContextCount = 10;
    let tempMaxContextTokens = 16384; // 最大上下文Token数
    let tempTemperature = 0.7;
    let tempTemperatureEnabled = false; // 是否启用temperature调整
    let tempSystemPrompt = '';
    let tempModelSelectionEnabled = false; // 是否启用模型选择
    let tempSelectedModels: Array<{ provider: string; modelId: string }> = []; // 选中的模型列表
    let tempEnableMultiModel = false; // 是否启用多模型模式
    let tempChatMode: 'ask' | 'edit' | 'agent' = 'ask'; // 聊天模式
    let tempModelThinkingSettings: Record<string, boolean> = {}; // 每个模型的thinking设置 {provider:modelId: boolean}

    // 预设管理
    interface Preset {
        id: string;
        name: string;
        contextCount: number;
        maxContextTokens?: number; // 最大上下文Token数
        temperature: number;
        temperatureEnabled: boolean; // 是否启用temperature调整
        systemPrompt: string;
        modelSelectionEnabled: boolean; // 是否启用模型选择
        selectedModels: Array<{ provider: string; modelId: string }>; // 选中的模型列表
        enableMultiModel: boolean; // 是否启用多模型模式
        chatMode: 'ask' | 'edit' | 'agent'; // 聊天模式
        modelThinkingSettings?: Record<string, boolean>; // 每个模型的thinking设置
        createdAt: number;
    }

    let presets: Preset[] = [];
    let selectedPresetId: string = '';
    let editingPresetId: string = ''; // 当前正在编辑的预设ID（如果为空，则表示编辑当前选中的预设）
    let newPresetName = '新预设';

    // 拖拽排序相关（预设列表）
    let dragSrcIndex: number | null = null;
    let dragOverIndex: number | null = null;
    let dragDirection: 'above' | 'below' | null = null;

    // 拖拽排序相关（模型列表）
    let draggedModelIndex: number | null = null;
    let dropModelIndicatorIndex: number | null = null;

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

    // 获取提供商显示名称
    function getProviderDisplayName(providerId: string): string {
        const builtInNames: Record<string, string> = {
            gemini: 'Gemini',
            deepseek: 'DeepSeek',
            openai: 'OpenAI',
            claude: 'Claude',
            volcano: 'Volcano',
        };

        if (builtInNames[providerId]) {
            return builtInNames[providerId];
        }

        // 查找自定义提供商
        if (providers.customProviders && Array.isArray(providers.customProviders)) {
            const customProvider = providers.customProviders.find((p: any) => p.id === providerId);
            if (customProvider) {
                return customProvider.name;
            }
        }

        return providerId;
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

    // 获取所有可用模型
    function getAllAvailableModels(): Array<{
        provider: string;
        modelId: string;
        modelName: string;
        providerName: string;
        supportsThinking: boolean;
    }> {
        const models: Array<{
            provider: string;
            modelId: string;
            modelName: string;
            providerName: string;
            supportsThinking: boolean;
        }> = [];

        // 遍历内置提供商
        for (const [providerId, providerConfig] of Object.entries(providers)) {
            if (
                providerId === 'customProviders' ||
                !providerConfig ||
                Array.isArray(providerConfig)
            )
                continue;

            const providerName = providerId;
            if (providerConfig.models && Array.isArray(providerConfig.models)) {
                for (const model of providerConfig.models) {
                    models.push({
                        provider: providerId,
                        modelId: model.id,
                        modelName: model.name || model.id,
                        providerName: providerName,
                        supportsThinking: model.capabilities?.thinking || false,
                    });
                }
            }
        }

        // 遍历自定义提供商
        if (providers.customProviders && Array.isArray(providers.customProviders)) {
            for (const provider of providers.customProviders) {
                if (provider.models && Array.isArray(provider.models)) {
                    for (const model of provider.models) {
                        models.push({
                            provider: provider.id,
                            modelId: model.id,
                            modelName: model.name || model.id,
                            providerName: provider.name,
                            supportsThinking: model.capabilities?.thinking || false,
                        });
                    }
                }
            }
        }

        return models;
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
    }

    // 加载预设
    async function loadPreset(presetId: string) {
        // 如果点击的是已选择的预设，只关闭菜单
        if (selectedPresetId === presetId) {
            isPresetListOpen = false;
            return;
        }

        const preset = presets.find(p => p.id === presetId);
        if (preset) {
            tempContextCount = preset.contextCount;
            tempMaxContextTokens = preset.maxContextTokens ?? 16384;
            tempTemperature = preset.temperature;
            tempTemperatureEnabled = preset.temperatureEnabled ?? true; // 兼容旧预设
            tempSystemPrompt = preset.systemPrompt;
            tempModelSelectionEnabled = preset.modelSelectionEnabled ?? false; // 兼容旧预设
            tempSelectedModels = [...(preset.selectedModels || [])]; // 创建新数组引用
            tempEnableMultiModel = preset.enableMultiModel ?? false;
            tempChatMode = preset.chatMode || 'ask'; // 兼容旧预设
            tempModelThinkingSettings = { ...(preset.modelThinkingSettings || {}) }; // 创建新对象引用
            selectedPresetId = presetId;
            // 保存选中的预设ID
            await saveSelectedPresetId(presetId);

            // 立即应用设置，确保UI更新
            applySettings();
            
            // 关闭预设列表
            isPresetListOpen = false;
        }
    }

    // 打开指定预设的设置
    async function configurePreset(presetId: string) {
        // 先加载预设数据（复用loadPreset的逻辑，但需要避免它关闭列表导致的闪烁，或者直接在这里处理）
        // 这里我们手动执行加载逻辑，确保状态正确
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
            tempContextCount = preset.contextCount;
            tempMaxContextTokens = preset.maxContextTokens ?? 16384;
            tempTemperature = preset.temperature;
            tempTemperatureEnabled = preset.temperatureEnabled ?? true;
            tempSystemPrompt = preset.systemPrompt;
            tempModelSelectionEnabled = preset.modelSelectionEnabled ?? false;
            tempSelectedModels = [...(preset.selectedModels || [])];
            tempEnableMultiModel = preset.enableMultiModel ?? false;
            tempChatMode = preset.chatMode || 'ask';
            tempModelThinkingSettings = { ...(preset.modelThinkingSettings || {}) };
            
            // 记录正在编辑的预设ID，但不切换当前选中的预设
            editingPresetId = presetId;

            // 切换视图：关闭预设列表，打开设置面板
            isPresetListOpen = false;
            isSettingsOpen = true;
            updateSettingsPosition();
            
            // 重新添加外部点击监听（针对设置面板）
            setTimeout(() => {
                document.addEventListener('click', closeSettingsOnOutsideClick);
            }, 0);
        }
    }

    // 从设置面板返回预设列表
    function backToPresetList() {
        // 关闭设置面板
        isSettingsOpen = false;
        editingPresetId = ''; // 清除编辑状态
        document.removeEventListener('click', closeSettingsOnOutsideClick);
        
        // 打开预设列表
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
        // 如果是拖到下方，目标位置应该是 index + 1
        if (dragDirection === 'below') {
            dest = index + 1;
        }

        const item = presets[src];
        presets.splice(src, 1);
        // 如果从上往下移，目标索引在删除后会减1
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
        const els = document.querySelectorAll('.model-settings-preset-menu-preset.dragging');
        els.forEach(el => el.classList.remove('dragging'));
    }

    // 更新预设
    async function updatePreset(presetId: string) {
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
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
            
            // 如果更新的是当前选中的预设，则应用设置
            if (presetId === selectedPresetId) {
                applySettings();
            }

            pushMsg(t('aiSidebar.modelSettings.presetUpdated'));
        }
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

            // 如果鼠标在元素的上半部分，显示在上方
            if (y < height / 2) {
                dropModelIndicatorIndex = index;
            } else {
                // 如果鼠标在元素下半部分，显示在下方
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

            // 如果dropModelIndicatorIndex为null，使用传入的dropIndex
            if (targetIndex === null) {
                targetIndex = dropIndex;
            }

            // 确保目标索引有效
            if (
                targetIndex !== null &&
                targetIndex !== draggedModelIndex &&
                targetIndex !== draggedModelIndex + 1
            ) {
                // 重新排列数组
                const newModels = [...tempSelectedModels];
                const [draggedItem] = newModels.splice(draggedModelIndex, 1);

                // 调整目标索引（因为我们已经移除了一个元素）
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
            modelThinkingSettings: tempModelThinkingSettings,
        });
    }

    // 比较两个模型数组是否相等
    function areModelsEqual(
        models1: Array<{ provider: string; modelId: string }>,
        models2: Array<{ provider: string; modelId: string }>
    ): boolean {
        if (models1.length !== models2.length) return false;
        return models1.every((m1, index) => {
            const m2 = models2[index];
            return m1.provider === m2.provider && m1.modelId === m2.modelId;
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
        // 只有当没有正在编辑的预设，或者正在编辑的预设就是当前选中的预设时，才自动应用
        (!editingPresetId || editingPresetId === selectedPresetId) &&
        (tempContextCount !== appliedSettings.contextCount ||
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
        // 注意：此处不再因为不匹配而自动取消选择预设
        // 而是通过 isModified 状态来提示用户保存修改
    }
    
    // 计算当前是否与选中的预设不一致
    $: isModified = (() => {
        const targetId = editingPresetId || selectedPresetId;
        if (!targetId) return false;
        const preset = presets.find(p => p.id === targetId);
        if (!preset) return false;
        
        return (
            preset.contextCount !== tempContextCount ||
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

    // 重置临时值为当前应用的设置
    async function resetToAppliedSettings() {
        tempContextCount = appliedSettings.contextCount;
        tempMaxContextTokens = appliedSettings.maxContextTokens ?? 16384;
        tempTemperature = appliedSettings.temperature;
        tempTemperatureEnabled = appliedSettings.temperatureEnabled ?? true;
        tempSystemPrompt = appliedSettings.systemPrompt;
        tempModelSelectionEnabled = appliedSettings.modelSelectionEnabled ?? false;
        tempSelectedModels = [...(appliedSettings.selectedModels || [])]; // 创建新数组引用
        tempEnableMultiModel = appliedSettings.enableMultiModel ?? false;
        tempChatMode = appliedSettings.chatMode ?? 'ask';
        tempModelThinkingSettings = { ...(appliedSettings.modelThinkingSettings || {}) }; // 创建新对象引用

        // 检查当前应用的设置是否与某个预设匹配
        const savedPresetId = await loadSelectedPresetId();
        if (savedPresetId) {
            const preset = presets.find(p => p.id === savedPresetId);
            if (
                preset &&
                preset.contextCount === appliedSettings.contextCount &&
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
                )
            ) {
                // 设置匹配，保持预设选择
                selectedPresetId = savedPresetId;
            } else {
                // 设置不匹配，但如果savedPresetId存在，我们可能仍希望保持选中状态但标记为修改
                // 但如果是首次加载，我们可能希望精确匹配。
                // 这里保持原逻辑：如果不完全匹配，不自动选中（或者选中但isModified为true？）
                // 原逻辑是如果不匹配就清空。为了兼容“切换”功能，我们先保持清空，
                // 只有当用户显式点击预设时才强制选中。
                selectedPresetId = '';
            }
        } else {
            selectedPresetId = '';
        }
    }

    // 重置为默认值
    async function resetToDefaults() {
        const modelConfig = getCurrentModelConfig();
        tempContextCount = 10;
        tempTemperature = modelConfig?.temperature ?? 0.7;
        tempTemperatureEnabled = true;
        tempSystemPrompt = '';
        tempModelSelectionEnabled = false;
        tempSelectedModels = [];
        tempEnableMultiModel = false;
        tempChatMode = 'ask';
        tempModelThinkingSettings = {};
        selectedPresetId = '';
        // 清除保存的预设ID
        await saveSelectedPresetId('');
    }



    // 关闭设置下拉菜单
    function closeSettingsOnOutsideClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.model-settings-trigger-btn') && !target.closest('.model-settings-dropdown')) {
            isSettingsOpen = false;
            editingPresetId = ''; // 清除编辑状态
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

    // 打开预设列表
    async function openPresetList() {
        isPresetListOpen = true;
        isSettingsOpen = false; // 关闭设置面板
        await loadPresets();
        updatePresetListPosition();
        setTimeout(() => {
            document.addEventListener('click', closePresetListOnOutsideClick);
        }, 0);
    }
    
    // 关闭预设列表
    function closePresetListOnOutsideClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.model-settings-preset-btn') && !target.closest('.model-settings-preset-dropdown')) {
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

        // 计算垂直位置
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        if (spaceAbove >= dropdownHeight || spaceAbove >= spaceBelow) {
            // 显示在按钮上方
            settingsTop = rect.top - dropdownHeight - 4;
        } else {
            // 显示在按钮下方
            settingsTop = rect.bottom + 4;
        }

        // 计算水平位置（左对齐按钮，与预设列表一致）
        settingsLeft = rect.left;

        // 确保下拉菜单不会超出视口右边界
        if (settingsLeft + dropdownWidth > window.innerWidth - 8) {
            settingsLeft = window.innerWidth - dropdownWidth - 8;
        }
        
        // 确保不会超出左边界
        if (settingsLeft < 8) {
            settingsLeft = 8;
        }
    }
    
    // 计算预设列表下拉菜单位置
    async function updatePresetListPosition() {
        if (!presetButtonElement || !isPresetListOpen) return;

        await tick();

        const rect = presetButtonElement.getBoundingClientRect();
        const dropdownWidth = presetDropdownElement?.offsetWidth || 280;
        const dropdownHeight = presetDropdownElement?.offsetHeight || 300;

        // 计算垂直位置
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        if (spaceAbove >= dropdownHeight || spaceAbove >= spaceBelow) {
            // 显示在按钮上方
            presetListTop = rect.top - dropdownHeight - 4;
        } else {
            // 显示在按钮下方
            presetListTop = rect.bottom + 4;
        }

        // 计算水平位置（左对齐按钮）
        presetListLeft = rect.left;

        // 确保下拉菜单不会超出视口右边界
        if (presetListLeft + dropdownWidth > window.innerWidth - 8) {
            presetListLeft = window.innerWidth - dropdownWidth - 8;
        }
    }

    $: if (isSettingsOpen) {
        updateSettingsPosition();
    }
    
    $: if (isPresetListOpen && presets) {
        updatePresetListPosition();
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
                    tempContextCount = preset.contextCount;
                    tempTemperature = preset.temperature;
                    tempTemperatureEnabled = preset.temperatureEnabled ?? true;
                    tempSystemPrompt = preset.systemPrompt;
                    tempModelSelectionEnabled = preset.modelSelectionEnabled ?? false;
                    tempSelectedModels = [...(preset.selectedModels || [])]; // 创建新数组引用
                    tempEnableMultiModel = preset.enableMultiModel ?? false;
                    tempChatMode = preset.chatMode || 'ask';
                    tempModelThinkingSettings = { ...(preset.modelThinkingSettings || {}) }; // 创建新对象引用
                    selectedPresetId = savedPresetId;
                    // 触发应用
                    applySettings();
                } else {
                    // 预设已被删除，清除保存的ID
                    await saveSelectedPresetId('');
                }
            }
        })();
    });

    // 计算当前按钮上要显示的预设名称
    // 仅在显式选中某个预设（`selectedPresetId`）时显示其名称
    $: currentPresetName = (() => {
        if (selectedPresetId) {
            const preset = presets.find(p => p.id === selectedPresetId);
            return preset ? preset.name : '预设';
        }
        return '预设';
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

    <!-- 3. 预设列表下拉框 -->
    {#if isPresetListOpen}
<!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            bind:this={presetDropdownElement}
            class="model-settings-preset-dropdown"
            style="top: {presetListTop}px; left: {presetListLeft}px;"
            on:click|stopPropagation
        >
            <!-- 预设列表 -->
            {#if presets.length > 0}
                <div class="model-settings-preset-list-container">
                    {#each presets as preset, index}
                        <div
                            class="model-settings-preset-menu-preset"
                            draggable="true"
                            on:dragstart|stopPropagation={e =>
                                handleDragStart(e, index)}
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
                            <div class="model-settings-preset-menu-preset-main">
                                <div
                                    class="model-settings-preset-menu-preset-info"
                                    class:selected={selectedPresetId === preset.id}
                                    on:click={() => loadPreset(preset.id)}
                                    role="button"
                                    tabindex="0"
                                    on:keydown={e =>
                                        e.key === 'Enter' && loadPreset(preset.id)}
                                >
                                    {#if selectedPresetId === preset.id}
                                        <svg
                                            class="model-settings-preset-selected-icon"
                                        >
                                            <use xlink:href="#iconCheck"></use>
                                        </svg>
                                    {/if}
                                    <div
                                        class="model-settings-preset-menu-preset-content"
                                    >
                                        <span class="preset-name">
                                            {preset.name}
                                        </span>
                                        <!-- 简略信息 -->
                                        <div class="model-settings-preset-details">
                                             {t('aiSidebar.mode.' + (preset.chatMode || 'ask')) || preset.chatMode || '问答'}
                                        </div>
                                    </div>
                                </div>
                                <div
                                    class="model-settings-preset-menu-preset-actions"
                                >
                                    <button
                                        class="b3-button b3-button--text"
                                        on:click|stopPropagation={() =>
                                            configurePreset(preset.id)}
                                        title={t(
                                            'aiSidebar.modelSettings.title'
                                        ) || '设置'}
                                    >
                                        <svg class="b3-button__icon">
                                            <use xlink:href="#iconModelSetting"></use>
                                        </svg>
                                    </button>
                                    <button
                                        class="b3-button b3-button--text"
                                        on:click|stopPropagation={() =>
                                            deletePreset(preset.id)}
                                        title={t(
                                            'aiSidebar.modelSettings.deletePreset'
                                        )}
                                    >
                                        <svg class="b3-button__icon">
                                            <use xlink:href="#iconTrashcan"></use>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {:else}
                <div class="model-settings-preset-menu-empty">
                    <div style="margin-bottom: 8px;">{t('aiSidebar.modelSettings.noPresets')}</div>
                    <button
                        class="b3-button b3-button--text"
                        on:click|stopPropagation={openSettingsPanel}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconModelSetting"></use></svg>
                        {t('aiSidebar.modelSettings.title') || '模型设置'}
                    </button>
                </div>
            {/if}

            <div class="model-settings-preset-menu-divider"></div>

            <!-- 设置按钮 (已移除，功能移至每个预设项) -->
            <!--
            <div
                class="model-settings-preset-menu-item clickable"
                on:click|stopPropagation={openSettings}
                role="button"
                tabindex="0"
                on:keydown={e => e.key === 'Enter' && openSettings()}
            >
                <svg class="b3-button__icon"><use xlink:href="#iconModelSetting"></use></svg>
                <span>{t('aiSidebar.modelSettings.title') || '模型设置'}</span>
            </div>
            -->
        </div>
    {/if}

    <!-- 4. 详细设置面板 -->
    {#if isSettingsOpen}
        <div
            bind:this={settingsDropdownElement}
            class="model-settings-dropdown"
            style="top: {settingsTop}px; left: {settingsLeft}px;"
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
                        on:click={backToPresetList}
                        title={t('common.close')}
                    >
                        <svg class="b3-button__icon"><use xlink:href="#iconClose"></use></svg>
                    </button>
                </div>
            </div>

            <div class="model-settings-content">
                <!-- 上下文数设置 -->
                <div class="model-settings-item">
                    <label class="model-settings-label">
                        {t('aiSidebar.modelSettings.contextCount')}
                        <span class="model-settings-value">{tempContextCount}</span>
                    </label>
                    <input
                        type="range"
                        min="1"
                        max="200"
                        step="1"
                        bind:value={tempContextCount}
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
                            // 如果切换到非ask模式，自动禁用多模型
                            if (tempChatMode !== 'ask' && tempEnableMultiModel) {
                                tempEnableMultiModel = false;
                            }
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
                            class="b3-switch"
                        />
                        <label for="model-selection-enabled">
                            {t('aiSidebar.modelSettings.enableModelSelection') || '启用模型选择'}
                        </label>
                    </div>

                    {#if tempModelSelectionEnabled}
                        <div class="model-settings-model-selector">
                            <!-- 已选模型列表 -->
                            {#if tempSelectedModels.length > 0}
                                <div class="model-settings-selected-models-header">
                                    <div class="model-settings-selected-models-title">已选模型</div>
                                </div>

                                <div class="model-settings-selected-models-list">
                                    {#each tempSelectedModels as model, index}
                                        <!-- Drop indicator before this item -->
                                        {#if dropModelIndicatorIndex === index}
                                            <div
                                                class="model-settings-drop-indicator model-settings-drop-indicator--active"
                                            ></div>
                                        {/if}

                                        <div
                                            class="model-settings-selected-model"
                                            draggable={tempEnableMultiModel}
                                            role="button"
                                            tabindex="0"
                                            on:dragstart={e =>
                                                tempEnableMultiModel &&
                                                handleModelDragStart(e, index)}
                                            on:dragover={e =>
                                                tempEnableMultiModel &&
                                                handleModelDragOver(e, index)}
                                            on:drop={e =>
                                                tempEnableMultiModel && handleModelDrop(e, index)}
                                            on:dragend={tempEnableMultiModel && handleModelDragEnd}
                                        >
                                            <div class="model-settings-selected-model-content">
                                                {#if tempEnableMultiModel}
                                                    <div class="model-settings-drag-handle">
                                                        <svg class="model-settings-drag-icon">
                                                            <use xlink:href="#iconDrag"></use>
                                                        </svg>
                                                    </div>
                                                {/if}
                                                <div class="model-settings-selected-model-info">
                                                    <span
                                                        class="model-settings-selected-model-name"
                                                    >
                                                        {getModelDisplayName(
                                                            model.provider,
                                                            model.modelId
                                                        )}
                                                    </span>
                                                    <span
                                                        class="model-settings-selected-model-provider"
                                                    >
                                                        {getProviderDisplayName(model.provider)}
                                                    </span>
                                                </div>
                                                <div class="model-settings-selected-model-actions">
                                                    {#if tempEnableMultiModel}
                                                        <button
                                                            class="model-settings-move-btn"
                                                            disabled={index === 0}
                                                            on:click|stopPropagation={() =>
                                                                moveModelUp(index)}
                                                            title={t('multiModel.moveUp') || '上移'}
                                                        >
                                                            <svg class="model-settings-move-icon">
                                                                <use xlink:href="#iconUp"></use>
                                                            </svg>
                                                        </button>
                                                        <button
                                                            class="model-settings-move-btn"
                                                            disabled={index ===
                                                                tempSelectedModels.length - 1}
                                                            on:click|stopPropagation={() =>
                                                                moveModelDown(index)}
                                                            title={t('multiModel.moveDown') ||
                                                                '下移'}
                                                        >
                                                            <svg class="model-settings-move-icon">
                                                                <use xlink:href="#iconDown"></use>
                                                            </svg>
                                                        </button>
                                                    {/if}
                                                    <button
                                                        class="model-settings-remove-btn"
                                                        on:click|stopPropagation={() =>
                                                            removeSelectedModel(index)}
                                                        title={t('multiModel.remove') || '移除'}
                                                    >
                                                        <svg class="model-settings-remove-icon">
                                                            <use xlink:href="#iconClose"></use>
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    {/each}

                                    <!-- Drop indicator after the last item -->
                                    {#if dropModelIndicatorIndex === tempSelectedModels.length}
                                        <div
                                            class="model-settings-drop-indicator model-settings-drop-indicator--active"
                                        ></div>
                                    {/if}
                                </div>
                            {/if}

                            <!-- 多模型模式开关 -->
                            <div class="model-settings-checkbox">
                                <input
                                    type="checkbox"
                                    id="enable-multi-model"
                                    bind:checked={tempEnableMultiModel}
                                    class="b3-switch"
                                    disabled={tempChatMode !== 'ask'}
                                    on:change={() => {
                                        // 关闭多模型模式时，如果有多个模型被选中，清空选择
                                        if (
                                            !tempEnableMultiModel &&
                                            tempSelectedModels.length > 1
                                        ) {
                                            tempSelectedModels = [];
                                        }
                                    }}
                                />
                                <label
                                    for="enable-multi-model"
                                    class:disabled={tempChatMode !== 'ask'}
                                >
                                    {t('aiSidebar.modelSettings.enableMultiModel') || '多模型模式'}
                                    {#if tempChatMode !== 'ask'}
                                        <span class="model-settings-disabled-hint">
                                            ({t('aiSidebar.modelSettings.onlyAskMode') ||
                                                '仅问答模式可用'})
                                        </span>
                                    {/if}
                                </label>
                            </div>

                            <!-- 模型选择下拉框 -->
                            <div class="model-settings-model-list">
                                {#each getAllAvailableModels() as model}
                                    <div class="model-settings-model-item">
                                        <div class="model-settings-model-item-main">
                                            <input
                                                type={tempEnableMultiModel ? 'checkbox' : 'radio'}
                                                id="model-{model.provider}-{model.modelId}"
                                                name="preset-model-selection"
                                                checked={tempSelectedModels.some(
                                                    m =>
                                                        m.provider === model.provider &&
                                                        m.modelId === model.modelId
                                                )}
                                                on:change={e => {
                                                    if (tempEnableMultiModel) {
                                                        // 多模型模式：checkbox
                                                        if (e.currentTarget.checked) {
                                                            tempSelectedModels = [
                                                                ...tempSelectedModels,
                                                                {
                                                                    provider: model.provider,
                                                                    modelId: model.modelId,
                                                                },
                                                            ];
                                                        } else {
                                                            tempSelectedModels =
                                                                tempSelectedModels.filter(
                                                                    m =>
                                                                        !(
                                                                            m.provider ===
                                                                                model.provider &&
                                                                            m.modelId ===
                                                                                model.modelId
                                                                        )
                                                                );
                                                        }
                                                    } else {
                                                        // 单模型模式：radio
                                                        tempSelectedModels = [
                                                            {
                                                                provider: model.provider,
                                                                modelId: model.modelId,
                                                            },
                                                        ];
                                                    }
                                                }}
                                            />
                                            <label for="model-{model.provider}-{model.modelId}">
                                                <span class="model-provider-name">
                                                    {model.providerName}
                                                </span>
                                                <span class="model-name">{model.modelName}</span>
                                            </label>
                                        </div>

                                        <!-- Thinking checkbox -->
                                        {#if model.supportsThinking}
                                            <div class="model-settings-thinking-checkbox">
                                                <input
                                                    type="checkbox"
                                                    id="thinking-{model.provider}-{model.modelId}"
                                                    class="b3-switch b3-switch--small"
                                                    checked={tempModelThinkingSettings[
                                                        `${model.provider}:${model.modelId}`
                                                    ] ?? false}
                                                    on:change={e => {
                                                        const key = `${model.provider}:${model.modelId}`;
                                                        tempModelThinkingSettings = {
                                                            ...tempModelThinkingSettings,
                                                            [key]: e.currentTarget.checked,
                                                        };
                                                    }}
                                                />
                                                <label
                                                    for="thinking-{model.provider}-{model.modelId}"
                                                    class="thinking-label"
                                                >
                                                    {t('aiSidebar.modelSettings.enableThinking') ||
                                                        '思考'}
                                                </label>
                                            </div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
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

    .model-settings-trigger-btn {
        padding: 4px;
    }

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

    .model-settings-header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .model-settings-preset-menu-item {
        display: flex;
        align-items: center;
        padding: 8px;
        gap: 8px;
        flex-shrink: 0;

        &.clickable {
            cursor: pointer;
            border-radius: 4px;
            transition: background 0.2s;

            &:hover {
                background: var(--b3-theme-surface);
            }
        }

        input {
            flex: 1;
        }
    }

    .model-settings-preset-menu-divider {
        height: 1px;
        background: var(--b3-border-color);
        margin: 4px 0;
        flex-shrink: 0;
    }
    
    .model-settings-preset-list-container {
        overflow-y: auto;
        flex: 1;
    }

    .model-settings-preset-menu-preset {
        position: relative;
        display: flex;
        flex-direction: column;
        padding: 6px 8px;
        border-radius: 4px;
        transition: background 0.2s;
        cursor: grab;

        &:hover {
            background: var(--b3-theme-surface);
        }

        &:active {
            cursor: grabbing;
        }

        &.dragging {
            opacity: 0.5;
        }
    }

    .model-settings-preset-menu-preset.drag-over {
        border: 1px dashed var(--b3-theme-primary);
        background: var(--b3-theme-surface);
    }

    .model-settings-preset-menu-preset.drag-over-above::before {
        content: '';
        position: absolute;
        top: -2px;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--b3-theme-primary);
        z-index: 1;
    }

    .model-settings-preset-menu-preset.drag-over-below::after {
        content: '';
        position: absolute;
        bottom: -2px;
        left: 0;
        right: 0;
        height: 2px;
        background: var(--b3-theme-primary);
        z-index: 1;
    }

    .model-settings-preset-menu-preset-main {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
    }

    .model-settings-preset-menu-preset-info {
        flex: 1;
        display: flex;
        align-items: flex-start;
        gap: 6px;
        cursor: pointer;
        font-size: 13px;
        color: var(--b3-theme-on-surface);

        &.selected {
            color: var(--b3-theme-primary);

            .preset-name {
                font-weight: 600;
            }
        }

        svg {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
            margin-top: 2px;
        }
    }

    .model-settings-preset-menu-preset-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .preset-name {
        font-size: 13px;
        font-weight: 500;
    }

    .model-settings-preset-menu-preset-actions {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
    }

    .model-settings-preset-menu-empty {
        padding: 16px;
        text-align: center;
        color: var(--b3-theme-on-surface-light);
        font-size: 12px;
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
        padding: 12px;
        background: var(--b3-theme-surface);
        border-radius: 4px;
        border: 1px solid var(--b3-border-color);
    }

    .model-settings-model-list {
        margin-top: 12px;
        max-height: 200px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .model-settings-model-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 6px 8px;
        background: var(--b3-theme-background);
        border-radius: 4px;
        border: 1px solid var(--b3-border-color);
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-surface);
            border-color: var(--b3-theme-primary-light);
        }

        input[type='checkbox'],
        input[type='radio'] {
            flex-shrink: 0;
        }

        label {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 12px;
            margin: 0;
        }

        .model-provider-name {
            color: var(--b3-theme-on-surface-light);
            font-size: 11px;
            padding: 2px 6px;
            background: var(--b3-theme-surface);
            border-radius: 3px;
        }

        .model-name {
            color: var(--b3-theme-on-surface);
            font-weight: 500;
        }
    }

    .model-settings-model-item-main {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .model-settings-thinking-checkbox {
        display: flex;
        align-items: center;
        gap: 4px;
        padding-left: 8px;
        border-left: 1px solid var(--b3-border-color);

        input[type='checkbox'] {
            flex-shrink: 0;
        }

        .thinking-label {
            font-size: 11px;
            color: var(--b3-theme-on-surface-light);
            cursor: pointer;
            margin: 0;
            white-space: nowrap;
        }
    }

    .model-settings-checkbox {
        label.disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
    }

    .model-settings-disabled-hint {
        font-size: 11px;
        color: var(--b3-theme-on-surface-light);
        font-weight: normal;
    }

    // 已选模型列表样式
    .model-settings-selected-models-header {
        border-bottom: 1px solid var(--b3-border-color);
    }

    .model-settings-selected-models-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
        margin-bottom: 4px;
    }

    .model-settings-selected-models-list {
        max-height: 200px;
        overflow-y: auto;
    }

    .model-settings-drop-indicator {
        height: 2px;
        background: var(--b3-theme-primary);
        border-radius: 1px;
        margin: 2px 8px;
        opacity: 0;
        transition: opacity 0.2s ease;

        &--active {
            opacity: 1;
        }
    }

    .model-settings-selected-model {
        margin: 4px 0;
        background: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        cursor: move;
        transition: all 0.2s;

        &:hover {
            background: var(--b3-theme-surface);
            border-color: var(--b3-theme-primary-light);
        }

        &:active {
            transform: scale(0.98);
        }
    }

    .model-settings-selected-model-content {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        min-width: 0;
    }

    .model-settings-drag-handle {
        flex-shrink: 0;
        cursor: grab;
        color: var(--b3-theme-on-surface-light);

        &:active {
            cursor: grabbing;
        }
    }

    .model-settings-drag-icon {
        width: 14px;
        height: 14px;
    }

    .model-settings-selected-model-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .model-settings-selected-model-name {
        font-size: 12px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .model-settings-selected-model-provider {
        font-size: 10px;
        color: var(--b3-theme-on-surface-light);
    }

    .model-settings-selected-model-actions {
        display: flex;
        gap: 2px;
        flex-shrink: 0;
    }

    .model-settings-move-btn,
    .model-settings-remove-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        border-radius: 3px;
        cursor: pointer;
        color: var(--b3-theme-on-surface-light);
        transition: all 0.2s;

        &:hover:not(:disabled) {
            background: var(--b3-theme-surface);
            color: var(--b3-theme-on-background);
        }

        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
    }

    .model-settings-move-icon,
    .model-settings-remove-icon {
        width: 12px;
        height: 12px;
    }
</style>
