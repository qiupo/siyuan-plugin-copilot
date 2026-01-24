<script context="module" lang="ts">
    export interface ToolConfig {
        name: string;
        autoApprove: boolean;
    }
</script>

<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { AVAILABLE_TOOLS, type Tool } from '../tools';
    import { t } from '../utils/i18n';

    export let selectedTools: ToolConfig[] = [];
    export let availableTools: Tool[] = AVAILABLE_TOOLS;

    const dispatch = createEventDispatcher();

    // 使用本地状态管理选中工具，避免双向绑定的问题
    let localSelectedTools: ToolConfig[] = [...selectedTools];

    // 当外部 selectedTools 改变时，同步到本地状态
    $: if (selectedTools) {
        localSelectedTools = [...selectedTools];
    }

    function close() {
        dispatch('close');
    }
    const toolCategories = {
        siyuan: {
            name: t('tools.category.siyuan'),
            tools: [
                'siyuan_sql_query',
                'siyuan_database',
                'siyuan_get_block_content',
                'siyuan_get_block_attrs',
                'siyuan_set_block_attrs',
                'siyuan_insert_block',
                'siyuan_update_block',
                'siyuan_create_document',
                'siyuan_get_doc_tree',
                'siyuan_list_notebooks',
                'siyuan_create_notebook',
                'siyuan_rename_document',
                'siyuan_move_documents',
            ],
        },
    };

    // 按类别组织工具
    let categorizedTools: Record<string, Tool[]> = {};
    
    $: {
        categorizedTools = {};
        // SiYuan tools
        categorizedTools['siyuan'] = toolCategories.siyuan.tools
            .map(toolName => availableTools.find(tool => tool.function.name === toolName))
            .filter(tool => tool !== undefined) as Tool[];

        // MCP tools
        const mcpTools = availableTools.filter(t => t.function.name.startsWith('mcp__'));
        
        // Group MCP tools by server name if possible (mcp__SERVER__TOOL)
        const mcpGroups: Record<string, Tool[]> = {};
        mcpTools.forEach(tool => {
            const match = tool.function.name.match(/^mcp__(.+?)__/);
            const serverName = match ? match[1] : 'other';
            if (!mcpGroups[serverName]) mcpGroups[serverName] = [];
            mcpGroups[serverName].push(tool);
        });

        for (const [server, tools] of Object.entries(mcpGroups)) {
             categorizedTools[`mcp_${server}`] = tools;
        }
    }

    function getCategoryName(key: string): string {
        if (key === 'siyuan') return toolCategories.siyuan.name;
        if (key.startsWith('mcp_')) return `MCP: ${key.substring(4)}`;
        return key;
    }

    // 切换工具选择
    function toggleTool(toolName: string) {
        const index = localSelectedTools.findIndex(t => t.name === toolName);
        if (index >= 0) {
            // 移除工具
            localSelectedTools = localSelectedTools.filter(t => t.name !== toolName);
        } else {
            // 添加工具
            localSelectedTools = [...localSelectedTools, { name: toolName, autoApprove: false }];
        }
        // 通知父组件更新
        selectedTools = [...localSelectedTools];
        dispatch('update', localSelectedTools);
    }

    // 切换工具的自动批准状态
    function toggleToolAutoApprove(toolName: string) {
        const index = localSelectedTools.findIndex(t => t.name === toolName);
        if (index >= 0) {
            // 工具已选中,更新其自动批准状态
            // 创建新数组以触发响应式更新
            localSelectedTools = localSelectedTools.map((tool, i) =>
                i === index ? { ...tool, autoApprove: !tool.autoApprove } : tool
            );
        } else {
            // 工具未选中,添加工具并设置自动批准为 true
            localSelectedTools = [...localSelectedTools, { name: toolName, autoApprove: true }];
        }
        // 同步到导出 prop 以支持 bind:selectedTools
        selectedTools = [...localSelectedTools];
        // 通知父组件更新
        dispatch('update', localSelectedTools);
    }

    // 全选/取消全选
    function toggleAll() {
        if (localSelectedTools.length === availableTools.length) {
            // 取消全选
            localSelectedTools = [];
        } else {
            // 全选
            localSelectedTools = availableTools.map(tool => ({
                name: tool.function.name,
                autoApprove: false
            }));
        }
        selectedTools = [...localSelectedTools];
        dispatch('update', localSelectedTools);
    }
    
    function isToolSelected(toolName: string): boolean {
        return localSelectedTools.some(t => t.name === toolName);
    }

    function isToolAutoApprove(toolName: string): boolean {
        return localSelectedTools.find(t => t.name === toolName)?.autoApprove || false;
    }
</script>

<div class="tool-selector-overlay" on:click={close} on:keydown={(e) => e.key === 'Escape' && close()} role="button" tabindex="0">
    <div class="tool-selector-modal" on:click|stopPropagation role="button" tabindex="0" on:keydown|stopPropagation>
        <div class="modal-header">
            <h3>{t('tools.selector.title')}</h3>
            <div class="header-actions">
                <button class="b3-button b3-button--text" on:click={toggleAll}>
                    {localSelectedTools.length === availableTools.length ? t('tools.selector.deselectAll') : t('tools.selector.selectAll')}
                </button>
                <button class="icon-button" on:click={close}>
                    <svg class="icon">
                        <use xlink:href="#iconClose"></use>
                    </svg>
                </button>
            </div>
        </div>
        <div class="modal-content">
            {#each Object.entries(categorizedTools) as [category, tools]}
                {#if tools.length > 0}
                    <div class="tool-category">
                        <div class="category-title">{getCategoryName(category)}</div>
                        <div class="tool-list">
                            {#each tools as tool}
                                <div class="tool-item" class:selected={isToolSelected(tool.function.name)}>
                                    <div class="tool-main" on:click={() => toggleTool(tool.function.name)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && toggleTool(tool.function.name)}>
                                        <div class="tool-checkbox">
                                            {#if isToolSelected(tool.function.name)}
                                                <svg class="icon"><use xlink:href="#iconCheck"></use></svg>
                                            {/if}
                                        </div>
                                        <div class="tool-info">
                                            <div class="tool-name">{tool.function.name}</div>
                                            <div class="tool-desc">{tool.function.description.split('\n')[0]}</div>
                                        </div>
                                    </div>
                                    <div 
                                        class="tool-auto-approve" 
                                        class:active={isToolAutoApprove(tool.function.name)}
                                        on:click|stopPropagation={() => toggleToolAutoApprove(tool.function.name)}
                                        title={t('tools.selector.autoApprove')}
                                        role="button"
                                        tabindex="0"
                                        on:keydown|stopPropagation
                                    >
                                        <svg class="icon"><use xlink:href="#iconFlash"></use></svg>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            {/each}
        </div>
        <div class="modal-footer">
            <div class="selected-count">
                {t('tools.selector.selectedCount').replace('{n}', localSelectedTools.length.toString())}
            </div>
            <button class="b3-button" on:click={close}>{t('common.confirm')}</button>
        </div>
    </div>
</div>

<style lang="scss">
    .tool-selector-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .tool-selector-modal {
        background: var(--b3-theme-background);
        border-radius: 6px;
        box-shadow: var(--b3-dialog-shadow);
        width: 600px;
        max-width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--b3-border-color);
    }

    .modal-header {
        padding: 16px;
        border-bottom: 1px solid var(--b3-border-color);
        display: flex;
        align-items: center;
        justify-content: space-between;

        h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .icon-button {
            padding: 4px;
            border-radius: 4px;
            cursor: pointer;
            border: none;
            background: transparent;
            color: var(--b3-theme-on-surface);

            &:hover {
                background: var(--b3-theme-surface-light);
            }

            .icon {
                width: 12px;
                height: 12px;
            }
        }
    }

    .modal-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
    }

    .tool-category {
        margin-bottom: 20px;

        .category-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 10px;
            color: var(--b3-theme-on-surface);
            opacity: 0.8;
        }
    }

    .tool-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 10px;
    }

    .tool-item {
        display: flex;
        align-items: center;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid var(--b3-border-color);
        background: var(--b3-theme-surface);
        transition: all 0.2s;
        gap: 8px;

        &:hover {
            border-color: var(--b3-theme-primary);
        }

        &.selected {
            background: var(--b3-theme-primary-light);
            border-color: var(--b3-theme-primary);
            
            .tool-checkbox {
                background: var(--b3-theme-primary);
                border-color: var(--b3-theme-primary);
                color: var(--b3-theme-on-primary);
            }
        }
    }

    .tool-main {
        flex: 1;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        cursor: pointer;
        min-width: 0;
    }

    .tool-checkbox {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        border: 1px solid var(--b3-border-color);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 2px;
        background: var(--b3-theme-surface);

        .icon {
            width: 10px;
            height: 10px;
        }
    }

    .tool-info {
        flex: 1;
        min-width: 0;

        .tool-name {
            font-size: 13px;
            font-weight: 500;
            color: var(--b3-theme-on-surface);
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .tool-desc {
            font-size: 12px;
            color: var(--b3-theme-on-surface-light);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    }

    .tool-auto-approve {
        padding: 4px;
        border-radius: 4px;
        cursor: pointer;
        color: var(--b3-theme-on-surface-light);
        opacity: 0.5;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
            background: var(--b3-theme-surface-light);
            opacity: 1;
        }

        &.active {
            color: var(--b3-theme-primary);
            opacity: 1;
        }

        .icon {
            width: 14px;
            height: 14px;
        }
    }

    .modal-footer {
        padding: 12px 16px;
        border-top: 1px solid var(--b3-border-color);
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    .selected-count {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
    }
</style>
