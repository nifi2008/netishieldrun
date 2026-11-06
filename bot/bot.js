/**
 * NetiShield Run - Telegram Bot
 * Uses official Telegram Games (sendGame) - NOT Mini Apps / Web Apps
 */

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const path = require('path');

// ========== Config & Validation ==========
const BOT_TOKEN = process.env.BOT_TOKEN;
const GAME_SHORT_NAME = process.env.GAME_SHORT_NAME || 'netishieldrun';
const GAME_URL = process.env.GAME_URL;
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean)
  .map((id) => Number(id));

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is missing. Copy .env.example to .env and set your token.');
  process.exit(1);
}

if (!GAME_URL) {
  console.warn('⚠️  GAME_URL is not set. answerCallbackQuery will fail until you set a valid HTTPS URL.');
}

const bot = new Telegraf(BOT_TOKEN);

// ========== Helpers ==========
function isAdmin(userId) {
  if (!ADMIN_IDS.length) return false;
  return ADMIN_IDS.includes(Number(userId));
}

function log(msg, extra = '') {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`, extra);
}

// ========== Commands ==========

// /start
bot.start(async (ctx) => {
  const name = ctx.from?.first_name || 'Player';
  await ctx.reply(
    `🛡️ *NetiShield Run*\n\nسلام ${name}!\n\nیک بازی آرکید Runner با هویت بصری نئونی NetiShield.\n\nبرای شروع بازی از دستور زیر استفاده کن:\n/game\n\nدستورات:\n/game — ارسال بازی\n/help — راهنما`,
    { parse_mode: 'Markdown' }
  );
});

// /help
bot.help(async (ctx) => {
  await ctx.reply(
    `📖 *راهنمای NetiShield Run*\n\n` +
      `/game — دریافت پیام رسمی بازی (Telegram Game)\n` +
      `/help — همین پیام\n\n` +
      `*مدیر:*\n` +
      `/sendgame — ارسال بازی برای مدیر (جهت فوروارد دستی)\n\n` +
      `⚠️ محدودیت رسمی تلگرام:\n` +
      `متد sendGame به کانال‌ها پشتیبانی نمی‌شود.\n` +
      `برای انتشار در کانال، پیام بازی را از چت خصوصی/گروه فوروارد کنید.`,
    { parse_mode: 'Markdown' }
  );
});

// /game — send official Game message
bot.command('game', async (ctx) => {
  try {
    // sendGame only works in private chats and groups/supergroups — NOT channels
    await ctx.replyWithGame(GAME_SHORT_NAME);
    log(`sendGame OK → chat ${ctx.chat.id} user ${ctx.from?.id}`);
  } catch (err) {
    const desc = err?.response?.description || err.message || String(err);
    log(`sendGame FAILED: ${desc}`);

    if (desc.includes('GAME_SHORT_NAME_INVALID') || desc.includes('game_short_name')) {
      await ctx.reply(
        '❌ نام کوتاه بازی نامعتبر است.\n' +
          'ابتدا بازی را با /newgame در @BotFather ثبت کنید و GAME_SHORT_NAME را در .env تنظیم کنید.'
      );
    } else if (desc.includes('channel') || desc.includes('CHANNEL')) {
      await ctx.reply(
        '❌ طبق محدودیت رسمی Telegram Bot API، ارسال بازی (sendGame) به کانال‌ها مجاز نیست.\n' +
          'بازی را در چت خصوصی یا گروه ارسال کنید و سپس به‌صورت دستی فوروارد کنید.'
      );
    } else {
      await ctx.reply(`❌ خطا در ارسال بازی:\n${desc}`);
    }
  }
});

// /sendgame — admin only: send game to admin so they can forward manually
bot.command('sendgame', async (ctx) => {
  if (!isAdmin(ctx.from?.id)) {
    await ctx.reply('⛔ این دستور فقط برای مدیران مجاز است.');
    return;
  }

  try {
    await ctx.replyWithGame(GAME_SHORT_NAME);
    await ctx.reply(
      '✅ پیام بازی ارسال شد.\n\n' +
        '📌 برای انتشار در کانال:\n' +
        '1. روی پیام بازی بالا long-press / راست‌کلیک کنید\n' +
        '2. Forward را انتخاب کنید\n' +
        '3. کانال مقصد را انتخاب کنید\n\n' +
        '⚠️ توجه: Bot API امکان sendGame مستقیم به کانال را نمی‌دهد. فوروارد دستی روش رسمی و پشتیبانی‌شده است.'
    );
    log(`Admin sendgame → user ${ctx.from.id}`);
  } catch (err) {
    const desc = err?.response?.description || err.message || String(err);
    log(`Admin sendgame FAILED: ${desc}`);
    await ctx.reply(`❌ خطا: ${desc}`);
  }
});

// ========== Callback Query (Play button) ==========
// When user presses Play on a Game message, Telegram sends callback_query with game_short_name
bot.on('callback_query', async (ctx) => {
  const cq = ctx.callbackQuery;

  // Game launch callback
  if (cq.game_short_name) {
    if (cq.game_short_name !== GAME_SHORT_NAME) {
      await ctx.answerCbQuery('بازی ناشناخته است.', { show_alert: true });
      return;
    }

    if (!GAME_URL) {
      await ctx.answerCbQuery(
        'آدرس بازی (GAME_URL) تنظیم نشده است. به مدیر اطلاع دهید.',
        { show_alert: true }
      );
      return;
    }

    // Optional: append user id for analytics (not required by Telegram)
    // Telegram may append its own tg* fragment parameters
    const url = GAME_URL;

    try {
      await ctx.answerCbQuery(undefined, { url });
      log(`Game opened → user ${cq.from.id} url ${url}`);
    } catch (err) {
      const desc = err?.response?.description || err.message || String(err);
      log(`answerCbQuery FAILED: ${desc}`);
      await ctx.answerCbQuery('خطا در باز کردن بازی.', { show_alert: true });
    }
    return;
  }

  // Other callback data (if any future buttons)
  await ctx.answerCbQuery();
});

// ========== High Score helpers (optional, for future server-side score submit) ==========
/**
 * Example usage from a secure backend endpoint (never expose bot token to client):
 *
 * await bot.telegram.setGameScore(userId, score, {
 *   chat_id: chatId,
 *   message_id: messageId,
 *   force: false,
 *   disable_edit_message: false
 * });
 *
 * Note: Scores are per-chat / per-game-message.
 * The HTML game cannot call setGameScore directly with the bot token.
 * You need an intermediate HTTPS endpoint that validates the request.
 */

// ========== Error handling ==========
bot.catch((err, ctx) => {
  log(`Unhandled error for ${ctx.updateType}`, err.message || err);
});

// ========== Launch ==========
async function main() {
  log('Starting NetiShield Run bot...');
  log(`GAME_SHORT_NAME = ${GAME_SHORT_NAME}`);
  log(`GAME_URL = ${GAME_URL || '(not set)'}`);
  log(`Admins = ${ADMIN_IDS.length ? ADMIN_IDS.join(', ') : '(none configured)'}`);

  await bot.launch();
  log('✅ Bot is running (long polling)');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
