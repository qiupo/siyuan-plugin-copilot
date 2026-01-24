import { pushErrMsg, pushMsg } from "../api";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { MCPServerConfig } from "../defaultSettings";
import type { Tool } from "../tools";

export class MCPManager {
    private clients: Map<string, Client> = new Map();
    private configs: MCPServerConfig[] = [];
    private toolServerMap: Map<string, { serverId: string, originalName: string }> = new Map();

    constructor() {}

    public async init(configs: MCPServerConfig[]) {
        // Close existing connections if re-initializing
        await this.close();
        
        this.configs = configs;
        for (const config of configs) {
            if (config.enabled) {
                try {
                    await this.connect(config);
                } catch (e) {
                    console.error(`Failed to connect to MCP server ${config.name}:`, e);
                    const errorMsg = e instanceof Error ? e.message : String(e);
                    pushErrMsg(`Failed to connect to MCP server ${config.name}: ${errorMsg}`);
                }
            }
        }
    }

    private async connect(config: MCPServerConfig) {
        let transport;
        if (config.type === 'stdio') {
            // Check if we are in a browser environment or if process is polyfilled as browser
            // @ts-ignore
            const isBrowser = typeof window !== 'undefined' || (typeof process !== 'undefined' && process.platform === 'browser');
            console.log(`isBrowser: ${isBrowser} process.platform: ${process.platform} config.type: ${config.type}`);
            if (isBrowser) {
                const msg = `Stdio transport is not supported in this environment (Browser). Skipping ${config.name}`;
                console.warn(msg);
                pushErrMsg(msg);
                return;
            }
            try {
                // transport = new StdioClientTransport({
                //     command: config.command!,
                //     args: config.args,
                //     env: config.env
                // });
            } catch (e) {
                console.error("Stdio transport failed to initialize", e);
                throw e;
            }
        } else if (config.type === 'sse') {
            transport = new SSEClientTransport(new URL(config.url!));
        } else {
            throw new Error(`Unknown transport type: ${config.type}`);
        }

        const client = new Client({
            name: "siyuan-copilot-client",
            version: "1.0.0",
        }, {
            capabilities: {},
        });

        await client.connect(transport);
        this.clients.set(config.id, client);
        console.log(`Connected to MCP server: ${config.name}`);
        pushMsg(`Connected to MCP server: ${config.name}`);
    }

    public async getTools(): Promise<Tool[]> {
        const tempMap = new Map<string, { serverId: string, originalName: string }>();
        const allTools: Tool[] = [];
        for (const [id, client] of this.clients.entries()) {
            try {
                const result = await client.listTools();
                const serverConfig = this.configs.find(c => c.id === id);
                
                const tools: Tool[] = result.tools.map(t => {
                    let toolName = `mcp__${t.name}`;
                    // Handle naming conflicts
                    if (tempMap.has(toolName)) {
                        toolName = `mcp__${t.name}__${serverConfig?.name || 'unknown'}`;
                    }

                    tempMap.set(toolName, { 
                        serverId: id, 
                        originalName: t.name 
                    });

                    return {
                        type: 'function',
                        function: {
                            name: toolName,
                            description: t.description || '',
                            parameters: {
                                type: 'object',
                                properties: t.inputSchema.properties || {},
                                required: t.inputSchema.required || []
                            } as any
                        },
                        _mcpServerName: serverConfig?.name
                    } as any as Tool;
                });
                console.log('tools',tools)
                allTools.push(...tools);
            } catch (e) {
                console.error(`Failed to list tools for client ${id}:`, e);
            }
        }
        this.toolServerMap = tempMap;
        return allTools;
    }

    public async callTool(name: string, args: any): Promise<string> {
        // Look up server and original tool name
        let info = this.toolServerMap.get(name);

        // If not found, try to refresh tools list first
        if (!info) {
            console.log(`MCP tool ${name} not found in cache, refreshing tools list...`);
            await this.getTools();
            info = this.toolServerMap.get(name);
        }
        
        // If not found in map, try to parse old format as fallback (optional, but good for robustness if map is empty)
        let serverId: string | undefined;
        let toolName: string;

        if (info) {
            serverId = info.serverId;
            toolName = info.originalName;
        } else {
            // Fallback: try to parse mcp__SERVER__TOOL
            // This might be risky if we changed naming convention, but let's keep it as backup
            // or maybe we should just fail. 
            // Given the user wants to remove server name from prefix, relying on regex is unreliable now.
            // But let's check if it matches the OLD pattern just in case.
            const match = name.match(/^mcp__(.+?)__(.+)$/);
            if (match) {
                const [_, serverName, tName] = match;
                const config = this.configs.find(c => c.name === serverName);
                if (config) {
                    serverId = config.id;
                    toolName = tName;
                }
            }
        }

        if (!serverId) {
             throw new Error(`MCP tool not registered or found: ${name}`);
        }

        const client = this.clients.get(serverId);
        if (!client) {
            throw new Error(`MCP client not connected for server ID: ${serverId}`);
        }

        try {
            const result = await client.callTool({
                name: toolName!,
                arguments: args
            });
            
            // Format result
            const content = (result as any).content;
            if (content && content.length > 0) {
                return content.map((c: any) => {
                    if (c.type === 'text') return c.text;
                    if (c.type === 'image') return `[Image: ${c.mimeType}]`;
                    if (c.type === 'resource') return `[Resource: ${c.resource.uri}]`;
                    return JSON.stringify(c);
                }).join('\n');
            }
            return "Tool execution successful.";
        } catch (e) {
            console.error(`Tool call failed:`, e);
            throw e;
        }
    }

    public async close() {
        for (const client of this.clients.values()) {
            try {
                await client.close();
            } catch (e) {
                console.error("Error closing client:", e);
            }
        }
        this.clients.clear();
    }
}

export const mcpManager = new MCPManager();
