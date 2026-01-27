import { pushErrMsg, pushMsg } from "../api";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServerConfig } from "../defaultSettings";
import type { Tool } from "../tools";
import { getFrontend } from "siyuan";
import process from "process";

export class MCPManager {
  private clients: Map<string, Client> = new Map();
  private configs: MCPServerConfig[] = [];
  private toolServerMap: Map<
    string,
    { serverId: string; originalName: string }
  > = new Map();
  private notifiedConnections: Map<string, string> = new Map();
  private listeners: (() => void)[] = [];
  private initPromise: Promise<void> | null = null;

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

  private async closeClient(id: string) {
    const client = this.clients.get(id);
    if (!client) return;
    try {
      await client.close();
    } catch (e) {
      console.error(`Error closing client ${id}:`, e);
    } finally {
      this.clients.delete(id);
      this.notifiedConnections.delete(id);
    }
  }

  private getConfigSignature(config: MCPServerConfig) {
    const env = config.env || {};
    const envKeys = Object.keys(env).sort();
    const normalizedEnv: Record<string, string> = {};
    for (const key of envKeys) {
      normalizedEnv[key] = env[key];
    }
    return JSON.stringify({
      id: config.id,
      name: config.name,
      type: config.type,
      command: config.command || "",
      args: config.args || [],
      url: config.url || "",
      env: normalizedEnv,
      enabled: config.enabled,
    });
  }

  private shouldNotifyConnected(config: MCPServerConfig) {
    const signature = this.getConfigSignature(config);
    const previous = this.notifiedConnections.get(config.id);
    if (previous === signature) {
      return false;
    }
    this.notifiedConnections.set(config.id, signature);
    return true;
  }

  public async init(configs: MCPServerConfig[]) {
    console.log(`[MCP] init called with ${configs.length} configs:`, JSON.stringify(configs.map(c => ({id: c.id, name: c.name, enabled: c.enabled}))));
    
    // Check if configs have changed to avoid unnecessary reconnections
    if (JSON.stringify(configs) === JSON.stringify(this.configs) && !this.initPromise) {
      console.log(`[MCP] Configs unchanged, skipping init`);
      return;
    }

    const runInit = async () => {
      const normalizedConfigs = configs.map((config) => ({ ...config }));
      const idCounter = new Map<string, number>();
      const duplicates: string[] = [];
      for (const config of normalizedConfigs) {
        const baseId = (config.id || "").trim() || "mcp_server";
        const count = (idCounter.get(baseId) || 0) + 1;
        idCounter.set(baseId, count);
        if (count > 1) {
          duplicates.push(baseId);
          config.id = `${baseId}__${count}`;
          console.warn(`[MCP] Duplicate server ID "${baseId}" detected. Using "${config.id}" instead.`);
        } else {
          config.id = baseId;
        }
      }
      if (duplicates.length > 0) {
        const uniqueDuplicates = Array.from(new Set(duplicates));
        console.error(`[MCP] Duplicate server IDs detected: ${uniqueDuplicates.join(', ')}`);
        pushErrMsg(`MCP 配置错误: 检测到重复的服务器 ID (${uniqueDuplicates.join(', ')})。这会导致部分工具无法加载。已为重复项自动修正本次会话的 ID。`);
      }

      const previousConfigs = this.configs;
      const previousConfigMap = new Map(previousConfigs.map((c) => [c.id, c]));
      const normalizedConfigMap = new Map(normalizedConfigs.map((c) => [c.id, c]));

      const toDisconnect = new Set<string>();
      for (const [id] of this.clients.entries()) {
        const next = normalizedConfigMap.get(id);
        if (!next || !next.enabled) {
          toDisconnect.add(id);
        }
      }
      for (const [id, prev] of previousConfigMap.entries()) {
        const next = normalizedConfigMap.get(id);
        if (!next || !next.enabled) continue;
        if (this.getConfigSignature(prev) !== this.getConfigSignature(next)) {
          toDisconnect.add(id);
        }
      }

      await Promise.all(Array.from(toDisconnect).map((id) => this.closeClient(id)));

      this.configs = normalizedConfigs;
      const connectionCandidates = normalizedConfigs.filter((config) => {
        if (!config.enabled) return false;
        const prevConfig = previousConfigMap.get(config.id);
        const isConnected = this.clients.has(config.id);
        const changed =
          !prevConfig ||
          this.getConfigSignature(prevConfig) !==
            this.getConfigSignature(config);
        return !isConnected || changed;
      });

      console.log(
        `[MCP] Planned connections: ${connectionCandidates.length}`,
        connectionCandidates.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          enabled: c.enabled,
        })),
      );

      const connectionPromises = connectionCandidates.map(async (config) => {
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
            // ... (keep existing error handling)
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
        } else {
          console.log(`[MCP] Skipping disabled server: ${config.name} (${config.id})`);
        }
      });

      await Promise.all(connectionPromises);
      this.notifyToolsUpdate();
    };

    const chained = this.initPromise ? this.initPromise.then(runInit) : runInit();
    this.initPromise = chained.finally(() => {
      if (this.initPromise === chained) {
        this.initPromise = null;
      }
    });
    await this.initPromise;
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

        // Fix PATH for macOS Electron environment to ensure npx/node/uvx can be found
        const env = { ...process.env, ...(config.env || {}) };
        if (process.platform === 'darwin' || process.platform === 'linux') {
          const home = process.env.HOME || '';
          const commonPaths = [
            '/opt/homebrew/bin',
            '/usr/local/bin',
            '/usr/bin',
            '/bin',
            '/usr/sbin',
            '/sbin',
            // uv / python tools often in .local/bin
            `${home}/.local/bin`,
            // cargo / rust tools
            `${home}/.cargo/bin`,
            // npm global installs
            `${home}/.npm-global/bin`,
          ];
          
          // Try to find nvm path if possible
          // This is a best-effort guess for nvm
          if (home) {
             // We can't easily guess nvm path without sourcing shell, 
             // but we can encourage users to set absolute path or symlink if this fails.
          }

          const currentPath = env.PATH || '';
          const pathParts = currentPath.split(':').filter(p => !!p);
          
          for (const p of commonPaths) {
            if (!pathParts.includes(p)) {
              pathParts.push(p);
            }
          }
          env.PATH = pathParts.join(':');
        }

        transport = new StdioClientTransport({
          command: config.command!,
          args: config.args,
          env: env,
        });
      } catch (e) {
        console.error("Stdio transport failed to initialize", e);
        if (e instanceof Error && (e as any).code === 'ENOENT') {
          const cmd = config.command;
          if (cmd === 'npx') {
            throw new Error(`无法找到 npx 命令。请确保已安装 Node.js，或在系统 PATH 中包含 npx。您也可以尝试指定 npx 的绝对路径。`);
          } else if (cmd === 'uvx') {
            throw new Error(`无法找到 uvx 命令。请确保已安装 uv (Python 工具)，或在系统 PATH 中包含 uvx。`);
          } else {
             throw new Error(`无法找到命令: ${cmd}。请检查命令是否正确安装，或尝试使用绝对路径。`);
          }
        }
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
      console.log(`[MCP] Connected to MCP server: ${config.name} (ID: ${config.id}). Total clients: ${this.clients.size}`);
      if (this.shouldNotifyConnected(config)) {
        pushMsg(`Connected to MCP server: ${config.name}`);
      }

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
        console.log(`[MCP] Connected via StreamableHTTP to ${config.name} (ID: ${config.id}). Total clients: ${this.clients.size}`);
        if (this.shouldNotifyConnected(config)) {
          pushMsg(`Connected to MCP server: ${config.name} (HTTP)`);
        }
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
          console.log(`[MCP] Connected via Legacy SSE to ${config.name} (ID: ${config.id}). Total clients: ${this.clients.size}`);
          if (this.shouldNotifyConnected(config)) {
            pushMsg(`Connected to MCP server: ${config.name} (SSE)`);
          }
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
    if (this.initPromise) {
      await this.initPromise;
    }
    const clientEntries = Array.from(this.clients.entries());
    console.log(`[MCP] getTools called. Connected clients: ${clientEntries.length}`, clientEntries.map(e => e[0]));
    
    // 1. Fetch tools from all clients concurrently
    const rawResults = await Promise.all(
      clientEntries.map(async ([id, client]) => {
        try {
          console.log(`[MCP] Listing tools for client ${id}...`);
          const result = await client.listTools();
          console.log(`[MCP] Client ${id} returned ${result.tools.length} tools`);
          return { id, tools: result.tools, error: null };
        } catch (e) {
          console.error(`[MCP ERROR] Failed to list tools for client ${id}:`, e);
          return { id, tools: [], error: e };
        }
      })
    );

    // 2. Process tools and handle naming conflicts sequentially
    const tempMap = new Map<
      string,
      { serverId: string; originalName: string }
    >();
    const allTools: Tool[] = [];
    
    for (const { id, tools } of rawResults) {
        if (tools.length === 0) continue;
        
        const serverConfig = this.configs.find((c) => c.id === id);
        const serverName = serverConfig?.name || "unknown";

        for (const t of tools) {
            let toolName = `mcp__${t.name}`;
            
            // Handle naming conflicts
            if (tempMap.has(toolName)) {
              console.warn(`[MCP] Tool name conflict: ${toolName}. Renaming to include server name.`);
              toolName = `mcp__${t.name}__${serverName}`;
            }

            tempMap.set(toolName, {
              serverId: id,
              originalName: t.name,
            });

            allTools.push({
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
              _mcpServerName: serverName,
            } as any as Tool);
        }
    }
    
    console.log(`[MCP] Total tools processed: ${allTools.length}`);
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
    const ids = Array.from(this.clients.keys());
    await Promise.all(ids.map((id) => this.closeClient(id)));
  }
}

export const mcpManager = new MCPManager();
