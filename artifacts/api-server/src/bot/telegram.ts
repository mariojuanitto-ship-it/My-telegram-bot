import { logger } from "../lib/logger";

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type PhotoInput = string | Uint8Array;

export type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  from?: { id: number; username?: string; first_name?: string; last_name?: string };
  text?: string;
};

export type TelegramCallbackQuery = {
  id: string;
  from: { id: number; username?: string; first_name?: string; last_name?: string };
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type InlineKeyboardButton = {
  text: string;
  callback_data?: string;
};

type ReplyMarkup = {
  inline_keyboard?: InlineKeyboardButton[][];
  keyboard?: string[][];
  resize_keyboard?: boolean;
  is_persistent?: boolean;
};

const token = () => process.env["TELEGRAM_BOT_TOKEN"];

async function request<T>(method: string, body: Record<string, unknown>) {
  const botToken = token();
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !data.ok) throw new Error(data.description ?? `Telegram API ${method} failed`);
  return data.result as T;
}

export const telegram = {
  getUpdates: (offset: number, timeout: number) =>
    request<TelegramUpdate[]>("getUpdates", { offset, timeout, allowed_updates: ["message", "callback_query"] }),
  deleteWebhook: () => request<boolean>("deleteWebhook", { drop_pending_updates: false }),
  answerCallback: (callbackQueryId: string, text?: string) =>
    request<boolean>("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false }),
  sendMessage: (chatId: number, text: string, replyMarkup?: ReplyMarkup) =>
    request<TelegramMessage>("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    }),
  editMessage: (chatId: number, messageId: number, text: string, replyMarkup?: ReplyMarkup) =>
    request<TelegramMessage>("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup,
    }),
  sendPhoto: async (chatId: number, photo: PhotoInput, caption: string, replyMarkup?: ReplyMarkup) => {
    if (typeof photo === "string") {
      return request<TelegramMessage>("sendPhoto", {
        chat_id: chatId,
        photo,
        caption,
        reply_markup: replyMarkup,
      });
    }
    const botToken = token();
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", caption);
    if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
    const bytes = Uint8Array.from(photo);
    form.append("photo", new Blob([bytes.buffer], { type: "image/png" }), "rp-character.png");
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    const data = (await response.json()) as TelegramResponse<TelegramMessage>;
    if (!response.ok || !data.ok) throw new Error(data.description ?? "Telegram sendPhoto failed");
    return data.result as TelegramMessage;
  },
};

export const mainKeyboard = (isAdmin: boolean): ReplyMarkup => ({
  keyboard: [
    ["👤 Профиль", "🛍 Общий магазин"],
    ["💳 Донат", "🆘 Техподдержка"],
    ["🎰 Казино", "🏆 Форбс"],
    ["👥 Кланы", "🏷 Торговая площадка"],
    ["🔄 Обмен", "💼 Работы"],
    ...(isAdmin ? [["🛠 Админ-панель"]] : []),
  ],
  resize_keyboard: true,
  is_persistent: true,
});

export const inline = (rows: InlineKeyboardButton[][]) => ({ inline_keyboard: rows });

export function logTelegramError(error: unknown, context: string) {
  logger.error({ err: error, context }, "Telegram bot error");
}
