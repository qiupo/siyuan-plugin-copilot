import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { MCPServerConfig } from "../defaultSettings";
import type { Tool } from "../tools";

export class MCPManager {
    private clients: Map<string, Client> = new Map();
    private configs: MCPServerConfig[] = [];

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
                }
            }
        }
    }

    private async connect(config: MCPServerConfig) {
        let transport;
        if (config.type === 'stdio') {
            try {
                transport = new StdioClientTransport({
                    command: config.command!,
                    args: config.args,
                    env: config.env
                });
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
    }

    public async getTools(): Promise<Tool[]> {
        const allTools: Tool[] = [];
        for (const [id, client] of this.clients.entries()) {
            try {
                const result = await client.listTools();
                const serverConfig = this.configs.find(c => c.id === id);
                // Use a safer separator or namespace strategy if needed
                // Here we use "__" as separator to avoid conflict with tool names
                const prefix = serverConfig ? `mcp__${serverConfig.name}__` : 'mcp__unknown__';
                
                const tools: Tool[] = result.tools.map(t => ({
                    type: 'function',
                    function: {
                        name: `${prefix}${t.name}`,
                        description: t.description || '',
                        parameters: {
                            type: 'object',
                            properties: t.inputSchema.properties || {},
                            required: t.inputSchema.required || []
                        } as any
                    }
                }));
                allTools.push(...tools);
            } catch (e) {
                console.error(`Failed to list tools for client ${id}:`, e);
            }
        }
        return allTools;
    }

    public async callTool(name: string, args: any): Promise<string> {
        // Parse the tool name to find the server
        // Format: mcp__SERVERNAME__TOOLNAME
        const match = name.match(/^mcp__(.+?)__(.+)$/);
        if (!match) {
             throw new Error(`Invalid MCP tool name format: ${name}`);
        }

        const [_, serverName, toolName] = match;
        
        const config = this.configs.find(c => c.name === serverName);
        if (!config) {
            throw new Error(`MCP server not found for tool: ${name}`);
        }

        const client = this.clients.get(config.id);
        if (!client) {
            throw new Error(`MCP client not connected for server: ${serverName}`);
        }

        try {
            const result = await client.callTool({
                name: toolName,
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
