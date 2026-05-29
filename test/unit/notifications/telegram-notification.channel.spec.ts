import { ConfigService } from '@nestjs/config';
import { TelegramNotificationChannel } from '../../../src/notifications/infrastructure/telegram/telegram-notification.channel';

describe('TelegramNotificationChannel', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends plain text with AEROLINEAS_ARGENTINAS and no parse_mode by default', async () => {
    const fetchMock = mockFetch();
    const channel = channelWithConfig({ telegramParseMode: 'none' });

    await channel.send({
      title: 'PRICE_DROP',
      body: 'Viaje Octubre: AEROLINEAS_ARGENTINAS bajó de 337419 a 288038 ARS.',
    });

    const payload = requestPayload(fetchMock);
    expect(payload).toEqual({
      chat_id: 'chat-id',
      text: 'Viaje Octubre: AEROLINEAS_ARGENTINAS bajó de 337419 a 288038 ARS.',
    });
    expect(payload).not.toHaveProperty('parse_mode');
  });

  it('does not prefix PRICE_DROP technical title in the final message', async () => {
    const fetchMock = mockFetch();
    const channel = channelWithConfig({ telegramParseMode: 'none' });

    await channel.send({
      title: 'PRICE_DROP',
      body: '📉 Bajó el precio más barato — Viaje Octubre',
    });

    expect(requestPayload(fetchMock)).toMatchObject({
      text: '📉 Bajó el precio más barato — Viaje Octubre',
    });
    expect(requestPayload(fetchMock).text).not.toContain('PRICE_DROP:');
  });

  it('does not prefix DAILY_SUMMARY technical title in the final message', async () => {
    const fetchMock = mockFetch();
    const channel = channelWithConfig({ telegramParseMode: 'none' });

    await channel.send({
      title: 'DAILY_SUMMARY',
      body: '✈️ Viaje Diciembre\n\nTags: CHEAPEST, GOOD_TIME, RECOMMENDED.',
    });

    expect(requestPayload(fetchMock)).toMatchObject({
      text: '✈️ Viaje Diciembre\n\nTags: CHEAPEST, GOOD_TIME, RECOMMENDED.',
    });
    expect(requestPayload(fetchMock).text).not.toContain('DAILY_SUMMARY:');
    expect(requestPayload(fetchMock)).not.toHaveProperty('parse_mode');
  });

  it('does not prefix INITIAL_SUMMARY technical title in the final message', async () => {
    const fetchMock = mockFetch();
    const channel = channelWithConfig({ telegramParseMode: 'none' });

    await channel.send({
      title: 'INITIAL_SUMMARY',
      body: '🔎 Resultado inicial\n\n✈️ Iron Maiden',
    });

    expect(requestPayload(fetchMock)).toMatchObject({
      text: '🔎 Resultado inicial\n\n✈️ Iron Maiden',
    });
    expect(requestPayload(fetchMock).text).not.toContain('INITIAL_SUMMARY:');
  });

  it('uses telegramChatId metadata when present', async () => {
    const fetchMock = mockFetch();
    const channel = channelWithConfig({ telegramParseMode: 'none' });

    await channel.send({
      title: '',
      body: 'Mensaje para una alerta creada desde el bot.',
      metadata: { telegramChatId: 'tester-chat' },
    });

    expect(requestPayload(fetchMock)).toMatchObject({
      chat_id: 'tester-chat',
      text: 'Mensaje para una alerta creada desde el bot.',
    });
  });

  it('sends a long daily summary as plain text', async () => {
    const fetchMock = mockFetch();
    const channel = channelWithConfig({ telegramParseMode: 'none' });

    await channel.send({
      title: 'DAILY_SUMMARY',
      body: [
        'Viaje Diciembre: JUJ-AEP 2026-12-20 al 2026-12-28.',
        'Opciones válidas: 5.',
        'Precio más barato: 234574 ARS.',
        'Recomendada: 241000 ARS.',
        'Tags: CHEAPEST, GOOD_TIME, RECOMMENDED.',
      ].join(' '),
    });

    const payload = requestPayload(fetchMock);
    expect(payload.text).toContain('Viaje Diciembre');
    expect(payload.text).toContain('GOOD_TIME');
    expect(payload.text).not.toContain('DAILY_SUMMARY:');
    expect(payload).not.toHaveProperty('parse_mode');
  });

  it('escapes MarkdownV2 when explicitly configured', async () => {
    const fetchMock = mockFetch();
    const channel = channelWithConfig({ telegramParseMode: 'MarkdownV2' });

    await channel.send({
      title: 'PRICE_DROP',
      body: 'AEROLINEAS_ARGENTINAS GOOD_TIME price=288038.',
    });

    expect(requestPayload(fetchMock)).toEqual({
      chat_id: 'chat-id',
      text: 'AEROLINEAS\\_ARGENTINAS GOOD\\_TIME price\\=288038\\.',
      parse_mode: 'MarkdownV2',
    });
  });

  it('escapes HTML when explicitly configured', async () => {
    const fetchMock = mockFetch();
    const channel = channelWithConfig({ telegramParseMode: 'HTML' });

    await channel.send({
      title: 'DAILY_SUMMARY',
      body: 'AEP < JUJ & fare > Base',
    });

    expect(requestPayload(fetchMock)).toEqual({
      chat_id: 'chat-id',
      text: 'AEP &lt; JUJ &amp; fare &gt; Base',
      parse_mode: 'HTML',
    });
  });
});

function channelWithConfig(values: Record<string, string>): TelegramNotificationChannel {
  return new TelegramNotificationChannel({
    get: jest.fn((key: string) => ({
      telegramBotToken: 'token',
      telegramChatId: 'chat-id',
      ...values,
    })[key]),
  } as unknown as ConfigService);
}

function mockFetch(): jest.Mock {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    text: jest.fn().mockResolvedValue('ok'),
  });
  global.fetch = fetchMock;
  return fetchMock;
}

function requestPayload(fetchMock: jest.Mock): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}
