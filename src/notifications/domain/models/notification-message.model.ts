export type NotificationInlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{
    text: string;
    callback_data: string;
  }>>;
};

export type NotificationMessage = {
  title: string;
  body: string;
  metadata?: Record<string, string | number | boolean | undefined>;
  replyMarkup?: NotificationInlineKeyboardMarkup;
};
