<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { MCPServerConfig } from '../defaultSettings';
    import { t } from '../utils/i18n';

    export let mcpServers: MCPServerConfig[] = [];

    const dispatch = createEventDispatcher();

    let editingServer: MCPServerConfig | null = null;
    let isEditing = false;
    let showAddForm = false;

    // 临时对象，用于绑定表单
    let formServer: Partial<MCPServerConfig> = {};

    function initForm(server?: MCPServerConfig) {
        if (server) {
            formServer = JSON.parse(JSON.stringify(server));
        } else {
            formServer = {
                id: `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: '',
                type: 'stdio',
                enabled: true,
                command: '',
                args: [],
                env: {},
                url: ''
            };
        }
    }

    function handleAdd() {
        showAddForm = true;
        isEditing = false;
        initForm();
    }

    function handleEdit(server: MCPServerConfig) {
        editingServer = server;
        isEditing = true;
        showAddForm = false;
        initForm(server);
    }

    function handleDelete(id: string) {
        mcpServers = mcpServers.filter(s => s.id !== id);
        dispatchChange();
    }

    function handleSave() {
        if (!formServer.name) {
            // TODO: Show error
            return;
        }

        const newConfig = formServer as MCPServerConfig;

        if (isEditing && editingServer) {
            const index = mcpServers.findIndex(s => s.id === editingServer!.id);
            if (index !== -1) {
                mcpServers[index] = newConfig;
            }
        } else {
            mcpServers = [...mcpServers, newConfig];
        }

        resetForm();
        dispatchChange();
    }

    function handleCancel() {
        resetForm();
    }

    function resetForm() {
        isEditing = false;
        showAddForm = false;
        editingServer = null;
        formServer = {};
    }

    function dispatchChange() {
        dispatch('change', mcpServers);
    }

    function handleArgsChange(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        try {
            // 尝试解析JSON数组
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
                formServer.args = parsed;
                return;
            }
        } catch (e) {
            // ignore
        }
        // 如果不是JSON，按空格分割
        formServer.args = val.split(' ').filter(s => s.length > 0);
    }

    function handleEnvChange(e: Event) {
        const val = (e.target as HTMLTextAreaElement).value;
        try {
            formServer.env = JSON.parse(val);
        } catch (e) {
            // ignore
        }
    }
</script>

<div class="mcp-manager">
    {#if !showAddForm && !isEditing}
        <div class="server-list">
            {#each mcpServers as server}
                <div class="server-item">
                    <div class="server-info">
                        <div class="server-name">
                            {server.name}
                            <span class="server-tag {server.enabled ? 'enabled' : 'disabled'}">
                                {server.enabled ? t('enabled') || '已启用' : t('disabled') || '已禁用'}
                            </span>
                            <span class="server-type-tag">{server.type}</span>
                        </div>
                        <div class="server-detail">
                            {#if server.type === 'stdio'}
                                {server.command} {server.args?.join(' ')}
                            {:else}
                                {server.url}
                            {/if}
                        </div>
                    </div>
                    <div class="server-actions">
                        <button class="b3-button b3-button--text" on:click={() => handleEdit(server)}>
                            {t('edit') || '编辑'}
                        </button>
                        <button class="b3-button b3-button--text b3-button--error" on:click={() => handleDelete(server.id)}>
                            {t('delete') || '删除'}
                        </button>
                    </div>
                </div>
            {/each}
            
            {#if mcpServers.length === 0}
                <div class="empty-hint">{t('mcp.noServers') || '暂无 MCP 服务器配置'}</div>
            {/if}

            <div class="add-btn-wrap">
                <button class="b3-button b3-button--outline" on:click={handleAdd}>
                    {t('add') || '添加服务器'}
                </button>
            </div>
        </div>
    {:else}
        <div class="server-form">
            <div class="config__item">
                <div class="config__item-label">{t('name') || '名称'}</div>
                <input class="b3-text-field" type="text" bind:value={formServer.name} placeholder="Server Name" />
            </div>

            <div class="config__item">
                <div class="config__item-label">{t('type') || '类型'}</div>
                <select class="b3-select" bind:value={formServer.type}>
                    <option value="stdio">Stdio (Local Process)</option>
                    <option value="sse">SSE (Remote URL)</option>
                </select>
            </div>

            {#if formServer.type === 'stdio'}
                <div class="config__item">
                    <div class="config__item-label">Command</div>
                    <input class="b3-text-field" type="text" bind:value={formServer.command} placeholder="e.g. node, python, npx" />
                </div>
                <div class="config__item">
                    <div class="config__item-label">Arguments (Space separated or JSON array)</div>
                    <input 
                        class="b3-text-field" 
                        type="text" 
                        value={Array.isArray(formServer.args) ? JSON.stringify(formServer.args) : ''} 
                        on:change={handleArgsChange}
                        placeholder='e.g. ./server.js or ["arg1", "arg2"]' 
                    />
                </div>
                <div class="config__item">
                    <div class="config__item-label">Environment Variables (JSON)</div>
                    <textarea 
                        class="b3-text-field" 
                        rows="3"
                        value={JSON.stringify(formServer.env || {}, null, 2)}
                        on:change={handleEnvChange}
                    ></textarea>
                </div>
            {:else}
                <div class="config__item">
                    <div class="config__item-label">URL</div>
                    <input class="b3-text-field" type="text" bind:value={formServer.url} placeholder="http://localhost:3000/sse" />
                </div>
            {/if}

            <div class="config__item">
                <label class="b3-label pointer">
                    <input class="b3-switch" type="checkbox" bind:checked={formServer.enabled} />
                    {t('enable') || '启用'}
                </label>
            </div>

            <div class="form-actions">
                <button class="b3-button b3-button--cancel" on:click={handleCancel}>
                    {t('cancel') || '取消'}
                </button>
                <button class="b3-button b3-button--text" on:click={handleSave}>
                    {t('save') || '保存'}
                </button>
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    .mcp-manager {
        padding: 16px;
        height: 100%;
        overflow-y: auto;
    }

    .server-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .server-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        border: 1px solid var(--b3-border-color);
        border-radius: 4px;
        background-color: var(--b3-theme-background);

        &:hover {
            background-color: var(--b3-list-hover-background);
        }
    }

    .server-info {
        flex: 1;
    }

    .server-name {
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
    }

    .server-detail {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        font-family: monospace;
    }

    .server-tag {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: normal;

        &.enabled {
            background-color: rgba(var(--b3-theme-success-rgb), 0.1);
            color: var(--b3-theme-success);
        }

        &.disabled {
            background-color: var(--b3-theme-surface-light);
            color: var(--b3-theme-on-surface-light);
        }
    }

    .server-type-tag {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        background-color: var(--b3-theme-primary-light);
        color: var(--b3-theme-primary);
        font-weight: normal;
    }

    .add-btn-wrap {
        margin-top: 16px;
        display: flex;
        justify-content: center;
    }

    .server-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-width: 600px;
        margin: 0 auto;
    }

    .config__item {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .config__item-label {
        font-weight: 500;
    }

    .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 16px;
    }

    .pointer {
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .empty-hint {
        text-align: center;
        padding: 20px;
        color: var(--b3-theme-on-surface-light);
    }
</style>
