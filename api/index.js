const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");

// ==================================================
// CONFIG — hardcoded
// ==================================================
const BOT_TOKEN = "8833680848:AAFsKWMuPk0YZPv_rg3d_2VJAzMnklUG6-Y";
const BOT_USERNAME = "CashRichesBot";
const MONGO_URI = "mongodb+srv://onlydatabase14_db_user:fOTYbj5lwDoUEHcu@cluster0.8jzothz.mongodb.net/?appName=Cluster0"; // ⚠️ TUM APNA NAYA MONGO URI YAHAN DAALO — abhi purana wala hai
const ADMIN_PASSWORD = "DevloperRavi"; // Main Admin Panel ka password — chaho to badal do
const DEV_VERIFY_PASSWORD = "DevRaviPanel"; // Device Verification Panel ka ALAG password — chaho to badal do
const RAVIPANEL_PASSWORD = ADMIN_PASSWORD; // /ravipanel bot command isi Admin Password se open hoga
const ADMIN_TELEGRAM_IDS = ["6970779071"]; // ⚠️ FIX: pehle ye ek plain string thi (bina [ ]) — isi wajah se new-user notification character-by-character bhejne ki koshish kar raha tha aur fail ho raha tha. Ab sahi array hai — aur ID add karni ho to comma se yahan daal dena.
const APP_URL = "https://cash-rich.vercel.app"; // ⚠️ pehli baar deploy karne ke baad apne asli Vercel URL se replace karo
const APP_NAME = "🤑💸 Cash Rich";
const POWERED_BY_HANDLE = "@MAKERBOTRAVIII";
const POWERED_BY_LINK_TEXT = "RAVI MAKER PRO";
const POWERED_BY_LINK_URL = "https://t.me/ravimakerprobot";

const PORT = process.env.PORT || 3000;

// ==================================================
// MODELS
// ==================================================
const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },

    balance: { type: Number, default: 0 },

    verified: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
    banReason: { type: String, default: "" },

    referredBy: { type: String, default: null },
    referCount: { type: Number, default: 0 },

    spinChances: { type: Number, default: 0 },
    pendingScratchCards: { type: Number, default: 0 },

    // Claim Bonus form — filled once, right after verification succeeds
    claimedBonus: { type: Boolean, default: false },
    realName: { type: String, default: "" },
    realNumber: { type: String, default: "" },
    upiId: { type: String, default: "" },
    email: { type: String, default: "" },

    withdrawalsToday: { type: Number, default: 0 },
    lastWithdrawDate: { type: String, default: "" },
    lastWalletWithdrawAt: { type: Date, default: null },
    lastUpiWithdrawAt: { type: Date, default: null },
    lastGiftCardWithdrawAt: { type: Date, default: null },

    walletNumber: { type: String, default: "" },
    joinedChannels: { type: Boolean, default: false },
    channelJoinRequests: { type: [String], default: [] },
    deviceFingerprint: { type: String, default: "", index: true },
    lastIp: { type: String, default: "", index: true },
    ipHistory: { type: [String], default: [] },

    captchaAnswer: { type: Number, default: null },
    captchaExpiresAt: { type: Date, default: null },
    verifiedViaFallbackChannel: { type: Boolean, default: false },

    lastCheckinDate: { type: String, default: "" },
    checkinStreak: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const User = mongoose.models.User || mongoose.model("User", userSchema);

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  chatId: { type: String, required: true },
  forced: { type: Boolean, default: true },
  adminIssueNotified: { type: Boolean, default: false },
});

const gatewaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  apiUrl: { type: String, required: true }, // template with {wallet} {amount}
});

const settingsSchema = new mongoose.Schema({
  key: { type: String, default: "main", unique: true },
  channels: { type: [channelSchema], default: [] },

  botEnabled: { type: Boolean, default: true },

  payoutChannel: {
    chatId: { type: String, default: "" },
    name: { type: String, default: "" },
  },

  // Refer
  referMode: { type: String, enum: ["amount", "chance"], default: "amount" },
  referAmount: { type: Number, default: 5 },

  // Spin Wheel (referral "chance" reward)
  spinWheelSegments: { type: [Number], default: [5, 10, 20, 30, 50, 100, 150, 200] },

  // Leaderboard — admin picks how many users are visible, and how many of
  // those (from the top) get a manual cash reward. leaderboardRewards[0] is
  // Top-1's reward, [1] is Top-2's, etc — length should match rewardCount.
  leaderboardDisplayCount: { type: Number, default: 20 },
  leaderboardRewardCount: { type: Number, default: 5 },
  leaderboardRewards: { type: [Number], default: [20, 15, 10, 5, 2] },
  leaderboardPrizeBy: { type: String, default: "" }, // admin username who manually distributes the prize
  leaderboardSponsor: { type: String, default: "" },

  // Withdrawal — Wallet
  withdrawWalletEnabled: { type: Boolean, default: true },
  gateways: { type: [gatewaySchema], default: [] },
  walletMin: { type: Number, default: 10 },
  walletMax: { type: Number, default: 500 },
  walletWithdrawTaxPercent: { type: Number, default: 0 },
  walletWithdrawCooldownMinutes: { type: Number, default: 0 },

  // Withdrawal — UPI
  withdrawUpiEnabled: { type: Boolean, default: false },
  upiMin: { type: Number, default: 10 },
  upiMax: { type: Number, default: 500 },
  upiWithdrawTaxPercent: { type: Number, default: 0 },
  upiWithdrawCooldownMinutes: { type: Number, default: 0 },

  // Withdrawal — Google Play Gift Card (manual, admin-approved)
  withdrawGiftCardEnabled: { type: Boolean, default: false },
  giftCardCooldownMinutes: { type: Number, default: 0 },

  withdrawalsPerDay: { type: Number, default: 2 },

  // Withdrawal eligibility gate
  minReferralsForWithdrawal: { type: Number, default: 0 }, // 0 = no restriction
  maxWithdrawalAmount: { type: Number, default: 500 }, // overall cap, separate from per-gateway walletMax

  // Scratch Card (only relevant when referMode === "amount")
  scratchCardReferThreshold: { type: Number, default: 0 }, // 0 = disabled — e.g. 3 = every 3rd referral
  scratchCardMinReward: { type: Number, default: 0.5 },
  scratchCardMaxReward: { type: Number, default: 2 },

  // Verification: "enabled" (device-fingerprint verify.html), "disabled" (skip), "captcha" (math captcha)
  verificationMode: { type: String, enum: ["enabled", "disabled", "captcha"], default: "enabled" },
  captchaTimeSeconds: { type: Number, default: 15 },
  captchaForceChannel: {
    chatId: { type: String, default: "" },
    name: { type: String, default: "" },
    url: { type: String, default: "" },
  },

  // Daily check-in bonus
  dailyCheckinEnabled: { type: Boolean, default: true },
  dailyCheckinAmount: { type: Number, default: 2 },

  // Device Verification Panel — artificial random-fail injection on top of
  // real device checks, managed via a separate panel/password.
  deviceVerificationFailPercent: { type: Number, default: 0 }, // 0-100
  deviceVerificationFailAction: { type: String, enum: ["ban", "no_refer_bonus"], default: "no_refer_bonus" },
});
settingsSchema.statics.getSettings = async function () {
  let s = await this.findOne({ key: "main" });
  if (!s) s = await this.create({ key: "main" });
  return s;
};
const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);

const giftCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    maxClaims: { type: Number, required: true },
    amountPerUser: { type: Number, required: true },
    claimedBy: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
const GiftCode = mongoose.models.GiftCode || mongoose.model("GiftCode", giftCodeSchema);

function generateGiftCode() {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const num = Math.floor(1000 + Math.random() * 9000);
  let letters = "";
  for (let i = 0; i < 4; i++) letters += alpha[Math.floor(Math.random() * alpha.length)];
  return `GIFT-${num}${letters}`;
}

const withdrawalRequestSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true },
    method: { type: String, enum: ["upi", "giftcard"], default: "upi" },
    upiId: { type: String, default: "" },
    amount: { type: Number, required: true },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    payoutAmount: { type: Number, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    adminMessages: { type: [{ chatId: String, messageId: Number }], default: [] },
    channelMsgChatId: { type: String, default: "" },
    channelMsgId: { type: Number, default: null },
  },
  { timestamps: true }
);
const WithdrawalRequest = mongoose.models.WithdrawalRequest || mongoose.model("WithdrawalRequest", withdrawalRequestSchema);

const withdrawalLogSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true },
    method: { type: String, enum: ["wallet", "upi"], required: true },
    amount: { type: Number, required: true },
    gatewayName: { type: String, default: "UPI" },
  },
  { timestamps: true }
);
const WithdrawalLog = mongoose.models.WithdrawalLog || mongoose.model("WithdrawalLog", withdrawalLogSchema);

const giftCardCodeSchema = new mongoose.Schema(
  {
    denomination: { type: Number, required: true },
    code: { type: String, required: true },
    claimed: { type: Boolean, default: false },
    claimedBy: { type: String, default: "" },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
const GiftCardCode = mongoose.models.GiftCardCode || mongoose.model("GiftCardCode", giftCardCodeSchema);

// ==================================================
// DB CONNECTION (cached across serverless invocations)
// ==================================================
let dbReady = null;
async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!dbReady) {
    dbReady = mongoose.connect(MONGO_URI).then(
      () => console.log("✅ MongoDB connected"),
      (err) => {
        dbReady = null; // allow retry on next request instead of caching the failure forever
        throw err;
      }
    );
  }
  await dbReady;
}

// ==================================================
// BOT — webhook mode
// ==================================================
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

let BOT_ID = null;
async function getBotId() {
  if (!BOT_ID) {
    const me = await bot.getMe();
    BOT_ID = me.id;
  }
  return BOT_ID;
}

async function verifyBotIsAdmin(chatId) {
  try {
    const botId = await getBotId();
    const member = await bot.getChatMember(chatId, botId);
    return ["administrator", "creator"].includes(member.status);
  } catch (err) {
    return false;
  }
}

async function getUserPhotoUrl(telegramId) {
  try {
    const photos = await bot.getUserProfilePhotos(telegramId, { limit: 1 });
    if (photos.total_count > 0) {
      const fileId = photos.photos[0][0].file_id;
      const file = await bot.getFile(fileId);
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    }
  } catch (e) {
    // no photo or bot can't access it — fine, frontend falls back to an emoji avatar
  }
  return null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function userDeepLink(user) {
  return user.username ? `https://t.me/${user.username}` : `tg://user?id=${user.telegramId}`;
}

function maskNumber(num) {
  const s = String(num || "");
  if (s.length <= 4) return s;
  return s.slice(0, 2) + "•".repeat(Math.max(0, s.length - 4)) + s.slice(-2);
}

function escapeMd(text) {
  return String(text || "").replace(/([_*[\]()~`>#+=|{}.!-])/g, "\\$1");
}

function parseGatewayResult(responseText) {
  const lower = String(responseText || "").toLowerCase();
  if (lower.includes("insufficient")) return { success: false, reason: "Insufficient Balance" };
  if (lower.includes("unauthorized") || lower.includes("invalid token") || lower.includes("auth fail") || lower.includes("bad auth")) {
    return { success: false, reason: "Unauthorized Token" };
  }
  if (lower.includes("min payout") || lower.includes("minimum payout") || lower.includes("min amount") || lower.includes("minimum amount")) {
    return { success: false, reason: "Min Payout" };
  }
  if (lower.includes("own account") || lower.includes("self account") || lower.includes("same account")) {
    return { success: false, reason: "Own Account" };
  }
  if (lower.includes("account not found") || lower.includes("not found") || lower.includes("invalid account")) {
    return { success: false, reason: "Not Found Account" };
  }
  if (lower.includes("fail") || lower.includes("declined") || lower.includes("rejected") || lower.includes("error")) {
    return { success: false, reason: "Failed" };
  }
  return { success: true, reason: "Success" };
}

async function getForcedPendingChannels(userId, channels) {
  const forcedChannels = (channels || []).filter((ch) => ch.forced !== false);
  if (forcedChannels.length === 0) return [];

  const user = await User.findOne({ telegramId: String(userId) }).select("channelJoinRequests");
  const sentRequests = user?.channelJoinRequests || [];

  const pending = [];
  for (const ch of forcedChannels) {
    // A pending join request on a private channel counts as "joined" for
    // our purposes — we can't see full membership until an admin approves it,
    // but the request itself proves intent, so we don't block on it.
    if (sentRequests.includes(String(ch.chatId))) continue;

    try {
      const member = await bot.getChatMember(ch.chatId, userId);
      if (["left", "kicked"].includes(member.status)) pending.push({ name: ch.name, url: ch.url });
    } catch (err) {
      pending.push({ name: ch.name, url: ch.url });
    }
  }
  return pending;
}

async function checkChannelsJoined(userId, channels) {
  const pending = await getForcedPendingChannels(userId, channels);
  return pending.length === 0;
}

// 1 row = 2 buttons
function joinChannelsKeyboard(channels) {
  const rows = [];
  for (let i = 0; i < channels.length; i += 2) {
    const pair = channels.slice(i, i + 2).map((ch) => ({
      text: `📢 ${ch.name}${ch.forced === false ? " (optional)" : ""}`,
      url: ch.url,
    }));
    rows.push(pair);
  }
  rows.push([{ text: "✅ I've Joined", callback_data: "check_joined" }]);
  return { inline_keyboard: rows };
}

async function sendAccessRestricted(chatId, channels) {
  await bot.sendMessage(
    chatId,
    `🚫 *ACCESS RESTRICTED*\n\n${APP_NAME} use karne ke liye pehle ye channels join karo:`,
    { parse_mode: "Markdown", reply_markup: joinChannelsKeyboard(channels) }
  );
}

async function sendVerificationPrompt(chatId, telegramId) {
  const sent = await bot.sendMessage(
    chatId,
    `🎗️ *WELCOME TO ${APP_NAME.replace("🎗️ ", "").toUpperCase()} BOT*\n\n🚫 ACCESS RESTRICTED\nPlease verify your account to continue.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔐 Open Verification", web_app: { url: `${APP_URL}/verify.html?uid=${telegramId}&cid=${chatId}&mid=` } }],
        ],
      },
    }
  );
  await bot.editMessageReplyMarkup(
    {
      inline_keyboard: [
        [
          {
            text: "🔐 Open Verification",
            web_app: { url: `${APP_URL}/verify.html?uid=${telegramId}&cid=${chatId}&mid=${sent.message_id}` },
          },
        ],
      ],
    },
    { chat_id: chatId, message_id: sent.message_id }
  );
}

async function sendCaptchaPrompt(chatId, telegramId) {
  const sent = await bot.sendMessage(
    chatId,
    `🎗️ *WELCOME TO ${APP_NAME.replace("🎗️ ", "").toUpperCase()} BOT*\n\n🧮 ACCESS RESTRICTED\nSolve a quick captcha to continue.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧮 Solve Captcha", web_app: { url: `${APP_URL}/captcha.html?uid=${telegramId}&cid=${chatId}&mid=` } }],
        ],
      },
    }
  );
  await bot.editMessageReplyMarkup(
    {
      inline_keyboard: [
        [
          {
            text: "🧮 Solve Captcha",
            web_app: { url: `${APP_URL}/captcha.html?uid=${telegramId}&cid=${chatId}&mid=${sent.message_id}` },
          },
        ],
      ],
    },
    { chat_id: chatId, message_id: sent.message_id }
  );
}

async function sendMiniAppWelcome(chatId, telegramId) {
  await bot.sendMessage(chatId, `💰 *WELCOME TO ${APP_NAME}*\n\nRefer & earn! 🧵`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "🚀 Open Mini App", web_app: { url: `${APP_URL}/index.html?uid=${telegramId}` } }]],
    },
  });
}

async function sendClaimBonusPrompt(chatId, telegramId) {
  await bot.sendMessage(chatId, `🎉 *VERIFIED!*\n\nAapki verification complete ho gayi hai.\nApna welcome bonus claim karne ke liye niche button dabao 👇`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "🎁 Claim Bonus", web_app: { url: `${APP_URL}/claim.html?uid=${telegramId}` } }]],
    },
  });
}

// After verification, a user who hasn't filled the Claim Bonus form yet
// always goes to claim.html first — the main mini app only opens after that.
async function sendPostVerifyEntry(chatId, telegramId, user) {
  if (!user || !user.claimedBonus) {
    await sendClaimBonusPrompt(chatId, telegramId);
  } else {
    await sendMiniAppWelcome(chatId, telegramId);
  }
}

async function handleEntry(chatId, telegramId) {
  const settings = await Settings.getSettings();

  if (!settings.botEnabled) {
    await bot.sendMessage(chatId, "🚫 *Bot is currently OFF*\n\nPlease check back later.", { parse_mode: "Markdown" });
    return;
  }

  const user = await User.findOne({ telegramId });
  const allForcedChannels = settings.channels.filter((c) => c.forced !== false);

  if (user && user.banned) {
    await sendAccessRestricted(chatId, allForcedChannels);
    return;
  }

  const pendingChannels = await getForcedPendingChannels(telegramId, settings.channels);
  if (pendingChannels.length > 0) {
    if (user) {
      user.joinedChannels = false;
      await user.save();
    }
    // On /start, show the FULL channel list — recheck (check_joined) narrows it down to only what's still pending.
    await sendAccessRestricted(chatId, allForcedChannels);
    return;
  }

  if (user) {
    user.joinedChannels = true;
    await user.save();
  }

  if (settings.verificationMode !== "disabled" && (!user || !user.verified)) {
    if (settings.verificationMode === "captcha") {
      await sendCaptchaPrompt(chatId, telegramId);
    } else {
      await sendVerificationPrompt(chatId, telegramId);
    }
  } else {
    await sendPostVerifyEntry(chatId, telegramId, user);
  }
}

async function notifyAdminNewUser(user) {
  const referrer = user.referredBy ? await User.findOne({ telegramId: user.referredBy }) : null;
  const userName = user.firstName || user.username || "Unknown";
  const referrerLine = referrer
    ? `REFERRER ~ ${referrer.firstName || referrer.username || "Unknown"} (\`${referrer.telegramId}\`)`
    : `REFERRER ~ None`;

  const buttons = [[{ text: "👤 View User", url: userDeepLink(user) }]];
  if (referrer) buttons.push([{ text: "👥 View Referrer", url: userDeepLink(referrer) }]);

  const text = `🆕 *NEW USER JOINED IN BOT*\n\nUSER ~ ${userName} (\`${user.telegramId}\`)\n${referrerLine}\n\nPowered by [${POWERED_BY_LINK_TEXT}](${POWERED_BY_LINK_URL})`;

  for (const adminId of ADMIN_TELEGRAM_IDS) {
    await bot
      .sendMessage(adminId, text, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } })
      .catch((err) => console.error("new user notify failed:", err.message));
  }
}

async function handleStart(msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const match = /\/start(?:\s+(.+))?/.exec(msg.text || "");
  const refCode = match && match[1] ? match[1].trim() : null;

  let user = await User.findOne({ telegramId });

  if (!user) {
    user = await User.create({
      telegramId,
      username: msg.from.username || "",
      firstName: msg.from.first_name || "",
      referredBy: refCode && refCode !== telegramId ? refCode : null,
    });
    await notifyAdminNewUser(user);
  }

  await handleEntry(chatId, telegramId);
}

async function resolveUpiRequest(requestId, approve) {
  const reqDoc = await WithdrawalRequest.findById(requestId).catch(() => null);
  if (!reqDoc || reqDoc.status !== "pending") return null;

  reqDoc.status = approve ? "approved" : "rejected";
  await reqDoc.save();

  const user = await User.findOne({ telegramId: reqDoc.telegramId });

  if (!approve) {
    if (user) {
      user.balance += reqDoc.amount;
      await user.save();
    }
    await sendAlert(
      reqDoc.telegramId,
      `❌ *Withdrawal Rejected*\n\nAapka ₹${reqDoc.amount} ka UPI withdrawal reject hua. Amount refund kar diya gaya hai.\n💰 Balance: ₹${user ? user.balance : "-"}`
    );
  } else {
    await WithdrawalLog.create({ telegramId: reqDoc.telegramId, method: "upi", amount: reqDoc.amount, gatewayName: "UPI" });
    await sendAlert(
      reqDoc.telegramId,
      `✅ *Withdrawal Approved*\n\n₹${reqDoc.payoutAmount} aapke UPI (\`${reqDoc.upiId}\`) pe bheja ja raha hai.`
    );
  }

  const statusText = approve ? "✅ APPROVED" : "❌ REJECTED";
  const editedText = `${statusText}\n\n👤 User ID: \`${reqDoc.telegramId}\`\n💰 Amount: ₹${reqDoc.amount}\n🧾 Tax: ₹${reqDoc.taxAmount}\n💵 Pay: ₹${reqDoc.payoutAmount}\n🏦 UPI ID: \`${reqDoc.upiId}\``;

  for (const am of reqDoc.adminMessages || []) {
    await bot.editMessageText(editedText, { chat_id: am.chatId, message_id: am.messageId, parse_mode: "Markdown" }).catch(() => {});
  }
  if (reqDoc.channelMsgChatId && reqDoc.channelMsgId) {
    await bot.editMessageText(editedText, { chat_id: reqDoc.channelMsgChatId, message_id: reqDoc.channelMsgId, parse_mode: "Markdown" }).catch(() => {});
  }

  return reqDoc;
}

async function handleCallbackQuery(query) {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);

  if (query.data.startsWith("upi_approve_") || query.data.startsWith("upi_reject_")) {
    if (!ADMIN_TELEGRAM_IDS.includes(telegramId)) {
      await bot.answerCallbackQuery(query.id, { text: "❌ Not authorized", show_alert: true });
      return;
    }
    const approve = query.data.startsWith("upi_approve_");
    const requestId = query.data.replace(approve ? "upi_approve_" : "upi_reject_", "");
    const result = await resolveUpiRequest(requestId, approve);
    await bot.answerCallbackQuery(query.id, { text: result ? (approve ? "✅ Approved" : "❌ Rejected") : "Already processed" });
    return;
  }

  if (query.data === "check_joined") {
    const settings = await Settings.getSettings();

    if (!settings.botEnabled) {
      await bot.answerCallbackQuery(query.id, { text: "🚫 Bot is currently OFF", show_alert: true });
      return;
    }

    const user = await User.findOne({ telegramId });
    if (user && user.banned) {
      await bot.answerCallbackQuery(query.id, { text: "❌ Aapne abhi tak sabhi channels join nahi kiye!", show_alert: true });
      return;
    }

    const pendingNow = await getForcedPendingChannels(telegramId, settings.channels);

    if (pendingNow.length > 0) {
      await bot.answerCallbackQuery(query.id, {
        text: `❌ Ye ${pendingNow.length} channel(s) abhi bhi join nahi hui:\n${pendingNow.map((c) => "• " + c.name).join("\n")}`,
        show_alert: true,
      });
      // Refresh the message so it only shows the channels still pending —
      // if the user already joined some, those disappear from the list.
      await bot
        .editMessageReplyMarkup(joinChannelsKeyboard(pendingNow), { chat_id: chatId, message_id: query.message.message_id })
        .catch(() => {});
      return;
    }

    await bot.answerCallbackQuery(query.id, { text: "✅ Verified! Continuing..." });

    if (user) {
      user.joinedChannels = true;
      await user.save();
    }

    if (settings.verificationMode !== "disabled" && (!user || !user.verified)) {
      if (settings.verificationMode === "captcha") {
        await sendCaptchaPrompt(chatId, telegramId);
      } else {
        await sendVerificationPrompt(chatId, telegramId);
      }
    } else {
      await sendPostVerifyEntry(chatId, telegramId, user);
    }
  }
}

async function sendAlert(telegramId, text) {
  try {
    await bot.sendMessage(telegramId, text, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("sendAlert failed:", err.message);
  }
}

async function banUser(telegramId, reason) {
  const user = await User.findOne({ telegramId });
  if (user) {
    user.banned = true;
    user.banReason = reason || "Verification failed";
    await user.save();
  }
  await sendAlert(telegramId, `⛔ *INSTANT BAN*\n\nAapko bot aur mini app se ban kar diya gaya hai.\nReason: ${reason || "Verification failed"}`);
}

async function editToMiniAppButton(chatId, messageId, telegramId) {
  try {
    await bot.editMessageText(`💰 *WELCOME TO ${APP_NAME}*`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🚀 Open Mini App", web_app: { url: `${APP_URL}/index.html?uid=${telegramId}` } }]] },
    });
  } catch (err) {
    console.error("editToMiniAppButton failed:", err.message);
  }
}

async function editToClaimBonusButton(chatId, messageId, telegramId) {
  try {
    await bot.editMessageText(`🎉 *VERIFIED!*\n\nApna welcome bonus claim karo 👇`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🎁 Claim Bonus", web_app: { url: `${APP_URL}/claim.html?uid=${telegramId}` } }]] },
    });
  } catch (err) {
    console.error("editToClaimBonusButton failed:", err.message);
  }
}

// Picks claim-bonus vs mini-app button depending on whether the user has
// already filled the Claim Bonus form.
async function editToPostVerifyButton(chatId, messageId, telegramId, user) {
  if (!user || !user.claimedBonus) {
    await editToClaimBonusButton(chatId, messageId, telegramId);
  } else {
    await editToMiniAppButton(chatId, messageId, telegramId);
  }
}

// ==================================================
// EXPRESS APP
// ==================================================
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("DB connection error:", err.message);
    res.status(500).json({ error: "DB connection failed", detail: err.message });
  }
});

function checkAdmin(req, res, next) {
  const pass = req.headers["x-admin-password"] || req.body.adminPassword || req.query.adminPassword;
  if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function checkDevVerifyAdmin(req, res, next) {
  const pass = req.headers["x-admin-password"] || req.body.adminPassword || req.query.adminPassword;
  if (pass !== DEV_VERIFY_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/api/devverify/settings", checkDevVerifyAdmin, async (req, res) => {
  const settings = await Settings.getSettings();
  res.json({
    deviceVerificationFailPercent: settings.deviceVerificationFailPercent,
    deviceVerificationFailAction: settings.deviceVerificationFailAction,
  });
});

app.post("/api/devverify/settings", checkDevVerifyAdmin, async (req, res) => {
  const { failPercent, failAction } = req.body;
  const settings = await Settings.getSettings();
  if (failPercent !== undefined) settings.deviceVerificationFailPercent = Math.max(0, Math.min(100, Number(failPercent)));
  if (failAction && ["ban", "no_refer_bonus"].includes(failAction)) settings.deviceVerificationFailAction = failAction;
  await settings.save();
  res.json({
    deviceVerificationFailPercent: settings.deviceVerificationFailPercent,
    deviceVerificationFailAction: settings.deviceVerificationFailAction,
  });
});

// ---------- TELEGRAM WEBHOOK ----------
async function handleChatJoinRequest(joinReq) {
  try {
    const chatId = String(joinReq.chat.id);
    const telegramId = String(joinReq.from.id);

    const settings = await Settings.getSettings();
    const isOurChannel = settings.channels.some((ch) => String(ch.chatId) === chatId || ch.chatId === `@${joinReq.chat.username}`);
    if (!isOurChannel) return;

    const user = await User.findOne({ telegramId });
    if (!user) return;

    if (!user.channelJoinRequests) user.channelJoinRequests = [];
    if (!user.channelJoinRequests.includes(chatId)) {
      user.channelJoinRequests.push(chatId);
      await user.save();
    }
  } catch (err) {
    console.error("chat_join_request record failed:", err.message);
  }
}

// ---------- /ravipanel — in-bot Admin Panel access ----------
const ravipanelAwaitingPassword = new Set(); // telegramIds currently being asked for the password

async function handleRavipanelCommand(msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  if (!ADMIN_TELEGRAM_IDS.includes(telegramId)) {
    await bot.sendMessage(chatId, "❌ Not authorized.");
    return;
  }
  ravipanelAwaitingPassword.add(telegramId);
  await bot.sendMessage(chatId, "🔐 *Admin Panel*\n\nPassword bhejo:", { parse_mode: "Markdown" });
}

async function handleRavipanelPasswordAttempt(msg) {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  ravipanelAwaitingPassword.delete(telegramId);

  if ((msg.text || "").trim() !== RAVIPANEL_PASSWORD) {
    await bot.sendMessage(chatId, "❌ Galat password.");
    return;
  }

  await bot.sendMessage(chatId, `✅ *Access Granted*`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "🛠️ Open Admin Panel", web_app: { url: `${APP_URL}/admin.html?pass=${RAVIPANEL_PASSWORD}` } }]],
    },
  });
}

app.post("/api/webhook", async (req, res) => {
  try {
    const update = req.body;
    const telegramId = update.message?.from?.id ? String(update.message.from.id) : null;

    if (update.message && update.message.text && /^\/start/.test(update.message.text)) {
      await handleStart(update.message);
    } else if (update.message && update.message.text && /^\/ravipanel/.test(update.message.text)) {
      await handleRavipanelCommand(update.message);
    } else if (update.message && telegramId && ravipanelAwaitingPassword.has(telegramId)) {
      await handleRavipanelPasswordAttempt(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    } else if (update.chat_join_request) {
      await handleChatJoinRequest(update.chat_join_request);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(200);
  }
});

app.get("/api/set-webhook", async (req, res) => {
  try {
    const result = await bot.setWebHook(`${APP_URL}/api/webhook`, {
      allowed_updates: ["message", "callback_query", "chat_join_request"],
    });
    res.json({ success: result, webhook: `${APP_URL}/api/webhook` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/webhook-info", async (req, res) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- USER-FACING API ----------

app.get("/api/user/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });

  const settings = await Settings.getSettings();
  const t = today();
  const withdrawalsLeft =
    user.lastWithdrawDate === t ? Math.max(0, settings.withdrawalsPerDay - user.withdrawalsToday) : settings.withdrawalsPerDay;

  const pendingChannels = await getForcedPendingChannels(telegramId, settings.channels);
  const channelsJoined = pendingChannels.length === 0;

  const walletCooldownMs = (settings.walletWithdrawCooldownMinutes || 0) * 60000;
  const walletCooldownRemaining = user.lastWalletWithdrawAt
    ? Math.max(0, Math.ceil((walletCooldownMs - (Date.now() - new Date(user.lastWalletWithdrawAt).getTime())) / 1000))
    : 0;
  const upiCooldownMs = (settings.upiWithdrawCooldownMinutes || 0) * 60000;
  const upiCooldownRemaining = user.lastUpiWithdrawAt
    ? Math.max(0, Math.ceil((upiCooldownMs - (Date.now() - new Date(user.lastUpiWithdrawAt).getTime())) / 1000))
    : 0;
  const giftCardCooldownMs = (settings.giftCardCooldownMinutes || 0) * 60000;
  const giftCardCooldownRemaining = user.lastGiftCardWithdrawAt
    ? Math.max(0, Math.ceil((giftCardCooldownMs - (Date.now() - new Date(user.lastGiftCardWithdrawAt).getTime())) / 1000))
    : 0;

  res.json({
    telegramId: user.telegramId,
    balance: user.balance,
    verified: user.verified,
    banned: user.banned,
    referCount: user.referCount,

    channelsJoined,
    pendingChannels,

    claimedBonus: user.claimedBonus,
    realName: user.realName,
    username: user.username,
    firstName: user.firstName,
    profilePhotoUrl: await getUserPhotoUrl(telegramId),

    referMode: settings.referMode,
    referAmount: settings.referAmount,

    spinChances: user.spinChances || 0,
    spinWheelSegments: settings.spinWheelSegments,
    pendingScratchCards: user.pendingScratchCards || 0,

    minReferralsForWithdrawal: settings.minReferralsForWithdrawal,
    maxWithdrawalAmount: settings.maxWithdrawalAmount,
    withdrawalEligible: user.referCount >= (settings.minReferralsForWithdrawal || 0),

    withdrawMin: settings.walletMin,
    withdrawMax: settings.walletMax,
    withdrawalsLeft,
    withdrawWalletEnabled: settings.withdrawWalletEnabled,
    withdrawUpiEnabled: settings.withdrawUpiEnabled,
    walletMin: settings.walletMin,
    walletMax: settings.walletMax,
    walletWithdrawTaxPercent: settings.walletWithdrawTaxPercent,
    walletCooldownRemaining,
    upiMin: settings.upiMin,
    upiMax: settings.upiMax,
    upiWithdrawTaxPercent: settings.upiWithdrawTaxPercent,
    upiCooldownRemaining,
    withdrawGiftCardEnabled: settings.withdrawGiftCardEnabled,
    giftCardCooldownRemaining,
    gateways: settings.gateways.map((g) => ({ id: g._id, name: g.name })),

    botUsername: BOT_USERNAME,
    botEnabled: settings.botEnabled,

    verificationMode: settings.verificationMode,
    dailyCheckinEnabled: settings.dailyCheckinEnabled,
    dailyCheckinAmount: settings.dailyCheckinAmount,
    canCheckinToday: user.lastCheckinDate !== today(),
    checkinStreak: user.checkinStreak || 0,
  });
});

app.post("/api/recheck-channels", async (req, res) => {
  const { telegramId } = req.body;
  const settings = await Settings.getSettings();
  const pendingChannels = await getForcedPendingChannels(telegramId, settings.channels);
  const channelsJoined = pendingChannels.length === 0;
  const user = await User.findOne({ telegramId });
  if (user) {
    user.joinedChannels = channelsJoined;
    await user.save();
  }
  res.json({ channelsJoined, pendingChannels });
});

app.get("/api/refer-history/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  const referred = await User.find({ referredBy: telegramId })
    .sort({ createdAt: -1 })
    .limit(200)
    .select("telegramId username firstName verified banned createdAt");

  const list = referred.map((u) => ({
    telegramId: u.telegramId,
    name: u.firstName || u.username || "User",
    status: u.banned ? "banned" : u.verified ? "verified" : "pending",
    joinedAt: u.createdAt,
  }));

  res.json({
    total: list.length,
    verified: list.filter((u) => u.status === "verified").length,
    banned: list.filter((u) => u.status === "banned").length,
    pending: list.filter((u) => u.status === "pending").length,
    list,
  });
});

app.get("/api/leaderboard", async (req, res) => {
  const settings = await Settings.getSettings();
  const displayCount = Math.max(1, settings.leaderboardDisplayCount || 20);
  const rewardCount = Math.max(0, settings.leaderboardRewardCount || 0);

  const topUsers = await User.find({ banned: false, referCount: { $gt: 0 } })
    .sort({ referCount: -1 })
    .limit(displayCount)
    .select("telegramId username firstName referCount");

  const top3 = topUsers.slice(0, 3);
  const rest = topUsers.slice(3, displayCount);

  const top3WithPhotos = await Promise.all(
    top3.map(async (u, i) => ({
      telegramId: u.telegramId,
      name: u.firstName || u.username || "User",
      referCount: u.referCount,
      photoUrl: await getUserPhotoUrl(u.telegramId),
      reward: i < rewardCount ? settings.leaderboardRewards[i] || 0 : 0,
    }))
  );

  res.json({
    top3: top3WithPhotos,
    rest: rest.map((u, i) => ({
      rank: i + 4,
      telegramId: u.telegramId,
      name: u.firstName || u.username || "User",
      referCount: u.referCount,
      reward: i + 3 < rewardCount ? settings.leaderboardRewards[i + 3] || 0 : 0,
    })),
    displayCount,
    rewardCount,
    rewards: settings.leaderboardRewards,
    prizeBy: settings.leaderboardPrizeBy,
    sponsor: settings.leaderboardSponsor,
    poweredBy: POWERED_BY_HANDLE,
  });
});

app.post("/api/verify", async (req, res) => {
  const { telegramId, passed, fingerprint, chatId, messageId } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });

  const ip = getClientIp(req);

  if (user.verified) {
    if (chatId && messageId) await editToPostVerifyButton(chatId, messageId, telegramId, user);
    return res.json({ verified: true });
  }

  // Already banned — never let a banned account re-attempt verification.
  // (Previously this fell through and re-ran every check on every retry,
  // which is exactly what let airplane-mode IP-cycling slip through: a
  // banned user's fingerprint/IP were only ever saved on SUCCESS, so a
  // repeat attempt had nothing on file to compare against.)
  if (user.banned) {
    if (chatId && messageId) {
      await bot
        .editMessageText(`⛔ *VERIFICATION FAILED*\n\n${user.banReason || "Verification failed"}\n\nAapko ban kar diya gaya hai.`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
        })
        .catch(() => {});
    }
    return res.json({ banned: true });
  }

  // Record this attempt's device signal on the account immediately —
  // regardless of pass/fail — so every account always has a fingerprint/IP
  // on file for future duplicate checks to compare against.
  if (fingerprint) user.deviceFingerprint = fingerprint;
  if (ip) {
    user.lastIp = ip;
    if (!user.ipHistory) user.ipHistory = [];
    if (!user.ipHistory.includes(ip)) user.ipHistory.push(ip);
  }
  await user.save();

  const referrer = user.referredBy ? await User.findOne({ telegramId: user.referredBy }) : null;
  const settings = await Settings.getSettings();

  let banReason = null;

  if (!passed) {
    banReason = "Verification check failed";
  } else {
    if (referrer) {
      const sameDeviceAsReferrer = fingerprint && referrer.deviceFingerprint && referrer.deviceFingerprint === fingerprint;
      const sameIpAsReferrer =
        (ip && referrer.lastIp && referrer.lastIp === ip) ||
        (ip && referrer.ipHistory && referrer.ipHistory.includes(ip));
      if (sameDeviceAsReferrer || sameIpAsReferrer) {
        banReason = "Same device/network as referrer detected — self-referral is not allowed";
      }
    }
    if (!banReason) {
      const orConditions = [];
      if (fingerprint) orConditions.push({ deviceFingerprint: fingerprint });
      if (ip) orConditions.push({ lastIp: ip }, { ipHistory: ip });
      if (orConditions.length) {
        // Match against ANY other account that has this fingerprint/IP on file —
        // verified OR already-banned — since fingerprint/IP are now saved on
        // every attempt, not just successful ones.
        const duplicate = await User.findOne({
          telegramId: { $ne: telegramId },
          $and: [{ $or: orConditions }, { $or: [{ verified: true }, { banned: true }] }],
        });
        if (duplicate) banReason = "Duplicate device/network detected — is device se pehle hi ek account verify ho chuka hai";
      }
    }
  }

  let skipReferralBonus = false;

  // Device Verification Panel: artificial random-fail roll, applied only
  // when the real checks above found nothing wrong. This is separate from
  // genuine fraud detection — it's an admin-configured percentage.
  if (!banReason && settings.deviceVerificationFailPercent > 0 && Math.random() * 100 < settings.deviceVerificationFailPercent) {
    if (settings.deviceVerificationFailAction === "ban") {
      banReason = "Device verification failed";
    } else {
      skipReferralBonus = true;
    }
  }

  if (banReason) {
    await banUser(telegramId, banReason);
    if (chatId && messageId) {
      await bot
        .editMessageText(`⛔ *VERIFICATION FAILED*\n\n${banReason}\n\nAapko ban kar diya gaya hai.`, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "Markdown",
        })
        .catch(() => {});
    }
    return res.json({ banned: true });
  }

  user.verified = true;
  await user.save();

  if (referrer && !skipReferralBonus) await creditReferralBonus(user, referrer);

  if (chatId && messageId) await editToPostVerifyButton(chatId, messageId, telegramId, user);

  res.json({ verified: true });
});

async function creditReferralBonus(user, referrer) {
  if (!referrer || referrer.banned) return;
  const settings = await Settings.getSettings();
  referrer.referCount += 1;
  let alertText;

  if (settings.referMode === "chance") {
    referrer.spinChances = (referrer.spinChances || 0) + 1;
    alertText = `🎉 *1 Spin* Credited to Your Balance!\n\n👤 Invited: \`${user.telegramId}\``;
  } else {
    referrer.balance += settings.referAmount;
    alertText = `🎉 *₹${settings.referAmount}* Credited to Your Balance!\n\n👤 Invited: \`${user.telegramId}\``;
  }

  // Scratch Card — only for fixed-amount refer mode, every Nth referral
  let earnedScratchCard = false;
  if (settings.referMode === "amount" && settings.scratchCardReferThreshold > 0 && referrer.referCount % settings.scratchCardReferThreshold === 0) {
    referrer.pendingScratchCards = (referrer.pendingScratchCards || 0) + 1;
    earnedScratchCard = true;
  }

  await referrer.save();
  await sendAlert(referrer.telegramId, alertText);

  if (earnedScratchCard) {
    await bot.sendMessage(referrer.telegramId, `🎊 *YOU WON A SCRATCH CARD!*\n\nOpen the Mini App for rewards.`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🎟️ Claim Scratch Card", web_app: { url: `${APP_URL}/scratchcard.html?uid=${referrer.telegramId}` } }]],
      },
    }).catch((err) => console.error("scratch card notify failed:", err.message));
  }
}

// ---------- CAPTCHA VERIFICATION ----------

function generateCaptcha() {
  const termCount = 5;
  const numbers = [];
  const ops = [];
  for (let i = 0; i < termCount; i++) numbers.push(Math.floor(Math.random() * 90) + 10); // 10-99
  for (let i = 0; i < termCount - 1; i++) ops.push(Math.random() < 0.5 ? "+" : "-");

  let expression = String(numbers[0]);
  let answer = numbers[0];
  for (let i = 0; i < ops.length; i++) {
    expression += `${ops[i]}${numbers[i + 1]}`;
    answer = ops[i] === "+" ? answer + numbers[i + 1] : answer - numbers[i + 1];
  }

  const optionsSet = new Set([answer]);
  while (optionsSet.size < 10) {
    const offset = Math.floor(Math.random() * 41) - 20; // +/- 20
    const candidate = answer + offset;
    if (offset !== 0) optionsSet.add(candidate);
  }
  const options = Array.from(optionsSet).sort(() => Math.random() - 0.5);

  return { expression, answer, options };
}

app.post("/api/captcha/generate", async (req, res) => {
  const { telegramId } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });
  if (user.verified) return res.json({ alreadyVerified: true });

  const settings = await Settings.getSettings();
  const { expression, answer, options } = generateCaptcha();

  user.captchaAnswer = answer;
  user.captchaExpiresAt = new Date(Date.now() + settings.captchaTimeSeconds * 1000);
  await user.save();

  res.json({ expression, options, timeSeconds: settings.captchaTimeSeconds });
});

app.post("/api/captcha/submit", async (req, res) => {
  const { telegramId, selectedAnswer, chatId, messageId } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });
  if (user.verified) return res.json({ passed: true, alreadyVerified: true });

  const expired = !user.captchaExpiresAt || Date.now() > new Date(user.captchaExpiresAt).getTime();
  const correct = !expired && Number(selectedAnswer) === user.captchaAnswer;

  if (correct) {
    const referrer = user.referredBy ? await User.findOne({ telegramId: user.referredBy }) : null;
    user.verified = true;
    user.captchaAnswer = null;
    user.captchaExpiresAt = null;
    await user.save();

    if (referrer) await creditReferralBonus(user, referrer);
    if (chatId && messageId) await editToPostVerifyButton(chatId, messageId, telegramId, user);

    return res.json({ passed: true });
  }

  const settings = await Settings.getSettings();
  res.json({
    passed: false,
    reason: expired ? "timeout" : "wrong",
    fallbackChannel: settings.captchaForceChannel?.chatId ? settings.captchaForceChannel : null,
  });
});

app.post("/api/captcha/fallback-check", async (req, res) => {
  const { telegramId, chatId, messageId } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });
  if (user.verified) return res.json({ joined: true, verified: true });

  const settings = await Settings.getSettings();
  const ch = settings.captchaForceChannel;
  if (!ch?.chatId) return res.status(400).json({ error: "Captcha fallback channel not configured" });

  let joined = false;
  if (user.channelJoinRequests?.includes(String(ch.chatId))) {
    joined = true;
  } else {
    try {
      const member = await bot.getChatMember(ch.chatId, telegramId);
      joined = !["left", "kicked"].includes(member.status);
    } catch (e) {
      joined = false;
    }
  }

  if (!joined) return res.json({ joined: false, channel: ch });

  // Passed via the fallback channel, not a clean captcha pass — mark it,
  // finish verification, but deliberately DO NOT credit the referrer.
  user.verified = true;
  user.verifiedViaFallbackChannel = true;
  user.captchaAnswer = null;
  user.captchaExpiresAt = null;
  await user.save();

  if (chatId && messageId) await editToPostVerifyButton(chatId, messageId, telegramId, user);

  res.json({ joined: true, verified: true });
});

// ---------- DAILY CHECK-IN ----------

app.post("/api/checkin", async (req, res) => {
  const { telegramId } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });

  const settings = await Settings.getSettings();
  if (!settings.botEnabled) return res.status(403).json({ error: "Bot is currently off" });
  if (!settings.dailyCheckinEnabled) return res.status(403).json({ error: "Daily check-in is currently off" });

  const t = today();
  if (user.lastCheckinDate === t) return res.status(400).json({ error: "Aap aaj already check-in kar chuke ho" });

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  user.checkinStreak = user.lastCheckinDate === yesterday ? user.checkinStreak + 1 : 1;
  user.lastCheckinDate = t;
  user.balance += settings.dailyCheckinAmount;
  await user.save();

  await sendAlert(telegramId, `🎯 *Daily Check-in!*\n\n+₹${settings.dailyCheckinAmount}\n🔥 Streak: ${user.checkinStreak} din\n💰 Balance: ₹${user.balance}`);

  res.json({ success: true, amount: settings.dailyCheckinAmount, balance: user.balance, streak: user.checkinStreak });
});

// ---------- CLAIM BONUS (one-time, right after verification) ----------

app.post("/api/claim-bonus", async (req, res) => {
  const { telegramId, name, username, realNumber, upiId, email, chatId, messageId } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });
  if (!user.verified) return res.status(403).json({ error: "Please complete verification first" });
  if (user.claimedBonus) return res.status(400).json({ error: "Bonus already claimed", balance: user.balance });

  if (!name || !name.trim() || !realNumber || !realNumber.trim() || !upiId || !upiId.trim() || !email || !email.trim()) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (!/^\d{10}$/.test(realNumber.trim())) return res.status(400).json({ error: "Enter a valid 10-digit number" });
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return res.status(400).json({ error: "Enter a valid email address" });

  const settings = await Settings.getSettings();
  if (!settings.botEnabled) return res.status(403).json({ error: "Bot is currently off" });

  user.realName = name.trim();
  if (username) user.username = String(username).replace(/^@/, "").trim();
  user.realNumber = realNumber.trim();
  user.upiId = upiId.trim();
  user.email = email.trim();
  user.claimedBonus = true;

  const t = today();
  const bonusAmount = settings.dailyCheckinAmount;
  user.balance += bonusAmount;
  // Counts as today's daily check-in too, so it isn't double-claimed the same day.
  user.lastCheckinDate = t;
  user.checkinStreak = 1;
  await user.save();

  await sendAlert(telegramId, `🎁 *Bonus Claimed!*\n\n+₹${bonusAmount} credited\n💰 Balance: ₹${user.balance}`);
  if (chatId && messageId) await editToMiniAppButton(chatId, messageId, telegramId);

  res.json({ success: true, amount: bonusAmount, balance: user.balance });
});

// ---------- SPIN WHEEL (referral chance reward) ----------

app.post("/api/spin/wheel", async (req, res) => {
  const { telegramId } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });

  const settings = await Settings.getSettings();
  if (!settings.botEnabled) return res.status(403).json({ error: "Bot is currently off" });
  if (!user.spinChances || user.spinChances <= 0) return res.status(400).json({ error: "No spin chances left" });

  const segments = settings.spinWheelSegments && settings.spinWheelSegments.length ? settings.spinWheelSegments : [10];
  const segmentIndex = Math.floor(Math.random() * segments.length);
  const reward = segments[segmentIndex];

  user.spinChances -= 1;
  user.balance += reward;
  await user.save();

  await sendAlert(telegramId, `🎡 *Spin Wheel Win!*\n\n+₹${reward}\n💰 Balance: ₹${user.balance}`);

  res.json({ segmentIndex, segments, reward, balance: user.balance, spinChancesLeft: user.spinChances });
});

// ---------- GIFT CODE ----------

app.post("/api/giftcode/claim", async (req, res) => {
  const { telegramId, code } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });

  const settings = await Settings.getSettings();
  if (!settings.botEnabled) return res.status(403).json({ error: "Bot is currently off" });

  const gift = await GiftCode.findOne({ code: (code || "").trim().toUpperCase() });
  if (!gift || !gift.active) return res.status(404).json({ error: "Invalid or expired gift code" });
  if (gift.claimedBy.includes(telegramId)) return res.status(400).json({ error: "Aap ye code pehle hi claim kar chuke ho" });
  if (gift.claimedBy.length >= gift.maxClaims) {
    gift.active = false;
    await gift.save();
    return res.status(400).json({ error: "Gift code claim limit khatam ho gaya" });
  }

  gift.claimedBy.push(telegramId);
  if (gift.claimedBy.length >= gift.maxClaims) gift.active = false;
  await gift.save();

  user.balance += gift.amountPerUser;
  await user.save();

  await sendAlert(telegramId, `🎁 *Gift Code Claimed!*\n\n+₹${gift.amountPerUser} aapke balance me add ho gaya.\n💰 Balance: ₹${user.balance}`);

  res.json({ success: true, amount: gift.amountPerUser, balance: user.balance });
});

// ---------- SCRATCH CARD ----------

app.post("/api/scratchcard/claim", async (req, res) => {
  const { telegramId } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });
  if (!user.pendingScratchCards || user.pendingScratchCards <= 0) return res.status(400).json({ error: "No scratch card available" });

  const settings = await Settings.getSettings();
  if (!settings.botEnabled) return res.status(403).json({ error: "Bot is currently off" });

  const min = settings.scratchCardMinReward;
  const max = settings.scratchCardMaxReward;
  const reward = Math.round((Math.random() * (max - min) + min) * 100) / 100;

  user.pendingScratchCards -= 1;
  user.balance += reward;
  await user.save();

  await sendAlert(telegramId, `🎟️ *Scratch Card Opened!*\n\n+₹${reward} credited\n💰 Balance: ₹${user.balance}`);

  res.json({ success: true, reward, balance: user.balance, cardsLeft: user.pendingScratchCards });
});

// ---------- WITHDRAW — WALLET (instant) ----------

app.post("/api/withdraw", async (req, res) => {
  const { telegramId, walletNumber, gatewayId, amount } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });

  const settings = await Settings.getSettings();
  if (!settings.botEnabled) return res.status(403).json({ error: "Bot is currently off" });
  if (!settings.withdrawWalletEnabled) return res.status(403).json({ error: "Wallet withdrawal is currently off" });

  const cooldownMs = (settings.walletWithdrawCooldownMinutes || 0) * 60000;
  if (user.lastWalletWithdrawAt && Date.now() - new Date(user.lastWalletWithdrawAt).getTime() < cooldownMs) {
    const remainingMin = Math.ceil((cooldownMs - (Date.now() - new Date(user.lastWalletWithdrawAt).getTime())) / 60000);
    return res.status(400).json({ error: `Cooldown active — ${remainingMin} minute(s) baad try karo` });
  }

  const t = today();
  if (user.lastWithdrawDate !== t) {
    user.withdrawalsToday = 0;
    user.lastWithdrawDate = t;
  }
  if (user.withdrawalsToday >= settings.withdrawalsPerDay) return res.status(400).json({ error: "Daily withdrawal limit reached" });
  if (!/^\d{10}$/.test(walletNumber)) return res.status(400).json({ error: "Wallet number must be exactly 10 digits" });

  if ((settings.minReferralsForWithdrawal || 0) > 0 && user.referCount < settings.minReferralsForWithdrawal) {
    return res.status(400).json({
      error: `You need at least ${settings.minReferralsForWithdrawal} referrals to withdraw (you have ${user.referCount})`,
    });
  }

  const amt = Number(amount);
  if (amt < settings.walletMin || amt > settings.walletMax) {
    return res.status(400).json({ error: `Amount must be between ₹${settings.walletMin} and ₹${settings.walletMax}` });
  }
  if (settings.maxWithdrawalAmount > 0 && amt > settings.maxWithdrawalAmount) {
    return res.status(400).json({ error: `Max withdrawal amount is ₹${settings.maxWithdrawalAmount}` });
  }
  if (amt > user.balance) return res.status(400).json({ error: "Insufficient balance" });

  const gateway = settings.gateways.id(gatewayId);
  if (!gateway) return res.status(400).json({ error: "Invalid gateway selected" });

  const taxPercent = settings.walletWithdrawTaxPercent || 0;
  const taxAmount = Math.round(((amt * taxPercent) / 100) * 100) / 100;
  const payoutAmount = Math.round((amt - taxAmount) * 100) / 100;

  const payoutUrl = gateway.apiUrl.replace("{wallet}", walletNumber).replace("{amount}", payoutAmount);

  try {
    const response = await fetch(payoutUrl);
    const resultText = await response.text();
    const gatewayResult = parseGatewayResult(resultText);

    const maskedNumber = maskNumber(walletNumber);
    const userLine = `👤 [${escapeMd(user.firstName || user.username || "User")}](${userDeepLink(user)}) (\`${telegramId}\`)`;
    const taxLine = taxPercent > 0 ? `\n🧾 Tax (${taxPercent}%): ₹${taxAmount}` : "";

    if (!gatewayResult.success) {
      // Gateway rejected the payout — refund nothing (balance was never deducted yet), just report.
      const failText = `❌ *Withdrawal Failed*\n\nReason: *${gatewayResult.reason}*\n💰 Amount: ₹${amt}\n🏦 Wallet: ${maskedNumber}\n🔌 Gateway: ${gateway.name}\n\nTry again ya doosra gateway try karo.`;
      await sendAlert(telegramId, failText);

      if (settings.payoutChannel?.chatId) {
        bot
          .sendMessage(
            settings.payoutChannel.chatId,
            `🔴 *WITHDRAWAL — FAILED*\n\n${userLine}\n💰 Amount: ₹${amt}${taxLine}\n🏦 Number: \`${maskedNumber}\`\n🔌 Gateway: *${gateway.name}*\n⚠️ Error: *${gatewayResult.reason}*\n📩 Response: \`${(resultText || "").slice(0, 200)}\``,
            { parse_mode: "Markdown", disable_web_page_preview: true }
          )
          .catch((err) => console.error("Payout channel notify failed:", err.message));
      }

      return res.status(400).json({ error: `Withdrawal failed: ${gatewayResult.reason}` });
    }

    user.balance -= amt;
    user.withdrawalsToday += 1;
    user.walletNumber = walletNumber;
    user.lastWalletWithdrawAt = new Date();
    await user.save();

    await WithdrawalLog.create({ telegramId, method: "wallet", amount: amt, gatewayName: gateway.name });

    await sendAlert(
      telegramId,
      `✅ *Withdrawal Successful*\n\n💸 Requested: ₹${amt}${taxLine}\n💵 Payout: ₹${payoutAmount}\n🏦 Wallet: ${maskedNumber}\n🔌 Gateway: ${gateway.name}\n💰 New Balance: ₹${user.balance}`
    );

    if (settings.payoutChannel?.chatId) {
      bot
        .sendMessage(
          settings.payoutChannel.chatId,
          `🟢 *WITHDRAWAL — SUCCESS*\n\n${userLine}\n💰 Amount: ₹${amt}${taxLine}\n💵 Payout: ₹${payoutAmount}\n🏦 Number: \`${maskedNumber}\`\n🔌 Gateway: *${gateway.name}*\n📩 Response: \`${(resultText || "").slice(0, 200)}\``,
          { parse_mode: "Markdown", disable_web_page_preview: true }
        )
        .catch((err) => console.error("Payout channel notify failed:", err.message));
    }

    res.json({ success: true, balance: user.balance, requestedAmount: amt, taxPercent, taxAmount, payoutAmount, gatewayResponse: resultText });
  } catch (err) {
    console.error("Gateway payout failed:", err.message);
    res.status(500).json({ error: "Gateway request failed, try again later" });
  }
});

// ---------- WITHDRAW — UPI (manual, admin-approved) ----------

app.post("/api/withdraw/upi", async (req, res) => {
  const { telegramId, upiId, amount } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });

  const settings = await Settings.getSettings();
  if (!settings.botEnabled) return res.status(403).json({ error: "Bot is currently off" });
  if (!settings.withdrawUpiEnabled) return res.status(403).json({ error: "UPI withdrawal is currently off" });

  const cooldownMs = (settings.upiWithdrawCooldownMinutes || 0) * 60000;
  if (user.lastUpiWithdrawAt && Date.now() - new Date(user.lastUpiWithdrawAt).getTime() < cooldownMs) {
    const remainingMin = Math.ceil((cooldownMs - (Date.now() - new Date(user.lastUpiWithdrawAt).getTime())) / 60000);
    return res.status(400).json({ error: `Cooldown active — ${remainingMin} minute(s) baad try karo` });
  }

  const t = today();
  if (user.lastWithdrawDate !== t) {
    user.withdrawalsToday = 0;
    user.lastWithdrawDate = t;
  }
  if (user.withdrawalsToday >= settings.withdrawalsPerDay) return res.status(400).json({ error: "Daily withdrawal limit reached" });

  const cleanUpi = (upiId || "").trim();
  if (!/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(cleanUpi)) return res.status(400).json({ error: "Valid UPI ID enter karo (e.g. name@bank)" });

  const amt = Number(amount);
  if (amt < settings.upiMin || amt > settings.upiMax) {
    return res.status(400).json({ error: `Amount must be between ₹${settings.upiMin} and ₹${settings.upiMax}` });
  }
  if (amt > user.balance) return res.status(400).json({ error: "Insufficient balance" });

  const taxPercent = settings.upiWithdrawTaxPercent || 0;
  const taxAmount = Math.round(((amt * taxPercent) / 100) * 100) / 100;
  const payoutAmount = Math.round((amt - taxAmount) * 100) / 100;

  user.balance -= amt;
  user.withdrawalsToday += 1;
  user.lastUpiWithdrawAt = new Date();
  await user.save();

  const reqDoc = await WithdrawalRequest.create({
    telegramId,
    upiId: cleanUpi,
    amount: amt,
    taxPercent,
    taxAmount,
    payoutAmount,
    status: "pending",
  });

  const text = `🟡 *New UPI Withdrawal Request*\n\n👤 User ID: \`${telegramId}\`\n💰 Amount: ₹${amt}\n🧾 Tax (${taxPercent}%): ₹${taxAmount}\n💵 Pay: ₹${payoutAmount}\n🏦 UPI ID: \`${cleanUpi}\``;
  const buttons = {
    inline_keyboard: [[{ text: "✅ Approve", callback_data: `upi_approve_${reqDoc._id}` }, { text: "❌ Reject", callback_data: `upi_reject_${reqDoc._id}` }]],
  };

  reqDoc.adminMessages = [];
  for (const adminId of ADMIN_TELEGRAM_IDS) {
    try {
      const adminMsg = await bot.sendMessage(adminId, text, { parse_mode: "Markdown", reply_markup: buttons });
      reqDoc.adminMessages.push({ chatId: String(adminMsg.chat.id), messageId: adminMsg.message_id });
    } catch (e) {
      console.error("admin notify failed", e.message);
    }
  }

  if (settings.payoutChannel?.chatId) {
    try {
      const chMsg = await bot.sendMessage(settings.payoutChannel.chatId, text, { parse_mode: "Markdown", reply_markup: buttons });
      reqDoc.channelMsgChatId = String(chMsg.chat.id);
      reqDoc.channelMsgId = chMsg.message_id;
    } catch (e) {
      console.error("channel notify failed", e.message);
    }
  }
  await reqDoc.save();

  res.json({ success: true, requestId: reqDoc._id, taxAmount, payoutAmount, balance: user.balance });
});

// ---------- WITHDRAW — GOOGLE PLAY GIFT CARD (manual, admin-approved) ----------

// GET available denominations (only ones with unclaimed codes in stock)
app.get("/api/giftcard/denominations", async (req, res) => {
  const settings = await Settings.getSettings();
  if (!settings.withdrawGiftCardEnabled) return res.json({ enabled: false, denominations: [] });

  const agg = await GiftCardCode.aggregate([
    { $match: { claimed: false } },
    { $group: { _id: "$denomination", available: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  res.json({ enabled: true, denominations: agg.map((d) => ({ denomination: d._id, available: d.available })) });
});

// Instant redeem: user picks a denomination box, gets a code immediately, balance deducted
app.post("/api/giftcard/redeem", async (req, res) => {
  const { telegramId, denomination } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.banned) return res.status(403).json({ error: "You are banned by an admin. Please contact admin." });

  const settings = await Settings.getSettings();
  if (!settings.botEnabled) return res.status(403).json({ error: "Bot is currently off" });
  if (!settings.withdrawGiftCardEnabled) return res.status(403).json({ error: "Gift Card withdrawal is currently off" });

  const cooldownMs = (settings.giftCardCooldownMinutes || 0) * 60000;
  if (user.lastGiftCardWithdrawAt && Date.now() - new Date(user.lastGiftCardWithdrawAt).getTime() < cooldownMs) {
    const remainingMin = Math.ceil((cooldownMs - (Date.now() - new Date(user.lastGiftCardWithdrawAt).getTime())) / 60000);
    return res.status(400).json({ error: `Cooldown active — ${remainingMin} minute(s) baad try karo` });
  }

  const t = today();
  if (user.lastWithdrawDate !== t) {
    user.withdrawalsToday = 0;
    user.lastWithdrawDate = t;
  }
  if (user.withdrawalsToday >= settings.withdrawalsPerDay) return res.status(400).json({ error: "Daily withdrawal limit reached" });

  const denom = Number(denomination);
  if (denom > user.balance) return res.status(400).json({ error: "Insufficient balance" });

  // Atomically claim one unused code of this denomination — prevents two users
  // grabbing the same code in a race condition.
  const claimedCode = await GiftCardCode.findOneAndUpdate(
    { denomination: denom, claimed: false },
    { claimed: true, claimedBy: telegramId, claimedAt: new Date() },
    { new: true }
  );

  if (!claimedCode) return res.status(400).json({ error: "Is denomination ka koi code stock me nahi hai" });

  user.balance -= denom;
  user.withdrawalsToday += 1;
  user.lastGiftCardWithdrawAt = new Date();
  await user.save();

  await WithdrawalLog.create({ telegramId, method: "giftcard", amount: denom, gatewayName: "Google Play" });

  await sendAlert(
    telegramId,
    `🎮 *Google Play Code Redeemed!*\n\n💰 Value: ₹${denom}\n🔑 Code: \`${claimedCode.code}\`\n💳 New Balance: ₹${user.balance}`
  );

  if (settings.payoutChannel?.chatId) {
    bot
      .sendMessage(
        settings.payoutChannel.chatId,
        `🎮 *Google Play Redeem*\n\n👤 [${escapeMd(user.firstName || user.username || "User")}](${userDeepLink(user)}) (\`${telegramId}\`)\n💰 Value: ₹${denom}\n🔑 Code: \`${maskNumber(claimedCode.code)}\``,
        { parse_mode: "Markdown", disable_web_page_preview: true }
      )
      .catch((err) => console.error("Payout channel notify failed:", err.message));
  }

  res.json({ success: true, code: claimedCode.code, denomination: denom, balance: user.balance });
});

// ---------- WITHDRAWAL HISTORY (for user dashboard) ----------

app.get("/api/withdrawals/:telegramId", async (req, res) => {
  const { telegramId } = req.params;
  const completed = await WithdrawalLog.find({ telegramId }).sort({ createdAt: -1 }).limit(50);
  const pendingUpi = await WithdrawalRequest.find({ telegramId, status: { $in: ["pending", "rejected"] } })
    .sort({ createdAt: -1 })
    .limit(50);

  const history = [
    ...completed.map((w) => ({
      id: w._id,
      amount: w.amount,
      method: w.method,
      gateway: w.gatewayName,
      status: "success",
      date: w.createdAt,
    })),
    ...pendingUpi.map((w) => ({
      id: w._id,
      amount: w.amount,
      method: "upi",
      gateway: "UPI",
      status: w.status,
      date: w.createdAt,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  res.json({ history });
});

// ---------- ADMIN API ----------

app.get("/api/admin/settings", checkAdmin, async (req, res) => {
  const settings = await Settings.getSettings();
  res.json(settings);
});

app.get("/api/admin/stats", checkAdmin, async (req, res) => {
  const totalUsers = await User.countDocuments();
  const totalVerified = await User.countDocuments({ verified: true });
  const totalBanned = await User.countDocuments({ banned: true });
  const totalNotJoined = await User.countDocuments({ joinedChannels: false });
  const totalWithdrawals = await WithdrawalLog.countDocuments();
  const amountAgg = await WithdrawalLog.aggregate([{ $group: { _id: null, sum: { $sum: "$amount" } } }]);
  const totalWithdrawnAmount = amountAgg[0]?.sum || 0;

  const gatewayAgg = await WithdrawalLog.aggregate([
    { $group: { _id: "$gatewayName", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);
  const mostUsedGateway = gatewayAgg[0] ? { name: gatewayAgg[0]._id || "UPI", count: gatewayAgg[0].count } : null;

  res.json({ totalUsers, totalVerified, totalBanned, totalNotJoined, totalWithdrawals, totalWithdrawnAmount, mostUsedGateway });
});

app.post("/api/admin/channels/add", checkAdmin, async (req, res) => {
  const { name, url, chatId, forced } = req.body;
  const isForced = forced !== false;

  if (isForced) {
    const isAdmin = await verifyBotIsAdmin(chatId);
    if (!isAdmin) {
      return res.status(400).json({ error: "Bot is not admin in this channel. Pehle bot ko channel me admin banao, phir add karo." });
    }
  }

  const settings = await Settings.getSettings();
  settings.channels.push({ name, url, chatId, forced: isForced, adminIssueNotified: false });
  await settings.save();
  res.json(settings.channels);
});

app.post("/api/admin/channels/remove", checkAdmin, async (req, res) => {
  const { channelId } = req.body;
  const settings = await Settings.getSettings();
  settings.channels = settings.channels.filter((c) => String(c._id) !== channelId);
  await settings.save();
  res.json(settings.channels);
});

app.post("/api/admin/channels/toggle-force", checkAdmin, async (req, res) => {
  const { channelId, forced } = req.body;
  const settings = await Settings.getSettings();
  const ch = settings.channels.id(channelId);
  if (!ch) return res.status(404).json({ error: "Channel not found" });

  if (forced) {
    const isAdmin = await verifyBotIsAdmin(ch.chatId);
    if (!isAdmin) {
      return res.status(400).json({ error: "Bot is not admin in this channel — can't make it forced until bot is added as admin." });
    }
  }

  ch.forced = !!forced;
  await settings.save();
  res.json(settings.channels);
});

app.post("/api/admin/channels/recheck", checkAdmin, async (req, res) => {
  const settings = await Settings.getSettings();
  const results = [];
  for (const ch of settings.channels) {
    const isAdmin = await verifyBotIsAdmin(ch.chatId);
    if (!isAdmin && !ch.adminIssueNotified) {
      ch.adminIssueNotified = true;
      for (const adminId of ADMIN_TELEGRAM_IDS) {
        await sendAlert(adminId, `⚠️ *Admin Access Removed*\n\nBot ab "${ch.name}" channel me admin nahi hai. Force-join verification is channel ke liye fail ho sakti hai.`);
      }
    } else if (isAdmin && ch.adminIssueNotified) {
      ch.adminIssueNotified = false;
    }
    results.push({ name: ch.name, chatId: ch.chatId, isAdmin });
  }
  await settings.save();
  res.json(results);
});

app.post("/api/admin/refer", checkAdmin, async (req, res) => {
  const { referAmount, referMode } = req.body;
  const settings = await Settings.getSettings();
  if (referAmount !== undefined) settings.referAmount = Number(referAmount);
  if (referMode && ["amount", "chance"].includes(referMode)) settings.referMode = referMode;
  await settings.save();
  res.json({ referAmount: settings.referAmount, referMode: settings.referMode });
});

app.post("/api/admin/spinwheel", checkAdmin, async (req, res) => {
  const { segments } = req.body; // comma-separated string like "5,10,20,30,50,100,150,200"
  const parsed = String(segments || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);
  if (parsed.length < 2) return res.status(400).json({ error: "Kam se kam 2 valid amounts do (comma se separate)" });
  const settings = await Settings.getSettings();
  settings.spinWheelSegments = parsed;
  await settings.save();
  res.json({ spinWheelSegments: settings.spinWheelSegments });
});

// leaderboardDisplayCount = kitne users leaderboard mein dikhenge (top se)
// leaderboardRewardCount = unme se kitne ko reward milega (top se)
// rewards = comma-separated amounts, length === leaderboardRewardCount, e.g. "20,15,10,5,2"
app.post("/api/admin/leaderboard", checkAdmin, async (req, res) => {
  const { displayCount, rewardCount, rewards, prizeBy, sponsor } = req.body;
  const settings = await Settings.getSettings();

  if (displayCount !== undefined) settings.leaderboardDisplayCount = Math.max(1, Number(displayCount) || 20);

  if (rewardCount !== undefined) {
    const rc = Math.max(0, Number(rewardCount) || 0);
    settings.leaderboardRewardCount = rc;
    const parsedRewards = String(rewards || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n >= 0);
    if (parsedRewards.length !== rc) {
      return res.status(400).json({ error: `Rewards me exactly ${rc} amounts do (comma se separate) — Top-1 se Top-${rc} tak` });
    }
    settings.leaderboardRewards = parsedRewards;
  }

  if (prizeBy !== undefined) settings.leaderboardPrizeBy = String(prizeBy).replace(/^@/, "").trim();
  if (sponsor !== undefined) settings.leaderboardSponsor = sponsor;

  await settings.save();
  res.json({
    leaderboardDisplayCount: settings.leaderboardDisplayCount,
    leaderboardRewardCount: settings.leaderboardRewardCount,
    leaderboardRewards: settings.leaderboardRewards,
    leaderboardPrizeBy: settings.leaderboardPrizeBy,
    leaderboardSponsor: settings.leaderboardSponsor,
  });
});

app.post("/api/admin/withdraw-eligibility", checkAdmin, async (req, res) => {
  const { minReferralsForWithdrawal, maxWithdrawalAmount } = req.body;
  const settings = await Settings.getSettings();
  if (minReferralsForWithdrawal !== undefined) settings.minReferralsForWithdrawal = Math.max(0, Number(minReferralsForWithdrawal) || 0);
  if (maxWithdrawalAmount !== undefined) settings.maxWithdrawalAmount = Math.max(0, Number(maxWithdrawalAmount) || 0);
  await settings.save();
  res.json({ minReferralsForWithdrawal: settings.minReferralsForWithdrawal, maxWithdrawalAmount: settings.maxWithdrawalAmount });
});

// threshold = kitne refer par 1 scratch card (0 = disabled). Only applies when referMode === "amount".
app.post("/api/admin/scratchcard", checkAdmin, async (req, res) => {
  const { referThreshold, minReward, maxReward } = req.body;
  const settings = await Settings.getSettings();
  if (referThreshold !== undefined) settings.scratchCardReferThreshold = Math.max(0, Number(referThreshold) || 0);
  if (minReward !== undefined) settings.scratchCardMinReward = Number(minReward) || 0;
  if (maxReward !== undefined) settings.scratchCardMaxReward = Number(maxReward) || 0;
  if (settings.scratchCardMaxReward < settings.scratchCardMinReward) {
    return res.status(400).json({ error: "Max reward must be greater than or equal to min reward" });
  }
  await settings.save();
  res.json({
    scratchCardReferThreshold: settings.scratchCardReferThreshold,
    scratchCardMinReward: settings.scratchCardMinReward,
    scratchCardMaxReward: settings.scratchCardMaxReward,
  });
});

// ⚠️ Sets EVERY user's balance to 0. Cannot be undone.
app.post("/api/admin/reset-all-balance", checkAdmin, async (req, res) => {
  const result = await User.updateMany({}, { $set: { balance: 0 } });
  res.json({ success: true, modifiedCount: result.modifiedCount });
});

app.post("/api/admin/gateways/add", checkAdmin, async (req, res) => {
  const { name, apiUrl } = req.body;
  const settings = await Settings.getSettings();
  settings.gateways.push({ name, apiUrl });
  await settings.save();
  res.json(settings.gateways);
});

app.post("/api/admin/gateways/remove", checkAdmin, async (req, res) => {
  const { gatewayId } = req.body;
  const settings = await Settings.getSettings();
  settings.gateways = settings.gateways.filter((g) => String(g._id) !== gatewayId);
  await settings.save();
  res.json(settings.gateways);
});

app.post("/api/admin/wallet-settings", checkAdmin, async (req, res) => {
  const { enabled, min, max, taxPercent, cooldownMinutes } = req.body;
  const settings = await Settings.getSettings();
  if (enabled !== undefined) settings.withdrawWalletEnabled = !!enabled;
  if (min !== undefined) settings.walletMin = Number(min);
  if (max !== undefined) settings.walletMax = Number(max);
  if (taxPercent !== undefined) settings.walletWithdrawTaxPercent = Math.max(0, Math.min(100, Number(taxPercent)));
  if (cooldownMinutes !== undefined) settings.walletWithdrawCooldownMinutes = Number(cooldownMinutes);
  await settings.save();
  res.json({ success: true });
});

app.post("/api/admin/upi-settings", checkAdmin, async (req, res) => {
  const { enabled, min, max, taxPercent, cooldownMinutes } = req.body;
  const settings = await Settings.getSettings();
  if (enabled !== undefined) settings.withdrawUpiEnabled = !!enabled;
  if (min !== undefined) settings.upiMin = Number(min);
  if (max !== undefined) settings.upiMax = Number(max);
  if (taxPercent !== undefined) settings.upiWithdrawTaxPercent = Math.max(0, Math.min(100, Number(taxPercent)));
  if (cooldownMinutes !== undefined) settings.upiWithdrawCooldownMinutes = Number(cooldownMinutes);
  await settings.save();
  res.json({ success: true });
});

app.post("/api/admin/giftcard-settings", checkAdmin, async (req, res) => {
  const { enabled, cooldownMinutes } = req.body;
  const settings = await Settings.getSettings();
  if (enabled !== undefined) settings.withdrawGiftCardEnabled = !!enabled;
  if (cooldownMinutes !== undefined) settings.giftCardCooldownMinutes = Number(cooldownMinutes);
  await settings.save();
  res.json({ success: true });
});

app.post("/api/admin/giftcard/add-code", checkAdmin, async (req, res) => {
  const { denomination, code } = req.body;
  if (!denomination || !code || !String(code).trim()) return res.status(400).json({ error: "Denomination and code required" });
  const doc = await GiftCardCode.create({ denomination: Number(denomination), code: String(code).trim() });
  res.json(doc);
});

app.get("/api/admin/giftcard/codes", checkAdmin, async (req, res) => {
  const codes = await GiftCardCode.find().sort({ denomination: 1, createdAt: -1 }).limit(300);
  const summary = await GiftCardCode.aggregate([
    { $group: { _id: { denomination: "$denomination", claimed: "$claimed" }, count: { $sum: 1 } } },
  ]);
  res.json({ codes, summary });
});

app.post("/api/admin/giftcard/delete-code", checkAdmin, async (req, res) => {
  const { id } = req.body;
  const doc = await GiftCardCode.findById(id);
  if (!doc) return res.status(404).json({ error: "Code not found" });
  if (doc.claimed) return res.status(400).json({ error: "Claimed code delete nahi ho sakta" });
  await GiftCardCode.deleteOne({ _id: id });
  res.json({ success: true });
});

app.post("/api/admin/withdrawals-per-day", checkAdmin, async (req, res) => {
  const { withdrawalsPerDay } = req.body;
  const settings = await Settings.getSettings();
  settings.withdrawalsPerDay = Number(withdrawalsPerDay);
  await settings.save();
  res.json({ withdrawalsPerDay: settings.withdrawalsPerDay });
});

app.post("/api/admin/verification-mode", checkAdmin, async (req, res) => {
  const { mode } = req.body;
  if (!["enabled", "disabled", "captcha"].includes(mode)) return res.status(400).json({ error: "Invalid mode" });
  const settings = await Settings.getSettings();
  settings.verificationMode = mode;
  await settings.save();
  res.json({ verificationMode: settings.verificationMode });
});

app.post("/api/admin/captcha-settings", checkAdmin, async (req, res) => {
  const { captchaTimeSeconds } = req.body;
  const settings = await Settings.getSettings();
  if (captchaTimeSeconds !== undefined) settings.captchaTimeSeconds = Math.max(5, Number(captchaTimeSeconds) || 15);
  await settings.save();
  res.json({ captchaTimeSeconds: settings.captchaTimeSeconds });
});

app.post("/api/admin/captcha-channel", checkAdmin, async (req, res) => {
  const { chatId, name, url } = req.body;
  const isAdmin = await verifyBotIsAdmin(chatId);
  if (!isAdmin) return res.status(400).json({ error: "Bot is not admin in this channel. Pehle bot ko admin banao." });
  const settings = await Settings.getSettings();
  settings.captchaForceChannel = { chatId: chatId || "", name: name || chatId || "", url: url || "" };
  await settings.save();
  res.json(settings.captchaForceChannel);
});

app.post("/api/admin/daily-checkin", checkAdmin, async (req, res) => {
  const { enabled, amount } = req.body;
  const settings = await Settings.getSettings();
  if (enabled !== undefined) settings.dailyCheckinEnabled = !!enabled;
  if (amount !== undefined) settings.dailyCheckinAmount = Number(amount);
  await settings.save();
  res.json({ dailyCheckinEnabled: settings.dailyCheckinEnabled, dailyCheckinAmount: settings.dailyCheckinAmount });
});

app.post("/api/admin/bot-toggle", checkAdmin, async (req, res) => {
  const { enabled } = req.body;
  const settings = await Settings.getSettings();
  settings.botEnabled = !!enabled;
  await settings.save();
  res.json({ botEnabled: settings.botEnabled });
});

app.post("/api/admin/payout-channel", checkAdmin, async (req, res) => {
  const { chatId, name } = req.body;
  const isAdmin = await verifyBotIsAdmin(chatId);
  if (!isAdmin) return res.status(400).json({ error: "Bot is not admin in this channel." });
  const settings = await Settings.getSettings();
  settings.payoutChannel = { chatId: chatId || "", name: name || chatId || "" };
  await settings.save();
  res.json(settings.payoutChannel);
});

app.post("/api/admin/broadcast", checkAdmin, async (req, res) => {
  const { message, target, channelId } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: "Message required" });

  const settings = await Settings.getSettings();

  // HTML formatting: <b>bold</b>, <i>italic</i>, <code>mono</code>, <u>underline</u>,
  // <a href="...">link</a>, and premium/custom emoji via <tg-emoji emoji-id="ID">😀</tg-emoji>.
  // Falls back to plain text if the HTML the admin typed doesn't parse.
  async function sendFormatted(chatId) {
    try {
      return await bot.sendMessage(chatId, message, { parse_mode: "HTML" });
    } catch (err) {
      return await bot.sendMessage(chatId, message);
    }
  }

  if (target === "channel") {
    const channel = settings.channels.id(channelId);
    if (!channel) return res.status(400).json({ error: "Channel not found" });
    try {
      await sendFormatted(channel.chatId);
      return res.json({ success: true, sentTo: "channel", channel: channel.name });
    } catch (err) {
      return res.status(500).json({ error: "Failed to send to channel: " + err.message });
    }
  }

  if (target === "all_channels") {
    let sent = 0,
      failed = 0;
    for (const ch of settings.channels) {
      try {
        await sendFormatted(ch.chatId);
        sent++;
      } catch (err) {
        failed++;
      }
    }
    return res.json({ success: true, sentTo: "all_channels", sent, failed, total: settings.channels.length });
  }

  const users = await User.find({}, "telegramId");
  let sent = 0,
    failed = 0;
  for (const u of users) {
    try {
      await sendFormatted(u.telegramId);
      sent++;
    } catch (err) {
      failed++;
    }
  }
  res.json({ success: true, sentTo: "bot", sent, failed, total: users.length });
});

app.post("/api/admin/balance/add", checkAdmin, async (req, res) => {
  const { telegramId, amount } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  user.balance += Number(amount);
  await user.save();
  await sendAlert(telegramId, `💰 *Balance Added*\n\n+₹${amount} admin ne add kiya.\nNew Balance: ₹${user.balance}`);
  res.json({ success: true, balance: user.balance });
});

app.post("/api/admin/balance/deduct", checkAdmin, async (req, res) => {
  const { telegramId, amount } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "User not found" });
  user.balance = Math.max(0, user.balance - Number(amount));
  await user.save();
  await sendAlert(telegramId, `💸 *Balance Deducted*\n\n-₹${amount} admin ne deduct kiya.\nNew Balance: ₹${user.balance}`);
  res.json({ success: true, balance: user.balance });
});

app.post("/api/admin/ban", checkAdmin, async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ error: "User ID or username required" });
  const clean = identifier.replace(/^@/, "").trim();
  const user = await User.findOne({ $or: [{ telegramId: clean }, { username: clean }] });
  if (!user) return res.status(404).json({ error: "User not found" });
  user.banned = true;
  user.banReason = "Banned by admin";
  await user.save();
  res.json({ success: true, telegramId: user.telegramId });
});

app.get("/api/admin/users", checkAdmin, async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(200);
  res.json(users);
});

app.post("/api/admin/users/unban", checkAdmin, async (req, res) => {
  const { telegramId } = req.body;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: "Not found" });
  user.banned = false;
  user.banReason = "";
  await user.save();
  res.json({ success: true });
});

app.post("/api/admin/giftcode/create", checkAdmin, async (req, res) => {
  const { maxClaims, amountPerUser } = req.body;
  if (!maxClaims || !amountPerUser) return res.status(400).json({ error: "maxClaims and amountPerUser required" });

  let code;
  let attempts = 0;
  do {
    code = generateGiftCode();
    attempts++;
  } while ((await GiftCode.findOne({ code })) && attempts < 10);

  const gift = await GiftCode.create({ code, maxClaims: Number(maxClaims), amountPerUser: Number(amountPerUser) });
  res.json(gift);
});

app.get("/api/admin/giftcode/list", checkAdmin, async (req, res) => {
  const gifts = await GiftCode.find().sort({ createdAt: -1 }).limit(100);
  res.json(gifts);
});

app.post("/api/admin/giftcode/delete", checkAdmin, async (req, res) => {
  const { id } = req.body;
  await GiftCode.deleteOne({ _id: id });
  res.json({ success: true });
});

app.get("/api/admin/upi/list", checkAdmin, async (req, res) => {
  const list = await WithdrawalRequest.find().sort({ createdAt: -1 }).limit(100);
  res.json(list);
});

app.post("/api/admin/upi/approve", checkAdmin, async (req, res) => {
  const { requestId } = req.body;
  const result = await resolveUpiRequest(requestId, true);
  if (!result) return res.status(400).json({ error: "Already processed or not found" });
  res.json({ success: true });
});

app.post("/api/admin/upi/reject", checkAdmin, async (req, res) => {
  const { requestId } = req.body;
  const result = await resolveUpiRequest(requestId, false);
  if (!result) return res.status(400).json({ error: "Already processed or not found" });
  res.json({ success: true });
});

app.get("/api", (req, res) => res.send(`⚡ ${APP_NAME} backend is running.`));

// ---------- LOCAL DEV ----------
if (require.main === module) {
  connectDB().then(() => {
    bot.startPolling();
    app.listen(PORT, () => console.log(`🚀 Local server running on port ${PORT}`));
  });
}

module.exports = app;
