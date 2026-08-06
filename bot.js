// ═══════════════════════════════════════════════════════
//  TELEGRAM BOT - bot.js
// ═══════════════════════════════════════════════════════

const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;

let bot = null;

if (TOKEN) {
  // Polling is required for Telegram inline-button callbacks.
  bot = new TelegramBot(TOKEN, { polling: Boolean(ADMIN_CHAT_ID) });
  console.log('✅ Telegram Bot initialized');
} else {
  console.warn('⚠️  TELEGRAM_BOT_TOKEN not set — bot disabled');
}

// ─── Send Order Confirmation to Buyer ────────────────
async function sendOrderConfirmation(order) {
  if (!bot) return;
  try {
    const chatId = normalizeTelegram(order.buyer_telegram);
    if (!chatId) return;

    const discount = order.product_discount || 0;
    const priceText = discount > 0
      ? `$${Number(order.product_price).toFixed(2)} ~~$${Number(order.product_original_price).toFixed(2)}~~ (-${discount}%)`
      : `$${Number(order.product_price).toFixed(2)}`;

    const msg = `🎉 *ការទិញរបស់អ្នករួចហើយ!*\n\n` +
      `📦 *${escMd(order.product_name)}*\n` +
      `💰 ${priceText}\n` +
      `🆔 Order #${order.id}\n\n` +
      (order.page_link ? `🔗 *Link ផេករបស់អ្នក:*\n${order.page_link}\n\n` : '') +
      `📞 *បញ្ហា?* ទំនាក់ @${escMd(order.admin_telegram || 'admin')}\n\n` +
      `✅ អរគុណដែលបានទិញ!`;

    // Send photo + caption if image available
    if (order.product_image) {
      await bot.sendPhoto(chatId, order.product_image, {
        caption: msg,
        parse_mode: 'Markdown'
      });
    } else {
      await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    }

    console.log(`✅ Bot: sent confirmation to ${chatId}`);
  } catch (err) {
    console.error('❌ Bot sendOrderConfirmation error:', err.message);
  }
}

// ─── Notify Admin on New Order ────────────────────────
async function notifyAdminNewOrder(order, adminTelegram) {
  if (!bot) {
    console.warn('Telegram admin notification skipped: TELEGRAM_BOT_TOKEN is not set');
    return false;
  }
  try {
    // Telegram bots cannot message private users by @username. Prefer the
    // numeric chat ID configured in Railway; accept a numeric legacy value.
    const legacyChatId = /^-?\d+$/.test(String(adminTelegram || '').trim())
      ? String(adminTelegram).trim()
      : null;
    const chatId = String(ADMIN_CHAT_ID || legacyChatId || '').trim();
    if (!chatId) {
      console.warn('Telegram admin notification skipped: TELEGRAM_ADMIN_CHAT_ID is not set');
      return false;
    }

    const msg = `🛒 *Order ថ្មី #${order.id}*\n\n` +
      `📦 ${escMd(order.product_name)}\n` +
      `💰 $${Number(order.product_price).toFixed(2)}\n` +
      `👤 ${escMd(order.buyer_name)}\n` +
      `📱 Telegram: @${escMd(order.buyer_telegram)}\n` +
      (order.buyer_phone ? `📞 ទូរស័ព្ទ: ${escMd(order.buyer_phone)}\n` : '') +
      `\n⏳ ចុចConfirm នៅ Admin Panel!`;

    await bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ យល់ព្រម', callback_data: `order_confirm:${order.id}` },
          { text: '❌ បដិសេធ', callback_data: `order_cancel:${order.id}` }
        ]]
      }
    });
    console.log(`✅ Bot: notified admin ${chatId}`);
    return true;
  } catch (err) {
    console.error('❌ Bot notifyAdmin error:', err.message);
    return false;
  }
}

// ─── Handle Order Actions from Telegram ───────────────
if (bot && ADMIN_CHAT_ID) {
  bot.on('callback_query', async (query) => {
    const match = /^(order_confirm|order_cancel):(\d+)$/.exec(query.data || '');
    if (!match) return;

    // Only the configured admin is allowed to change an order.
    if (String(query.from?.id) !== String(ADMIN_CHAT_ID)) {
      await bot.answerCallbackQuery(query.id, {
        text: 'អ្នកមិនមានសិទ្ធិគ្រប់គ្រង Order នេះទេ',
        show_alert: true
      });
      return;
    }

    const orderId = Number(match[2]);
    const newStatus = match[1] === 'order_confirm' ? 'delivered' : 'cancelled';

    try {
      // Lazy require avoids changing application startup order.
      const pool = require('./database');
      const result = await pool.query(
        `UPDATE orders
         SET status=$1, updated_at=CURRENT_TIMESTAMP
         WHERE id=$2 AND status='pending'
         RETURNING id`,
        [newStatus, orderId]
      );

      if (result.rows.length === 0) {
        await bot.answerCallbackQuery(query.id, {
          text: 'Order នេះបានដោះស្រាយរួចហើយ',
          show_alert: true
        });
        return;
      }

      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );

      const approved = newStatus === 'delivered';
      await bot.answerCallbackQuery(query.id, {
        text: approved ? 'បានយល់ព្រម Order' : 'បានបដិសេធ Order'
      });
      await bot.sendMessage(
        query.message.chat.id,
        `${approved ? '✅ បានយល់ព្រម' : '❌ បានបដិសេធ'} Order #${orderId}`
      );
    } catch (err) {
      console.error('❌ Bot order action error:', err.message);
      await bot.answerCallbackQuery(query.id, {
        text: 'មានបញ្ហា សូមព្យាយាមម្ដងទៀត',
        show_alert: true
      }).catch(() => {});
    }
  });

  bot.on('polling_error', (err) => {
    console.error('❌ Telegram polling error:', err.message);
  });
}

// ─── Helpers ──────────────────────────────────────────
function normalizeTelegram(username) {
  if (!username) return null;
  // Accept @username, username, or numeric chat_id
  const clean = username.trim().replace(/^@/, '');
  if (!clean) return null;
  return clean;
}

function escMd(str) {
  if (!str) return '';
  return String(str).replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

module.exports = { bot, sendOrderConfirmation, notifyAdminNewOrder };
