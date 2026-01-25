import { pushErrMsg, pushMsg } from "../api";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServerConfig } from "../defaultSettings";
import type { Tool } from "../tools";
import { getFrontend } from "siyuan";

export class MCPManager {
  private clients: Map<string, Client> = new Map();
  private configs: MCPServerConfig[] = [];
  private toolServerMap: Map<
    string,
    { serverId: string; originalName: string }
  > = new Map();
  private listeners: (() => void)[] = [];

  constructor() {}

  public onToolsUpdate(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyToolsUpdate() {
    this.listeners.forEach((l) => l());
  }

  public async init(configs: MCPServerConfig[]) {
    // Check if configs have changed to avoid unnecessary reconnections
    if (JSON.stringify(configs) === JSON.stringify(this.configs)) {
      return;
    }

    // Close existing connections if re-initializing
    await this.close();

    this.configs = configs;
    const connectionPromises = configs.map(async (config) => {
      if (config.enabled) {
        try {
          await this.connect(config);
        } catch (e) {
          const errorDetail =
            config.type === "sse" ? ` (URL: ${config.url})` : "";
          console.error(
            `Failed to connect to MCP server ${config.name}${errorDetail}:`,
            e,
          );
          const errorMsg = e instanceof Error ? e.message : String(e);

          let userFriendlyMsg = errorMsg;
          if (
            errorMsg.includes("ERR_CONNECTION_REFUSED") ||
            errorMsg.includes("fetch failed") ||
            errorMsg.includes("Failed to fetch")
          ) {
            userFriendlyMsg = `无法连接到服务器。请检查服务是否已启动且地址正确。(Connection refused / Failed to fetch)`;
          } else if (
            errorMsg.includes(
              "Endpoint origin does not match connection origin",
            )
          ) {
            userFriendlyMsg = `连接错误：服务端返回的地址与访问地址不匹配。通常是因为通过 IP 访问了绑定在 localhost 的服务。请尝试使用 localhost 访问，或修改服务端配置允许外部 IP。(${errorMsg})`;
          }

          pushErrMsg(`MCP server ${config.name}: ${userFriendlyMsg}`);
        }
      }
    });

    await Promise.all(connectionPromises);
    this.notifyToolsUpdate();
  }

  private async connect(config: MCPServerConfig) {
    let transport;
    console.log(`connect config: ${JSON.stringify(config)}`);
    if (config.type === "stdio") {
      const frontend = getFrontend();
      const isSupportStdio =
        frontend === "desktop" || frontend === "desktop-window";
      console.log(`frontend: ${JSON.stringify(frontend)} config.type: ${config.type} isSupportStdio:${isSupportStdio}`);

      if (!isSupportStdio) {
        const msg = `Stdio transport is not supported in this environment (${frontend}). Skipping ${config.name}. Please use SSE transport instead.`;
        console.warn(msg);
        // pushErrMsg(msg);
        return;
      }
      try {
        const { StdioClientTransport } = await import(
          "@modelcontextprotocol/sdk/client/stdio.js"
        );
        transport = new StdioClientTransport({
          command: config.command!,
          args: config.args,
          env: config.env,
        });
      } catch (e) {
        console.error("Stdio transport failed to initialize", e);
        throw e;
      }
      
      const client = new Client(
        {
          name: "siyuan-copilot-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        },
      );
      
      // @ts-ignore
      client.onerror = (error) => {
        console.error(`[MCP] Client error for ${config.name}:`, error);
      };

      await client.connect(transport);
      this.clients.set(config.id, client);
      console.log(`Connected to MCP server: ${config.name}`);
      pushMsg(`Connected to MCP server: ${config.name}`);

    } else if (config.type === "sse") {
      if (!config.url) {
        throw new Error("SSE URL is required");
      }
      
      const url = new URL(config.url);
      let connected = false;

      // 1. Try StreamableHTTPClientTransport first (Modern)
      try {
        console.log(`[MCP] Attempting StreamableHTTP connection to ${config.url}`);
        const transport = new StreamableHTTPClientTransport(url);
        const client = new Client(
          {
            name: "siyuan-copilot-client",
            version: "1.0.0",
          },
          {
            capabilities: {},
          },
        );

        // @ts-ignore
        client.onerror = (error) => {
          console.error(`[MCP] Client error for ${config.name} (HTTP):`, error);
        };

        await client.connect(transport);
        this.clients.set(config.id, client);
        connected = true;
        console.log(`[MCP] Connected via StreamableHTTP to ${config.name}`);
        pushMsg(`Connected to MCP server: ${config.name} (HTTP)`);
      } catch (e) {
        console.warn(`[MCP] StreamableHTTP failed for ${config.name}, falling back to SSE. Error: ${e}`);
      }

      // 2. Fallback to SSEClientTransport (Legacy)
      if (!connected) {
        try {
          console.log(`[MCP] Attempting Legacy SSE connection to ${config.url}`);
          const transport = new SSEClientTransport(url);
          const client = new Client(
            {
              name: "siyuan-copilot-client",
              version: "1.0.0",
            },
            {
              capabilities: {},
            },
          );

          // @ts-ignore
          client.onerror = (error) => {
            console.error(`[MCP] Client error for ${config.name} (SSE):`, error);
            // Close the client to prevent infinite retries for SSE if it's a fatal error
            if (config.type === "sse") {
              console.warn(`[MCP] Closing SSE connection for ${config.name} due to error.`);
              client.close().catch(() => {});
              this.clients.delete(config.id);
              pushErrMsg(
                `MCP server ${config.name} connection lost. Stopped retrying.`,
              );
            }
          };

          await client.connect(transport);
          this.clients.set(config.id, client);
          console.log(`[MCP] Connected via Legacy SSE to ${config.name}`);
          pushMsg(`Connected to MCP server: ${config.name} (SSE)`);
        } catch (e) {
          console.error(`[MCP] Legacy SSE failed for ${config.name}:`, e);
          throw new Error(`Failed to connect to ${config.name} (tried both HTTP and SSE). Last error: ${e}`);
        }
      }
    } else {
      throw new Error(`Unknown transport type: ${config.type}`);
    }
  }

  public async getTools(): Promise<Tool[]> {
    const tempMap = new Map<
      string,
      { serverId: string; originalName: string }
    >();
    
    const clientEntries = Array.from(this.clients.entries());
    const toolsResults = await Promise.all(
      clientEntries.map(async ([id, client]) => {
        try {
          console.log(`[MCP] Listing tools for client ${id}...`);
          const result = await client.listTools();
          console.log(`[MCP] Client ${id} returned ${result.tools.length} tools`);
          
          const serverConfig = this.configs.find((c) => c.id === id);

          const tools: Tool[] = result.tools.map((t) => {
            let toolName = `mcp__${t.name}`;
            // Handle naming conflicts
            if (tempMap.has(toolName)) {
              toolName = `mcp__${t.name}__${serverConfig?.name || "unknown"}`;
            }

            tempMap.set(toolName, {
              serverId: id,
              originalName: t.name,
            });

            return {
              type: "function",
              function: {
                name: toolName,
                description: t.description || "",
                parameters: {
                  type: "object",
                  properties: t.inputSchema.properties || {},
                  required: t.inputSchema.required || [],
                } as any,
              },
              _mcpServerName: serverConfig?.name,
            } as any as Tool;
          });
          console.log(`Tools loaded from client ${id}:`, tools.length);
          return tools;
        } catch (e) {
          console.error(`Failed to list tools for client ${id}:`, e);
          return [];
        }
      })
    );

    // Merge all tools
    const allTools = toolsResults.flat();
    this.toolServerMap = tempMap;
    return allTools;
  }

  public async callTool(name: string, args: any): Promise<string> {
    // Look up server and original tool name
    let info = this.toolServerMap.get(name);

    // If not found, try to refresh tools list first
    if (!info) {
      console.log(
        `MCP tool ${name} not found in cache, refreshing tools list...`,
      );
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
        const config = this.configs.find((c) => c.name === serverName);
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
        arguments: args,
      });

      // Format result
      const content = (result as any).content;
      if (content && content.length > 0) {
        return content
          .map((c: any) => {
            if (c.type === "text") return c.text;
            if (c.type === "image") return `[Image: ${c.mimeType}]`;
            if (c.type === "resource") return `[Resource: ${c.resource.uri}]`;
            return JSON.stringify(c);
          })
          .join("\n");
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
