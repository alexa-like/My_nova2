import TelegramBot from "node-telegram-bot-api";
import { IUser } from "../models/User.js";

export interface PluginMatch {
  confidence: number;
  params: Record<string, string>;
}

export interface PluginContext {
  bot: TelegramBot;
  msg: TelegramBot.Message;
  user: IUser;
  match: PluginMatch;
  chatId: number;
  text: string;
}

export interface NovaPlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  isPremium?: boolean;
  match(text: string): PluginMatch | null;
  handle(ctx: PluginContext): Promise<void>;
}
