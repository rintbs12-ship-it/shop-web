// ═══════════════════════════════════════════════════════
//  TELEGRAM BOT - bot.js
// ═══════════════════════════════════════════════════════

const TelegramBot = require('node-telegram-bot-api');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let bot = null;

if (TOKEN) {
  bot = new TelegramBot(TOKEN, { polling: false });
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
  if (!bot || !adminTelegram) return;
  try {
    const chatId = normalizeTelegram(adminTelegram);
    if (!chatId) return;

    const msg = `🛒 *Order ថ្មី #${order.id}*\n\n` +
      `📦 ${escMd(order.product_name)}\n` +
      `💰 $${Number(order.product_price).toFixed(2)}\n` +
      `👤 ${escMd(order.buyer_name)}\n` +
      `📱 Telegram: @${escMd(order.buyer_telegram)}\n` +
      (order.buyer_phone ? `📞 ទូរស័ព្ទ: ${escMd(order.buyer_phone)}\n` : '') +
      `\n⏳ ចុចConfirm នៅ Admin Panel!`;

    await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    console.log(`✅ Bot: notified admin ${chatId}`);
  } catch (err) {
    console.error('❌ Bot notifyAdmin error:', err.message);
  }
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
