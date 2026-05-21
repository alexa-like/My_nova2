import { NovaPlugin, PluginContext, PluginMatch } from "./types.js";
import TelegramBot from "node-telegram-bot-api";
import { IUser } from "../models/User.js";

const plugins: NovaPlugin[] = [];

export function registerPlugin(plugin: NovaPlugin): void {
  plugins.push(plugin);
}

export function getPlugins(): NovaPlugin[] {
  return [...plugins];
}

export function getPlugin(id: string): NovaPlugin | undefined {
  return plugins.find((p) => p.id === id);
}

export interface RouteResult {
  plugin: NovaPlugin;
  match: PluginMatch;
}

export function routeMessage(text: string): RouteResult | null {
  if (!text || text.startsWith("/")) return null;

  let best: RouteResult | null = null;

  for (const plugin of plugins) {
    try {
      const match = plugin.match(text);
      if (match && match.confidence > 0) {
        if (!best || match.confidence > best.match.confidence) {
          best = { plugin, match };
        }
      }
    } catch {
      // non-fatal — plugin match failure
    }
  }

  return best;
}

export async function dispatchMessage(
  bot: TelegramBot,
  msg: TelegramBot.Message,
  user: IUser,
  text: string
): Promise<boolean> {
  const result = routeMessage(text);
  if (!result || result.match.confidence < 0.55) return false;

  const ctx: PluginContext = {
    bot,
    msg,
    user,
    match: result.match,
    chatId: msg.chat.id,
    text,
  };

  await result.plugin.handle(ctx);
  return true;
}
