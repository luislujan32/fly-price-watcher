export type NotificationMessage = {
  title: string;
  body: string;
  metadata?: Record<string, string | number | boolean>;
};
